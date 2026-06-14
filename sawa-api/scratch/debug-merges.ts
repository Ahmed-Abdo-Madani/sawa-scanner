import { AppDataSource } from '../src/data-source';
import { ProductMergeLog } from '../src/entities/product-merge-log.entity';
import { MoreThan } from 'typeorm';

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(ProductMergeLog);
  const count = await repo.count({
    where: {
      created_at: MoreThan(new Date('2026-06-11T22:20:00Z')),
    }
  });
  console.log('Merge logs created in last run:', count);

  // Print first 5 logs
  const logs = await repo.find({
    where: {
      created_at: MoreThan(new Date('2026-06-11T22:20:00Z')),
    },
    order: { created_at: 'ASC' },
    take: 5
  });
  for (const log of logs) {
    console.log(`Log ID: ${log.id} | winner_gtin: ${log.winner_gtin} | reason: ${log.reason} | time: ${log.created_at}`);
  }

  await AppDataSource.destroy();
}

run().catch(console.error);
