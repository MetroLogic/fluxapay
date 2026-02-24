import { 
  Keypair, 
  Horizon, 
  TransactionBuilder, 
  Networks, 
  Operation, 
    Asset
} from '@stellar/stellar-sdk';
import { HDWalletService } from './HDWalletService';

export class StellarService {
  private server: Horizon.Server;
  private networkPassphrase: string;
  private funderKeypair: Keypair;
  private hdWalletService: HDWalletService;
  private usdcIssuer: string;

  constructor() {
    const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
    this.networkPassphrase = process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
    this.server = new Horizon.Server(horizonUrl);
    
    const funderSecret = process.env.FUNDER_SECRET_KEY;
    if (!funderSecret) {
      throw new Error('FUNDER_SECRET_KEY is required in environment variables');
    }
    this.funderKeypair = Keypair.fromSecret(funderSecret);

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
    
    // Default to testnet USDC issuer or override
    this.usdcIssuer = process.env.USDC_ISSUER_PUBLIC_KEY || 'GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y';
  }

  // Allow injecting a mock HDWalletService for testing or different config
  public setHDWalletService(service: HDWalletService) {
    this.hdWalletService = service;
  }

  /**
   * Checks if a Stellar account exists on-chain.
   * @param publicKey The public key (address) to check.
   * @returns true if the account exists, false otherwise.
   */
  public async checkAccountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Funds an account with a starting balance and establishes a trustline to USDC.
   * Handles the account merge edge case (if it already exists, just checks/adds trustline).
   * @param merchantId The merchant ID
   * @param paymentId The payment ID
   */
  public async prepareAccount(merchantId: string, paymentId: string): Promise<void> {
    const derivedKeypairInfo = await this.hdWalletService.regenerateKeypair(merchantId, paymentId);
    const destinationPublicKey = derivedKeypairInfo.publicKey;
    const destinationSecretKey = derivedKeypairInfo.secretKey;

    const exists = await this.checkAccountExists(destinationPublicKey);

    if (!exists) {
      // 1. Create and Fund Account
      console.log(`Account ${destinationPublicKey} does not exist. Creating and funding...`);
      await this.createAndFundAccount(destinationPublicKey, '2.0'); // 1 XLM base reserve + 0.5 for trustline + 0.5 buffer
    }

    // 2. Check and Add Trustline
    const hasTrustline = await this.checkTrustline(destinationPublicKey, 'USDC', this.usdcIssuer);
    
    if (!hasTrustline) {
      console.log(`Account ${destinationPublicKey} lacks USDC trustline. Adding...`);
      await this.addTrustline(destinationSecretKey, 'USDC', this.usdcIssuer);
    } else {
        console.log(`Account ${destinationPublicKey} already has USDC trustline.`);
    }
  }

  /**
   * Creates a new account and funds it from the funder wallet.
   * @param destination The public key of the new account.
   * @param startingBalance The amount of XLM to send.
   */
  private async createAndFundAccount(destination: string, startingBalance: string): Promise<void> {
    // Load the funder account
    const funderAccountResponse = await this.server.loadAccount(this.funderKeypair.publicKey());

    // Build the transaction
    const transaction = new TransactionBuilder(funderAccountResponse, {
      fee: '100', // Basic fee
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.createAccount({
        destination: destination,
        startingBalance: startingBalance,
      }))
      .setTimeout(30)
      .build();

    // Sign the transaction with the funder's secret key
    transaction.sign(this.funderKeypair);

    // Submit the transaction
    try {
      await this.server.submitTransaction(transaction);
    } catch (error: any) {
      console.error('Error creating account:', error.response ? error.response.data : error);
      throw error;
    }
  }

  /**
   * Checks if an account has a trustline for a specific asset.
   */
  public async checkTrustline(publicKey: string, assetCode: string, assetIssuer: string): Promise<boolean> {
    try {
        const account = await this.server.loadAccount(publicKey);
        const balances = account.balances;
        
        for (const balance of balances) {
            if ('asset_code' in balance && balance.asset_code === assetCode && 'asset_issuer' in balance && balance.asset_issuer === assetIssuer) {
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking trustline:', error);
        throw error;
    }
  }

  /**
   * Adds a trustline to a specific asset.
   * @param secretKey The secret key of the account establishing the trustline.
   * @param assetCode The code of the asset (e.g., "USDC").
   * @param assetIssuer The issuer's public key.
   */
  private async addTrustline(secretKey: string, assetCode: string, assetIssuer: string): Promise<void> {
    const keypair = Keypair.fromSecret(secretKey);
    const accountResponse = await this.server.loadAccount(keypair.publicKey());
    const asset = new Asset(assetCode, assetIssuer);

    const transaction = new TransactionBuilder(accountResponse, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(Operation.changeTrust({
        asset: asset,
      }))
      .setTimeout(30)
      .build();

    transaction.sign(keypair);

    try {
      await this.server.submitTransaction(transaction);
    } catch (error: any) {
      console.error('Error adding trustline:', error.response ? error.response.data : error);
      throw error;
    }
  }
}
