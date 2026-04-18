import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET;
if (!devSecret) {
  console.error('❌ DEV_ADMIN_SECRET env var is not set. Aborting.');
  process.exit(1);
}

function parseCityArg(): string {
    const cityArg = process.argv.find((arg) => arg.startsWith('--city='));
    return cityArg?.split('=')[1]?.trim() || 'riyadh';
}

type StoreApiItem = {
    id: string;
};

async function triggerHungerStationProducts() {
    const city = parseCityArg();
    console.log(`🚀 Triggering HungerStation products jobs for city=${city}...`);
    console.log(`   API: ${API_BASE_URL}`);

    let enqueued = 0;
    let failed = 0;

    try {
        const storesRes = await axios.get(`${API_BASE_URL}/stores`, {
            params: { city, platform: 'hungerstation' },
            headers: { 'x-dev-admin-secret': devSecret },
        });

        const stores: StoreApiItem[] = Array.isArray(storesRes.data)
            ? storesRes.data
            : [];

        for (const store of stores) {
            try {
                await axios.post(
                    `${API_BASE_URL}/ingestion/jobs`,
                    {
                        platform: 'hungerstation',
                        mode: 'products-for-store',
                        storeId: store.id,
                    },
                    {
                        headers: { 'x-dev-admin-secret': devSecret },
                    },
                );
                enqueued++;
            } catch (error: any) {
                failed++;
                const msg = error?.response?.data?.message ?? error?.message;
                console.error(`❌ Failed for store ${store.id}: ${msg}`);
            }
        }

        console.log(`enqueued=${enqueued}, failed=${failed}`);
    } catch (error: any) {
        console.error(
            `❌ Failed to fetch stores: ${error.response?.data?.message ?? error.message}`,
        );
        process.exit(1);
    }
}

triggerHungerStationProducts();
