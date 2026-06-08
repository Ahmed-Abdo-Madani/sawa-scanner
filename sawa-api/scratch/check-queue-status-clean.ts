import { Queue } from 'bullmq';
import Redis from 'ioredis';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load env variables
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
    const activeCount = await queue.getActiveCount();
    const waitingCount = await queue.getWaitingCount();
    const delayedCount = await queue.getDelayedCount();
    const failedCount = await queue.getFailedCount();
    const completedCount = await queue.getCompletedCount();

    console.log('\n=====================================');
    console.log('--- BullMQ Ingestion Queue Summary ---');
    console.log(`ActiveCount:    ${activeCount}`);
    console.log(`WaitingCount:   ${waitingCount}`);
    console.log(`DelayedCount:   ${delayedCount}`);
    console.log(`FailedCount:    ${failedCount}`);
    console.log(`CompletedCount: ${completedCount}`);
    console.log('=====================================\n');

    // Group active jobs by name
    const activeJobs = await queue.getActive();
    const activeGroup: Record<string, number> = {};
    activeJobs.forEach(job => {
      activeGroup[job.name] = (activeGroup[job.name] || 0) + 1;
    });

    console.log('--- Active Jobs Breakdown ---');
    if (Object.keys(activeGroup).length > 0) {
      Object.entries(activeGroup).forEach(([name, count]) => {
        console.log(`  - ${name}: ${count}`);
      });
    } else {
      console.log('  No active jobs.');
    }

    // Group waiting jobs by name
    const waitingJobs = await queue.getWaiting();
    const waitingGroup: Record<string, number> = {};
    waitingJobs.forEach(job => {
      waitingGroup[job.name] = (waitingGroup[job.name] || 0) + 1;
    });

    console.log('\n--- Waiting Jobs Breakdown ---');
    if (Object.keys(waitingGroup).length > 0) {
      Object.entries(waitingGroup).forEach(([name, count]) => {
        console.log(`  - ${name}: ${count}`);
      });
    } else {
      console.log('  No waiting jobs.');
    }

    // Print details of the active jobs (safe since activeCount is usually small)
    if (activeJobs.length > 0) {
      console.log('\n--- Active Jobs Details ---');
      activeJobs.forEach(job => {
        console.log(`- ID: ${job.id}, Name: ${job.name}, Data: ${JSON.stringify(job.data).slice(0, 150)}...`);
      });
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.quit();
  }
}

main();

