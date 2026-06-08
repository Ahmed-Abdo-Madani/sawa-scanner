import axios from 'axios';
import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';
const TRACKER_FILE = path.join(__dirname, 'triggered-ghadir-stores.json');

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadTriggered(): string[] {
  if (fs.existsSync(TRACKER_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf8'));
    } catch {
      return [];
    }
  }
  return [];
}

function saveTriggered(ids: string[]) {
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(ids, null, 2));
}

/**
 * Checks active + waiting jobs count in the queue.
 * Blocks if count is above high-water threshold (200 jobs) to prevent Redis OOM.
 */
async function checkBackpressure() {
  const connection = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  const queue = new Queue('ingestion-queue', { connection });

  try {
    let checkIdx = 1;
    while (true) {
      const active = await queue.getActiveCount();
      const waiting = await queue.getWaitingCount();
      const totalPending = active + waiting;

      if (totalPending < 200) {
        if (checkIdx > 1) {
          console.log(`   ✅ Backpressure cleared. Current pending jobs: ${totalPending}. Resuming enqueuing...`);
        }
        break;
      }

      console.warn(
        `   ⚠️  Backpressure threshold breached! Pending jobs: ${totalPending} (Active: ${active}, Waiting: ${waiting}). Sleeping 30s... (Check #${checkIdx})`
      );
      await sleep(30000);
      checkIdx++;
    }
  } catch (err) {
    console.error('Backpressure check failed:', err.message);
  } finally {
    await connection.quit();
  }
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  // Fetch active HungerStation stores in Riyadh Ghadir district
  console.log('Fetching active HungerStation stores in Ghadir...');
  const stores = await storeRepo.find({
    where: { 
      platform: 'hungerstation',
      city_slug: 'riyadh',
      district_slug: 'ghadir',
      is_active: true
    },
    relations: ['merchant']
  });

  console.log(`Found ${stores.length} active stores in Ghadir in database.`);

  const triggeredIds = loadTriggered();
  const storesToProcess: Store[] = [];
  for (const store of stores) {
    if (triggeredIds.includes(store.id)) {
      continue;
    }
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } }
    });
    if (priceCount === 0) {
      storesToProcess.push(store);
    }
  }

  console.log(`Found ${storesToProcess.length} HungerStation stores to trigger.`);
  console.log('============================================================');

  await AppDataSource.destroy();
  console.log('Database connection closed. Starting triggers via API...');

  const delayBetweenStores = 15000; // 15 seconds delay to prevent queue flooding

  for (let i = 0; i < storesToProcess.length; i++) {
    // Check backpressure before triggering next store
    await checkBackpressure();

    const store = storesToProcess[i];
    const merchantName = store.merchant?.name_en || 'Unknown Store';
    console.log(`[${i + 1}/${storesToProcess.length}] Triggering [${merchantName}]`);
    console.log(`   URL: ${store.source_url}`);

    try {
      const res = await axios.post(
        `${API_BASE_URL}/ingestion/hs-catalog-scrape`,
        {
          storeUrl: store.source_url,
          dryRun: false,
        },
        {
          headers: { 'x-dev-admin-secret': devSecret },
          validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
        },
      );

      if (res.status === 409) {
        console.log(`   ℹ️  Already enqueued (Conflict 409). Skipping...`);
        triggeredIds.push(store.id);
        saveTriggered(triggeredIds);
        if (i < storesToProcess.length - 1) {
          console.log(`   💤 Sleeping 5s before next store...`);
          await sleep(5000);
        }
        continue;
      }

      const { jobId, message } = res.data;
      console.log(`   ✅ Enqueued! Job ID: ${jobId}. State: ${message || 'Queued'}`);

      triggeredIds.push(store.id);
      saveTriggered(triggeredIds);

      if (i < storesToProcess.length - 1) {
        console.log(`   💤 Sleeping ${delayBetweenStores / 1000}s before next store...`);
        await sleep(delayBetweenStores);
      }

    } catch (error: any) {
      console.error(`   ❌ Failed to trigger catalog scrape for [${merchantName}]: ${error.response?.data?.message || error.message}`);
    }
    console.log('------------------------------------------------------------');
  }

  console.log('\n🎉 Finished triggering all remaining HungerStation stores in Ghadir!');
}

main().catch(err => {
  console.error('Error:', err);
});
