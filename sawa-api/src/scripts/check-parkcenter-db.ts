import { Client } from 'pg';
import Redis from 'ioredis';
import { config } from 'dotenv';
config();

async function run() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL successfully.\n');

    // 1. Total Park Center Products
    const prodRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM product 
      WHERE data_source = 'parkcenter'
    `);
    console.log(`📦 Total Park Center Products: ${prodRes.rows[0].count}`);

    // 2. Total Park Center Prices
    const priceRes = await client.query(`
      SELECT COUNT(*) as count 
      FROM product_price pp
      JOIN merchant m ON pp.merchant_id = m.id
      WHERE m.name_en = 'Park Center'
    `);
    console.log(`💰 Total Park Center Prices: ${priceRes.rows[0].count}`);

    // 3. Sample of latest products
    const sampleRes = await client.query(`
      SELECT id, name_ar, gtin, category 
      FROM product 
      WHERE data_source = 'parkcenter'
      ORDER BY id DESC
      LIMIT 5
    `);
    if (sampleRes.rows.length > 0) {
      console.log('\n🔍 Sample Park Center Products in DB:');
      console.table(sampleRes.rows);
    }

    // 4. Redis Queue Status
    const redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
    });

    try {
      const waitCount = await redis.llen('bull:ingestion-queue:wait');
      const activeCount = await redis.llen('bull:ingestion-queue:active');
      const delayedCount = await redis.zcard('bull:ingestion-queue:delayed');
      console.log(`\n📬 Ingestion Queue Status:`);
      console.log(`- Wait list length  : ${waitCount}`);
      console.log(`- Active list length: ${activeCount}`);
      console.log(`- Delayed list length: ${delayedCount}`);
    } catch (err: any) {
      console.error('Failed to get Redis queue status:', err.message);
    } finally {
      await redis.quit();
    }

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await client.end();
  }
}

run();
