const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  const redis = new Redis({
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    username: process.env.REDIS_USERNAME || 'default',
  });

  try {
    console.log('Connecting to Redis to clean up zombie clients...');
    const clientListRaw = await redis.call('CLIENT', 'LIST');
    
    const clients = clientListRaw.split('\n').filter(line => line.trim().length > 0).map(line => {
      const parts = line.split(' ');
      const client = {};
      parts.forEach(part => {
        const [key, value] = part.split('=');
        if (key && value !== undefined) {
          client[key] = value;
        }
      });
      return client;
    });

    console.log(`Currently connected clients: ${clients.length}`);
    
    let killedCount = 0;
    for (const c of clients) {
      const idleSeconds = parseInt(c.idle || '0');
      // If idle for more than 15 minutes (900 seconds) AND it's from the ISP IP 185.26.10.211 (or just idle > 15m)
      if (idleSeconds > 900) {
        console.log(`Killing idle client ID: ${c.id}, Addr: ${c.addr}, Name: "${c.name || ''}", idle: ${(idleSeconds/60).toFixed(1)}m`);
        try {
          await redis.call('CLIENT', 'KILL', `ID`, c.id);
          killedCount++;
        } catch (killErr) {
          console.error(`Failed to kill client ${c.id}:`, killErr.message);
        }
      }
    }

    console.log(`\nClean-up finished! Killed ${killedCount} zombie connection(s).`);

  } catch (error) {
    console.error('Error during client clean-up:', error);
  } finally {
    await redis.quit();
  }
}

main();
