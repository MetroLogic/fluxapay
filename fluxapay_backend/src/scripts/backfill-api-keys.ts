import { PrismaClient } from '../generated/client/client';
import { generateApiKey, hashKey, getLastFour } from '../helpers/crypto.helper';
import { isDevEnv } from '../helpers/env.helper';

async function backfillApiKeys() {
    const prisma = new PrismaClient();

    try {
        const merchantsWithoutKeys = await prisma.merchant.findMany({
            where: {
                OR: [
                    { api_key_hashed: null },
                    { api_key_hashed: '' },
                ],
            },
        });

        console.log(`Found ${merchantsWithoutKeys.length} merchants without API keys`);

        for (const merchant of merchantsWithoutKeys) {
            console.log(`Generating key for merchant ${merchant.id} (${merchant.business_name || merchant.email})`);

            const apiKey = generateApiKey();
            const hashed = await hashKey(apiKey);
            const lastFour = getLastFour(apiKey);

            await prisma.merchant.update({
                where: { id: merchant.id },
                data: {
                    api_key_hashed: hashed,
                    api_key_last_four: lastFour,
                },
            });

            console.log(`Generated: sk_live_****${lastFour} for ${merchant.id}`);
            if (isDevEnv()) {
                console.log('Raw key (dev only):', apiKey);
            }
        }

        console.log('Backfill complete!');
    } catch (error) {
        console.error('Backfill failed:', error);
    } finally {
        await prisma.$disconnect();
    }
}

backfillApiKeys();
