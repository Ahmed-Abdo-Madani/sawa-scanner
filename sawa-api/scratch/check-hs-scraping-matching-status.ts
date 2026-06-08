import { AppDataSource } from '../src/data-source';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import { Product } from '../src/entities/product.entity';
import { In } from 'typeorm';
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
  const productRepo = AppDataSource.getRepository(Product);

  const districts = ['sahafah', 'ghadir'];

  // 1. Fetch stores in target districts
  const stores = await storeRepo.find({
    where: {
      platform: 'hungerstation',
      city_slug: 'riyadh',
      district_slug: In(districts)
    },
    relations: ['merchant']
  });

  console.log(`\nAnalyzing ${stores.length} HungerStation stores in target districts: ${districts.join(', ')}`);

  const storesWithPrices: any[] = [];
  const storesWithoutPrices: any[] = [];

  for (const store of stores) {
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } }
    });

    const info = {
      id: store.id,
      name: store.merchant?.name_en || 'Unknown Store',
      district: store.district_slug,
      priceCount
    };

    if (priceCount > 0) {
      storesWithPrices.push(info);
    } else {
      storesWithoutPrices.push(info);
    }
  }

  console.log('\n============================================================');
  console.log('📊 SCRAPING PROGRESS BY DISTRICTS');
  console.log('============================================================');
  console.log(`Total Target Stores          : ${stores.length}`);
  console.log(`Scraped Stores (Prices > 0)  : ${storesWithPrices.length}`);
  console.log(`Pending Stores (Prices = 0)  : ${storesWithoutPrices.length}`);

  console.log('\n✅ Scraped Stores List:');
  storesWithPrices.forEach((s, idx) => {
    console.log(`  ${idx + 1}. [${s.district.toUpperCase()}] ${s.name} (${s.priceCount} prices)`);
  });

  console.log('\n⏳ Pending Stores List:');
  storesWithoutPrices.forEach((s, idx) => {
    console.log(`  ${idx + 1}. [${s.district.toUpperCase()}] ${s.name}`);
  });

  // 2. Query GTIN matching stats database-wide
  const gtinStats = await AppDataSource.query(`
    SELECT
      COUNT(*) as total,
      COUNT(gtin) as matched,
      COUNT(*) - COUNT(gtin) as unmatched
    FROM product
    WHERE hs_product_id IS NOT NULL;
  `);

  const priceStats = await AppDataSource.query(`
    SELECT
      COUNT(*) as total_prices,
      COUNT(CASE WHEN p.gtin IS NOT NULL THEN 1 END) as matched_prices
    FROM product_price pp
    INNER JOIN store s ON s.id = pp.store_id
    LEFT JOIN product p ON p.id = pp.product_id
    WHERE s.platform = 'hungerstation';
  `);

  console.log('\n============================================================');
  console.log('📊 GTIN MATCHING & LINKING STATISTICS');
  console.log('============================================================');
  if (gtinStats && gtinStats[0]) {
    const total = parseInt(gtinStats[0].total || '0');
    const matched = parseInt(gtinStats[0].matched || '0');
    const unmatched = parseInt(gtinStats[0].unmatched || '0');
    const matchPct = total > 0 ? ((matched / total) * 100).toFixed(2) : '0.00';
    console.log(`Total HS Catalog Products    : ${total}`);
    console.log(`Matched Products (With GTIN) : ${matched} (${matchPct}%)`);
    console.log(`Unmatched HS Products        : ${unmatched}`);
  }

  if (priceStats && priceStats[0]) {
    const totalPrices = parseInt(priceStats[0].total_prices || '0');
    const matchedPrices = parseInt(priceStats[0].matched_prices || '0');
    const priceMatchPct = totalPrices > 0 ? ((matchedPrices / totalPrices) * 100).toFixed(2) : '0.00';
    console.log(`Total HS Price Records       : ${totalPrices}`);
    console.log(`Prices Linked to a GTIN      : ${matchedPrices} (${priceMatchPct}%)`);
  }
  console.log('============================================================\n');

  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error('Error:', err);
});
