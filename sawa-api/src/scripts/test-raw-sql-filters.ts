import { Client } from 'pg';
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

async function run() {
  try {
    await client.connect();
    console.log('Connected to PG.');

    // Run the category distinct query
    const res = await client.query(`
      SELECT DISTINCT(category) AS category
      FROM product
      WHERE category IS NOT NULL AND category != '' AND hs_product_id IS NOT NULL
      ORDER BY category ASC
    `);

    console.log('Categories Count:', res.rows.length);
    console.log('Categories Raw:', JSON.stringify(res.rows.slice(0, 10), null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
