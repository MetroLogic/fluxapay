import express from 'express';
import { PaymentService } from '../services/payment.service';
import { PrismaClient } from '../generated/client/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

const PORT = 4000;
const WEBHOOK_SECRET = 'test-secret-123';

app.post('/webhook', (req, res) => {
    console.log('--- Received Webhook ---');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Payload:', JSON.stringify(req.body, null, 2));

    const signature = req.headers['x-fluxapay-signature'];
    const timestamp = req.headers['x-fluxapay-timestamp'];

    if (!signature || !timestamp) {
        console.error('Missing headers!');
        return res.status(400).send('Missing headers');
    }

    console.log('Webhook validated manually in logs.');
    res.status(200).send('OK');
});

async function runTest() {
    const server = app.listen(PORT, async () => {
        console.log(`Test receiver listening on port ${PORT}`);

        try {
            // 1. Create/Update a merchant with webhook details
            const merchant = await prisma.merchant.upsert({
                where: { email: 'test-merchant@example.com' },
                update: {
                    webhook_url: `http://localhost:${PORT}/webhook`,
                    webhook_secret: WEBHOOK_SECRET,
                },
                create: {
                    business_name: 'Test Merchant',
                    email: 'test-merchant@example.com',
                    phone_number: '1234567890',
                    country: 'US',
                    settlement_currency: 'USD',
                    password: 'password123',
                    webhook_url: `http://localhost:${PORT}/webhook`,
                    webhook_secret: WEBHOOK_SECRET,
                }
            });

            console.log('Merchant created/updated:', merchant.id);

            // 2. Create a payment
            const payment = await PaymentService.createPayment({
                amount: 100,
                currency: 'USDC',
                customer_email: 'customer@example.com',
                merchantId: merchant.id,
                metadata: { order_id: 'ORDER-123' },
            });

            console.log('Payment created:', payment.id);

            // 3. Confirm payment (this should trigger the webhook)
            console.log('Confirming payment...');
            await PaymentService.confirmPayment(payment.id, 'TXN-ABC-123', 'PAYER-ADDR-XYZ');

            console.log('Payment confirmed.');

            // Wait for webhook
            console.log('Waiting 5 seconds for webhook processing...');
            await new Promise(resolve => setTimeout(resolve, 5000));

        } catch (error) {
            console.error('Test failed:', error);
        } finally {
            server.close();
            console.log('Test server closed.');
            process.exit(0);
        }
    });
}

runTest();
