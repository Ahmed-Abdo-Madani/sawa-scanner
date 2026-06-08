import { AppDataSource } from '../data-source';
import { Store } from '../entities/store.entity';

async function checkYasminStores() {
  await AppDataSource.initialize();
  const storeRepo = AppDataSource.getRepository(Store);

  const stores = await storeRepo.createQueryBuilder('store')
    .leftJoinAndSelect('store.merchant', 'merchant')
    .where('LOWER(store.district_name_en) LIKE :yasmin OR LOWER(store.district_name_ar) LIKE :yasmin', { yasmin: '%yasmin%' })
    .getMany();

  console.log(`--- FOUND ${stores.length} STORES IN YASMIN DISTRICT ---`);
  for (const store of stores) {
    console.log(`Store ID:   ${store.id}`);
    console.log(`Merchant:   ${store.merchant?.name_en} / ${store.merchant?.name_ar} (ID: ${store.merchant?.id})`);
    console.log(`Platform:   ${store.platform}`);
    console.log(`UUID/ID:    ${store.platform_branch_uuid} / ${store.platform_branch_id}`);
    console.log(`Source URL: ${store.source_url}`);
    console.log(`District:   ${store.district_name_en} / ${store.district_name_ar}`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

checkYasminStores().catch(err => console.error(err));
