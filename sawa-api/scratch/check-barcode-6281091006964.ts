import { Client } from 'pg';
import { config } from 'dotenv';
import * as path from 'path';

config({ path: path.join(__dirname, '../.env') });

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  const barcode = '6281091006964';
  try {
    await client.connect();
    console.log('Connected to DB.');

    // Find the product
    const productRes = await client.query(`
      SELECT * FROM product WHERE gtin = $1
    `, [barcode]);

    console.log(`Product query result count: ${productRes.rows.length}`);
    if (productRes.rows.length > 0) {
      const product = productRes.rows[0];
      console.log('Found Product:', product);

      // Find prices
      const pricesRes = await client.query(`
        SELECT p.*, m.name_en as merchant_name 
        FROM product_price p
        LEFT JOIN merchant m ON p.merchant_id = m.id
        WHERE p.product_id = $1
      `, [product.id]);
      console.log('Prices associated:', pricesRes.rows);
    } else {
      console.log('Product not found in DB.');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

run();
