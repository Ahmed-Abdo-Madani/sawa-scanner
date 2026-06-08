import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  const stores = await storeRepo.find({
    where: {
      platform: 'hungerstation',
      city_slug: 'riyadh',
      district_slug: 'sahafah',
      is_active: true
    },
    relations: ['merchant']
  });

  console.log(`Total active Sahafah stores: ${stores.length}`);

  let storesWithPrices = 0;
  let totalPrices = 0;

  const results: any[] = [];
  for (const store of stores) {
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } }
    });
    if (priceCount > 0) {
      storesWithPrices++;
      totalPrices += priceCount;
      results.push({
        name: store.merchant?.name_en || store.id,
        prices: priceCount
      });
    }
  }

  console.log(`Stores with prices: ${storesWithPrices}/${stores.length}`);
  console.log(`Total prices: ${totalPrices}`);
  if (results.length > 0) {
    console.table(results);
  }

  await AppDataSource.destroy();
}

main().catch(console.error);
