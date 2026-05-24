import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AtayibGtinArScraper } from '../src/ingestion/scraper/atayib-gtin-ar-scraper';
import { MubarkiyahGtinArScraper } from '../src/ingestion/scraper/mubarkiyah-gtin-ar-scraper';
import { WawGtinArScraper } from '../src/ingestion/scraper/waw-gtin-ar-scraper';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  console.log('🚀 Testing custom scrapers for barcode 6281007120401...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const atayib = app.get(AtayibGtinArScraper);
    const mubarkiyah = app.get(MubarkiyahGtinArScraper);
    const waw = app.get(WawGtinArScraper);

    const barcode = '6281007120401';

    // 1. Atayib
    console.log('\n--- 1. Testing Atayib ---');
    try {
      const candidates = await atayib.searchAndGetCandidates(barcode);
      console.log(`Found ${candidates.length} candidates.`);
      for (const cand of candidates.slice(0, 2)) {
        console.log(`Candidate Name: ${cand.name}, URL: ${cand.url}`);
        const details = await atayib.scrapeProductDetails(cand.url);
        console.log(`Details:`, details);
      }
    } catch (e: any) {
      console.error(`Atayib failed: ${e.message}`);
    }

    // 2. Mubarkiyah
    console.log('\n--- 2. Testing Mubarkiyah ---');
    try {
      const candidates = await mubarkiyah.searchAndGetCandidates(barcode);
      console.log(`Found ${candidates.length} candidates.`);
      for (const cand of candidates.slice(0, 2)) {
        console.log(`Candidate Name: ${cand.name}, URL: ${cand.url}`);
        const details = await mubarkiyah.scrapeProductDetails(cand.url);
        console.log(`Details:`, details);
      }
    } catch (e: any) {
      console.error(`Mubarkiyah failed: ${e.message}`);
    }

    // 3. Waw
    console.log('\n--- 3. Testing Waw ---');
    try {
      const candidates = await waw.searchAndGetCandidates(barcode);
      console.log(`Found ${candidates.length} candidates.`);
      for (const cand of candidates.slice(0, 2)) {
        console.log(`Candidate Name: ${cand.name}, URL: ${cand.url}`);
        const details = await waw.scrapeProductDetails(cand.url);
        console.log(`Details:`, details);
      }
    } catch (e: any) {
      console.error(`Waw failed: ${e.message}`);
    }

  } catch (error: any) {
    console.error('Fatal error during test:', error);
  } finally {
    await app.close();
    console.log('\n👋 Finished tests.');
  }
}

run();
