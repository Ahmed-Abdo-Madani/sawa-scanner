import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { QUEUE_NAMES } from '../config/queue.constants';
import * as dotenv from 'dotenv';

dotenv.config();

// Comment 3: Reuse connection parameters from environment
const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function obliterateQueue() {
  // Comment 3: Use centralized queue name constant
  const queue = new Queue(QUEUE_NAMES.INGESTION, { connection });
  console.log('🚀 Obliterating ingestion-queue...');
  await queue.obliterate({ force: true });
  console.log('✅ Queue obliterated.');
  process.exit(0);
}

obliterateQueue().catch((err) => {
  console.error(err);
  process.exit(1);
});
