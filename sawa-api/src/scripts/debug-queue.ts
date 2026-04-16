import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis('redis://:odOxk0Z4tiTnbDFLMTLpitlYlBiDMS1h@redis-15087.crce176.me-central-1-1.ec2.cloud.redislabs.com:15087');

async function checkQueue() {
  const queue = new Queue('ingestion-queue', { connection });
  
  const waiting = await queue.getWaitingCount();
  const active = await queue.getActiveCount();
  const completed = await queue.getCompletedCount();
  const failed = await queue.getFailedCount();
  
  console.log('--- Ingestion Queue Status ---');
  console.log(`Waiting: ${waiting}`);
  console.log(`Active: ${active}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  
  const jobs = await queue.getJobs(['waiting', 'active', 'failed'], 0, 10);
  console.log('\n--- Recent Jobs ---');
  for (const job of jobs) {
    console.log(`ID: ${job.id}, Name: ${job.name}, State: ${await job.getState()}, Data: ${JSON.stringify(job.data)}`);
    if (job.failedReason) {
      console.log(`  Failed: ${job.failedReason}`);
    }
  }
  
  process.exit(0);
}

checkQueue().catch(err => {
  console.error(err);
  process.exit(1);
});
