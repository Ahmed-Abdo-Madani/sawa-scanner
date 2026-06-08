import { AppDataSource } from '../data-source';
import { ProductPrice } from '../entities/product-price.entity';
import { Not, IsNull } from 'typeorm';

async function checkPrices() {
  await AppDataSource.initialize();
  
  const priceRepo = AppDataSource.getRepository(ProductPrice);
  const hsPrices = await priceRepo.find({
    where: {
      store_id: Not(IsNull())
    },
    relations: ['product', 'store', 'store.merchant'],
    take: 10
  });

  console.log(`Found ${hsPrices.length} HungerStation prices:`);
  for (const price of hsPrices) {
    console.log(`Price ID: ${price.id}`);
    console.log(`Product: ID=${price.product?.id}, GTIN=${price.product?.gtin}, Name=${price.product?.name_en || price.product?.name_ar}`);
    console.log(`Price: ${price.price_sar_incl_vat} SAR`);
    console.log(`Store: ID=${price.store?.id}, Platform=${price.store?.platform}`);
    console.log(`Store Merchant: ID=${price.store?.merchant?.id}, Name=${price.store?.merchant?.name_en}`);
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

checkPrices().catch(err => console.error(err));
