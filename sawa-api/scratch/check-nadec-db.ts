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
  const barcode = '6281057030040';
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

      // Let's delete the product to force seeding
      console.log('Deleting prices for product...');
      await client.query(`DELETE FROM product_price WHERE product_id = $1`, [product.id]);
      
      console.log('Deleting product images...');
      await client.query(`DELETE FROM product_image WHERE product_id = $1`, [product.id]);

      console.log('Deleting product allergens...');
      await client.query(`DELETE FROM product_allergen WHERE product_id = $1`, [product.id]);

      console.log('Deleting nutrition facts...');
      await client.query(`DELETE FROM nutrition_fact WHERE product_id = $1`, [product.id]);

      console.log('Deleting product alternative names...');
      await client.query(`DELETE FROM product_alternative_name WHERE product_id = $1`, [product.id]);

      console.log('Deleting product reports...');
      await client.query(`DELETE FROM product_report WHERE gtin = $1`, [product.gtin]);

      console.log('Deleting product...');
      await client.query(`DELETE FROM product WHERE id = $1`, [product.id]);
      
      console.log('Successfully deleted product to trigger fresh seeding.');
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
