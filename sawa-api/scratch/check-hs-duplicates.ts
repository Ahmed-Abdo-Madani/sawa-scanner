import { AppDataSource } from '../src/data-source';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // Query 1: Distribution of stores per product (how many stores sell the same product)
  const storesPerProduct = await AppDataSource.query(`
    WITH product_store_counts AS (
      SELECT
        product_id,
        COUNT(DISTINCT store_id) as store_count
      FROM product_price pp
      INNER JOIN store s ON s.id = pp.store_id
      WHERE s.platform = 'hungerstation'
      GROUP BY product_id
    )
    SELECT
      store_count,
      COUNT(*) as product_count
    FROM product_store_counts
    GROUP BY store_count
    ORDER BY store_count ASC;
  `);

  console.log('\n============================================================');
  console.log('📦 STORES PER UNIQUE PRODUCT DISTRIBUTION');
  console.log('============================================================');
  console.table(storesPerProduct);

  // Query 2: Get total unique products sold in at least one store, and those sold in >1 store
  const summary = await AppDataSource.query(`
    WITH product_store_counts AS (
      SELECT
        product_id,
        COUNT(DISTINCT store_id) as store_count
      FROM product_price pp
      INNER JOIN store s ON s.id = pp.store_id
      WHERE s.platform = 'hungerstation'
      GROUP BY product_id
    )
    SELECT
      COUNT(*) as total_unique_products,
      COUNT(CASE WHEN store_count > 1 THEN 1 END) as products_in_multiple_stores,
      MAX(store_count) as max_stores_for_single_product,
      AVG(store_count) as avg_stores_per_product
    FROM product_store_counts;
  `);

  console.log('\n============================================================');
  console.log('📊 MULTI-STORE PRODUCT DEDUPLICATION SUMMARY');
  console.log('============================================================');
  if (summary && summary[0]) {
    const total = parseInt(summary[0].total_unique_products || '0');
    const multiStore = parseInt(summary[0].products_in_multiple_stores || '0');
    const maxStores = parseInt(summary[0].max_stores_for_single_product || '0');
    const avgStores = parseFloat(summary[0].avg_stores_per_product || '0').toFixed(2);
    
    console.log(`Total Unique Products with Prices : ${total}`);
    console.log(`Products sold in >1 store         : ${multiStore} (${((multiStore / total) * 100).toFixed(2)}%)`);
    console.log(`Average stores per product        : ${avgStores}`);
    console.log(`Max stores selling same product   : ${maxStores}`);
  }
  console.log('============================================================\n');

  await AppDataSource.destroy();
}

main().catch(console.error);
