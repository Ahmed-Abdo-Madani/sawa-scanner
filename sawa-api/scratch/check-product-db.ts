import { AppDataSource } from '../src/data-source';
import { ProductPrice } from '../src/entities/product-price.entity';
import { Product } from '../src/entities/product.entity';

async function main() {
  const barcode = '6281007074995';
  await AppDataSource.initialize();

  const productRepo = AppDataSource.getRepository(Product);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const product = await productRepo.findOne({
    where: { gtin: barcode }
  });

  if (!product) {
    console.log(`❌ Product with GTIN ${barcode} not found in database.`);
    await AppDataSource.destroy();
    return;
  }

  console.log(`✅ Product Found: ID=${product.id}, GTIN=${product.gtin}, Name=${product.name_en} / ${product.name_ar}`);

  const prices = await priceRepo.find({
    where: { product_id: product.id },
    relations: ['store', 'store.merchant']
  });

  console.log(`✅ Found ${prices.length} prices:`);
  for (const price of prices) {
    console.log(`- Price ID: ${price.id}`);
    console.log(`  Price: ${price.price_sar_incl_vat} SAR`);
    console.log(`  Platform: ${price.store?.platform}`);
    console.log(`  Store ID: ${price.store?.id}`);
    console.log(`  Store UUID: ${price.store?.platform_branch_uuid}`);
    console.log(`  Store URL: ${price.store?.source_url}`);
    if (price.store?.merchant) {
      console.log(`  Merchant ID: ${price.store.merchant.id}`);
      console.log(`  Merchant Name: ${price.store.merchant.name_en} / ${price.store.merchant.name_ar}`);
      console.log(`  Merchant Logo URL: ${price.store.merchant.logo_url}`);
    } else {
      console.log(`  Merchant: null`);
    }
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

main().catch(console.error);
