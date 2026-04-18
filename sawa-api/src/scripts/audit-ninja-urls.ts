const { DataSource } = require('typeorm');
require('dotenv').config();

const ds = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : true,
});

async function auditUrls() {
  try {
    await ds.initialize();
    console.log('--- Ninja URL Audit ---');
    const res = await ds.query(`
      SELECT p.name_en, pp.source_url, p.gtin, pp.scraped_at
      FROM product p
      JOIN product_price pp ON p.id = pp.product_id
      JOIN merchant m ON m.id = pp.merchant_id
      WHERE m.name_en = 'Ninja'
      ORDER BY pp.scraped_at DESC
      LIMIT 10
    `);

    res.forEach((row: any) => {
      console.log(`Product: ${row.name_en}`);
      console.log(`URL:     ${row.source_url}`);
      console.log(`GTIN:    ${row.gtin}`);
      console.log(`Scraped: ${row.scraped_at}`);
      console.log('---');
    });

    const pollutionCheck = await ds.query(`
      SELECT COUNT(*) as count FROM product_price pp
      JOIN merchant m ON m.id = pp.merchant_id
      WHERE m.name_en = 'Ninja' AND (pp.source_url LIKE '%-%-%-%-%' OR pp.source_url NOT LIKE '%/product/%')
    `);
    console.log(
      `\nPotential Pollution (Non-canonical URLs): ${pollutionCheck[0].count}`,
    );
  } catch (err) {
    console.error(err);
  } finally {
    await ds.destroy();
  }
}

auditUrls();
