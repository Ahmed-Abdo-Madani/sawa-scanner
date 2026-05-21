import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EtaamGtinArScraper } from '../ingestion/scraper/etaam-gtin-ar-scraper';

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Application Context for Cloudflare Evasion...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  
  try {
    const scraper = app.get(EtaamGtinArScraper);
    
    // Override the config to run headfully
    (scraper as any).config.headless = false;
    
    console.log('🚀 Launching headful Salla browser context at ./scraper-sessions/etaam-ar...');
    await scraper.ensureLaunched();
    
    // Open the Salla search page
    const page = await (scraper as any).context.newPage();
    const searchUrl = 'https://etaamexpress.com/ar/search?q=%D8%A3%D8%B1%D8%B2';
    console.log(`🧭 Navigating to: ${searchUrl}`);
    
    // We navigate and wait for the page to load
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 60000 });
    
    console.log('\n======================================================');
    console.log('🔒 CLOUDFLARE TURNSTILE SOLVER MODE ACTIVE');
    console.log('======================================================');
    console.log('Please check the opened browser window.');
    console.log('If you see a Cloudflare Turnstile challenge:');
    console.log('1. Solve it manually (or click the checkbox).');
    console.log('2. Once the search results page loads successfully,');
    console.log('   the cookies/cf_clearance will be saved automatically.');
    console.log('======================================================');
    console.log('Press ENTER here in the terminal when you are done to close the browser.');
    
    // Wait for user input
    await new Promise<void>((resolve) => {
      process.stdin.once('data', () => {
        resolve();
      });
    });
    
    console.log('💾 Saving cookies and closing browser...');
  } catch (error) {
    console.error('❌ Error during Cloudflare Turnstile solver run:', error);
  } finally {
    await app.close();
    console.log('👋 Done.');
    process.exit(0);
  }
}

bootstrap();
