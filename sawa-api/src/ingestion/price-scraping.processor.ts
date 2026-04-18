import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';

import {
  PriceScrapingJobDto,
  PriceScrapingRetailer,
} from './dto/price-scraping-job.dto';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { PandaPriceScraper } from './scraper/panda-price-scraper';
import { CarrefourPriceScraper } from './scraper/carrefour-price-scraper';
import { OthaimPriceScraper } from './scraper/othaim-price-scraper';
import { TamimiPriceScraper } from './scraper/tamimi-price-scraper';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { Merchant } from '../entities/merchant.entity';
import { PricesService } from '../prices/prices.service';

@Processor('price-scraping-queue')
export class PriceScrapingProcessor extends WorkerHost {
  private readonly logger = new Logger(PriceScrapingProcessor.name);

  constructor(
    private readonly robotsTxtService: RobotsTxtService,
    private readonly dataSource: DataSource,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly pricesService: PricesService,
  ) {
    super();
  }

  async process(job: Job<PriceScrapingJobDto>): Promise<any> {
    const { retailer } = job.data;
    this.logger.log(`Starting daily price sync for ${retailer}`);

    const scraper = this.getScraper(retailer);
    await scraper.launch();

    try {
      // 1. Find the merchant
      const merchantName = this.getMerchantName(retailer);
      const merchant = await this.merchantRepo.findOne({
        where: { name_en: merchantName },
      });
      if (!merchant) {
        throw new Error(`Merchant ${merchantName} not found in database.`);
      }

      // 2. Query products that have at least one price record for this merchant
      // This identifies which products we should sync for this specific retailer
      const productsToSync = await this.productRepo
        .createQueryBuilder('product')
        .innerJoin('product.prices', 'price')
        .where('price.merchant_id = :merchantId', { merchantId: merchant.id })
        .select('product.id', 'id')
        .addSelect('product.gtin', 'gtin')
        .addSelect('price.source_url', 'source_url')
        .distinct(true)
        .getRawMany();

      this.logger.log(
        `Found ${productsToSync.length} products to sync for ${merchantName}`,
      );

      let updatedCount = 0;
      for (const row of productsToSync) {
        const { id, gtin, source_url } = row;

        if (source_url) {
          try {
            const { price, inStock } = await scraper.scrapeProductPrice(
              source_url,
            );

            // Insert new historical record
            const newPrice = this.priceRepo.create({
              product_id: id,
              merchant_id: merchant.id,
              price_sar_incl_vat: price,
              currency: 'SAR',
              source_url: source_url,
              in_stock: inStock,
              scraped_at: new Date(),
            });

            await this.priceRepo.save(newPrice);
            updatedCount++;
            if (gtin) {
              await this.pricesService.invalidateGtinCache(gtin);
            } else {
              this.logger.warn(
                `Skipping cache invalidation for product ${id}: gtin not selected`,
              );
            }

            await job.updateProgress(
              Math.floor((updatedCount / productsToSync.length) * 100),
            );
          } catch (err) {
            this.logger.error(
              `Failed to sync price for product ${id} at ${merchantName}: ${err.message}`,
            );
          }
        }
      }

      this.logger.log(
        `Sync completed for ${merchantName}. Updated ${updatedCount} products.`,
      );
      return { updatedCount };
    } finally {
      await scraper.close();
    }
  }

  private getScraper(retailer: PriceScrapingRetailer) {
    const sessionPath = path.join(
      process.cwd(),
      '.sessions',
      retailer.toLowerCase(),
    );

    // Ensure session directory exists
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const config = {
      headless: true,
      cookieSessionPath: sessionPath,
    };

    switch (retailer) {
      case PriceScrapingRetailer.PANDA:
        return new PandaPriceScraper(this.robotsTxtService, config);
      case PriceScrapingRetailer.CARREFOUR:
        return new CarrefourPriceScraper(this.robotsTxtService, config);
      case PriceScrapingRetailer.OTHAIM:
        return new OthaimPriceScraper(this.robotsTxtService, config);
      case PriceScrapingRetailer.TAMIMI:
        return new TamimiPriceScraper(this.robotsTxtService, config);
      default:
        throw new Error(`Unsupported retailer: ${retailer}`);
    }
  }

  private getMerchantName(retailer: PriceScrapingRetailer): string {
    const mapping = {
      [PriceScrapingRetailer.PANDA]: 'Panda',
      [PriceScrapingRetailer.CARREFOUR]: 'Carrefour',
      [PriceScrapingRetailer.OTHAIM]: 'Othaim',
      [PriceScrapingRetailer.TAMIMI]: 'Tamimi',
    };
    return mapping[retailer];
  }
}
