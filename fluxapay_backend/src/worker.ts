import { PrismaClient } from './generated/client/client';
import { WebhookDispatcher } from './services/webhook.service';
import { PaymentMonitorService } from './services/payment-monitor.service';

const prisma = new PrismaClient();

async function main() {
    console.log('[Worker] Starting FluxaPay Payment Monitor Worker...');

    try {
        await prisma.$connect();
        console.log('[Worker] Connected to database successfully.');

        const webhookDispatcher = new WebhookDispatcher(prisma);
        const paymentMonitor = new PaymentMonitorService(prisma, webhookDispatcher);

        await paymentMonitor.start();
        
        console.log('[Worker] Payment monitor loop is running. Press Ctrl+C to exit.');
    } catch (error) {
        console.error('[Worker] Fatal error initializing worker:', error);
        await prisma.$disconnect();
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n[Worker] Shutting down due to SIGINT...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n[Worker] Terminating due to SIGTERM...');
    await prisma.$disconnect();
    process.exit(0);
});

main();
