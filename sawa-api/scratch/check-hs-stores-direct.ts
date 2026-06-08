import { AppDataSource } from '../src/data-source';
import { ProductPrice } from '../src/entities/product-price.entity';

async function main() {
  const barcode = '6281007074995';
  await AppDataSource.initialize();

  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const prices = await priceRepo.createQueryBuilder('pp')
    .leftJoinAndSelect('pp.product', 'product')
    .leftJoinAndSelect('pp.merchant', 'merchant')
    .leftJoinAndSelect('pp.store', 'store')
    .leftJoinAndSelect('store.merchant', 'storeMerchant')
    .where('product.gtin = :gtin', { gtin: barcode })
    .getMany();

  console.log(`✅ Found ${prices.length} prices for ${barcode}:`);
  prices.forEach((p, index) => {
    console.log(`[Price ${index + 1}] ID: ${p.id}`);
    console.log(`  Price: ${p.price_sar_incl_vat}`);
    console.log(`  Store ID in DB: ${p.store_id}`);
    console.log(`  Merchant ID in DB: ${p.merchant_id}`);
    console.log(`  Merchant Name: ${p.merchant?.name_en} / ${p.merchant?.name_ar}`);
    console.log(`  Store Platform: ${p.store?.platform}`);
    console.log(`  Store Branch UUID: ${p.store?.platform_branch_uuid}`);
    console.log(`  Store Merchant Name: ${p.store?.merchant?.name_en}`);
    console.log(`  Source URL: ${p.source_url}`);
    console.log('--------------------------------------------------');
  });

  await AppDataSource.destroy();
}

main().catch(console.error);
