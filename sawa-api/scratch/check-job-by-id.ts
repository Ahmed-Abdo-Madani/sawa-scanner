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
  const jobId = process.argv[2];
  if (!jobId) {
    console.error('Usage: npx ts-node scratch/check-job-by-id.ts <jobId>');
    process.exit(1);
  }

  const connection = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
  });

  const queue = new Queue('ingestion-queue', { connection });

  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      console.log(`Job ${jobId} not found in the queue.`);
      
      // Let's also check if there's any job containing the branch UUID for Dolphin
      const active = await queue.getActive();
      const completed = await queue.getCompleted();
      const failed = await queue.getFailed();
      const waiting = await queue.getWaiting();
      
      const allJobs = [...active, ...completed, ...failed, ...waiting];
      const matches = allJobs.filter(j => j.id?.includes('171560') || j.data?.storeUrl?.includes('171560'));
      if (matches.length > 0) {
        console.log('\nFound matching jobs:');
        for (const m of matches) {
          console.log(`- ID: ${m.id}, Name: ${m.name}, State: ${await m.getState()}, FailedReason: ${m.failedReason}`);
        }
      } else {
        console.log('\nNo matching jobs for Dolphin branch found.');
      }
      return;
    }

    console.log(`Job ID: ${job.id}`);
    console.log(`Name: ${job.name}`);
    console.log(`State: ${await job.getState()}`);
    console.log(`Failed Reason: ${job.failedReason}`);
    console.log(`ReturnValue: ${JSON.stringify(job.returnvalue)}`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.quit();
  }
}

main();
