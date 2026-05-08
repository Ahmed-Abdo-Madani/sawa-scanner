import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import { QUEUE_NAMES } from '../config/queue.constants';

dotenv.config();

// Comment 3: Reuse Redis connection config from central location
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null, // Critical requirement for BullMQ
};

// Comment 3: Use the same queue name registered in ingestion.module.ts
const ingestionQueue = new Queue(QUEUE_NAMES.INGESTION, { connection });

async function trigger() {
  const job = await ingestionQueue.add('scrape-category', {
    platform: 'ninja',
    categoryUrl: 'https://ananinja.com/sa/en/categories/dairy-eggs-21',
    pageRange: { start: 1, end: 1 },
  });
  console.log('Added job', job.id);
  process.exit(0);
}
trigger();
