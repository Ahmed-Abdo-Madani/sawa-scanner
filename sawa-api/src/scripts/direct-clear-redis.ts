import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const username = process.env.REDIS_USERNAME || undefined;
  const useTls = process.env.REDIS_TLS === 'true';

  console.log(`🔌 Connecting directly to Redis at ${host}:${port} (TLS: ${useTls})...`);
  
  const redisOptions: any = {
    host,
    port,
    username: username === 'default' ? undefined : username,
    password,
    maxRetriesPerRequest: null,
  };

  if (useTls) {
    redisOptions.tls = { rejectUnauthorized: false };
  }

  const redis = new Redis(redisOptions);

  try {
    console.log('🔍 Finding all BullMQ keys matching "bull:*"...');
    const keys = await redis.keys('bull:*');
    console.log(`Found ${keys.length} keys.`);

    if (keys.length > 0) {
      console.log('🧹 Deleting keys...');
      const batchSize = 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const chunk = keys.slice(i, i + batchSize);
        await redis.del(...chunk);
      }
      console.log('✅ Keys deleted successfully!');
    } else {
      console.log('ℹ️ No keys found.');
    }

  } catch (err: any) {
    console.error('❌ Redis clear failed:', err.message);
  } finally {
    redis.disconnect();
    console.log('🔌 Disconnected.');
    process.exit(0);
  }
}

run();
