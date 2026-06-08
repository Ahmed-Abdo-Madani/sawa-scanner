import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  // Find all hungerstation stores
  const stores = await storeRepo.find({
    where: { platform: 'hungerstation' },
    relations: ['merchant']
  });

  console.log(`\nHungerStation Stores in DB: ${stores.length}`);
  console.log('------------------------------------------------------------');

  let totalPrices = 0;
  
  const results: {
    id: string;
    merchantEn: string;
    merchantAr: string;
    url: string;
    priceCount: number;
  }[] = [];
  for (const store of stores) {
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } }
    });
    totalPrices += priceCount;
    results.push({
      id: store.id,
      merchantEn: store.merchant?.name_en || 'N/A',
      merchantAr: store.merchant?.name_ar || 'N/A',
      url: store.source_url || '',
      priceCount
    });
  }

  // Sort by price count desc
  results.sort((a, b) => b.priceCount - a.priceCount);

  results.forEach((r, idx) => {
    console.log(`[Store #${idx + 1}] ID: ${r.id}`);
    console.log(`  Name: ${r.merchantEn} (${r.merchantAr})`);
    console.log(`  Prices: ${r.priceCount}`);
    console.log(`  URL: ${r.url}`);
    console.log('------------------------------------------------------------');
  });

  console.log(`Summary:`);
  console.log(`- Total HungerStation Stores: ${stores.length}`);
  console.log(`- Stores with > 0 prices: ${results.filter(r => r.priceCount > 0).length}`);
  console.log(`- Stores with 0 prices: ${results.filter(r => r.priceCount === 0).length}`);
  console.log(`- Total prices across all stores: ${totalPrices}`);

  await AppDataSource.destroy();
}

main().catch(err => {
  console.error('Error running check:', err);
});
