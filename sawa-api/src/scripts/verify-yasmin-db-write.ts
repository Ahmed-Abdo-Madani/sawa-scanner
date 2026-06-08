import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { YasminCatalogScraperService } from '../ingestion/yasmin-catalog-scraper.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

dotenv.config();

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Context for Yasmin Store Catalog Verification...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(YasminCatalogScraperService);
    const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
    const priceRepo = app.get<Repository<ProductPrice>>(getRepositoryToken(ProductPrice));
    
    // Get BullMQ ingestion-queue to verify background seeding tasks
    const ingestionQueue = app.get<Queue>('BullQueue_ingestion-queue');

    console.log('🚀 Running 1-category real catalog scrape (dryRun: false, limitCategories: 1)...');
    const stats = await service.run({
      dryRun: false,
      delayMs: 200,
      triggerOtherStoresSearch: false, // Trigger other store price seeding in background
      limitCategories: 1, // Only process the first category for fast test
    });
    
    console.log('\n============================================================');
    console.log('📊 YASMIN STORE SCRAPER STATS:');
    console.log('============================================================');
    console.log(`Categories Processed : ${stats.totalCategoriesProcessed}`);
    console.log(`Total Processed      : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)  : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)    : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued: ${stats.totalOtherStoresEnqueued}`);
    console.log('============================================================\n');

    // 1. Verify DB Seeding
    console.log('🔍 Querying DB for newly seeded Yasmin Store products...');
    const seededProducts = await productRepo.find({
      where: { data_source: 'yasmin' },
      relations: ['prices'],
      take: 5,
    });

    console.log(`Found ${seededProducts.length} Yasmin Store products in database:`);
    for (const p of seededProducts) {
      console.log(`- Product: "${p.name_ar}" (${p.name_en}) | GTIN: ${p.gtin}`);
      console.log(`  Prices:`);
      for (const pr of p.prices) {
        console.log(`    └─ Price: ${pr.price_sar_incl_vat} SAR | Stock: ${pr.in_stock} | Scraped: ${pr.scraped_at}`);
      }
    }

    // 2. Verify BullMQ Queue Jobs
    if (ingestionQueue) {
      const waitingJobs = await ingestionQueue.getJobs(['waiting', 'active']);
      const seedJobs = waitingJobs.filter(job => job.name === 'seed-gtin-prices');
      console.log(`\n📬 BullMQ Queue Status:`);
      console.log(`- Total waiting/active seed-gtin-prices jobs: ${seedJobs.length}`);
      if (seedJobs.length > 0) {
        console.log('Sample background jobs:');
        for (const job of seedJobs.slice(0, 5)) {
          console.log(`  └─ Job ID: ${job.id} | GTIN: ${job.data?.gtin}`);
        }
      }
    } else {
      console.log('⚠️ Could not resolve BullMQ ingestion-queue.');
    }

    console.log('\n✅ Verification process finished successfully!');
  } catch (error: any) {
    console.error('❌ Verification failed:', error);
  } finally {
    await app.close();
    console.log('👋 Application context closed.');
  }
}

bootstrap();
