import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
dotenv.config();

const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined
};

const ingestionQueue = new Queue('ingestion', { connection });

async function trigger() {
  const job = await ingestionQueue.add('scrape-category', {
    platform: 'ninja',
    categoryUrl: 'https://ananinja.com/sa/en/categories/dairy-eggs-21',
    pageRange: { start: 1, end: 1 }
  });
  console.log('Added job', job.id);
  process.exit(0);
}
trigger();
