import { AppDataSource } from '../src/data-source';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // Find Riyadh districts with the count of stores and count of scraped prices
  const results = await AppDataSource.query(`
    SELECT
      s.district_slug,
      COUNT(DISTINCT s.id) AS total_stores,
      COUNT(pp.id) AS total_prices
    FROM store s
    LEFT JOIN product_price pp ON pp.store_id = s.id
    WHERE s.platform = 'hungerstation' AND s.city_slug = 'riyadh'
    GROUP BY s.district_slug
    ORDER BY total_prices DESC, total_stores DESC;
  `);

  console.log('\n--- Riyadh HungerStation Districts - Store and Price Counts ---');
  console.table(results);

  await AppDataSource.destroy();
}

main().catch(console.error);
