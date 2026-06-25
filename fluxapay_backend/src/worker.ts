import { PrismaClient } from './generated/client/client';
import { WebhookDispatcher } from './services/webhook.service';
import { PaymentMonitorService } from './services/payment-monitor.service';
import { getLogger } from './utils/logger';
import { requestContextStorage } from './utils/requestContext';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const logger = getLogger();

async function main() {
    const requestId = `worker-${randomUUID()}`;
    
    await requestContextStorage.run({ requestId }, async () => {
        logger.info('Starting FluxaPay Payment Monitor Worker...');

        try {
            await prisma.$connect();
            logger.info('Connected to database successfully.');

            const webhookDispatcher = new WebhookDispatcher(prisma);
            const paymentMonitor = new PaymentMonitorService(prisma, webhookDispatcher);

            await paymentMonitor.start();
            
            logger.info('Payment monitor loop is running. Press Ctrl+C to exit.');
        } catch (error: any) {
            logger.error('Fatal error initializing worker', { error: error.message });
            await prisma.$disconnect();
            process.exit(1);
        }
    });
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Shutting down due to SIGINT...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Terminating due to SIGTERM...');
    await prisma.$disconnect();
    process.exit(0);
});

main();
