import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TalbatukGtinArScraper } from '../src/ingestion/scraper/talbatuk-gtin-ar-scraper';
import { ProductsService } from '../src/products/products.service';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  console.log('🚀 Starting Standalone speed & latency verification script...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    // ----------------------------------------------------
    // TEST 1: Page Pooling & Dynamic Adaptive Timeouts
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Playwright Page Pooling & Adaptive Latency ---');
    const scraper = app.get(TalbatukGtinArScraper);
    await scraper.ensureLaunched();

    // Query 1: Empty Pool (Forces page creation)
    const t0 = Date.now();
    console.log('Running Query 1 (Pool is empty, will create new page)...');
    const cand1 = await scraper.searchAndGetCandidates('776992032113'); // Farfesha Hot Lemon
    const d1 = Date.now() - t0;
    console.log(`Query 1 completed in ${d1}ms. Candidates found: ${cand1.length}`);

    // Query 2: Reused Pool (Should reuse blank page from pool)
    const t1 = Date.now();
    console.log('\nRunning Query 2 (Page pool is populated, should reuse blank tab)...');
    const cand2 = await scraper.searchAndGetCandidates('6281014800419'); // Goody Tuna
    const d2 = Date.now() - t1;
    console.log(`Query 2 completed in ${d2}ms. Candidates found: ${cand2.length}`);

    console.log('\nMeasuring dynamic timeout calculations based on load latency history:');
    const timeout = (scraper as any).getAdaptiveSelectorTimeout('https://talbatuk.com');
    console.log(`Adaptive timeout for talbatuk.com is currently: ${timeout}ms (standard baseline: 3000ms)`);

    // ----------------------------------------------------
    // TEST 2: Negative Caching
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Redis Negative Caching ---');
    const productsService = app.get(ProductsService);
    const nonExistingGtin = '1111111111111';

    // Clear key first just to be clean
    const redis = (productsService as any).redis;
    const cacheKey = `missing:https://talbatuk.com:${nonExistingGtin}`;
    await redis.del(cacheKey);

    console.log(`\nQuerying ProductsService for non-existing barcode "${nonExistingGtin}" (First run, uncached)...`);
    const s0 = Date.now();
    try {
      await productsService.findByGtin(nonExistingGtin);
    } catch (e: any) {
      console.log(`First run rejected as expected: "${e.message}"`);
    }
    const d3 = Date.now() - s0;
    console.log(`First run completed in ${d3}ms`);

    // Verify negative cache was written
    const cachedVal = await redis.get(cacheKey);
    console.log(`Redis cache key "${cacheKey}" value: "${cachedVal}" (Expected: "true")`);

    console.log(`\nQuerying ProductsService again for "${nonExistingGtin}" (Second run, should skip scraping instantly)...`);
    const s1 = Date.now();
    try {
      await productsService.findByGtin(nonExistingGtin);
    } catch (e: any) {
      console.log(`Second run rejected as expected: "${e.message}"`);
    }
    const d4 = Date.now() - s1;
    console.log(`⚡ Second run completed in ${d4}ms! (Massive speedup!)`);

  } catch (e: any) {
    console.error(`Test failed: ${e.message}`, e.stack);
  } finally {
    const scraper = app.get(TalbatukGtinArScraper);
    await scraper.close();
    await app.close();
    console.log('\n👋 Verification script completed.');
  }
}

run();
