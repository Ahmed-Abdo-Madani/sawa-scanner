import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from '../config/queue.constants';
import * as dotenv from 'dotenv';

dotenv.config();

// Comment 3: Reuse connection parameters from environment
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function checkQueue() {
  // Comment 3: Use centralized queue name constant
  const queue = new Queue(QUEUE_NAMES.INGESTION, { connection });

  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const completed = await queue.getCompletedCount();
  const failed = await queue.getFailedCount();

  console.log('--- Ingestion Queue Status ---');
  console.log(`Waiting: ${waiting}`);
  console.log(`Active: ${active}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);

  const jobs = await queue.getJobs(['waiting', 'active', 'failed'], 0, 10);
  console.log('\n--- Recent Jobs ---');
  for (const job of jobs) {
    console.log(
      `ID: ${job.id}, Name: ${job.name}, State: ${await job.getState()}, Data: ${JSON.stringify(job.data)}`,
    );
    if (job.failedReason) {
      console.log(`  Failed: ${job.failedReason}`);
    }
  }

  process.exit(0);
}

checkQueue().catch((err) => {
  console.error(err);
  process.exit(1);
});
