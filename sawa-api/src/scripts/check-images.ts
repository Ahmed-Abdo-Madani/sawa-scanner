import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : true,
  });
  await db.initialize();
  const imgs = await db.query('SELECT * FROM product_image LIMIT 10;');
  console.log('Images:', imgs);

  const products = await db.query(`
    SELECT p.id, p.name_en, p.name_ar, p.brand, pp.price_sar_incl_vat 
    FROM product p 
    JOIN product_price pp ON p.id = pp.product_id
    LIMIT 20;
  `);
  console.log('Products & Prices:', products);

  await db.destroy();
}

check().catch(console.error);
