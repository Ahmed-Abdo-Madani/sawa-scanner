import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as dotenv from 'dotenv';

// Entities
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { Store } from '../entities/store.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { ProductAlternativeName } from '../entities/product-alternative-name.entity';

// Services
import { EtaamExpressCatalogScraperService } from '../ingestion/etaamexpress-catalog-scraper.service';
import { EtaamGtinArScraper } from '../ingestion/scraper/etaam-gtin-ar-scraper';
import { RobotsTxtService } from '../ingestion/scraper/robots-txt.service';
import { ImageHashService } from '../ingestion/image-hash.service';

dotenv.config();

const allEntities = [
  Product,
  ProductPrice,
  ProductImage,
  Merchant,
  Store,
  NutritionFact,
  Ingredient,
  ProductAllergen,
  ProductAlternativeName,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DATABASE_HOST'),
        port: config.get<number>('DATABASE_PORT'),
        username: config.get<string>('DATABASE_USERNAME'),
        password: config.get<string>('DATABASE_PASSWORD'),
        database: config.get<string>('DATABASE_NAME'),
        entities: allEntities,
        synchronize: false,
        ssl:
          config.get<string>('DATABASE_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
      }),
    }),
    TypeOrmModule.forFeature(allEntities),
  ],
  providers: [
    EtaamExpressCatalogScraperService,
    EtaamGtinArScraper,
    RobotsTxtService,
    ImageHashService,
    {
      provide: getQueueToken('ingestion-queue'),
      useValue: {
        add: async () => ({ id: 'mock-job' }),
      },
    },
  ],
})
class MinimalScrapeModule {}

async function bootstrap() {
  console.log('🛒 Bootstrapping Minimal NestJS Context for Etaam Express Verification (No Redis)...');
  const app = await NestFactory.createApplicationContext(MinimalScrapeModule, {
    logger: ['error', 'warn'],
  });

  try {
    const service = app.get(EtaamExpressCatalogScraperService);
    const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));

    console.log('🚀 Running 1-category real catalog scrape (dryRun: false, limitCategories: 1, triggerOtherStoresSearch: false)...');
    const stats = await service.run({
      dryRun: false,
      delayMs: 200,
      triggerOtherStoresSearch: false, // Ensure no background store lookups are triggered
      fresh: true, // Start fresh for verification
      limitCategories: 1,
    });

    console.log('\n============================================================');
    console.log('📊 ETAAM EXPRESS STORE SCRAPER STATS:');
    console.log('============================================================');
    console.log(`Categories Processed  : ${stats.totalCategoriesProcessed}`);
    console.log(`Total Processed        : ${stats.totalProcessed}`);
    console.log(`Products Added (DB)    : ${stats.totalAdded}`);
    console.log(`Prices Added (DB)      : ${stats.totalPricesAdded}`);
    console.log(`Other Stores Enqueued  : ${stats.totalOtherStoresEnqueued}`);
    console.log('============================================================\n');

    // 1. Verify DB Seeding
    console.log('🔍 Querying DB for newly seeded Etaam Express products...');
    const seededProducts = await productRepo.find({
      where: { data_source: 'etaam' },
      relations: ['prices'],
      take: 10,
    });

    console.log(`Found ${seededProducts.length} Etaam Express products in database:`);
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
