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

const MAJOR_MERCHANTS = [
  'othaim',
  'panda',
  'carrefour',
  'lulu hypermarket',
  'lulu express',
  'danube',
  'spinneys',
  'tamimi',
];

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 20;
  const delayBetweenStores = 10000;

  console.log('============================================================');
  console.log('🚀 ZERO-DISTRICTS MAJOR SUPERMARKETS TRIGGER');
  console.log('============================================================');
  console.log(`Target    : Major supermarkets in districts with 0 scraped stores`);
  console.log(`Limit     : ${limit} stores`);
  console.log(`API URL   : ${API_BASE_URL}`);
  console.log('============================================================\n');

  try {
    await dbClient.connect();
    console.log('✓ Connected to database.');

    // Step 1: Find districts that currently have ZERO scraped stores
    const zeroDistrictsRes = await dbClient.query<{ district: string }>(`
      SELECT DISTINCT s.district_name_en as district
      FROM store s
      WHERE s.platform = 'hungerstation'
        AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
        AND s.district_name_en IS NOT NULL
      GROUP BY s.district_name_en
      HAVING SUM(CASE WHEN EXISTS (
        SELECT 1 FROM product_price pp WHERE pp.store_id = s.id
      ) THEN 1 ELSE 0 END) = 0
      ORDER BY s.district_name_en
    `);

    const zeroDistricts = zeroDistrictsRes.rows.map((r) => r.district).filter(Boolean);
    console.log(`📍 Found ${zeroDistricts.length} districts with 0 scraped stores.`);

    if (zeroDistricts.length === 0) {
      console.log('✅ All districts already have scraped data. Nothing to do.');
      return;
    }

    // Step 2: Find major supermarket stores inside those zero districts
    const storesRes = await dbClient.query<{
      id: string;
      source_url: string;
      merchant_name: string;
      district: string;
    }>(`
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
        AND s.district_name_en = ANY($2)
      GROUP BY s.id, s.source_url, m.name_en, s.district_name_en
      HAVING COUNT(pp.id) = 0
      ORDER BY m.name_en ASC, s.district_name_en ASC
      LIMIT $3
    `, [MAJOR_MERCHANTS, zeroDistricts, limit]);

    const stores = storesRes.rows;
    console.log(`\n📊 Found ${stores.length} major supermarket stores in zero-scraped districts.`);

    // Close the database connection early to prevent timeouts during long API polling loops
    try {
      await dbClient.end();
      console.log('✓ Database connection closed.');
    } catch (dbErr: any) {
      console.warn(`⚠️ Error closing database connection: ${dbErr.message}`);
    }

    if (stores.length === 0) {
      console.log('❌ No major supermarkets found in zero-scraped districts.');
      return;
    }

    // Print district coverage summary
    const byDistrict: Record<string, number> = {};
    for (const s of stores) {
      byDistrict[s.district] = (byDistrict[s.district] || 0) + 1;
    }
    console.log('\n📍 Districts to be scraped:');
    for (const [district, count] of Object.entries(byDistrict)) {
      console.log(`   ${district.padEnd(35)} → ${count} store(s)`);
    }
    console.log('');

    console.log(`⚙️  Triggering catalog scraping sequentially...\n`);

    for (let i = 0; i < stores.length; i++) {
      const store = stores[i];
      console.log(`[${i + 1}/${stores.length}] [${store.merchant_name}] in [${store.district || 'Unknown'}]`);
      console.log(`   URL: ${store.source_url}`);

      try {
        const triggerRes = await axios.post(
          `${API_BASE_URL}/ingestion/hs-catalog-scrape`,
          { storeUrl: store.source_url, dryRun: false },
          {
            headers: { 'x-dev-admin-secret': devSecret },
            validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
          },
        );

        if (triggerRes.status === 409) {
          console.warn(`   ⚠️  Conflict: scrape already in progress. Retrying in 15s...`);
          i--;
          await sleep(15000);
          continue;
        }

        const { jobId, message } = triggerRes.data;
        console.log(`   ✅ Enqueued! Job ID: ${jobId}. State: ${message || 'Queued'}`);

        // Poll until orchestrator finishes enqueuing category jobs
        console.log(`   ⏳ Waiting for orchestrator...`);
        let finished = false;
        while (!finished) {
          await sleep(3000);
          try {
            const statusRes = await axios.get(`${API_BASE_URL}/ingestion/jobs/${jobId}`, {
              headers: { 'x-dev-admin-secret': devSecret },
            });
            const state = statusRes.data?.state;
            if (state === 'completed' || state === 'failed') {
              console.log(`   🏁 Orchestrator done: ${state}`);
              finished = true;
            } else {
              process.stdout.write(`      State: ${state}...\r`);
            }
          } catch (err: any) {
            console.error(`      Poll error: ${err.message}`);
            finished = true;
          }
        }

        if (i < stores.length - 1) {
          console.log(`   💤 Sleeping ${delayBetweenStores / 1000}s to avoid flooding...`);
          await sleep(delayBetweenStores);
        }

      } catch (error: any) {
        console.error(`   ❌ Failed: ${error.response?.data?.message || error.message}`);
      }
      console.log('------------------------------------------------------------');
    }

    console.log('\n🎉 Done enqueuing zero-district major supermarkets!');
    console.log(`📊 Monitor at ${API_BASE_URL}/admin/queues`);

  } catch (error: any) {
    console.error(`❌ Global error: ${error.message}`);
  } finally {
    try {
      // @ts-ignore - access internal connection status if needed, or just call end() and catch
      if (dbClient && (dbClient as any)._connected) {
        await dbClient.end();
      }
    } catch (e) {}
  }
}

run();
