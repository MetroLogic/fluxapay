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
    hasDuplicate: matchedPayments.length > 1,
    transactionHashes,
    totalReceived,
    expectedAmount,
    surplusAmount,
  };
}
