import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { NestFactory } from '@nestjs/core';

async function run() {
  console.log('🧟 Cleaning zombie active jobs...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const queue = app.get<Queue>(getQueueToken('ingestion-queue'));

  const activeJobs = await queue.getJobs(['active']);
  console.log(`Found ${activeJobs.length} active jobs.`);

  for (const job of activeJobs) {
    console.log(`Removing zombie job: ${job.id} (${job.name})`);
    await job.remove();
  }

  const waitingJobs = await queue.getJobs(['waiting']);
  console.log(`Found ${waitingJobs.length} waiting jobs.`);
  // Optional: remove all waiting too to start fresh
  for (const job of waitingJobs) {
    await job.remove();
  }

  console.log('✅ Clean complete.');
  await app.close();
  process.exit(0);
}

run();
