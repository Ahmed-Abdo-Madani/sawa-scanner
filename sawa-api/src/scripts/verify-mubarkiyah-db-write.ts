import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MubarkiyahCatalogScraperService } from '../ingestion/mubarkiyah-catalog-scraper.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Context for Mubarkiyah Store Catalog Verification...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(MubarkiyahCatalogScraperService);
    const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));
    const priceRepo = app.get<Repository<ProductPrice>>(getRepositoryToken(ProductPrice));

    console.log('🚀 Running 1-classification real catalog scrape (dryRun: false, limitClassifications: 1, triggerOtherStoresSearch: false)...');
    const stats = await service.run({
      dryRun: false,
      delayMs: 200,
      triggerOtherStoresSearch: false, // Ensure no background store lookups are triggered
      fresh: true, // Start fresh for verification
      limitClassifications: 1,
    });

    console.log('\n============================================================');
    console.log('📊 MUBARKIYAH STORE SCRAPER STATS:');
    console.log('============================================================');
    console.log(`Classifications Processed: ${stats.totalClassificationsProcessed}`);
    console.log(`Pages Scraped            : ${stats.totalPagesScraped}`);
    console.log(`Total Processed          : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)      : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)        : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued    : ${stats.totalOtherStoresEnqueued}`);
    console.log('============================================================\n');

    // 1. Verify DB Seeding
    console.log('🔍 Querying DB for newly seeded Mubarkiyah products...');
    const seededProducts = await productRepo.find({
      where: { data_source: 'mubarkiyah' },
      relations: ['prices'],
      take: 10,
    });

    console.log(`Found ${seededProducts.length} Mubarkiyah products in database:`);
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
