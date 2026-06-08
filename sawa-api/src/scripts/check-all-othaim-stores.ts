import { AppDataSource } from '../data-source';
import { Store } from '../entities/store.entity';

async function checkAllOthaimStores() {
  await AppDataSource.initialize();
  const storeRepo = AppDataSource.getRepository(Store);

  const stores = await storeRepo.createQueryBuilder('store')
    .leftJoinAndSelect('store.merchant', 'merchant')
    .where('LOWER(store.source_url) LIKE :othaim OR LOWER(store.platform_branch_uuid) LIKE :othaim OR LOWER(store.platform_branch_id) LIKE :othaim', { othaim: '%othaim%' })
    .getMany();

  console.log(`--- FOUND ${stores.length} OTHAIM STORES ---`);
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

checkAllOthaimStores().catch(err => console.error(err));
