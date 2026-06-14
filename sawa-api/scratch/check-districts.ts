import { AppDataSource } from '../src/data-source';

async function run() {
  await AppDataSource.initialize();
  
  const districts = await AppDataSource.query(`
    SELECT district_name_en, district_name_ar, COUNT(*) as cnt
    FROM store
    WHERE district_name_en IS NOT NULL
    GROUP BY district_name_en, district_name_ar
    ORDER BY cnt DESC
  `);

  console.log(`Distinct districts count: ${districts.length}`);
  console.log('List of distinct districts:');
  for (const d of districts) {
    console.log(`- "${d.district_name_en}" -> "${d.district_name_ar}" : ${d.cnt} stores`);
  }

  await AppDataSource.destroy();
}

run().catch(console.error);
