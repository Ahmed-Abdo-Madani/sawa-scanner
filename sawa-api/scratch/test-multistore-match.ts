import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SallaGtinArScraper } from '../src/ingestion/scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from '../src/ingestion/scraper/zid-gtin-ar-scraper';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🩺 Bootstrapping NestJS Application Context for Multi-Store Verification...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const sallaScraper = app.get(SallaGtinArScraper);
    const zidScraper = app.get(ZidGtinArScraper);

    console.log('🚀 Running Multi-Store In-Depth Match Tests...');

    // 1. Salla search test (store.shonaksa.com)
    console.log('\n--- TEST 1: Salla Search (store.shonaksa.com) ---');
    try {
      const match = await sallaScraper.searchAndGetBestMatch(
        'شاي',
        0.5,
        [], // no image hashes for test
        'https://store.shonaksa.com'
      );
      console.log('Result:', JSON.stringify(match, null, 2));
      if (match?.url) {
        console.log(`Scraping GTIN from detail page: ${match.url}`);
        const gtin = await sallaScraper.scrapeGtinFromProductPage(match.url);
        console.log(`GTIN/SKU: ${gtin}`);
      }
    } catch (err: any) {
      console.error('Test 1 failed:', err.message);
    }

    // 2. Zid search test (parkcentersa.com)
    console.log('\n--- TEST 2: Zid Search (parkcentersa.com) ---');
    try {
      const match = await zidScraper.searchAndGetBestMatch(
        'شاي',
        0.5,
        [], // no image hashes for test
        'https://parkcentersa.com'
      );
      console.log('Result:', JSON.stringify(match, null, 2));
      if (match?.url) {
        console.log(`Scraping GTIN from detail page: ${match.url}`);
        const gtin = await zidScraper.scrapeGtinFromProductPage(match.url);
        console.log(`GTIN/SKU: ${gtin}`);
      }
    } catch (err: any) {
      console.error('Test 2 failed:', err.message);
    }

    // 3. Salla search test (yasminstore.com)
    console.log('\n--- TEST 3: Salla Search (yasminstore.com) ---');
    try {
      const match = await sallaScraper.searchAndGetBestMatch(
        'قهوة',
        0.5,
        [],
        'https://yasminstore.com'
      );
      console.log('Result:', JSON.stringify(match, null, 2));
      if (match?.url) {
        console.log(`Scraping GTIN from detail page: ${match.url}`);
        const gtin = await sallaScraper.scrapeGtinFromProductPage(match.url);
        console.log(`GTIN/SKU: ${gtin}`);
      }
    } catch (err: any) {
      console.error('Test 3 failed:', err.message);
    }

  } catch (error: any) {
    console.error('Verification encountered an error:', error);
  } finally {
    await app.close();
    console.log('\n👋 Application context closed.');
  }
}

bootstrap();
