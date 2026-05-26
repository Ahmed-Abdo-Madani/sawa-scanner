import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : true,
  });

  await db.initialize();
  console.log('Connected to DB');

  const imgs = await db.query("SELECT * FROM product_image WHERE source = 'parkcenter' LIMIT 5;");
  console.log('Park Center images:', imgs);

  const products = await db.query("SELECT id, name_ar, image_front_url FROM product WHERE data_source = 'parkcenter' AND image_front_url IS NOT NULL LIMIT 5;");
  console.log('Park Center products image_front_url:', products);

  await db.destroy();
}

run().catch(console.error);
