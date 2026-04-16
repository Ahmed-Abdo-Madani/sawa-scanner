import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AppModule } from '../app.module';
import { NestFactory } from '@nestjs/core';

async function run() {
  console.log('🧹 Clearing ingestion-queue...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const queue = app.get<Queue>(getQueueToken('ingestion-queue'));
  
  await queue.drain(true); // Removes all waiting/delayed jobs
  await queue.obliterate(); // Removes everything including metadata
  
  console.log('✅ Queue cleared.');
  await app.close();
  process.exit(0);
}

run();
