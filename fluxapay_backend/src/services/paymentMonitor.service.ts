// Payment Monitor Oracle
import { Horizon, Asset } from '@stellar/stellar-sdk';
import { PrismaClient } from '@prisma/client';

const HORIZON_URL = 'https://horizon.stellar.org';
const USDC_ASSET = new Asset('USDC', 'GA5ZSE7V3Y3TQ3Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5Q5'); // Replace with actual issuer
const POLL_INTERVAL = 3000;

const prisma = new PrismaClient();
const server = new Horizon.Server(HORIZON_URL);

async function monitorPayments() {
  while (true) {
    const now = new Date();
    const payments = await prisma.payment.findMany({
      where: {
        status: 'pending',
        expiration: { gt: now },
      },
    });

    for (const payment of payments) {
      const address = payment.metadata?.stellar_address;
      if (!address) continue;
      try {
        const transactions = await server.payments().forAccount(address).order('desc').limit(10).call();
        for (const record of transactions.records) {
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
              data: { status },
            });
          }
        }
      } catch (e) {
        console.error('Error checking address', address, e);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }
}

monitorPayments();