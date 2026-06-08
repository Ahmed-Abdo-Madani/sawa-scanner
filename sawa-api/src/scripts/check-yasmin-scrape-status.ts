import { AppDataSource } from '../data-source';
import { Store } from '../entities/store.entity';
import { ProductPrice } from '../entities/product-price.entity';

async function checkYasminStatus() {
  await AppDataSource.initialize();
  console.log('✓ Database connection initialized.');

  const storeRepo = AppDataSource.getRepository(Store);
  const priceRepo = AppDataSource.getRepository(ProductPrice);

  // 1. Fetch all HungerStation stores in Riyadh's Yasmin district
  const stores = await storeRepo.find({
    where: {
      platform: 'hungerstation',
      city_slug: 'riyadh',
      district_slug: 'yasmin'
    },
    relations: ['merchant']
  });

  console.log(`📊 Found ${stores.length} HungerStation stores in Riyadh/Yasmin.\n`);
  console.log('========================================================================================================');
  console.log(
    `${'Store Name'.padEnd(30)} | ${'Branch ID'.padEnd(10)} | ${'Prices Count'.padEnd(12)} | ${'Latest Scrape Time'}`
  );
  console.log('========================================================================================================');

  let totalPrices = 0;
  let scrapedStoresCount = 0;

  for (const store of stores) {
    const merchantName = store.merchant?.name_en || 'Unknown';
    
    // Count prices for this store
    const count = await priceRepo.count({
      where: { store_id: store.id }
    });

    // Get the latest scraped_at timestamp for this store
    let latestScrape = 'Never';
    if (count > 0) {
      scrapedStoresCount++;
      const latestPrice = await priceRepo.findOne({
        where: { store_id: store.id },
        order: { scraped_at: 'DESC' }
      });
      if (latestPrice && latestPrice.scraped_at) {
        latestScrape = new Date(latestPrice.scraped_at).toISOString();
      }
    }

    console.log(
      `${merchantName.substring(0, 30).padEnd(30)} | ${String(store.platform_branch_id).padEnd(10)} | ${String(count).padStart(12)} | ${latestScrape}`
    );
    totalPrices += count;
  }

  console.log('========================================================================================================');
  console.log(`Summary:`);
  console.log(`- Scraped Stores : ${scrapedStoresCount} / ${stores.length}`);
  console.log(`- Total Prices   : ${totalPrices}`);
  console.log('========================================================================================================\n');

  await AppDataSource.destroy();
}

checkYasminStatus().catch(err => console.error(err));
