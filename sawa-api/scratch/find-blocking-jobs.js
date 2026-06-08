const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function main() {
  const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  const queue = new Queue('ingestion-queue', { connection });

  console.log('Checking active/waiting/delayed/prioritized jobs:');
  const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
  console.log(`Count: ${jobs.length}`);
  
  for (const job of jobs) {
    const state = await job.getState();
    console.log(`Job ID: ${job.id}, Name: ${job.name}, State: ${state}`);
  }

  await connection.quit();
}

main().catch(console.error);
