import { AppDataSource } from '../data-source';
import { ProductPrice } from '../entities/product-price.entity';

async function checkPrices() {
  await AppDataSource.initialize();
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const prices = await priceRepo.find({
    where: { store_id: '11473f88-9c37-45a4-b9a5-76efc187b67c' },
    relations: ['merchant', 'store', 'store.merchant', 'product'],
    take: 5,
  });

  console.log(`--- FOUND ${prices.length} PRICES FOR YASMIN OTHAIM ---`);
  for (const price of prices) {
    console.log(`Price ID:        ${price.id}`);
    console.log(`Product GTIN/ID: ${price.product?.gtin} / ${price.product?.id}`);
    console.log(`Product Name:    ${price.product?.name_en} / ${price.product?.name_ar}`);
    console.log(`Value:           ${price.price_sar_incl_vat}`);
    console.log(`Merchant:        ${price.merchant?.name_en} / ${price.merchant?.name_ar} (ID: ${price.merchant?.id})`);
    console.log(`Store:           ${price.store?.id} (Platform: ${price.store?.platform})`);
    console.log(`Store Merchant:  ${price.store?.merchant?.name_en} / ${price.store?.merchant?.name_ar} (ID: ${price.store?.merchant?.id})`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

checkPrices().catch(err => console.error(err));
