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
    console.log('✓ Connected to database.\n');

    // Query Riyadh stores grouped by merchant
    const merchantRes = await client.query(`
      SELECT 
        m.name_en as merchant_name_en,
        m.name_ar as merchant_name_ar,
        COUNT(DISTINCT s.id) as total_stores,
        COUNT(DISTINCT CASE WHEN pp.id IS NOT NULL THEN s.id END) as scraped_stores,
        COUNT(pp.id) as total_prices
      FROM store s
      INNER JOIN merchant m ON s.merchant_id = m.id
      LEFT JOIN product_price pp ON pp.store_id = s.id
      WHERE s.platform = 'hungerstation'
        AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
      GROUP BY m.name_en, m.name_ar
      ORDER BY total_stores DESC
    `);

    console.log('========================================================================');
    console.log('🇸🇦 RIYADH HUNGERSTATION STORES BY MERCHANT CHAIN');
    console.log('========================================================================');
    console.log(
      String('Merchant Name').padEnd(30) + 
      String('Total Stores').padEnd(15) + 
      String('Scraped Stores').padEnd(16) + 
      String('Total Prices').padEnd(15)
    );
    console.log('------------------------------------------------------------------------');
    for (const row of merchantRes.rows) {
      const name = `${row.merchant_name_en} / ${row.merchant_name_ar || ''}`;
      console.log(
        name.substring(0, 28).padEnd(30) + 
        String(row.total_stores).padEnd(15) + 
        String(row.scraped_stores).padEnd(16) + 
        String(row.total_prices).padEnd(15)
      );
    }
    console.log('========================================================================');

  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await client.end();
  }
}

run();
