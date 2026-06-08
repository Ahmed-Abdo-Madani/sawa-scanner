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
    console.log('Querying HungerStation merchants...');
    const res = await client.query(`
      SELECT id, name_en, name_ar 
      FROM merchant 
      ORDER BY name_en ASC
    `);
    console.log('Merchants:');
    res.rows.forEach(row => {
      console.log(`- ID: ${row.id} | EN: "${row.name_en}" | AR: "${row.name_ar}"`);
    });

    console.log('\nQuerying stores with district names...');
    const storeRes = await client.query(`
      SELECT id, name, name_ar, district_name, district_name_ar, merchant_id 
      FROM store 
      LIMIT 30
    `);
    storeRes.rows.forEach(row => {
      console.log(`- ID: ${row.id} | EN: "${row.name}" | AR: "${row.name_ar}" | District: "${row.district_name}" / "${row.district_name_ar}" | MerchantID: ${row.merchant_id}`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
