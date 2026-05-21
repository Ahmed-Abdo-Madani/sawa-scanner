import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function triggerEtaamGtinArScrape() {
  console.log('🛒 Triggering Etaam Express ARABIC GTIN Enrichment Job...');

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

  try {
    console.log('Parsed configuration:', JSON.stringify(parsedFlags, null, 2));

    const res = await axios.post(
      `${API_BASE_URL}/ingestion/etaam-gtin-ar`,
      parsedFlags,
      {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
      },
    );

    const { enqueued, skipped } = res.data;

    console.log('✅ Etaam GTIN Arabic Enrichment job triggered successfully!');
    console.log(`🚀 Enqueued: ${enqueued} products (Arabic names)`);
    console.log(`⚠️  Skipped:  ${skipped} products`);
    console.log(
      '\n📊 Monitor the Bull Board at http://localhost:3000/admin/queues to track progress.',
    );
  } catch (error: any) {
    console.error('❌ Failed to trigger Etaam GTIN Arabic Enrichment:');
    console.error(
      'Error:',
      error.response?.data?.message || error.message,
    );
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error(
        'ℹ️  Authentication failed. Check DEV_ADMIN_SECRET in .env',
      );
    }
    process.exit(1);
  }
}

triggerEtaamGtinArScrape();
