import { Client } from 'pg';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from 'dotenv';
config();

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '15087', 10),
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database.');

    // 1. Get database statistics for HungerStation products
    const statsRes = await client.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN gtin IS NOT NULL THEN 1 END) as with_gtin,
        COUNT(CASE WHEN gtin IS NULL THEN 1 END) as without_gtin
      FROM product
      WHERE hs_product_id IS NOT NULL
    `);
    
    const stats = statsRes.rows[0];
    console.log('\n======================================');
    console.log('📊 HungerStation GTIN Statistics');
    console.log('======================================');
    console.log(`Total HS Products:    ${stats.total}`);
    console.log(`With GTIN:            ${stats.with_gtin} (${stats.total > 0 ? ((stats.with_gtin / stats.total) * 100).toFixed(2) : 0}%)`);
    console.log(`Without GTIN:         ${stats.without_gtin} (${stats.total > 0 ? ((stats.without_gtin / stats.total) * 100).toFixed(2) : 0}%)`);
    console.log('======================================\n');

    // 2. Show top 15 recently updated HungerStation products with GTINs
    const recentRes = await client.query(`
      SELECT id, name_ar, name_en, gtin, updated_at
      FROM product
      WHERE hs_product_id IS NOT NULL AND gtin IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 15
    `);
    
    console.log('➡️ Recently Matched Products:');
    console.table(recentRes.rows.map(row => ({
      ID: row.id,
      'Arabic Name': row.name_ar,
      'English Name': row.name_en,
      GTIN: row.gtin,
      'Updated At': row.updated_at
    })));

    // 3. Get BullMQ Queue status
    const queue = new Queue('etaam-gtin-ar-queue', { connection: redisConnection });
    
    const waiting = await queue.getWaitingCount();
    const active = await queue.getActiveCount();
    const completed = await queue.getCompletedCount();
    const failed = await queue.getFailedCount();
    
    console.log('\n======================================');
    console.log('🐂 BullMQ Queue: etaam-gtin-ar-queue');
    console.log('======================================');
    console.log(`Waiting:   ${waiting}`);
    console.log(`Active:    ${active}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed:    ${failed}`);
    console.log('======================================\n');

  } catch (error) {
    console.error('Error running stats script:', error);
  } finally {
    await client.end();
    await redisConnection.quit();
  }
}

run();
