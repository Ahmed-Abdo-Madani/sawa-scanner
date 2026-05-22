import IORedis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

async function inspectRedis() {
  const redis = new IORedis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '15087', 10),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  });

  try {
    console.log('Connecting to Redis...');
    
    // 1. Get memory info
    const info = await redis.info('memory');
    console.log('================ REDIS MEMORY INFO ================');
    console.log(info);

    // 2. Get some key stats or list large keys
    console.log('================ REDIS KEY COUNT ================');
    const keys = await redis.keys('*');
    console.log(`Total Keys in Redis: ${keys.length}`);

    // Group keys by prefix to see what's using memory
    const prefixes: Record<string, number> = {};
    for (const key of keys) {
      const parts = key.split(':');
      const prefix = parts.slice(0, 2).join(':');
      prefixes[prefix] = (prefixes[prefix] || 0) + 1;
    }

    console.log('\nKey Counts by Prefix:');
    Object.entries(prefixes)
      .sort((a, b) => b[1] - a[1])
      .forEach(([prefix, count]) => {
        console.log(`  ${prefix}: ${count} keys`);
      });

  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    redis.disconnect();
  }
}

inspectRedis();
