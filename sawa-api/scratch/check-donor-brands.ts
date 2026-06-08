import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { Not, IsNull } from 'typeorm';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const results = await AppDataSource.query(`
    SELECT brand, COUNT(*) AS count
    FROM product
    WHERE gtin IS NOT NULL
    GROUP BY brand
    ORDER BY count DESC
    LIMIT 30;
  `);

  console.log('\n--- Top 30 Brands in Donor Products ---');
  console.table(results);

  await AppDataSource.destroy();
}

main().catch(console.error);
