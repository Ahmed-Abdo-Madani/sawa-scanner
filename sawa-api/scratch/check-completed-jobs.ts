import { Queue } from 'bullmq';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  const connection = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME,
  };

  console.log(`Connecting to Redis at ${connection.host}:${connection.port}...`);

  const ingestionQueue = new Queue('ingestion-queue', { connection });

  try {
    const completedJobs = await ingestionQueue.getJobs(['completed']);
    console.log(`\n--- Completed Jobs in ingestion-queue (${completedJobs.length}) ---`);
    
    // Sort by id descending
    completedJobs.sort((a, b) => parseInt(b.id || '0') - parseInt(a.id || '0'));

    for (const job of completedJobs) {
      if (job.name === 'hs-catalog-scrape') {
        console.log(`\nJob ID: ${job.id}`);
        console.log(`Name: ${job.name}`);
        console.log(`Data: ${JSON.stringify(job.data)}`);
        console.log(`Result: ${JSON.stringify(job.returnvalue)}`);
        console.log('------------------------------------------------------------');
      }
    }

  } catch (error) {
    console.error('Error querying queues:', error);
  } finally {
    await ingestionQueue.close();
  }
}

main().catch(console.error);
