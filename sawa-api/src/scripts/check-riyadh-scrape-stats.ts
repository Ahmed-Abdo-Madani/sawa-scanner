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

    // 1. Total HS Stores overall
    const totalHSRes = await client.query(`
      SELECT COUNT(1) as cnt 
      FROM store 
      WHERE platform = 'hungerstation'
    `);
    const totalHS = parseInt(totalHSRes.rows[0].cnt, 10);

    // 2. Riyadh HS Stores overall
    const riyadhHSRes = await client.query(`
      SELECT COUNT(1) as cnt 
      FROM store 
      WHERE platform = 'hungerstation' 
        AND (city_slug = 'riyadh' OR city_name_en ILIKE '%riyadh%')
    `);
    const totalRiyadhHS = parseInt(riyadhHSRes.rows[0].cnt, 10);

    // 3. Scraped Riyadh HS Stores (stores with at least 1 price record)
    const scrapedRiyadhHSRes = await client.query(`
      SELECT COUNT(DISTINCT s.id) as cnt
      FROM store s
      INNER JOIN product_price pp ON pp.store_id = s.id
      WHERE s.platform = 'hungerstation'
        AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
    `);
    const scrapedRiyadhHS = parseInt(scrapedRiyadhHSRes.rows[0].cnt, 10);

    // 4. District breakdown
    const districtRes = await client.query(`
      SELECT 
        s.district_name_en as district,
        COUNT(DISTINCT s.id) as total_stores,
        COUNT(DISTINCT CASE WHEN pp.id IS NOT NULL THEN s.id END) as scraped_stores,
        COUNT(pp.id) as total_prices
      FROM store s
      LEFT JOIN product_price pp ON pp.store_id = s.id
      WHERE s.platform = 'hungerstation'
        AND (s.city_slug = 'riyadh' OR s.city_name_en ILIKE '%riyadh%')
      GROUP BY s.district_name_en
      ORDER BY total_stores DESC
    `);

    console.log('============================================================');
    console.log('🇸🇦 RIYADH HUNGERSTATION INGESTION STATUS');
    console.log('============================================================');
    console.log(`Total HungerStation Stores (all cities):  ${totalHS}`);
    console.log(`Total HungerStation Stores in Riyadh:     ${totalRiyadhHS}`);
    console.log(`Scraped HungerStation Stores in Riyadh:   ${scrapedRiyadhHS} / ${totalRiyadhHS} (${((scrapedRiyadhHS / totalRiyadhHS) * 100).toFixed(1)}%)`);
    console.log('============================================================');
    console.log('\nDISTRICT BREAKDOWN:');
    console.log('------------------------------------------------------------');
    console.log(
      String('District').padEnd(25) + 
      String('Total Stores').padEnd(15) + 
      String('Scraped Stores').padEnd(16) + 
      String('Total Prices').padEnd(15)
    );
    console.log('------------------------------------------------------------');
    for (const row of districtRes.rows) {
      const dist = row.district || 'Unknown / Not Set';
      console.log(
        dist.padEnd(25) + 
        String(row.total_stores).padEnd(15) + 
        String(row.scraped_stores).padEnd(16) + 
        String(row.total_prices).padEnd(15)
      );
    }
    console.log('============================================================');

  } catch (error) {
    console.error('Error during execution:', error);
  } finally {
    await client.end();
  }
}

run();
