import { AppDataSource } from '../src/data-source';
import { ProductMergeLog } from '../src/entities/product-merge-log.entity';

async function main() {
  await AppDataSource.initialize();
  const logs = await AppDataSource.getRepository(ProductMergeLog).find({
    where: [
      { winner_product_id: 'a9b8ed22-4199-4d4a-9761-2904b7854643' },
      { winner_gtin: '6281007070775' }
    ],
    order: { created_at: 'DESC' }
  });

  console.log(`Found ${logs.length} merge logs for this GTIN/Product:`);
  for (const log of logs) {
    console.log(`Log ID: ${log.id}`);
    console.log(`Winner Product ID: ${log.winner_product_id}`);
    console.log(`Winner GTIN: ${log.winner_gtin}`);
    console.log(`Loser Product ID: ${log.loser_product_id}`);
    console.log(`Loser GTIN: ${log.loser_gtin}`);
    console.log(`Reason: ${log.reason}`);
    console.log(`Triggered By: ${log.triggered_by} (${log.actor_uid})`);
    console.log(`Payload:`, JSON.stringify(log.payload, null, 2));
    console.log(`Created At: ${log.created_at}`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

main().catch(err => console.error(err));
