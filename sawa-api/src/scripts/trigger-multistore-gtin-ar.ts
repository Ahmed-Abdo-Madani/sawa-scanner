import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

const targetStores = [
  { url: 'https://store.shonaksa.com', platform: 'salla' },
  { url: 'https://yasminstore.com', platform: 'salla' },
  { url: 'https://mrlogman.com', platform: 'salla' },
  { url: 'https://parkcentersa.com', platform: 'zid' },
  { url: 'https://menhal.sa', platform: 'zid' },
  { url: 'https://etaamexpress.com', platform: 'salla' },
];

async function triggerMultiStoreGtinArScrape() {
  console.log('🛒 Triggering Multi-Store Arabic GTIN Enrichment Pipeline...');

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const parsedFlags: any = {
    limit: 1000,
    merchantName: 'HungerStation',
    threshold: 0.7,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      parsedFlags.dryRun = true;
    } else if (arg === '--no-dry-run') {
      parsedFlags.dryRun = false;
    } else if (arg === '--limit' && i + 1 < args.length) {
      parsedFlags.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (arg.startsWith('--limit=')) {
      parsedFlags.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--merchant' && i + 1 < args.length) {
      parsedFlags.merchantName = args[i + 1];
      i++;
    } else if (arg.startsWith('--merchant=')) {
      parsedFlags.merchantName = arg.split('=')[1];
    } else if (arg === '--threshold' && i + 1 < args.length) {
      parsedFlags.threshold = parseFloat(args[i + 1]);
      i++;
    } else if (arg.startsWith('--threshold=')) {
      parsedFlags.threshold = parseFloat(arg.split('=')[1]);
    }
  }

  console.log('Parsed configuration:', JSON.stringify(parsedFlags, null, 2));

  console.log(`\n----------------------------------------`);
  console.log(`🚀 Dispatching interleaved jobs for stores: ${JSON.stringify(targetStores.map(s => s.url))}`);
  
  try {
    const payload = {
      ...parsedFlags,
      stores: targetStores,
    };

    const res = await axios.post(
      `${API_BASE_URL}/ingestion/etaam-gtin-ar/multistore`,
      payload,
      {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
      },
    );

    const { enqueued, skipped } = res.data;
    console.log(`✅ Success: enqueued=${enqueued}, skipped=${skipped}`);
    console.log(`\n========================================`);
    console.log(`🎉 Pipeline Dispatch Complete!`);
    console.log(`📈 Total Enqueued: ${enqueued}`);
    console.log(`⚠️ Total Skipped:  ${skipped}`);
    console.log(`📊 Monitor the Bull Board at ${API_BASE_URL}/admin/queues to track progress.`);
  } catch (error: any) {
    console.error(`❌ Failed to trigger interleaved enrichment:`);
    console.error('Full Error:', error);
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(
        'ℹ️  Authentication failed. Check DEV_ADMIN_SECRET in .env',
      );
      process.exit(1);
    }
  }
}

triggerMultiStoreGtinArScrape();
