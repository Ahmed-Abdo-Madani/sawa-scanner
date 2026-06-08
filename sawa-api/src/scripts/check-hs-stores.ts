import { AppDataSource } from '../data-source';
import { Store } from '../entities/store.entity';

async function checkStores() {
  await AppDataSource.initialize();
  const storeRepo = AppDataSource.getRepository(Store);
  const stores = await storeRepo.find({
    where: { platform: 'hungerstation' },
    relations: ['merchant'],
    take: 10
  });

  console.log(`Found ${stores.length} HungerStation stores:`);
  for (const store of stores) {
    console.log(`Store ID:   ${store.id}`);
    console.log(`Merchant:   ${store.merchant?.name_en || store.merchant?.name_ar}`);
    console.log(`UUID:       ${store.platform_branch_uuid}`);
    console.log(`Branch ID:  ${store.platform_branch_id}`);
    console.log(`Source URL: ${store.source_url}`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

checkStores().catch(err => console.error(err));
