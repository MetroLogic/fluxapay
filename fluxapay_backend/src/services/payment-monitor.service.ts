import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaClient, Payment } from '../generated/client';
import { WebhookDispatcher } from './webhook.service';

export class PaymentMonitorService {
    private prisma: PrismaClient;
    private webhookDispatcher: WebhookDispatcher;
    private server: StellarSdk.Horizon.Server;
    private workerStateKey = 'PAYMENT_MONITOR_PAGING_TOKEN';

    constructor(prisma: PrismaClient, webhookDispatcher: WebhookDispatcher) {
        this.prisma = prisma;
        this.webhookDispatcher = webhookDispatcher;
        
        const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
        this.server = new StellarSdk.Horizon.Server(horizonUrl);
    }

    public async start() {
        console.log('[PaymentMonitor] Starting payment monitor...');

        let lastToken = 'now';
        const state = await this.prisma.workerState.findUnique({
            where: { key: this.workerStateKey }
        });

        if (state && state.value) {
            lastToken = state.value;
            console.log(`[PaymentMonitor] Resuming from paging token: ${lastToken}`);
        } else {
            console.log('[PaymentMonitor] No previous state found, starting from "now"');
        }

        this.server.payments()
            .cursor(lastToken)
            .stream({
                onmessage: async (payment: any) => {
                    await this.handlePayment(payment);
                },
                onerror: (error: any) => {
                    console.error('[PaymentMonitor] Streaming error:', error);
                }
            });
    }

    private async handlePayment(payment: any) {
        // Only interested in actual payments (not path_payments or account_merges right now)
        if (payment.type !== 'payment') {
            return;
        }

        // Only interested in USDC
        if (payment.asset_type === 'native' || payment.asset_code !== 'USDC') {
            return;
        }

        const toAddress = payment.to;
        const txHash = payment.transaction_hash;
        const paidAmount = parseFloat(payment.amount);

        // Fast check if it's one of our pending addresses
        const pendingPayment = await this.prisma.payment.findFirst({
            where: {
                stellar_address: toAddress,
                status: 'pending'
            },
            include: { merchant: true }
        });

        if (!pendingPayment) {
            return; // Not our payment or already confirmed
        }

        const requiredAmount = parseFloat(pendingPayment.amount.toString());

        // Check idempotency: did we already process this exact tx?
        if (pendingPayment.transaction_hash === txHash || pendingPayment.status === 'confirmed') {
            return;
        }

        // Validate amount match
        if (paidAmount < requiredAmount) {
            console.log(`[PaymentMonitor] Underpayment detected on ${toAddress}. Expected ${requiredAmount}, got ${paidAmount}`);
            return;
        }

        console.log(`[PaymentMonitor] Found matching payment for ${toAddress}! Tx: ${txHash}`);

        try {
            // 1. Update Payment status to Confirmed
            const updatedPayment = await this.prisma.payment.update({
                where: { id: pendingPayment.id },
                data: {
                    status: 'confirmed',
                    transaction_hash: txHash,
                    confirmed_at: new Date(),
                }
            });

            // 2. Trigger the Webhook Dispatcher
            await this.webhookDispatcher.sendPaymentWebhook(updatedPayment, pendingPayment.merchant);

            // 3. Update Paging Token on Success
            await this.prisma.workerState.upsert({
                where: { key: this.workerStateKey },
                update: { value: payment.paging_token },
                create: { key: this.workerStateKey, value: payment.paging_token }
            });

            console.log(`[PaymentMonitor] Successfully processed and saved paging token: ${payment.paging_token}`);
        } catch (error: any) {
            console.error(`[PaymentMonitor] Error processing payment ${pendingPayment.id}:`, error.message);
        }
    }
}
