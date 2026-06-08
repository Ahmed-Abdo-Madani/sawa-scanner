const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function main() {
  const connection = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
  const queue = new Queue('ingestion-queue', { connection });

  console.log('Fetching all jobs...');
  const jobs = await queue.getJobs(['active', 'waiting', 'delayed', 'prioritized', 'completed', 'failed']);
  console.log(`Total jobs found: ${jobs.length}`);

  for (const job of jobs) {
    const state = await job.getState();
    console.log(`Job ID: ${job.id}, Name: ${job.name}, State: ${state}, Created At: ${new Date(job.timestamp)}`);
    if (job.name === 'hs-catalog-scrape' && ['waiting', 'delayed', 'active', 'prioritized'].includes(state)) {
      console.log(`Removing job ${job.id} to clear conflict...`);
      await job.remove();
      console.log(`Job ${job.id} removed.`);
    }
  }

  await connection.quit();
  console.log('Done.');
}

main().catch(console.error);
