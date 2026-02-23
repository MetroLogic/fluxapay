import {
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
  Horizon,
} from "@stellar/stellar-sdk";
import { HDWalletService } from "./HDWalletService";

interface RefundParams {
  refundId: string;
  merchantId: string;
  paymentId: string;
  customerAddress: string;
  amount: string;
  currency: string;
}

interface RefundResult {
  transactionHash: string;
  ledger: number;
  sourceAddress: string;
}

const STELLAR_ERROR_MESSAGES: Record<string, string> = {
  op_underfunded: "Insufficient funds in the source account",
  op_no_trust:
    "Destination account does not have a trustline for this asset",
  op_no_destination: "Destination account does not exist",
  op_line_full: "Destination account trustline is full",
  op_no_issuer: "Asset issuer account does not exist",
  tx_bad_seq: "Transaction sequence number mismatch",
  tx_insufficient_fee: "Transaction fee is too low",
};

export class StellarRefundService {
  private horizonUrl: string;
  private networkPassphrase: string;
  private usdcIssuer: string;
  private baseFee: string;
  private txTimeout: number;
  private hdWalletService: HDWalletService;

  constructor() {
    this.horizonUrl =
      process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
    this.networkPassphrase =
      process.env.STELLAR_NETWORK === "public"
        ? Networks.PUBLIC
        : Networks.TESTNET;
    this.usdcIssuer = process.env.STELLAR_USDC_ISSUER || "";
    this.baseFee = process.env.STELLAR_BASE_FEE || "100";
    this.txTimeout = parseInt(process.env.STELLAR_TX_TIMEOUT || "30", 10);

    // Initialize HDWalletService with KMS support
    // For backward compatibility, still support direct seed injection in tests
    const masterSeed = process.env.HD_WALLET_MASTER_SEED;
    if (masterSeed) {
      // Legacy mode: direct seed injection (for tests)
      this.hdWalletService = new HDWalletService(masterSeed);
    } else {
      // Production mode: use KMS
      this.hdWalletService = new HDWalletService();
    }
  }

  async executeRefund(params: RefundParams): Promise<RefundResult> {
    const {
      refundId,
      merchantId,
      paymentId,
      customerAddress,
      amount,
      currency,
    } = params;

    // 1. Regenerate keypair for the payment address
    const { publicKey, secretKey } = await this.hdWalletService.regenerateKeypair(
      merchantId,
      paymentId,
    );
    const sourceKeypair = Keypair.fromSecret(secretKey);

    // 2. Validate customer address format
    try {
      Keypair.fromPublicKey(customerAddress);
    } catch {
      throw {
        status: 400,
        message: "Invalid customer Stellar address",
        code: "invalid_address",
      };
    }

    // 3. Load source account from Horizon
    const server = new Horizon.Server(this.horizonUrl);
    let sourceAccount;
    try {
      sourceAccount = await server.loadAccount(publicKey);
    } catch {
      throw {
        status: 502,
        message: "Failed to load source account from Stellar network",
        code: "source_not_found",
      };
    }

    // 4. Verify destination account exists
    try {
      await server.loadAccount(customerAddress);
    } catch {
      throw {
        status: 400,
        message: "Customer destination account does not exist on Stellar",
        code: "op_no_destination",
      };
    }

    // 5. Resolve asset
    const asset =
      currency === "XLM"
        ? Asset.native()
        : new Asset("USDC", this.usdcIssuer);

    // 6. Build transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: this.baseFee,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.payment({
          destination: customerAddress,
          asset,
          amount,
        }),
      )
      .addMemo(Memo.text(`refund:${refundId.slice(0, 20)}`))
      .setTimeout(this.txTimeout)
      .build();

    // 7. Sign with source keypair
    transaction.sign(sourceKeypair);

    // 8. Submit to Stellar network
    try {
      const response = await server.submitTransaction(transaction);
      return {
        transactionHash: response.hash,
        ledger: response.ledger,
        sourceAddress: publicKey,
      };
    } catch (err: any) {
      const resultCodes = err?.response?.data?.extras?.result_codes;
      const opCode = resultCodes?.operations?.[0] || resultCodes?.transaction;
      const friendlyMessage =
        STELLAR_ERROR_MESSAGES[opCode] || "Stellar transaction failed";

      throw {
        status: 502,
        message: friendlyMessage,
        code: opCode || "stellar_error",
      };
    }
  }
}
