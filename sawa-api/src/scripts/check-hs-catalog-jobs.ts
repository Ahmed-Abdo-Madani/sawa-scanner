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
    const queue = new Queue('ingestion-queue', { connection: redisConnection });
    
    const failedJobs = await queue.getJobs(['failed']);
    const completedJobs = await queue.getJobs(['completed']);
    const activeJobs = await queue.getJobs(['active']);
    const waitingJobs = await queue.getJobs(['waiting']);

    console.log(`\nQueue Stats:`);
    console.log(`- Active:    ${activeJobs.length}`);
    console.log(`- Waiting:   ${waitingJobs.length}`);
    console.log(`- Completed: ${completedJobs.length}`);
    console.log(`- Failed:    ${failedJobs.length}`);

    console.log(`\n======================================`);
    console.log(`❌ Failed Jobs in ingestion-queue (First 20 details)`);
    console.log(`======================================`);
    
    let hsFailedCount = 0;
    for (const job of failedJobs) {
      if (job.name.includes('hs-')) {
        hsFailedCount++;
        if (hsFailedCount <= 20) {
          console.log(`Job ID: ${job.id} | Name: ${job.name}`);
          console.log(`Store URL: ${job.data?.storeUrl}`);
          console.log(`Failed Reason: ${job.failedReason}`);
          if (job.stacktrace && job.stacktrace.length > 0) {
            console.log(`Stacktrace:\n${job.stacktrace[0].substring(0, 400)}`);
          }
          console.log('--------------------------------------');
        }
      }
    }
    console.log(`Total Failed HS Jobs: ${hsFailedCount}`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await redisConnection.quit();
  }
}

run();
