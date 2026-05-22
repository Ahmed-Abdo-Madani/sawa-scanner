import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

async function inspectQueue() {
  const connection = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '15087', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  const queue = new Queue('etaam-gtin-ar-queue', { connection });

  try {
    console.log('Connecting to queue...');
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
      queue.getFailedCount(),
      queue.getCompletedCount(),
    ]);

    console.log('================ QUEUE JOB STATES ================');
    console.log(`Waiting:   ${waiting}`);
    console.log(`Active:    ${active}`);
    console.log(`Delayed:   ${delayed}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Completed: ${completed}`);
    console.log(`Total:     ${waiting + active + delayed + failed + completed}`);

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await queue.close();
    connection.disconnect();
  }
}

inspectQueue();
