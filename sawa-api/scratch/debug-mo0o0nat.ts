import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Mo0o0natGtinArScraper } from '../src/ingestion/scraper/mo0o0nat-gtin-ar-scraper';
import * as dotenv from 'dotenv';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  const barcode = '6291003011856';
  console.log(`🧪 Debugging Mo0o0nat search for barcode "${barcode}"...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const scraper = app.get(Mo0o0natGtinArScraper);
    await scraper.ensureLaunched();

    // Test with default (which uses "search")
    console.log('\n--- 1. Testing with default (search param "search") ---');
    try {
      const candidates = await scraper.searchAndGetCandidates(barcode, 0.5, undefined, 'https://mo0o0nat.com');
      console.log(`Found ${candidates.length} candidates using default search.`);
      for (const cand of candidates) {
        console.log(`- Candidate: ${cand.name}, URL: ${cand.url}`);
      }
    } catch (e: any) {
      console.error(`Default search failed: ${e.message}`);
    }

  } catch (err: any) {
    console.error(`Fatal error: ${err.message}`);
  } finally {
    await app.close();
    console.log('\n👋 Debug complete.');
  }
}

run();
