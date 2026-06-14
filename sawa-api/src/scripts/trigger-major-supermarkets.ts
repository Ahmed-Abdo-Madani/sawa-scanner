import axios from 'axios';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

const dbClient = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10; // Default limit of 10 stores to prevent overloading
  const merchantArg = args.find((a) => a.startsWith('--merchant='));
  const selectedMerchant = merchantArg ? merchantArg.split('=')[1].toLowerCase().trim() : null;
  const targetMerchants = selectedMerchant ? [selectedMerchant] : [
    'othaim',
    'panda',
    'carrefour',
    'lulu hypermarket',
    'lulu express',
    'danube',
    'spinneys',
    'tamimi'
  ];
  const onlyUnscraped = !args.includes('--all');
  const delayBetweenStores = 10000; // 10 seconds delay between triggering stores

  console.log('============================================================');
  console.log('🚀 HUNGERSTATION MAJOR SUPERMARKETS TRIGGER');
  console.log('============================================================');
  console.log(`Merchant Filter : ${selectedMerchant || 'All Major Supermarkets'}`);
  console.log(`Limit           : ${limit}`);
  console.log(`Only Unscraped  : ${onlyUnscraped}`);
  console.log(`API URL         : ${API_BASE_URL}`);
  console.log('============================================================\n');

  try {
    await dbClient.connect();
    console.log('✓ Connected to database.');

    // Fetch matching stores
    const query = `
      SELECT 
        s.id,
        s.source_url,
        m.name_en as merchant_name,
        s.district_name_en as district,
        COUNT(pp.id) as price_count
      FROM store s
      INNER JOIN merchant m ON s.merchant_id = m.id
      LEFT JOIN product_price pp ON pp.store_id = s.id
      WHERE s.platform = 'hungerstation'
        AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
        AND LOWER(m.name_en) = ANY($1)
      GROUP BY s.id, s.source_url, m.name_en, s.district_name_en
      HAVING 1=1
      ${onlyUnscraped ? 'AND COUNT(pp.id) = 0' : ''}
      ORDER BY m.name_en ASC
      LIMIT $2
    `;

    const res = await dbClient.query(query, [targetMerchants, limit]);
    const stores = res.rows;
    console.log(`📊 Found ${stores.length} major supermarket stores matching the criteria.`);

    if (stores.length === 0) {
      console.log('❌ No matching stores found. Exiting.');
      return;
    }

    console.log(`⚙️  Triggering catalog scraping for ${stores.length} store(s) sequentially...\n`);

    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      console.log(`[${i + 1}/${stores.length}] Triggering [${store.merchant_name}] in [${store.district || 'Unknown District'}]`);
      console.log(`   URL: ${store.source_url}`);

      try {
        const triggerRes = await axios.post(
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

        if (triggerRes.status === 409) {
          console.warn(`   ⚠️  Conflict: A catalog scrape is already in progress. Retrying in 15s...`);
          i--; // Retry this store
          await sleep(15000);
          continue;
        }

        const { jobId, message } = triggerRes.data;
        console.log(`   ✅ Enqueued! Job ID: ${jobId}. State: ${message || 'Queued'}`);

        // Poll job state until orchestrator enqueues category jobs
        console.log(`   ⏳ Waiting for orchestrator to finish enqueuing category jobs...`);
        let finished = false;
        while (!finished) {
          await sleep(3000);
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

        if (i < stores.length - 1) {
          console.log(`   💤 Sleeping ${delayBetweenStores / 1000}s to avoid queue flooding...`);
          await sleep(delayBetweenStores);
        }

      } catch (error: any) {
        console.error(`   ❌ Failed to trigger catalog scrape for [${store.merchant_name}]: ${error.response?.data?.message || error.message}`);
      }
      console.log('------------------------------------------------------------');
    }

    console.log('\n🎉 Finished enqueuing major supermarkets catalog scraping jobs!');
    console.log(`📊 Check Bull Board at ${API_BASE_URL}/admin/queues to monitor sub-tasks.`);

  } catch (error: any) {
    console.error(`❌ Global error during execution: ${error.message}`);
  } finally {
    await dbClient.end();
  }
}

run();
