import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { YasminCatalogScraperService } from '../ingestion/yasmin-catalog-scraper.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🚀 Bootstrapping NestJS Context for Full Yasmin Store Catalog Scrape...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(YasminCatalogScraperService);

    const fresh = process.argv.includes('--fresh');
    console.log(`📥 Running full catalog scrape (dryRun: false, triggerOtherStoresSearch: false, fresh: ${fresh})...`);
    const stats = await service.run({
      dryRun: false,
      delayMs: 1000, // Organic delay between categories
      triggerOtherStoresSearch: false, // Do not trigger other store lookups as requested
      fresh,
    });

    console.log('\n============================================================');
    console.log('🏁 FULL CATALOG SCRAPE COMPLETED:');
    console.log('============================================================');
    console.log(`Categories Processed : ${stats.totalCategoriesProcessed}`);
    console.log(`Total Processed      : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)  : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)    : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued: ${stats.totalOtherStoresEnqueued}`);
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
