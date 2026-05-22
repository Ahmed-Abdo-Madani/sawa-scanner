import axios from 'axios';
import * as dotenv from 'dotenv';
import IORedis from 'ioredis';
import { Queue } from 'bullmq';
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

async function getQueueSize(): Promise<number> {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '15087', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  const queue = new Queue('etaam-gtin-ar-queue', { connection });
  try {
    const [waiting, active, delayed, prioritized] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getPrioritizedCount(),
    ]);
    return waiting + active + delayed + prioritized;
  } catch (err: any) {
    console.error(`⚠️ Error reading queue size from Redis:`, err.message);
    return 9999; // Return high number to wait if Redis is down/unreachable
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

async function triggerMultiStoreGtinArScrape() {
  console.log('🛒 Triggering Backpressured Multi-Store Arabic GTIN Enrichment Pipeline...');

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
  console.log(`🚀 Dispatching interleaved jobs sequentially in chunks...`);
  
  let offset = 0;
  const CHUNK_SIZE = 200; // 200 products * 6 stores = 1200 jobs at a time
  let hasMore = true;
  let totalEnqueued = 0;
  let totalSkipped = 0;

  try {
    while (hasMore) {
      // 1. Check current queue size to avoid OOM
      const currentQueueSize = await getQueueSize();
      console.log(`📊 Current queue size (active/waiting/delayed): ${currentQueueSize} jobs`);

      // We set a high-water threshold of 500 jobs (e.g. less than 1 chunk remaining) before adding more
      if (currentQueueSize > 500) {
        console.log(`⏳ Queue size (${currentQueueSize}) exceeds safety threshold (500). Sleeping for 30 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 30000));
        continue;
      }

      // If we have reached the user-defined limit, truncate the next chunk size
      const remainingLimit = parsedFlags.limit - (totalEnqueued / targetStores.length);
      if (remainingLimit <= 0) {
        console.log(`🎉 Reached user-defined product limit (${parsedFlags.limit}). Stopping enqueue loop.`);
        break;
      }
      const nextChunkLimit = Math.min(CHUNK_SIZE, remainingLimit);

      console.log(`🚀 Enqueuing chunk: offset=${offset}, limit=${nextChunkLimit} products...`);

      const payload = {
        ...parsedFlags,
        limit: nextChunkLimit,
        offset,
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
      console.log(`   └─ Response: enqueued=${enqueued}, skipped=${skipped}`);

      totalEnqueued += enqueued;
      totalSkipped += skipped;

      // If enqueued is less than requested chunk limit, database has no more products
      if (enqueued < nextChunkLimit * targetStores.length) {
        console.log(`🎉 All products in database successfully enqueued.`);
        hasMore = false;
        break;
      }

      // Move to next page offset
      offset += nextChunkLimit;

      // Rest for 5 seconds between enqueues to let BullMQ settle
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    console.log(`\n========================================`);
    console.log(`🎉 Pipeline Dispatch Complete!`);
    console.log(`📈 Total Enqueued: ${totalEnqueued}`);
    console.log(`⚠️ Total Skipped:  ${totalSkipped}`);
    console.log(`📊 Monitor the Bull Board at ${API_BASE_URL}/admin/queues to track progress.`);
  } catch (error: any) {
    console.error(`❌ Failed to trigger interleaved enrichment:`);
    if (error.response) {
      console.error(`   └─ Status: ${error.response.status}`);
      console.error(`   └─ Data:`, error.response.data);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

triggerMultiStoreGtinArScrape();
