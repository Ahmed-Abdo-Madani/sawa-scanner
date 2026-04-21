import { Logger, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { IngestionProcessor } from './ingestion.processor';
import { ProductClusteringService } from './product-clustering.service';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { ScanModule } from '../scan/scan.module';
import { PriceScrapingProcessor } from './price-scraping.processor';
import { PriceScrapingRetailer } from './dto/price-scraping-job.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PricesModule } from '../prices/prices.module';
import { StoresModule } from '../stores/stores.module';
import { IngestionJobMode, IngestionPlatform } from './dto/ingestion-job.dto';

// Entities
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { Merchant } from '../entities/merchant.entity';
import { Store } from '../entities/store.entity';

import { OpenFoodFactsService } from './open-food-facts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      ProductPrice,
      ProductImage,
      ProductAllergen,
      Merchant,
      Store,
    ]),
    BullModule.registerQueue({
      name: 'ingestion-queue',
    }),
    BullModule.registerQueue({
      name: 'price-scraping-queue',
    }),
    ScanModule,
    PricesModule,
    StoresModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionProcessor,
    PriceScrapingProcessor,
    ProductClusteringService,
    RobotsTxtService,
    OpenFoodFactsService,
  ],
  exports: [IngestionService],
})
export class IngestionModule implements OnModuleInit {
  private readonly logger = new Logger(IngestionModule.name);

  private parseBoolFlag(value?: string): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  }

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue('ingestion-queue')
    private readonly ingestionQueue: Queue,
    @InjectQueue('price-scraping-queue')
    private readonly priceScrapingQueue: Queue,
  ) {}

  async onModuleInit() {
    // Schedule Daily Price Scraping Cron Jobs
    // Panda: Daily 2:00 AM KSA (23:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'panda-daily',
      { pattern: '0 23 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.PANDA },
      },
    );

    // Carrefour: Daily 2:30 AM KSA (23:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'carrefour-daily',
      { pattern: '30 23 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.CARREFOUR },
      },
    );

    // Othaim: Daily 3:00 AM KSA (00:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'othaim-daily',
      { pattern: '0 0 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.OTHAIM },
      },
    );

    // Tamimi: Daily 3:30 AM KSA (00:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'tamimi-daily',
      { pattern: '30 0 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.TAMIMI },
      },
    );

    if (
      this.parseBoolFlag(
        this.configService.get<string>('HUNGERSTATION_DISCOVERY_ENABLED'),
      )
    ) {
      await this.ingestionQueue.upsertJobScheduler(
        'hungerstation-weekly-discovery',
        { pattern: '0 22 * * 0' },
        {
          name: 'discover-cities',
          data: {
            platform: IngestionPlatform.HUNGERSTATION,
            mode: IngestionJobMode.DISCOVER_CITIES,
          },
        },
      );
    } else {
      try {
        await this.ingestionQueue.removeJobScheduler(
          'hungerstation-weekly-discovery',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to remove scheduler hungerstation-weekly-discovery: ${error.message}`,
        );
      }
    }

    if (
      this.parseBoolFlag(
        this.configService.get<string>('HUNGERSTATION_DAILY_ENABLED'),
      )
    ) {
      await this.ingestionQueue.upsertJobScheduler(
        'hungerstation-daily-prices',
        { pattern: '0 1 * * *' },
        {
          name: 'daily-refresh-hungerstation',
          data: {
            platform: IngestionPlatform.HUNGERSTATION,
            mode: IngestionJobMode.DAILY_REFRESH_HUNGERSTATION,
          },
        },
      );
    } else {
      try {
        await this.ingestionQueue.removeJobScheduler(
          'hungerstation-daily-prices',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to remove scheduler hungerstation-daily-prices: ${error.message}`,
        );
      }
    }
  }
}
