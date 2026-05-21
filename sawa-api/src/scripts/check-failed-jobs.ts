import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from 'dotenv';
config();

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function run() {
  try {
    const queue = new Queue('etaam-gtin-ar-queue', { connection: redisConnection });
    
    const failedJobs = await queue.getJobs(['failed'], 0, 10);
    console.log(`\n======================================`);
    console.log(`❌ Failed Jobs In etaam-gtin-ar-queue (${failedJobs.length} shown)`);
    console.log(`======================================`);
    
    for (const job of failedJobs) {
      console.log(`Job ID: ${job.id}`);
      console.log(`Product: ${job.data?.productNameAr} (ID: ${job.data?.productId})`);
      console.log(`Failed Reason: ${job.failedReason}`);
      if (job.stacktrace && job.stacktrace.length > 0) {
        console.log(`Stacktrace Snippet:\n${job.stacktrace[0].substring(0, 300)}...`);
      }
      console.log('--------------------------------------');
    }
  } catch (error) {
    console.error('Error checking failed jobs:', error);
  } finally {
    await redisConnection.quit();
  }
}

run();
