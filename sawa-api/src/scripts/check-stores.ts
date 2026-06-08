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
    console.log('Connected to PostgreSQL.');

    const res = await client.query(`
      SELECT id, name_en, name_ar, logo_url, base_url, data_source_type
      FROM merchant
      ORDER BY name_en ASC
    `);
    console.log(`All Merchants (${res.rows.length}):`);
    for (const row of res.rows) {
      console.log(`- [${row.name_en} / ${row.name_ar || 'N/A'}] Logo: ${row.logo_url} Base: ${row.base_url} Source: ${row.data_source_type}`);
    }

  } catch (error) {
    console.error(error);
  } finally {
    await client.end();
  }
}

run();
