import { AppDataSource } from '../data-source';
import { Product } from '../entities/product.entity';

async function testSearch() {
  await AppDataSource.initialize();
  const productRepo = AppDataSource.getRepository(Product);

  const query = 'Haley';
  const products = await productRepo
    .createQueryBuilder('product')
    .leftJoinAndSelect('product.images', 'images')
    .leftJoinAndSelect('product.prices', 'prices')
    .leftJoinAndSelect('prices.merchant', 'merchant')
    .leftJoinAndSelect('prices.store', 'store')
    .leftJoinAndSelect('store.merchant', 'storeMerchant')
    .where(
      '(product.name_en ILIKE :q OR product.name_ar ILIKE :q OR product.brand ILIKE :q)',
      { q: `%${query}%` },
    )
    .limit(5)
    .getMany();

  console.log(`--- FOUND ${products.length} PRODUCTS ---`);
  for (const product of products) {
    console.log(`Product: ${product.name_en}`);
    for (const price of product.prices || []) {
      console.log(`  Price ID: ${price.id}`);
      console.log(`  Merchant Name: ${price.merchant?.name_en}`);
      console.log(`  Store ID: ${price.store?.id}`);
      console.log(`  Store Platform: ${price.store?.platform}`);
      console.log(`  Store Merchant: ${JSON.stringify(price.store?.merchant)}`);
      console.log(`  Store keys: ${Object.keys(price.store || {})}`);
    }
  }

  await AppDataSource.destroy();
}

testSearch().catch(err => console.error(err));
