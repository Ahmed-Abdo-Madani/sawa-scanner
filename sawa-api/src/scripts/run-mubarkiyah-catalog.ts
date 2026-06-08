import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MubarkiyahCatalogScraperService } from '../ingestion/mubarkiyah-catalog-scraper.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🚀 Bootstrapping NestJS Context for Full Mubarkiyah Catalog Scrape...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(MubarkiyahCatalogScraperService);

    const fresh = process.argv.includes('--fresh');
    console.log(`\n📥 Running full catalog scrape (dryRun: false, triggerOtherStoresSearch: false, fresh: ${fresh})...`);
    console.log('Progress will be saved locally to "./mubarkiyah-scrape-progress.json"\n');

    const stats = await service.run({
      dryRun: false,
      delayMs: 300, // Safe delay between hits
      triggerOtherStoresSearch: false, // Strict flag as per instructions
      fresh,
    });

    console.log('\n============================================================');
    console.log('🏁 FULL CATALOG SCRAPE COMPLETED:');
    console.log('============================================================');
    console.log(`Classifications Processed: ${stats.totalClassificationsProcessed}`);
    console.log(`Pages Scraped            : ${stats.totalPagesScraped}`);
    console.log(`Total Processed          : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)      : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)        : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued    : ${stats.totalOtherStoresEnqueued}`);
    console.log(`Duration (ms)            : ${stats.durationMs}`);
    console.log('============================================================\n');

  } catch (error: any) {
    console.error('❌ Full catalog scrape failed:', error);
  } finally {
    await app.close();
    console.log('👋 Application context closed.');
    process.exit(0);
  }
}

bootstrap();
