import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Mo0o0natGtinArScraper } from '../src/ingestion/scraper/mo0o0nat-gtin-ar-scraper';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  const barcode = '6291003011856';
  console.log(`🚀 Dry-running Mo0o0nat scraper for barcode ${barcode}...`);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const scraper = app.get(Mo0o0natGtinArScraper);
    await scraper.ensureLaunched();

    const candidates = await scraper.searchAndGetCandidates(barcode);
    console.log(`Found ${candidates.length} candidates:`);
    for (const cand of candidates) {
      console.log(`- Candidate: "${cand.name}", URL: ${cand.url}, Image: ${cand.image}`);
      console.log('Scraping details...');
      const details = await scraper.scrapeProductDetails(cand.url);
      console.log('Details:', details);
    }
  } catch (e: any) {
    console.error(`Test failed: ${e.message}`);
  } finally {
    await app.close();
    console.log('\n👋 Finished.');
  }
}

run();
