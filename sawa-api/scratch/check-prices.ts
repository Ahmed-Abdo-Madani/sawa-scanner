import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const res = await client.query(`
      SELECT 
        pp.id AS price_id,
        p.gtin,
        p.name_en,
        p.id AS product_id
      FROM product_price pp
      JOIN product p ON pp.product_id = p.id
      WHERE pp.store_id = '11473f88-9c37-45a4-b9a5-76efc187b67c'
      LIMIT 5
    `);
    
    res.rows.forEach(row => {
      console.log(`- ProductID: ${row.product_id} | GTIN: ${row.gtin} | Name: "${row.name_en}"`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
