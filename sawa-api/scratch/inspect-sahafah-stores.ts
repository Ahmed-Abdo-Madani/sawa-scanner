import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const results = await AppDataSource.query(`
    SELECT
      s.id,
      s.platform_branch_uuid,
      m.name_en AS merchant_name,
      s.source_url,
      s.is_active
    FROM store s
    JOIN merchant m ON s.merchant_id = m.id
    WHERE s.platform = 'hungerstation'
      AND s.city_slug = 'riyadh'
      AND s.district_slug = 'sahafah'
    LIMIT 20;
  `);

  console.log('\n--- Sample of 20 HungerStation Stores in Sahafah ---');
  console.table(results);

  await AppDataSource.destroy();
}

main().catch(console.error);
