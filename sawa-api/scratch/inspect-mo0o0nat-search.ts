import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Mo0o0natGtinArScraper } from '../src/ingestion/scraper/mo0o0nat-gtin-ar-scraper';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();
process.env.BYPASS_ROBOTS_TXT = 'true';

async function run() {
  const barcode = '6291003011856';
  console.log(`🔎 Inspecting Mo0o0nat search for barcode "${barcode}"...`);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const scraper = app.get(Mo0o0natGtinArScraper);
    await scraper.ensureLaunched();
    const context = (scraper as any).context;
    if (!context) throw new Error('Browser context not initialized');

    const page = await context.newPage();
    const url = `https://mo0o0nat.com/products?q=${barcode}`;
    console.log(`Navigating to: ${url}...`);

    await page.goto(url, { waitUntil: 'networkidle' });
    console.log('Navigation finished. Waiting 3 seconds...');
    await page.waitForTimeout(3000);

    const html = await page.content();
    fs.writeFileSync('./scratch/mo0o0nat-search-page.html', html);
    console.log('Saved search page HTML to scratch/mo0o0nat-search-page.html');

    // Let's print out all a[href*="/products/"] links
    const links = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      return anchors
        .map(a => ({ href: a.href, text: a.textContent?.trim() || '' }))
        .filter(a => a.href.includes('/products/'));
    });

    console.log(`Found ${links.length} links containing '/products/':`);
    console.log(links);

  } catch (error: any) {
    console.error('Error during inspection:', error);
  } finally {
    await app.close();
    console.log('\n👋 Done.');
  }
}

run();
