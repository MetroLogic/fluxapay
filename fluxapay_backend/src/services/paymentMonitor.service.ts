// Payment Monitor Oracle
import { Horizon, Asset } from '@stellar/stellar-sdk';
import { PrismaClient } from '../generated/client/client';
import { paymentContractService } from './paymentContract.service';
/**
 * paymentMonitor.service.ts
 *
 * Automated on-chain payment detection: polls Stellar Horizon for incoming
 * USDC payments to payment addresses and updates Payment status (paid / overpaid).
 * Intended to be run on a schedule via cron.service (e.g. every 1–2 minutes).
 */

import { Horizon, Asset } from "@stellar/stellar-sdk";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaClient } from "../generated/client/client";

const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const USDC_ISSUER =
  process.env.USDC_ISSUER_PUBLIC_KEY ||
  "GBBD47IF6LWK7P7MDEVSCWT73IQIGCEZHR7OMXMBZQ3ZONN2T4U6W23Y";
const USDC_ASSET = new Asset("USDC", USDC_ISSUER);

const prisma = new PrismaClient();
const server = new Horizon.Server(HORIZON_URL);

/**
 * Run one pass of the payment monitor: fetch all pending, non-expired payments
 * with a stellar_address, check each for incoming USDC, and update status.
 * Safe to call repeatedly from a cron job.
 */
export async function runPaymentMonitorTick(): Promise<void> {
  const now = new Date();
  const payments = await prisma.payment.findMany({
    where: {
      status: "pending",
      expiration: { gt: now },
      stellar_address: { not: null },
    },
  });

    for (const payment of payments) {
      const address = payment.stellar_address;
      if (!address) continue;

      try {
        // Build the payments query with cursor support
        let paymentsQuery = server.payments()
          .forAccount(address)
          .order('desc')
          .limit(10);

        // If we have a last paging token, start from there to only get new transactions
        if (payment.last_paging_token) {
          paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
        }

        const transactions = await paymentsQuery.call();

        // Track the latest paging token to avoid re-processing
        let latestPagingToken = payment.last_paging_token;

        for (const record of transactions.records) {
          // Update the latest paging token
          if (record.paging_token && (!latestPagingToken || record.paging_token > latestPagingToken)) {
            latestPagingToken = record.paging_token;
          }

          if (record.type !== 'payment') continue;
          if (record.asset_type !== 'credit_alphanum4' || record.asset_code !== 'USDC') continue;
          if (record.asset_issuer !== USDC_ASSET.issuer) continue;

          const amount = parseFloat(record.amount);
          if (amount >= payment.amount) {
            let status = 'paid';
            if (amount > payment.amount) status = 'overpaid';
            else if (amount < payment.amount) status = 'partially_paid';

            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status,
                last_paging_token: latestPagingToken,
                transaction_hash: record.transaction_hash,
              },
            });

            // Trigger on-chain verification via Soroban contract
            if (status === 'paid' || status === 'overpaid') {
              // Using record.amount (string decimal) - handled by paymentContractService conversion
              paymentContractService.verify_payment(payment.id, record.transaction_hash, record.amount)
                .catch(err => console.error(`Failed to initiate on-chain verification for payment ${payment.id}:`, err));
            }
            break; // Payment processed, move to next payment
          }
        }

        // Update the paging token even if no matching payment was found
        if (latestPagingToken && latestPagingToken !== payment.last_paging_token) {
  for (const payment of payments) {
    const address = payment.stellar_address;
    if (!address) continue;

    try {
      let paymentsQuery = server
        .payments()
        .forAccount(address)
        .order("desc")
        .limit(10);

      if (payment.last_paging_token) {
        paymentsQuery = paymentsQuery.cursor(payment.last_paging_token);
      }

      const transactions = await paymentsQuery.call();
      let latestPagingToken = payment.last_paging_token;
      const requiredAmount = Number(payment.amount as Decimal);

      for (const record of transactions.records) {
        if (
          record.paging_token &&
          (!latestPagingToken || record.paging_token > latestPagingToken)
        ) {
          latestPagingToken = record.paging_token;
        }

        if (record.type !== "payment") continue;
        if (
          record.asset_type !== "credit_alphanum4" ||
          record.asset_code !== "USDC"
        )
          continue;
        if (record.asset_issuer !== USDC_ASSET.issuer) continue;

        const amount = parseFloat(record.amount);
        if (amount >= requiredAmount) {
          const status =
            amount > requiredAmount
              ? "overpaid"
              : amount < requiredAmount
                ? "partially_paid"
                : "paid";

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status,
              last_paging_token: latestPagingToken,
              transaction_hash: record.transaction_hash,
            },
          });
          break;
        }
      }

      if (
        latestPagingToken &&
        latestPagingToken !== payment.last_paging_token
      ) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { last_paging_token: latestPagingToken },
        });
      }
    } catch (e) {
      console.error(
        "[PaymentMonitor] Error checking address",
        address,
        e,
      );
    }
  }
}
