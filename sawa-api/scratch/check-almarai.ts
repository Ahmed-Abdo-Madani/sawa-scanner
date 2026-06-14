import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import { Like } from 'typeorm';

async function main() {
  await AppDataSource.initialize();
  console.log('Database initialized.');

  const productRepo = AppDataSource.getRepository(Product);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  // Search for products by name
  const products = await productRepo.find({
    where: [
      { name_en: Like('%Almarai Mixed Fruit Juice%') },
      { name_ar: Like('%Almarai Mixed Fruit Juice%') },
      { name_en: Like('%6281007070775%') },
      { gtin: '6281007070775' }
    ],
    relations: ['prices', 'prices.store', 'prices.store.merchant']
  });

  console.log(`Found ${products.length} products:`);
  for (const p of products) {
    console.log(`ID: ${p.id}`);
    console.log(`GTIN: ${p.gtin}`);
    console.log(`GTIN Prefix: ${p.gtin_prefix}`);
    console.log(`Name (EN): ${p.name_en}`);
    console.log(`Name (AR): ${p.name_ar}`);
    console.log(`Brand: ${p.brand} | Normalized: ${p.brand_normalized}`);
    console.log(`Name Normalized: ${p.name_normalized}`);
    console.log(`Data Source: ${p.data_source}`);
    console.log(`HS Product ID: ${p.hs_product_id}`);
    console.log(`Prices count: ${p.prices?.length || 0}`);
    if (p.prices) {
      for (const pr of p.prices) {
        console.log(`  - Price: ${pr.price_sar_incl_vat} SAR at Store: ${pr.store?.merchant?.name_en} (ID: ${pr.store?.id}, Platform ID: ${pr.store?.platform_branch_uuid})`);
      }
    }
    console.log('--------------------------------------------------');
  }

  await AppDataSource.destroy();
}

main().catch(err => console.error(err));
