import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function clearQueues() {
  const queuesToClear = ['etaam-gtin-ar-queue', 'etaam-gtin-queue'];

  for (const queueName of queuesToClear) {
    console.log(`🧹 Connecting to ${queueName}...`);
    const queue = new Queue(queueName, { connection });

    try {
      console.log(`   └─ Draining waiting/delayed jobs...`);
      await queue.drain(true);
      console.log(`   └─ Obliterating queue metadata...`);
      await queue.obliterate({ force: true });
      console.log(`✅ Queue "${queueName}" successfully cleared and obliterated.\n`);
    } catch (err: any) {
      console.error(`❌ Failed to clear queue "${queueName}":`, err.message);
    } finally {
      await queue.close();
    }
  }

  connection.disconnect();
  console.log('🏁 Redis connection closed.');
  process.exit(0);
}

clearQueues().catch((err) => {
  console.error('Fatal error during queue clearing:', err);
  process.exit(1);
});
