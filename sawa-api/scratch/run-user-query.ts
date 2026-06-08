import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const results = await AppDataSource.query(`
    SELECT
      data_source,
      COUNT(*)                                          AS total_products,
      COUNT(gtin)                                       AS with_gtin,
      COUNT(*) - COUNT(gtin)                            AS without_gtin,
      ROUND(COUNT(gtin)::numeric / COUNT(*) * 100, 1)  AS pct_complete
    FROM product
    GROUP BY data_source
    ORDER BY total_products DESC;
  `);

  console.log('\n--- Current Product Table Stats (User Query) ---');
  console.table(results);

  await AppDataSource.destroy();
}

main().catch(console.error);
