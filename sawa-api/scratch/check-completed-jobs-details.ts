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
    const completedJobs = await queue.getCompleted(0, 10);
    console.log(`\n--- Last ${completedJobs.length} Completed Jobs ---`);
    for (const job of completedJobs) {
      console.log(`- ID: ${job.id}`);
      console.log(`  Name: ${job.name}`);
      console.log(`  Finished Time: ${job.finishedOn ? new Date(job.finishedOn).toISOString() : 'N/A'}`);
      console.log(`  ReturnValue: ${JSON.stringify(job.returnvalue)}`);
      console.log('-------------------------------------------');
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await connection.quit();
  }
}

main();
