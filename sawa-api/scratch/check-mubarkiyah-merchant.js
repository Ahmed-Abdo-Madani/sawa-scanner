const { Client } = require('pg');
require('dotenv').config({ path: 'c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/.env' });

async function check() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : true,
  });

  try {
    await client.connect();
    const res = await client.query("SELECT * FROM merchant WHERE name_en ILIKE '%mubarkiyah%' OR name_ar ILIKE '%مباركية%'");
    console.log('Merchants matching Mubarkiyah:', JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await client.end();
  }
}
check();
