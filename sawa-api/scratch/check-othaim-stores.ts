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
    console.log('Querying stores in Yasmin district...');
    const res = await client.query(`
      SELECT 
        s.id AS store_id, 
        s.platform, 
        s.platform_branch_id, 
        s.platform_branch_uuid, 
        s.district_slug, 
        s.district_name_en, 
        s.district_name_ar, 
        s.merchant_id, 
        m.name_en AS merchant_name_en, 
        m.name_ar AS merchant_name_ar
      FROM store s
      JOIN merchant m ON s.merchant_id = m.id
      WHERE s.district_slug ILIKE '%yasmin%' 
         OR s.district_name_en ILIKE '%yasmin%'
         OR s.district_name_ar ILIKE '%ياسمين%'
    `);
    
    console.log('Results:');
    res.rows.forEach(row => {
      console.log(`- StoreID: ${row.store_id} | Platform: ${row.platform} | UUID: ${row.platform_branch_uuid} | District: "${row.district_name_en}" / "${row.district_name_ar}" | Merchant: "${row.merchant_name_en}" / "${row.merchant_name_ar}" (ID: ${row.merchant_id})`);
    });
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

run();
