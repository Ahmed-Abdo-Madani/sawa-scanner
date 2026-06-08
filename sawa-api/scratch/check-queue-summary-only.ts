import { Queue } from 'bullmq';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  const connection = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  const queue = new Queue('ingestion-queue', { connection });

  try {
    const active = await queue.getActiveCount();
    const waiting = await queue.getWaitingCount();
    const delayed = await queue.getDelayedCount();
    const failed = await queue.getFailedCount();
    const completed = await queue.getCompletedCount();

    console.log('\n=====================================');
    console.log('--- BullMQ Ingestion Queue Summary ---');
    console.log(`Active:    ${active}`);
    console.log(`Waiting:   ${waiting}`);
    console.log(`Delayed:   ${delayed}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Completed: ${completed}`);
    console.log('=====================================\n');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.quit();
  }
}

main();
