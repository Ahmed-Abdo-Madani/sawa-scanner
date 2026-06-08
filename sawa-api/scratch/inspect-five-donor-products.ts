import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { Not, IsNull } from 'typeorm';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const results = await AppDataSource.query(`
    SELECT *
    FROM product
    WHERE gtin IS NOT NULL
    LIMIT 5;
  `);

  console.log('\n--- 5 Donor Products ---');
  console.log(JSON.stringify(results, null, 2));

  await AppDataSource.destroy();
}

main().catch(console.error);
