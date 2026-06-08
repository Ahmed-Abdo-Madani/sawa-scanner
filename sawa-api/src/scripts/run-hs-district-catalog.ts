import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const city = args.find((a) => a.startsWith('--city='))?.split('=')[1] || 'riyadh';
  const district = args.find((a) => a.startsWith('--district='))?.split('=')[1] || 'yasmin';
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 999;
  const delayBetweenStores = 10000; // 10 seconds delay between triggering stores

  console.log('============================================================');
  console.log('🚀 HUNGERSTATION DISTRICT CATALOG SCRAPE TRIGGER');
  console.log('============================================================');
  console.log(`City      : ${city}`);
  console.log(`District  : ${district}`);
  console.log(`Limit     : ${limit}`);
  console.log(`API URL   : ${API_BASE_URL}`);
  console.log('============================================================\n');

  try {
    // 1. Fetch stores in district
    console.log(`🔍 Fetching HungerStation stores in ${city}/${district}...`);
    const storesRes = await axios.get(`${API_BASE_URL}/stores`, {
      params: { city, district, platform: 'hungerstation' },
      headers: { 'x-dev-admin-secret': devSecret },
    });

    const stores = Array.isArray(storesRes.data) ? storesRes.data : [];
    console.log(`📊 Found ${stores.length} HungerStation stores in ${district} district.`);

    if (stores.length === 0) {
      console.log('❌ No stores found. Exiting.');
      return;
    }

    const storesToProcess = stores.slice(0, limit);
    console.log(`⚙️  Triggering catalog scraping for ${storesToProcess.length} store(s) sequentially...\n`);

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

        if (res.status === 409) {
          console.warn(`   ⚠️  Conflict: A catalog scrape is already in progress. Retrying in 10s...`);
          i--; // Retry this store
          await sleep(10000);
          continue;
        }

        const { jobId, message } = res.data;
        console.log(`   ✅ Enqueued! Job ID: ${jobId}. State: ${message || 'Queued'}`);

        // Poll job state until it finishes enqueuing category jobs
        console.log(`   ⏳ Waiting for orchestrator to finish enqueuing category jobs...`);
        let finished = false;
        while (!finished) {
          await sleep(2000);
          try {
            const statusRes = await axios.get(`${API_BASE_URL}/ingestion/jobs/${jobId}`, {
              headers: { 'x-dev-admin-secret': devSecret },
            });
            const state = statusRes.data?.state;
            if (state === 'completed' || state === 'failed') {
              console.log(`   🏁 Orchestrator job finished with state: ${state}`);
              finished = true;
            } else {
              console.log(`      Current state: ${state}...`);
            }
          } catch (err) {
            console.error(`      Error checking job status: ${err.message}`);
            finished = true; // Stop polling on error to prevent infinite loop
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

    console.log('\n🎉 Finished triggering all HungerStation stores in the district!');
    console.log(`📊 Check Bull Board at ${API_BASE_URL}/admin/queues to monitor sub-tasks.`);

  } catch (error: any) {
    console.error(`❌ Global error during execution: ${error.message}`);
  }
}

run();
