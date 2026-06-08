import axios from 'axios';
import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import { In } from 'typeorm';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { isMajorSupermarket } from '../src/utils/normalization';


// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const districtsArg = args.find((a) => a.startsWith('--districts='));
const districts = districtsArg
  ? districtsArg.split('=')[1].split(',')
  : ['sahafah', 'ghadir'];

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  console.log(`Target Districts: ${districts.join(', ')}`);

  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const allStores = await storeRepo.find({
    where: { 
      platform: 'hungerstation',
      city_slug: 'riyadh',
      district_slug: In(districts)
    },
    relations: ['merchant']
  });

  const stores = allStores.filter((store) =>
    isMajorSupermarket(store.merchant?.name_en, store.merchant?.name_ar),
  );


  const storesToProcess: Store[] = [];
  for (const store of stores) {
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } }
    });
    if (priceCount === 0) {
      storesToProcess.push(store);
    }
  }

  console.log(`\nFound ${storesToProcess.length} HungerStation stores with 0 prices.`);
  console.log('============================================================');

  await AppDataSource.destroy();
  console.log('Database connection closed. Starting triggers via API...');

  const delayBetweenStores = 10000; // 10 seconds

  for (let i = 0; i < storesToProcess.length; i++) {
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

      let jobIdToPoll: string | null = null;

      if (res.status === 409) {
        const conflictingJobId = res.data?.jobId;
        if (conflictingJobId) {
          console.warn(`   ⚠️  Conflict: Job ${conflictingJobId} is already in-flight.`);
          try {
            const statusRes = await axios.get(`${API_BASE_URL}/ingestion/jobs/${conflictingJobId}`, {
              headers: { 'x-dev-admin-secret': devSecret },
            });
            const conflictingJob = statusRes.data;
            const targetUrl = conflictingJob?.data?.storeUrl;
            if (targetUrl === store.source_url) {
              console.log(`   👉 Conflicting job is for THIS store. Adopting it and polling to completion!`);
              jobIdToPoll = conflictingJobId;
            } else {
              console.log(`   👉 Conflicting job is for a DIFFERENT store (${targetUrl || 'unknown'}).`);
              console.log(`      Waiting for it to finish before retrying this store...`);
              let finished = false;
              while (!finished) {
                await sleep(10000);
                const checkRes = await axios.get(`${API_BASE_URL}/ingestion/jobs/${conflictingJobId}`, {
                  headers: { 'x-dev-admin-secret': devSecret },
                });
                const checkState = checkRes.data?.state;
                if (checkState === 'completed' || checkState === 'failed') {
                  console.log(`      Conflicting job finished with state: ${checkState}`);
                  finished = true;
                } else {
                  console.log(`      Conflicting job current state: ${checkState}...`);
                }
              }
              i--; // Retry this store
              continue;
            }
          } catch (err: any) {
            console.error(`      Error inspecting conflicting job: ${err.message}`);
            i--;
            await sleep(10000);
            continue;
          }
        } else {
          console.warn(`   ⚠️  Conflict: A catalog scrape is already in progress. Retrying in 10s...`);
          i--;
          await sleep(10000);
          continue;
        }
      } else {
        const { jobId, message } = res.data;
        console.log(`   ✅ Enqueued! Job ID: ${jobId}. State: ${message || 'Queued'}`);
        jobIdToPoll = jobId;
      }

      if (jobIdToPoll) {
        // Poll job state until it finishes enqueuing category jobs
        console.log(`   ⏳ Waiting for orchestrator to finish enqueuing category jobs...`);
        let finished = false;
        while (!finished) {
          await sleep(2000);
          try {
            const statusRes = await axios.get(`${API_BASE_URL}/ingestion/jobs/${jobIdToPoll}`, {
              headers: { 'x-dev-admin-secret': devSecret },
            });
            const state = statusRes.data?.state;
            if (state === 'completed' || state === 'failed') {
              console.log(`   🏁 Orchestrator job finished with state: ${state}`);
              finished = true;
            } else {
              console.log(`      Current state: ${state}...`);
            }
          } catch (err: any) {
            console.error(`      Error checking job status: ${err.message}`);
            finished = true; // Stop polling on error
          }
        }
      }

      if (i < storesToProcess.length - 1) {
        console.log(`   💤 Sleeping ${delayBetweenStores / 1000}s to avoid queue flooding...`);
        await sleep(delayBetweenStores);
      }

    } catch (error: any) {
      console.error(`   ❌ Failed to trigger catalog scrape for [${merchantName}]: ${error.response?.data?.message || error.message}`);
    }
    console.log('------------------------------------------------------------');
  }

  console.log('\n🎉 Finished triggering all remaining HungerStation stores!');
}

main().catch(err => {
  console.error('Error:', err);
});
