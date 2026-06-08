import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  // 1. Total count of unmatched HungerStation products
  const totalCountRes = await AppDataSource.query(`
    SELECT COUNT(*) AS total_unmatched
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL;
  `);
  const totalUnmatched = parseInt(totalCountRes[0].total_unmatched, 10);

  // 2. Count of unique normalized names
  const uniqueNamesRes = await AppDataSource.query(`
    SELECT COUNT(DISTINCT name_normalized) AS unique_names
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL;
  `);
  const uniqueNames = parseInt(uniqueNamesRes[0].unique_names, 10);

  // 3. Count of unique (name_normalized + brand_normalized) combinations
  const uniqueNameBrandsRes = await AppDataSource.query(`
    SELECT COUNT(*) AS unique_name_brands
    FROM (
      SELECT name_normalized, brand_normalized
      FROM product
      WHERE data_source = 'hungerstation' AND gtin IS NULL
      GROUP BY name_normalized, brand_normalized
    ) AS sub;
  `);
  const uniqueNameBrands = parseInt(uniqueNameBrandsRes[0].unique_name_brands, 10);

  // 4. Sample of some duplicate names to see how many times they appear
  const duplicateSamples = await AppDataSource.query(`
    SELECT name_en, COUNT(*) AS count
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL
    GROUP BY name_en
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 15;
  `);

  console.log('\n============================================================');
  console.log('📊 HUNGERSTATION UNMATCHED PRODUCT UNIQUENESS REPORT');
  console.log('============================================================');
  console.log(`Total Unmatched HS Products      : ${totalUnmatched}`);
  console.log(`Unique Product Names             : ${uniqueNames}`);
  console.log(`Unique (Name + Brand) Duplicates : ${uniqueNameBrands}`);
  console.log(`Uniqueness Ratio                 : ${((uniqueNames / totalUnmatched) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  console.log('--- Top 15 Duplicate Product Names ---');
  console.table(duplicateSamples);

  await AppDataSource.destroy();
}

main().catch(console.error);
