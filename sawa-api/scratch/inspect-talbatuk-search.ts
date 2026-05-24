import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TalbatukGtinArScraper } from '../src/ingestion/scraper/talbatuk-gtin-ar-scraper';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  const barcode = '6281014800419';
  console.log(`🔎 Inspecting Talbatuk search for barcode "${barcode}"...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const scraper = app.get(TalbatukGtinArScraper);
    await scraper.ensureLaunched();
    const context = (scraper as any).context;
    if (!context) throw new Error('Browser context not initialized');

    const page = await context.newPage();
    const url = `https://talbatuk.com/products?q=${barcode}`;
    console.log(`Navigating to: ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });
    console.log('Navigation finished. Waiting 3 seconds...');
    await page.waitForTimeout(3000);

    const html = await page.content();
    fs.writeFileSync('./scratch/talbatuk-search-page.html', html);
    console.log('Saved search page HTML to scratch/talbatuk-search-page.html');

    // Let's print out all a[href*="/products/"] links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }))
        .filter(a => a.href.includes('/products/'));
    });

    console.log(`Found ${links.length} links containing '/products/':`);
    console.log(links);

    // Let's run the scraper candidate generation directly to see if it succeeds now
    console.log('\n--- Running searchAndGetCandidates directly ---');
    const candidates = await scraper.searchAndGetCandidates(barcode, 0.5, undefined, 'https://talbatuk.com');
    console.log('Candidates returned:', candidates);

  } catch (error: any) {
    console.error('Error during inspection:', error);
  } finally {
    await app.close();
    console.log('\n👋 Done.');
  }
}

run();
