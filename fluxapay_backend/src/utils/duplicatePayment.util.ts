import { Decimal } from "@prisma/client/runtime/library";

export interface MatchedStellarPayment {
  transactionHash: string;
  amount: Decimal;
  payer?: string;
  pagingToken?: string;
}

export interface DuplicatePaymentAnalysis {
  hasDuplicate: boolean;
  transactionHashes: string[];
  totalReceived: Decimal;
  expectedAmount: Decimal;
  surplusAmount: Decimal;
}

export interface PaymentReceiptProgress {
  amountReceived: Decimal;
  remainingBalance: Decimal;
  status: "pending" | "partially_paid" | "confirmed" | "overpaid";
  verified: boolean;
}

export function calculatePaymentReceiptProgress(
  expectedAmount: Decimal,
  amountReceived: Decimal,
): PaymentReceiptProgress {
  const remainingBalance = expectedAmount.minus(amountReceived);

  if (amountReceived.gte(expectedAmount)) {
    return {
      amountReceived,
      remainingBalance: new Decimal(0),
      status: amountReceived.gt(expectedAmount) ? "overpaid" : "confirmed",
      verified: true,
    };
  }

  return {
    amountReceived,
    remainingBalance,
    status: amountReceived.gt(0) ? "partially_paid" : "pending",
    verified: false,
  };
}

/**
 * Analyze matched on-chain receipts for duplicate payment detection.
 */
export function analyzeDuplicatePayments(
  expectedAmount: Decimal,
  matchedPayments: MatchedStellarPayment[],
): DuplicatePaymentAnalysis {
  const totalReceived = matchedPayments.reduce(
    (sum, tx) => sum.plus(tx.amount),
    new Decimal(0),
  );
  const surplusAmount = totalReceived.minus(expectedAmount);
  const transactionHashes = matchedPayments.map((tx) => tx.transactionHash);

  return {
    hasDuplicate: matchedPayments.length > 1 && surplusAmount.gt(0),
    transactionHashes,
    totalReceived,
    expectedAmount,
    surplusAmount,
  };
}
