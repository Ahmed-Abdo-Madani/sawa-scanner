import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DukanExpressCatalogScraperService } from '../ingestion/dukanexpress-catalog-scraper.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Context for Dukan Express Store Catalog Verification...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(DukanExpressCatalogScraperService);
    const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
    const priceRepo = app.get<Repository<ProductPrice>>(getRepositoryToken(ProductPrice));

    console.log('🚀 Running 1-page real catalog scrape (dryRun: false, startPage: 1, endPage: 1, triggerOtherStoresSearch: false)...');
    const stats = await service.run({
      dryRun: false,
      delayMs: 200,
      triggerOtherStoresSearch: false, // Ensure no background store lookups are triggered
      startPage: 1,
      endPage: 1,
      fresh: true, // Start fresh for verification
    });

    console.log('\n============================================================');
    console.log('📊 DUKAN EXPRESS STORE SCRAPER STATS:');
    console.log('============================================================');
    console.log(`Pages Scraped        : ${stats.totalPagesScraped}`);
    console.log(`Total Processed      : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)  : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)    : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued: ${stats.totalOtherStoresEnqueued}`);
    console.log('============================================================\n');

    // 1. Verify DB Seeding
    console.log('🔍 Querying DB for newly seeded Dukan Express products...');
    const seededProducts = await productRepo.find({
      where: { data_source: 'dukanexpress' },
      relations: ['prices'],
      take: 10,
    });

    console.log(`Found ${seededProducts.length} Dukan Express products in database:`);
    for (const p of seededProducts) {
      console.log(`- Product: "${p.name_ar}" (${p.name_en}) | GTIN: ${p.gtin}`);
      console.log(`  Prices:`);
      for (const pr of p.prices) {
        console.log(`    └─ Price: ${pr.price_sar_incl_vat} SAR | Stock: ${pr.in_stock} | Scraped: ${pr.scraped_at}`);
      }
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
