import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SallaGtinArScraper } from '../src/ingestion/scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from '../src/ingestion/scraper/zid-gtin-ar-scraper';
import { Product } from '../src/entities/product.entity';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

const STORES = [
  { url: 'https://store.shonaksa.com', platform: 'salla', name: 'Shonaksa (Salla)' },
  { url: 'https://yasminstore.com', platform: 'salla', name: 'Yasmin Store (Salla)' },
  { url: 'https://mrlogman.com', platform: 'salla', name: 'Mr Logman (Salla)' },
  { url: 'https://parkcentersa.com', platform: 'zid', name: 'Park Center (Zid)' },
  { url: 'https://menhal.sa', platform: 'zid', name: 'Menhal (Zid)' },
];

async function runDryRun() {
  console.log('🧪 Starting direct Multi-Store GTIN dry run for 5 stores...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const sallaScraper = app.get(SallaGtinArScraper);
    const zidScraper = app.get(ZidGtinArScraper);
    const dataSource = app.get(DataSource);
    const productRepo = dataSource.getRepository(Product);

    // Let's find 5 real products in the DB that don't have a GTIN
    // We will search for products containing common keywords so they have a high chance of matching
    const keywords = ['شاي', 'قهوة', 'حليب', 'شوكولاتة', 'صلصة'];
    const testProducts: Product[] = [];

    for (const keyword of keywords) {
      const product = await productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.images', 'image')
        .where('product.gtin IS NULL')
        .andWhere('product.name_ar LIKE :keyword', { keyword: `%${keyword}%` })
        .andWhere("product.name_ar != ''")
        .limit(1)
        .getOne();

      if (product) {
        testProducts.push(product);
      }
    }

    // Fallback to top 5 products without GTIN if keyword search didn't yield enough
    if (testProducts.length < 5) {
      const extraProducts = await productRepo
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.images', 'image')
        .where('product.gtin IS NULL')
        .andWhere("product.name_ar IS NOT NULL AND product.name_ar != ''")
        .limit(5 - testProducts.length)
        .getMany();
      testProducts.push(...extraProducts);
    }

    console.log(`\n📦 Selected ${testProducts.length} test products from DB missing GTINs:`);
    testProducts.forEach((p, idx) => {
      console.log(`  ${idx + 1}. [ID: ${p.id}] ${p.name_ar} (Hashes count: ${p.images?.length ?? 0})`);
    });

    console.log('\n============================================================');
    console.log('🚀 Running dry run on 5 stores sequentially...');
    console.log('============================================================');

    for (let i = 0; i < STORES.length; i++) {
      const store = STORES[i];
      const product = testProducts[i % testProducts.length];
      if (!product) continue;

      console.log(`\n🌐 STORE ${i + 1}/${STORES.length}: ${store.name}`);
      console.log(`🔎 Searching for: "${product.name_ar}"`);
      console.log(`🔗 Store URL: ${store.url}`);

      const scraper = store.platform === 'zid' ? zidScraper : sallaScraper;
      await scraper.ensureLaunched();

      const localHashes = product.images
        ?.map((img) => img.image_hash)
        .filter((hash): hash is string => !!hash && hash !== 'FAILED') || [];

      try {
        const startTime = Date.now();
        const bestMatch = await scraper.searchAndGetBestMatch(
          product.name_ar,
          0.5, // lower threshold for testing dry-run matching
          localHashes,
          store.url,
        );
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (bestMatch) {
          console.log(`✅ MATCH FOUND in ${duration}s!`);
          console.log(`   - Name: "${bestMatch.name}"`);
          console.log(`   - URL: ${bestMatch.url}`);
          console.log(`   - Similarity: ${bestMatch.similarity.toFixed(3)} (Method: ${bestMatch.matchMethod})`);
          if (bestMatch.matchMethod === 'image') {
            console.log(`   - Hamming Distance: ${bestMatch.hammingDistance}`);
          }

          console.log('   - Extracting GTIN/SKU from detail page...');
          const gtin = await scraper.scrapeGtinFromProductPage(bestMatch.url);
          if (gtin) {
            console.log(`   🎉 SUCCESS! Extracted GTIN/SKU: "${gtin}"`);
          } else {
            console.log('   ⚠️ Failed to extract GTIN/SKU from the product page.');
          }
        } else {
          console.log(`❌ No confident match found on this store in ${duration}s (Threshold: 0.5)`);
        }
      } catch (err: any) {
        console.error(`❌ Error scraping ${store.name}: ${err.message}`);
      }
    }

  } catch (error: any) {
    console.error('Fatal error during dry run:', error);
  } finally {
    await app.close();
    console.log('\n👋 Application context closed. Dry run complete!');
  }
}

runDryRun();
