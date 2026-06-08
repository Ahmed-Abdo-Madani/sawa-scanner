import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // List all cities and districts for hungerstation stores
  const results = await AppDataSource.query(`
    SELECT
      city_slug,
      district_slug,
      COUNT(*) AS total_stores,
      COUNT(CASE WHEN is_active = true THEN 1 END) AS active_stores
    FROM store
    WHERE platform = 'hungerstation'
    GROUP BY city_slug, district_slug
    ORDER BY city_slug, total_stores DESC;
  `);

  console.log('\n--- HungerStation Cities & Districts in DB ---');
  console.table(results);

  await AppDataSource.destroy();
}

main().catch(console.error);
