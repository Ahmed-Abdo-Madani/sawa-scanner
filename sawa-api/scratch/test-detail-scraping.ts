import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SallaGtinArScraper } from '../src/ingestion/scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from '../src/ingestion/scraper/zid-gtin-ar-scraper';

async function run() {
  console.log('🚀 INITIALIZING NEST APP TO TEST DETAIL SCRAPING...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const sallaScraper = app.get(SallaGtinArScraper);
  const zidScraper = app.get(ZidGtinArScraper);

  const urls = [
    // Shonaksa
    { name: 'Shonaksa', platform: 'salla', url: 'https://store.shonaksa.com/%D8%B2%D8%A8%D8%A7%D8%AF%D9%8A-%D9%83%D8%A7%D9%85%D9%84-%D8%A7%D9%84%D8%AF%D8%B3%D9%85-2-%D9%83/p262862544' },
    // Yasmin Store
    { name: 'Yasmin Store', platform: 'salla', url: 'https://yasminstore.com/ar/6281057030040-nadec-fresh-yoghurt-full-cream-2kg' },
    // Etaam Express
    { name: 'Etaam Express', platform: 'salla', url: 'https://etaamexpress.com/ar/%D9%86%D8%A7%D8%AF%D9%83-%D8%B2%D8%A8%D8%A7%D8%AF%D9%8A-%D8%B7%D8%A7%D8%B2%D8%AC-%D9%83%D8%A7%D9%85%D9%84-%D8%A7%D9%84%D8%AF%D8%B3%D9%85-2-%D9%83%D8%AC%D9%85/p1256338148' },
    // Menhal
    { name: 'Menhal', platform: 'zid', url: 'https://menhal.sa/products/%D8%B2%D8%A8%D8%A7%D8%AF%D9%8A%D8%B1%D9%88%D8%A8-%D9%83%D8%A7%D9%85%D9%84-%D8%A7%D9%84%D8%AF%D8%B3%D9%85-%D9%86%D8%A7%D8%AF%D9%832%D9%83%D9%8A%D9%84%D9%88' }
  ];

  for (const item of urls) {
    console.log(`\n==================================================`);
    console.log(`SCRAPING DETAILS FOR: ${item.name} (${item.url})`);
    
    try {
      const scraper = item.platform === 'salla' ? sallaScraper : zidScraper;
      await scraper.ensureLaunched();
      const details = await scraper.scrapeProductDetails(item.url);
      console.log('Result details:', details);
    } catch (err: any) {
      console.error(`❌ Error scraping ${item.name}:`, err.message);
    }
  }

  await app.close();
  console.log('\n👋 Done.');
}

run().catch(console.error);
