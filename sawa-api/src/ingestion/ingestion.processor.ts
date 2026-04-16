import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import axios from 'axios';

import { IngestionJobDto, IngestionPlatform, ScrapedProductData } from './dto/ingestion-job.dto';
import { INGESTION_JOB_OPTIONS } from './ingestion.service';
import { BaseScraper } from './scraper/base-scraper';

type ScrapedProductDetail = ScrapedProductData & { page?: any };
import { RobotsTxtService } from './scraper/robots-txt.service';
import { NinjaScraper } from './scraper/ninja-scraper';
import { HungerStationScraper } from './scraper/hungerstation-scraper';
import { PandaPriceScraper } from './scraper/panda-price-scraper';
import { CarrefourPriceScraper } from './scraper/carrefour-price-scraper';
import { OthaimPriceScraper } from './scraper/othaim-price-scraper';
import { TamimiPriceScraper } from './scraper/tamimi-price-scraper';
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
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
    private readonly robotsTxtService: RobotsTxtService,
    private readonly productClusteringService: ProductClusteringService,
    private readonly labelCoreService: LabelCoreService,
    private readonly sfdaMatcherService: SfdaMatcherService,
    private readonly dataSource: DataSource,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
  ) {
    super();
    this.logger.log('IngestionProcessor initialized and ready to pick up jobs.');
  }

  async process(job: Job<IngestionJobDto>): Promise<any> {
    this.logger.log(`Worker received job: ${job.id} (name: ${job.name})`);
    if (job.name === 'scrape-category') {
      return this.handleScrapeJob(job);
    }
    this.logger.warn(`Unknown job name: ${job.name}`);
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

        // Ninja: Exhaustive recursion logic
        if (platform === IngestionPlatform.NINJA && pageNum === 1) {
          const depth = job.data.depth || 0;
          const maxDepth = 4; // Default safe limit for Ninja structure

          if (depth < maxDepth) {
            this.logger.log(`[Depth ${depth}] Checking for subcategories at ${categoryUrl}`);
            const subcategories = await (scraper as NinjaScraper).getSubcategories(categoryUrl);
            
            if (subcategories.length > 0) {
              const visitedUrls = job.data.visitedUrls || [categoryUrl];
              const newCategories = subcategories.filter(sub => !visitedUrls.includes(sub.url));

              this.logger.log(`Discovered ${subcategories.length} subcategories, ${newCategories.length} new. Enqueueing recursion.`);
              for (const sub of newCategories) {
                const base64Url = Buffer.from(sub.url).toString('base64');
                const dedupeId = `recursive-${IngestionPlatform.NINJA}-${base64Url}-1-20`; // Increased to 20 pages

                await this.ingestionQueue.add('scrape-category', {
                  platform: IngestionPlatform.NINJA,
                  categoryUrl: sub.url,
                  pageRange: { start: 1, end: 20 },
                  visitedUrls: [...visitedUrls, sub.url],
                  depth: depth + 1
                }, { ...INGESTION_JOB_OPTIONS, jobId: dedupeId });
              }
              
              // If we found NO products and NO new subcategories on the first page, we stop this branch.
              if (listingProducts.length === 0 && newCategories.length === 0) {
                return { processedCount: 0, status: 'exhausted' };
              }
            }
          } else {
            this.logger.warn(`Max depth (${maxDepth}) reached at ${categoryUrl}. Skipping further discovery.`);
          }
        }

        for (const listingItem of listingProducts) {
          let detailPage: any = null;
          try {
            this.logger.debug(`Processing product: ${listingItem.name}`);
            let detailData: any = {};
            try {
               detailData = await scraper.scrapeDetailPage(listingItem.productPageUrl);
               detailPage = detailData.page;
            } catch (err) {
               this.logger.warn(`Detail capture failed for ${listingItem.name} at ${listingItem.productPageUrl}. Saving listing data only. Error: ${err.message}`);
            }
            
            const combinedData = { ...listingItem, ...detailData };

            // 4. Pass the active page and scraper context to allow browser-based image downloads
            await this.processProductData(platform, scraper, combinedData, detailPage || null);
            
            processedCount++;
            const progress = Math.floor((processedCount / (listingProducts.length * totalPages)) * 100);
            await job.updateProgress(progress);
          } catch (error) {
            this.logger.error(`Failed to process product ${listingItem.name}: ${error.message}`);
          } finally {
            if (detailPage) {
              await detailPage.close().catch(err => this.logger.warn(`Failed to close page: ${err.message}`));
            }
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
    const baseConfig = { headless: true, cookieSessionPath: `./scraper-sessions/${platform}` };
    switch (platform) {
      case IngestionPlatform.NINJA:
        return new NinjaScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'mobile' });
      case IngestionPlatform.HUNGERSTATION:
        return new HungerStationScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'mobile' });
      case IngestionPlatform.PANDA:
        return new PandaPriceScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'desktop' });
      case IngestionPlatform.CARREFOUR:
        return new CarrefourPriceScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'desktop' });
      case IngestionPlatform.OTHAIM:
        return new OthaimPriceScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'mobile' });
      case IngestionPlatform.TAMIMI:
        return new TamimiPriceScraper(this.robotsTxtService, { ...baseConfig, deviceProfile: 'desktop' });
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async processProductData(platform: IngestionPlatform, scraper: BaseScraper, data: ScrapedProductData, page: any = null) {
    // 1. Image Processing & AI Extraction (Best Effort)
    let structuredLabel: StructuredLabelDto | null = null;
    
    // We only attempt OCR if we have both a valid image and an active browser page context
    if (page && data.imageUrls.length > 0) {
      for (const imageUrl of data.imageUrls) {
        try {
          const base64 = await (scraper as any).downloadImageAsBase64(page, imageUrl);
          structuredLabel = await this.labelCoreService.processImage(base64);
          this.logger.debug(`Successfully extracted AI structured data for product: ${data.name}`);
          break; 
        } catch (err) {
          // We log the warning but don't abort, as catalog images often aren't labels
          this.logger.warn(`AI extraction skipped for ${data.name} (image ${imageUrl}): ${err.message}`);
        }
      }
    } else {
      this.logger.debug(`Skipping AI extraction for ${data.name} - no page context or images.`);
    }

    // 2. Find or Create Product (Robust Fallback Identity)
    // If no GTIN provided by catalog, we derive a unique one from the URL hash 
    // to ensure we can match/update this product in future crawls without duplicates.
    const fallbackGtin = data.productPageUrl ? `URL-${Buffer.from(data.productPageUrl).toString('base64').slice(-16)}` : null;
    
    const product = await this.productClusteringService.findOrCreateProduct(
      data.gtin || fallbackGtin,
      data.brand || (structuredLabel?.brand as string) || 'Generic',
      data.name || (structuredLabel?.name_en as string) || 'Unnamed Product',
      data.weight || '',
      data.name_ar
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

      // Check for price deduplication (if identical price exists for this merchant/product, just update scraped_at)
      const existingPrice = await manager.findOne(ProductPrice, {
        where: { product_id: product.id, merchant_id: merchant.id },
        order: { scraped_at: 'DESC' }
      });

      if (existingPrice && existingPrice.price_sar_incl_vat === data.price) {
        // Price hasn't changed. Just bump the timestamp
        existingPrice.scraped_at = new Date();
        existingPrice.in_stock = data.inStock ?? existingPrice.in_stock;
        await manager.save(existingPrice);
      } else {
        // Insert new Product Price
        const priceRecord = manager.create(ProductPrice, {
          product_id: product.id,
          merchant_id: merchant.id,
          price_sar_incl_vat: data.price,
          currency: 'SAR',
          source_url: data.productPageUrl,
          in_stock: data.inStock ?? true,
          scraped_at: new Date()
        });
        await manager.save(priceRecord);
      }

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
    if (s === 'carrefour') return 'Carrefour';
    if (s === 'panda') return 'Panda';
    if (s === 'othaim') return 'Othaim';
    if (s === 'tamimi') return 'Tamimi';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
