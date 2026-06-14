import { AppDataSource } from '../src/data-source';
import { ProductMergeLog } from '../src/entities/product-merge-log.entity';

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(ProductMergeLog);
  const logs = await repo.find({
    order: { created_at: 'DESC' },
    take: 10
  });
  console.log('Last 10 logs:');
  for (const log of logs) {
    console.log(`ID: ${log.id} | GTIN: ${log.winner_gtin} | Actor: ${log.actor_uid} | Reason: ${log.reason} | Time: ${log.created_at}`);
  }
  await AppDataSource.destroy();
}

run().catch(console.error);
