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
    console.log('Connecting to Redis...');
    const clientListRaw = await redis.call('CLIENT', 'LIST');
    console.log('Successfully retrieved client list.\n');

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

    console.log(`Total Connections reported by Redis: ${clients.length}`);
    console.log('------------------------------------------------------------');

    let idleCount = 0;
    let activeCount = 0;

    clients.forEach((c, index) => {
      const idleSeconds = parseInt(c.idle || '0');
      const ageSeconds = parseInt(c.age || '0');
      const idleMinutes = (idleSeconds / 60).toFixed(1);
      const ageHours = (ageSeconds / 3600).toFixed(1);
      
      console.log(`[Client #${index + 1}] ID: ${c.id}, Addr: ${c.addr}, Name: "${c.name || ''}", cmd: "${c.cmd || ''}", age: ${ageHours}h, idle: ${idleMinutes}m, db: ${c.db}`);
      
      if (idleSeconds > 300) { // idle for more than 5 minutes
        idleCount++;
      } else {
        activeCount++;
      }
    });

    console.log('------------------------------------------------------------');
    console.log(`Summary:`);
    console.log(`- Active clients (idle <= 5 mins): ${activeCount}`);
    console.log(`- Idle clients (idle > 5 mins): ${idleCount}`);

  } catch (error) {
    console.error('Error fetching client list:', error);
  } finally {
    await redis.quit();
  }
}

main();
