import { Module } from '@nestjs/common';
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

// Entities
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      ProductPrice,
      ProductImage,
      Merchant,
    ]),
    BullModule.registerQueue({
      name: 'ingestion-queue',
    }),
    BullModule.registerQueue({
      name: 'price-scraping-queue',
    }),
    ScanModule,
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionProcessor,
    PriceScrapingProcessor,
    ProductClusteringService,
    RobotsTxtService,
  ],
  exports: [IngestionService],
})
export class IngestionModule implements OnModuleInit {
  constructor(
    @InjectQueue('price-scraping-queue') private readonly priceScrapingQueue: Queue,
  ) {}

  async onModuleInit() {
    // Schedule Daily Price Scraping Cron Jobs
    // Panda: Daily 2:00 AM KSA (23:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler('panda-daily', { pattern: '0 23 * * *' }, {
      name: 'sync-prices',
      data: { retailer: PriceScrapingRetailer.PANDA },
    });

    // Carrefour: Daily 2:30 AM KSA (23:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler('carrefour-daily', { pattern: '30 23 * * *' }, {
      name: 'sync-prices',
      data: { retailer: PriceScrapingRetailer.CARREFOUR },
    });

    // Othaim: Daily 3:00 AM KSA (00:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler('othaim-daily', { pattern: '0 0 * * *' }, {
      name: 'sync-prices',
      data: { retailer: PriceScrapingRetailer.OTHAIM },
    });

    // Tamimi: Daily 3:30 AM KSA (00:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler('tamimi-daily', { pattern: '30 0 * * *' }, {
      name: 'sync-prices',
      data: { retailer: PriceScrapingRetailer.TAMIMI },
    });
  }
}
