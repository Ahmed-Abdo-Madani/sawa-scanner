const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT || '5432'),
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function run() {
  await client.connect();

  // Total stores
  const storeRes = await client.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(CASE WHEN platform = 'hungerstation' THEN 1 END) AS hs_total
    FROM store
  `);
  const totalStores = storeRes.rows[0];

  // Ingestion stats
  const priceCountRes = await client.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(CASE WHEN gtin IS NOT NULL THEN 1 END) AS with_gtin
    FROM product
    WHERE hs_product_id IS NOT NULL
  `);
  const products = priceCountRes.rows[0];

  // Count prices per store platform
  const pricesRes = await client.query(`
    SELECT 
      COUNT(*) AS total,
      COUNT(CASE WHEN product_id IN (SELECT id FROM product WHERE gtin IS NOT NULL) THEN 1 END) AS with_gtin
    FROM product_price
    WHERE store_id IN (SELECT id FROM store WHERE platform = 'hungerstation')
  `);
  const prices = pricesRes.rows[0];

  // Count HungerStation stores that have >0 prices
  const storesWithPricesRes = await client.query(`
    SELECT COUNT(DISTINCT store_id) AS active_stores
    FROM product_price
    WHERE store_id IN (SELECT id FROM store WHERE platform = 'hungerstation')
  `);
  const activeStores = storesWithPricesRes.rows[0].active_stores;

  console.log('=====================================');
  console.log('📊 HUNGERSTATION DATABASE STATISTICS');
  console.log('=====================================');
  console.log(`Total HungerStation Stores:        ${totalStores.hs_total}`);
  console.log(`Stores with Scraped Prices (>0):   ${activeStores}`);
  console.log(`Stores with Zero Prices (0):       ${totalStores.hs_total - activeStores}`);
  console.log(`Total HungerStation Price Records:  ${prices.total}`);
  console.log(`Prices Linked to a Valid GTIN:     ${prices.with_gtin} (${prices.total > 0 ? ((prices.with_gtin / prices.total) * 100).toFixed(2) : 0}%)`);
  console.log(`Unmatched HS Catalog Products:     ${products.total}`);
  console.log(`Matched HS Catalog Products:       ${products.with_gtin} (${products.total > 0 ? ((products.with_gtin / products.total) * 100).toFixed(2) : 0}%)`);
  console.log('=====================================');

  await client.end();
}

run().catch(console.error);
