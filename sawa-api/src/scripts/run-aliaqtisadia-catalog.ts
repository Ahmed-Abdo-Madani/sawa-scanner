import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
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
import { AliaqtisadiaCatalogScraperService } from '../ingestion/aliaqtisadia-catalog-scraper.service';
import { AliaqtisadiaGtinArScraper } from '../ingestion/scraper/aliaqtisadia-gtin-ar-scraper';
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
    AliaqtisadiaCatalogScraperService,
    AliaqtisadiaGtinArScraper,
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
  console.log('🚀 Bootstrapping Minimal NestJS Context for Full Aliaqtisadia Catalog Scrape (No Redis)...');
  const app = await NestFactory.createApplicationContext(MinimalScrapeModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = app.get(AliaqtisadiaCatalogScraperService);

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
