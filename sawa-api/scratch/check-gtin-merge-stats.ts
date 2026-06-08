import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // Check data_source of winner products in merge logs
  const logStats = await AppDataSource.query(`
    SELECT
      w.data_source AS winner_data_source,
      COUNT(l.id) AS total_merges
    FROM product_merge_log l
    JOIN product w ON l.winner_product_id = w.id
    GROUP BY w.data_source;
  `);
  console.log('\n--- Winner Products by data_source in Merge Logs ---');
  console.table(logStats);

  // Check some examples of recent merge logs
  const logs = await AppDataSource.query(`
    SELECT
      l.id,
      l.reason,
      l.winner_gtin,
      w.name_en AS winner_name,
      w.data_source AS winner_data_source,
      l.created_at
    FROM product_merge_log l
    JOIN product w ON l.winner_product_id = w.id
    ORDER BY l.created_at DESC
    LIMIT 10;
  `);
  console.log('\n--- Recent 10 Merge Logs ---');
  console.table(logs);

  // Let's count products with data_source='hungerstation' that have a gtin
  const hsGtins = await AppDataSource.query(`
    SELECT COUNT(*) AS count, COUNT(gtin) AS with_gtin
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NOT NULL;
  `);
  console.log('\n--- HungerStation Products with GTIN (Non-Null) ---');
  console.table(hsGtins);

  await AppDataSource.destroy();
}

main().catch(console.error);
