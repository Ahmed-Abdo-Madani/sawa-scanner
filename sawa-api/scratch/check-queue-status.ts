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
  const priceScrapingQueue = new Queue('price-scraping-queue', { connection });

  try {
    const ingestionCounts = await ingestionQueue.getJobCounts();
    console.log('\n--- ingestion-queue Job Counts ---');
    console.log(JSON.stringify(ingestionCounts, null, 2));

    const activeIngestion = await ingestionQueue.getJobs(['active']);
    console.log(`\nActive Ingestion Jobs (${activeIngestion.length}):`);
    activeIngestion.forEach(job => {
      console.log(`- ID: ${job.id}, Name: ${job.name}, Progress: ${job.progress}`);
    });

    const waitingIngestion = await ingestionQueue.getJobs(['waiting']);
    console.log(`\nWaiting Ingestion Jobs (${waitingIngestion.length}):`);
    waitingIngestion.forEach(job => {
      console.log(`- ID: ${job.id}, Name: ${job.name}`);
    });

    const priceCounts = await priceScrapingQueue.getJobCounts();
    console.log('\n--- price-scraping-queue Job Counts ---');
    console.log(JSON.stringify(priceCounts, null, 2));

  } catch (error) {
    console.error('Error querying queues:', error);
  } finally {
    await ingestionQueue.close();
    await priceScrapingQueue.close();
  }
}

main().catch(console.error);
