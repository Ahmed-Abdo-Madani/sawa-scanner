import { AppDataSource } from '../data-source';
import { Product } from '../entities/product.entity';
import { ProductMergeLog } from '../entities/product-merge-log.entity';
import { IsNull, Not } from 'typeorm';

async function countDupes() {
  await AppDataSource.initialize();
  console.log('✓ Database connected.');

  const productRepo = AppDataSource.getRepository(Product);
  const mergeLogRepo = AppDataSource.getRepository(ProductMergeLog);

  // Counts
  const totalProducts = await productRepo.count();
  const hsProducts = await productRepo.count({
    where: { hs_product_id: Not(IsNull()) }
  });
  const hsProductsNoGtin = await productRepo.count({
    where: { hs_product_id: Not(IsNull()), gtin: IsNull() }
  });
  const hsProductsWithGtin = await productRepo.count({
    where: { hs_product_id: Not(IsNull()), gtin: Not(IsNull()) }
  });
  const totalWithGtin = await productRepo.count({
    where: { gtin: Not(IsNull()) }
  });

  const matcherMergeLogs = await mergeLogRepo.count({
    where: { actor_uid: 'hs_local_gtin_matcher' }
  });

  console.log('============================================================');
  console.log('📊 DATABASE STATUS');
  console.log('============================================================');
  console.log(`Total Products in DB       : ${totalProducts}`);
  console.log(`Products with GTINs        : ${totalWithGtin}`);
  console.log(`HungerStation Products     : ${hsProducts}`);
  console.log(`  - With GTINs             : ${hsProductsWithGtin}`);
  console.log(`  - Lacking GTINs          : ${hsProductsNoGtin}`);
  console.log(`Merges by HS Matcher       : ${matcherMergeLogs}`);
  console.log('============================================================');

  await AppDataSource.destroy();
}

countDupes().catch(err => console.error(err));
