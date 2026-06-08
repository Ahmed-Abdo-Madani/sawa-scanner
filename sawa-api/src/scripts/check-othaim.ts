import { AppDataSource } from '../data-source';
import { Store } from '../entities/store.entity';
import { ProductPrice } from '../entities/product-price.entity';

async function checkOthaim() {
  await AppDataSource.initialize();
  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const stores = await storeRepo.find({
    relations: ['merchant'],
  });

  console.log('--- ALL STORES WITH OTHAIM OR HUNGERSTATION ---');
  for (const store of stores) {
    const storeName = (store.platform_branch_id || store.platform_branch_uuid || '').toLowerCase();
    const merchantName = (store.merchant?.name_en || '').toLowerCase();
    
    if (storeName.includes('othaim') || merchantName.includes('othaim') || storeName.includes('yasmin') || store.platform === 'hungerstation') {
      console.log(`Store ID:   ${store.id}`);
      console.log(`Merchant:   ${store.merchant?.name_en} / ${store.merchant?.name_ar} (ID: ${store.merchant?.id})`);
      console.log(`Platform:   ${store.platform}`);
      console.log(`UUID/ID:    ${store.platform_branch_uuid} / ${store.platform_branch_id}`);
      console.log(`Source URL: ${store.source_url}`);
      console.log(`District:   ${store.district_name_en} / ${store.district_name_ar}`);
      console.log('--------------------------------------------------');
    }
  }

  // Let's also check if there are prices associated with any "Othaim" or "HungerStation" merchant
  const prices = await priceRepo.find({
    relations: ['merchant', 'store', 'store.merchant'],
    take: 20,
    order: { scraped_at: 'DESC' }
  });
  console.log('--- LATEST PRICES ---');
  for (const price of prices) {
    console.log(`Price ID:    ${price.id}`);
    console.log(`Val:         ${price.price_sar_incl_vat}`);
    console.log(`Merchant:    ${price.merchant?.name_en} (ID: ${price.merchant?.id})`);
    console.log(`Store:       ${price.store?.platform_branch_id || price.store?.platform_branch_uuid} (Platform: ${price.store?.platform})`);
    console.log(`Store Merch: ${price.store?.merchant?.name_en} (ID: ${price.store?.merchant?.id})`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

checkOthaim().catch(err => console.error(err));
