import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { IsNull, Not } from 'typeorm';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const productRepo = AppDataSource.getRepository(Product);

  // 1. Count by brand (top 30 brands of unmatched products)
  const topBrands = await AppDataSource.query(`
    SELECT brand, COUNT(*) AS count
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 30;
  `);
  console.log('\n--- Top 30 Brands of Unmatched HungerStation Products ---');
  console.table(topBrands);

  // 2. Fetch a sample of 30 products with names and brands
  const sample = await AppDataSource.query(`
    SELECT id, brand, name_en, name_ar, net_weight_value, net_unit
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL
    ORDER BY created_at DESC
    LIMIT 30;
  `);
  console.log('\n--- Sample of 30 Unmatched HungerStation Products ---');
  console.table(sample);

  // 3. Count placeholder/generic brands vs real brands
  const brandTypes = await AppDataSource.query(`
    SELECT 
      CASE 
        WHEN brand IS NULL OR brand = '' OR LOWER(brand) IN ('generic', 'unnamed', 'unknown', 'various', 'local', 'fresh', 'سوا', 'sawa') THEN 'Generic/Unknown'
        ELSE 'Branded'
      END AS brand_type,
      COUNT(*) AS count
    FROM product
    WHERE data_source = 'hungerstation' AND gtin IS NULL
    GROUP BY 1;
  `);
  console.log('\n--- Brand Type Breakdown for Unmatched Products ---');
  console.table(brandTypes);

  await AppDataSource.destroy();
}

main().catch(console.error);
