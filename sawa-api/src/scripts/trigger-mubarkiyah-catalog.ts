import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function triggerMubarkiyahCatalogScrape() {
  console.log('🏪 Triggering Mubarkiyah Catalog Scrape...');

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const parsedFlags: any = {
    dryRun: false,
    triggerOtherStoresSearch: false, // Default to false to avoid cross-store triggers
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      parsedFlags.dryRun = true;
    } else if (arg === '--no-dry-run') {
      parsedFlags.dryRun = false;
    } else if (arg === '--delay' && i + 1 < args.length) {
      parsedFlags.delayMs = parseInt(args[i + 1], 10);
      i++;
    } else if (arg.startsWith('--delay=')) {
      parsedFlags.delayMs = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--search') {
      parsedFlags.triggerOtherStoresSearch = true;
    } else if (arg === '--fresh') {
      parsedFlags.fresh = true;
    }
  }

  try {
    console.log('Parsed flags:', JSON.stringify(parsedFlags, null, 2));

    const res = await axios.post(
      `${API_BASE_URL}/ingestion/mubarkiyah-catalog-scrape`,
      parsedFlags,
      {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
        validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
      },
    );

    const { jobId, created, message } = res.data;

    if (res.status === 409 || !created) {
      console.warn('⚠️  Mubarkiyah catalog scrape not queued (conflict):');
      console.warn('Message:', message || 'A scrape is already in progress.');
      process.exit(0);
    }

    console.log('✅ Mubarkiyah Catalog Scrape job triggered successfully!');
    console.log('Job ID:', jobId);
    console.log('Status:', message || 'Job queued.');
    console.log('Full response:', JSON.stringify(res.data, null, 2));
    console.log(
      '\n📊 Monitor the Bull Board at http://localhost:3000/admin/queues to track progress.',
    );
  } catch (error: any) {
    console.error('❌ Failed to trigger Mubarkiyah catalog scrape:');
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

triggerMubarkiyahCatalogScrape();
