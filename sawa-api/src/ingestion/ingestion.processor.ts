import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import axios from 'axios';

import { IngestionJobDto, IngestionPlatform, ScrapedProductData } from './dto/ingestion-job.dto';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { NinjaScraper } from './scraper/ninja-scraper';
import { HungerStationScraper } from './scraper/hungerstation-scraper';
import { ProductClusteringService } from './product-clustering.service';

import { SfdaMatcherService } from '../scan/sfda-matcher.service';
import { LabelCoreService } from '../scan/label-core.service';
import { StructuredLabelDto } from '../scan/dto/structured-label.dto';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';

@Processor('ingestion-queue')
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(
    private readonly robotsTxtService: RobotsTxtService,
    private readonly productClusteringService: ProductClusteringService,
    private readonly labelCoreService: LabelCoreService,
    private readonly sfdaMatcherService: SfdaMatcherService,
    private readonly dataSource: DataSource,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
  ) {
    super();
  }

  async process(job: Job<IngestionJobDto>): Promise<any> {
    if (job.name === 'scrape-category') {
      return this.handleScrapeJob(job);
    }
  }

  private async handleScrapeJob(job: Job<IngestionJobDto>) {
    const { platform, categoryUrl, pageRange } = job.data;
    this.logger.log(`Starting ingestion job for ${platform} - ${categoryUrl}`);

    const scraper = this.getScraper(platform);
    await scraper.launch();

    try {
      const totalPages = pageRange.end - pageRange.start + 1;
      let processedCount = 0;

      for (let pageNum = pageRange.start; pageNum <= pageRange.end; pageNum++) {
        this.logger.log(`Scraping page ${pageNum} of ${platform}`);
        const listingProducts = await scraper.scrapeListingPage(categoryUrl, pageNum);

        for (const listingItem of listingProducts) {
          try {
            this.logger.debug(`Processing product: ${listingItem.name}`);
            const detailData = await scraper.scrapeDetailPage(listingItem.productPageUrl);
            const combinedData = { ...listingItem, ...detailData };

            await this.processProductData(platform, combinedData);
            
            processedCount++;
            const progress = Math.floor((processedCount / (listingProducts.length * totalPages)) * 100);
            await job.updateProgress(progress);
          } catch (error) {
            this.logger.error(`Failed to process product ${listingItem.name}: ${error.message}`);
          }
        }
      }

      this.logger.log(`Ingestion job completed. Processed ${processedCount} products.`);
      return { processedCount };
    } finally {
      await scraper.close();
    }
  }

  private getScraper(platform: IngestionPlatform) {
    const config = { headless: true, cookieSessionPath: `./scraper-sessions/${platform}` };
    switch (platform) {
      case IngestionPlatform.NINJA:
        return new NinjaScraper(this.robotsTxtService, config);
      case IngestionPlatform.HUNGERSTATION:
        return new HungerStationScraper(this.robotsTxtService, config);
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async processProductData(platform: IngestionPlatform, data: ScrapedProductData) {
    // 1. Image Processing & AI Extraction
    let structuredLabel: StructuredLabelDto | null = null;
    for (const imageUrl of data.imageUrls) {
      try {
        const base64 = await this.downloadImageAsBase64(imageUrl);
        structuredLabel = await this.labelCoreService.processImage(base64);
        break; // Success! Both nutrition and ingredients are valid and present
      } catch (err) {
        this.logger.warn(`OCR pipeline failed for image ${imageUrl}: ${err.message}`);
        // Fall through to next image
      }
    }

    // 2. Find or Create Product
    const product = await this.productClusteringService.findOrCreateProduct(
      data.gtin || null,
      data.brand || (structuredLabel?.brand as string) || '',
      data.name || (structuredLabel?.name_en as string) || '',
      data.weight || ''
    );

    // 3. Database Updates in Transaction
    await this.dataSource.transaction(async (manager) => {
      // Update Product with AI data if available
      if (structuredLabel) {
        product.name_ar = product.name_ar || structuredLabel.name_ar;
        product.name_en = product.name_en || structuredLabel.name_en;
        
        if (structuredLabel.nutrition) {
          // Flatten/map structure to entity fields if they differ
          let nf = await manager.findOne(NutritionFact, { where: { product: { id: product.id } } });
          if (!nf) {
            nf = manager.create(NutritionFact, { ...structuredLabel.nutrition, product });
          } else {
            Object.assign(nf, structuredLabel.nutrition);
          }
          await manager.save(nf);
        }

        if (structuredLabel.ingredients && structuredLabel.ingredients.length > 0) {
          // Use SfdaMatcherService to check ingredients
          const enrichedIngredients = await this.sfdaMatcherService.matchIngredients(structuredLabel.ingredients);
          
          await manager.delete(Ingredient, { product: { id: product.id } });
          for (const ing of enrichedIngredients) {
             const ingredient = manager.create(Ingredient, {
               name_ar: ing.name_ar,
               name_en: ing.name_en,
               e_number: ing.e_number,
               sfda_status: ing.sfda_status,
               restriction_note: ing.restriction_note,
               product
             });
             await manager.save(ingredient);
          }
        }
      }
      await manager.save(product);

      // Find Merchant
      const merchantName = this.capitalize(platform);
      const merchant = await this.merchantRepo.findOne({ where: { name_en: merchantName } });
      if (!merchant) {
        throw new Error(`Merchant ${merchantName} not found in database. Run migrations.`);
      }

      // Insert Product Price
      const priceRecord = manager.create(ProductPrice, {
        product_id: product.id,
        merchant_id: merchant.id,
        price_sar_incl_vat: data.price,
        currency: 'SAR',
        source_url: data.productPageUrl,
        in_stock: true,
        scraped_at: new Date()
      });
      await manager.save(priceRecord);

      // Upsert Images
      for (const url of data.imageUrls) {
        const existingImg = await manager.findOne(ProductImage, { 
          where: { product_id: product.id, url: url } 
        });
        if (!existingImg) {
          const img = manager.create(ProductImage, {
            product_id: product.id,
            url: url,
            source: platform
          });
          await manager.save(img);
        }
      }
    });
  }

  private async downloadImageAsBase64(url: string): Promise<string> {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary').toString('base64');
  }

  private capitalize(s: string) {
    if (s === 'hungerstation') return 'HungerStation';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
