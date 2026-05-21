import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function inspectQueue() {
  const queueName = 'etaam-gtin-ar-queue';
  console.log(`🔍 Inspecting waiting jobs in ${queueName}...`);
  const queue = new Queue(queueName, { connection });

  try {
    const jobs = await queue.getJobs(['waiting', 'delayed']);
    console.log(`📋 Total waiting/delayed jobs found: ${jobs.length}`);

    // Let's inspect the first 30 jobs
    const sampleSize = Math.min(30, jobs.length);
    console.log(`\n🔍 First ${sampleSize} jobs:`);
    for (let i = 0; i < sampleSize; i++) {
      const job = jobs[i];
      const payload = job.data;
      console.log(`[${i + 1}] ID: ${job.id} | Product ID: ${payload.productId} | Store: ${payload.storeUrl} | Platform: ${payload.storePlatform}`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to inspect queue:`, err.message);
  } finally {
    await queue.close();
  }

  connection.disconnect();
  console.log('\n🏁 Done.');
  process.exit(0);
}

inspectQueue().catch((err) => {
  console.error('Fatal error during queue inspection:', err);
  process.exit(1);
});
