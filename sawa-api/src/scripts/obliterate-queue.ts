import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(
  'redis://:odOxk0Z4tiTnbDFLMTLpitlYlBiDMS1h@redis-15087.crce176.me-central-1-1.ec2.cloud.redislabs.com:15087',
);

async function obliterateQueue() {
  const queue = new Queue('ingestion-queue', { connection });
  console.log('🚀 Obliterating ingestion-queue...');
  await queue.obliterate({ force: true });
  console.log('✅ Queue obliterated.');
  process.exit(0);
}

obliterateQueue().catch((err) => {
  console.error(err);
  process.exit(1);
});
