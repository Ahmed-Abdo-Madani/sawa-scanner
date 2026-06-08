import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';

async function main() {
  const connection = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME || 'default',
  });

  const queue = new Queue('ingestion-queue', { connection });

  try {
    const active = await queue.getActiveCount();
    const waiting = await queue.getWaitingCount();
    const delayed = await queue.getDelayedCount();
    const failed = await queue.getFailedCount();
    const completed = await queue.getCompletedCount();

    console.log('\n--- BullMQ Ingestion Queue Status ---');
    console.log(`Active: ${active}`);
    console.log(`Waiting: ${waiting}`);
    console.log(`Delayed: ${delayed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Completed: ${completed}`);

    const activeJobs = await queue.getActive();
    if (activeJobs.length > 0) {
      console.log('\nActive Jobs:');
      activeJobs.forEach(job => {
        console.log(`- ID: ${job.id}, Name: ${job.name}, Data: ${JSON.stringify(job.data)}`);
      });
    } else {
      console.log('\nNo active jobs running in the queue.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.quit();
  }
}

// Load env variables
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

main();
