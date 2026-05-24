import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ParkCenterCatalogScraperService } from '../ingestion/parkcenter-catalog-scraper.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Application Context for Direct Scraper Test...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  
  try {
    const service = app.get(ParkCenterCatalogScraperService);
    console.log('🚀 Triggering Park Center Catalog Scraper directly (Dry Run, Pages 1-2)...');
    
    const stats = await service.run({
      dryRun: true,
      startPage: 1,
      endPage: 2,
      delayMs: 1000,
      triggerOtherStoresSearch: false, // Don't enqueue background jobs in dry run
    });
    
    console.log('============================================================');
    console.log('📊 DRY RUN RESULTS:');
    console.log('============================================================');
    console.log(`Pages Scraped        : ${stats.totalPagesScraped}`);
    console.log(`Total Processed      : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)  : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)    : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued: ${stats.totalOtherStoresEnqueued}`);
    console.log(`Duration             : ${(stats.durationMs / 1000).toFixed(1)}s`);
    console.log('============================================================');
    console.log('✅ Direct Scraper Test complete!');
  } catch (error: any) {
    console.error('❌ Failed to execute Park Center Catalog Scraper:', error);
  } finally {
    await app.close();
    console.log('👋 Application context closed.');
  }
}

bootstrap();
