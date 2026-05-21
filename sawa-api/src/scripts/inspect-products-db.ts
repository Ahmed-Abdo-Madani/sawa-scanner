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
    console.log('Connected to PostgreSQL database successfully.');

    // 1. Check categories for HungerStation products
    const hsCategories = await client.query(`
      SELECT category, COUNT(*) as count
      FROM product
      WHERE hs_product_id IS NOT NULL
      GROUP BY category
      ORDER BY count DESC
    `);
    console.log('\nHungerStation categories (hs_product_id IS NOT NULL):');
    console.table(hsCategories.rows);

    // 2. Check brands for HungerStation products
    const hsBrands = await client.query(`
      SELECT brand, COUNT(*) as count
      FROM product
      WHERE hs_product_id IS NOT NULL
      GROUP BY brand
      ORDER BY count DESC
    `);
    console.log('\nHungerStation brands (hs_product_id IS NOT NULL):');
    console.table(hsBrands.rows);

    // 3. Check some sample products
    const sampleProducts = await client.query(`
      SELECT id, name_en, name_ar, brand, category, hs_product_id
      FROM product
      WHERE hs_product_id IS NOT NULL
      LIMIT 10
    `);
    console.log('\nSample HungerStation products:');
    console.table(sampleProducts.rows);

  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await client.end();
  }
}

run();
