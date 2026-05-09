import 'dotenv/config';
import { DataSource } from 'typeorm';

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    synchronize: false,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();

  // Count products by completeness bands with brand presence
  const stats = await ds.query(`
    SELECT
      CASE
        WHEN data_completeness_score = 0 THEN 'zero'
        WHEN data_completeness_score < 0.2 THEN '0-0.2'
        WHEN data_completeness_score < 0.4 THEN '0.2-0.4'
        WHEN data_completeness_score < 0.7 THEN '0.4-0.7'
        ELSE '0.7+'
      END AS band,
      COUNT(*) AS total,
      SUM(CASE WHEN brand != '' AND brand IS NOT NULL THEN 1 ELSE 0 END) AS with_brand
    FROM product
    GROUP BY band
    ORDER BY band
  `);
  console.log('=== Completeness Distribution ===');
  console.log(JSON.stringify(stats, null, 2));

  // Get 5 enrichable candidates with brand
  const enrichable = await ds.query(`
    SELECT gtin, name_en, brand, data_completeness_score, off_categories_tags
    FROM product
    WHERE data_completeness_score > 0
      AND data_completeness_score < 0.7
      AND brand != ''
      AND brand IS NOT NULL
    ORDER BY data_completeness_score ASC
    LIMIT 5
  `);
  console.log('\n=== Top 5 Enrichable Candidates ===');
  console.log(JSON.stringify(enrichable, null, 2));

  await ds.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
