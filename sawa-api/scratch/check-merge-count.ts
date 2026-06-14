import { AppDataSource } from '../src/data-source';
import { ProductMergeLog } from '../src/entities/product-merge-log.entity';

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(ProductMergeLog);
  const count = await repo.count({ where: { actor_uid: 'hs_local_gtin_matcher' } });
  console.log('Merge count:', count);
  await AppDataSource.destroy();
}

run().catch(console.error);
