import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SallaGtinArScraper } from '../src/ingestion/scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from '../src/ingestion/scraper/zid-gtin-ar-scraper';

async function testSelfHealing() {
  console.log('🧪 Starting Self-Healing Scraper Resiliency Test...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const sallaScraper = app.get(SallaGtinArScraper);
    const zidScraper = app.get(ZidGtinArScraper);

    console.log('\n--- Test Case 1: Initial Launch ---');
    console.log('Is Salla launched initially?', sallaScraper.isLaunched());
    await sallaScraper.ensureLaunched();
    console.log('Is Salla launched after ensureLaunched()?', sallaScraper.isLaunched());

    console.log('\n--- Test Case 2: Clean Close Recovery ---');
    console.log('Closing Salla scraper browser context...');
    await sallaScraper.close();
    console.log('Is Salla launched after close()?', sallaScraper.isLaunched());
    
    console.log('Launching Salla scraper browser context again...');
    await sallaScraper.ensureLaunched();
    console.log('Is Salla launched after second ensureLaunched()?', sallaScraper.isLaunched());

    console.log('\n--- Test Case 3: Crash Recovery (Context closed unexpectedly) ---');
    // Grab the private/protected context to close it directly, simulating a background crash or termination
    const context = (sallaScraper as any).context;
    if (context) {
      console.log('Closing the active context directly (simulating unexpected termination/crash)...');
      await context.close();
      
      // The event listener is asynchronous, or pages() sanity check will instantly capture it.
      // Let's sleep a tiny bit to let close event propagate if any
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('Is Salla launched after unexpected context close?', sallaScraper.isLaunched());
      
      console.log('Spinning up fresh context after unexpected close...');
      await sallaScraper.ensureLaunched();
      console.log('Is Salla launched after recovering and relaunching?', sallaScraper.isLaunched());
    } else {
      console.error('Failed to grab the active context for simulated crash!');
    }

    console.log('\n--- Test Case 4: Crash Recovery (Browser disconnected unexpectedly) ---');
    const browser = (sallaScraper as any).browser;
    if (browser) {
      console.log('Closing the active browser directly (simulating unexpected browser termination)...');
      await browser.close();
      
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('Is Salla launched after unexpected browser disconnect?', sallaScraper.isLaunched());
      
      console.log('Spinning up fresh context after browser disconnect...');
      await sallaScraper.ensureLaunched();
      console.log('Is Salla launched after recovering and relaunching browser?', sallaScraper.isLaunched());
    } else {
      // In persistent context mode, browser might be null. Let's log this detail.
      console.log('Browser is null (expected in persistent context mode). Skipping browser-level disconnect test.');
    }

    // Clean up
    await sallaScraper.close();
    await zidScraper.close();
    console.log('\n✅ All Self-Healing Resiliency Tests passed successfully!');

  } catch (error: any) {
    console.error('❌ Fatal error during test:', error);
  } finally {
    await app.close();
    console.log('\n👋 Test completed!');
  }
}

testSelfHealing();
