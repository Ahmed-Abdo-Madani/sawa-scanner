import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import axios from 'axios';
import * as fs from 'fs';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { MubarkiyahCatalogJobDto } from './dto/mubarkiyah-catalog-job.dto';
import { normalizeBrandStrict, normalizeProductName } from '../utils/normalization';
import { getRandomUA } from './scraper/evasion';

export interface MubarkiyahCatalogStats {
  totalClassificationsProcessed: number;
  totalPagesScraped: number;
  totalProcessed: number;
  totalAdded: number;
  totalPricesAdded: number;
  totalOtherStoresEnqueued: number;
  durationMs: number;
  dryRun: boolean;
}

@Injectable()
export class MubarkiyahCatalogScraperService {
  private readonly logger = new Logger(MubarkiyahCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly dataSource: DataSource,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  private async fetchHtml(url: string): Promise<string> {
    const ua = getRandomUA('desktop');
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Referer': 'https://mubarkiyah.com/',
          'Connection': 'keep-alive',
        },
        timeout: 15000,
      });
      if (response.status === 200 && typeof response.data === 'string') {
        return response.data;
      }
    } catch (err: any) {
      this.logger.error(`[Mubarkiyah GET] failed for ${url}: ${err.message}`);
    }
    return '';
  }

  async run(opts: MubarkiyahCatalogJobDto): Promise<MubarkiyahCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;
    const delayMs = opts.delayMs ?? 1000;
    const triggerSearch = opts.triggerOtherStoresSearch ?? false;
    const fresh = opts.fresh ?? false;
    const limitClassifications = opts.limitClassifications ?? 0;

    this.logger.log(
      `[Mubarkiyah Catalog] Starting scrape: dryRun=${dryRun}, delayMs=${delayMs}, triggerSearch=${triggerSearch}, fresh=${fresh}, limitClassifications=${limitClassifications}`,
    );

    const progressFilePath = './mubarkiyah-scrape-progress.json';
    if (fresh && fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Mubarkiyah Catalog] Deleted progress tracking file for a fresh run.');
      } catch (err: any) {
        this.logger.warn(`[Mubarkiyah Catalog] Failed to delete progress file: ${err.message}`);
      }
    }

    let completedClassificationIds: string[] = [];
    let progressStats = {
      totalProcessed: 0,
      totalAdded: 0,
      totalPricesAdded: 0,
    };

    if (fs.existsSync(progressFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
        completedClassificationIds = data.completedClassificationIds ?? [];
        progressStats.totalProcessed = data.totalProcessed ?? 0;
        progressStats.totalAdded = data.totalAdded ?? 0;
        progressStats.totalPricesAdded = data.totalPricesAdded ?? 0;
        this.logger.log(
          `[Mubarkiyah Catalog] Loaded progress: ${completedClassificationIds.length} classifications already processed. Resuming...`,
        );
      } catch (err: any) {
        this.logger.warn(`[Mubarkiyah Catalog] Failed to read progress file: ${err.message}. Starting fresh.`);
      }
    }

    // Resolve or create Mubarkiyah Merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'Mubarkiyah' },
    });
    if (!merchant) {
      this.logger.log('[Mubarkiyah Catalog] Mubarkiyah merchant not found, creating it...');
      merchant = this.merchantRepo.create({
        name_en: 'Mubarkiyah',
        name_ar: 'المباركية',
        base_url: 'https://mubarkiyah.com',
        data_source_type: 'scraped_live',
      });
      merchant = await this.merchantRepo.save(merchant);
    }

    // Discover classifications from homepage
    this.logger.log('[Mubarkiyah Catalog] Fetching classifications from homepage...');
    const homeHtml = await this.fetchHtml('https://mubarkiyah.com/');
    if (!homeHtml) {
      throw new Error('Failed to load Mubarkiyah homepage to extract classifications.');
    }

    const homeMatch = homeHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!homeMatch) {
      throw new Error('Could not find __NEXT_DATA__ on homepage.');
    }

    const homeJson = JSON.parse(homeMatch[1]);
    const classifications = homeJson.props?.pageProps?.classifications || [];
    if (classifications.length === 0) {
      throw new Error('No classifications discovered from homepage.');
    }

    this.logger.log(`[Mubarkiyah Catalog] Found ${classifications.length} classifications.`);

    let classificationsToProcess = classifications;
    if (limitClassifications > 0) {
      classificationsToProcess = classifications.slice(0, limitClassifications);
      this.logger.log(`[Mubarkiyah Catalog] Limiting scrape to first ${limitClassifications} classifications.`);
    }

    let totalProcessed = progressStats.totalProcessed;
    let totalAdded = progressStats.totalAdded;
    let totalPricesAdded = progressStats.totalPricesAdded;
    let totalOtherStoresEnqueued = 0;
    let totalPagesScraped = 0;
    let totalClassificationsProcessed = 0;

    const getPrice = (item: any): number => {
      const op = item.offerPriceWithVat;
      const p = item.priceWithVat;
      if (op !== null && op !== undefined && !isNaN(op) && op > 0) {
        return op;
      }
      return p;
    };

    for (const classification of classificationsToProcess) {
      const classId = String(classification.id);
      const catNameEn = classification.descriptionEn || 'Uncategorized';
      const catNameAr = classification.descriptionAr || 'غير مصنف';

      if (completedClassificationIds.includes(classId)) {
        this.logger.log(`[Mubarkiyah Catalog] Classification ${classId} ("${catNameEn}") already processed. Skipping.`);
        continue;
      }

      this.logger.log(`[Mubarkiyah Catalog] Scraping classification ${classId} ("${catNameEn}")...`);
      let page = 1;
      let totalPages = 1000; // arbitrary upper bound, will narrow down dynamically

      while (page <= totalPages) {
        const url = `https://mubarkiyah.com/search?c=${classId}&page=${page}`;
        this.logger.log(`[Mubarkiyah Catalog] Fetching category page: ${url}`);
        
        let html = '';
        try {
          html = await this.fetchHtml(url);
        } catch (err: any) {
          this.logger.error(`[Mubarkiyah Catalog] Failed to fetch category page ${url}: ${err.message}`);
          // Wait and retry once
          try {
            this.logger.log(`[Mubarkiyah Catalog] Retrying in 5 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            html = await this.fetchHtml(url);
          } catch (retryErr: any) {
            this.logger.error(`[Mubarkiyah Catalog] Retry failed for ${url}. Aborting classification to avoid data gaps.`);
            break;
          }
        }

        if (!html) {
          this.logger.warn(`[Mubarkiyah Catalog] Empty response for ${url}. Skipping.`);
          break;
        }

        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) {
          this.logger.warn(`[Mubarkiyah Catalog] Next.js hydration payload not found on page ${page}. Skipping.`);
          break;
        }

        let pageJson;
        try {
          pageJson = JSON.parse(match[1]);
        } catch (e: any) {
          this.logger.error(`[Mubarkiyah Catalog] Failed to parse hydration JSON: ${e.message}`);
          break;
        }

        const itemsData = pageJson.props?.pageProps?.itemsData || {};
        const productsList = itemsData.list || [];
        totalPages = itemsData.totalPages ?? 1;
        totalPagesScraped++;

        this.logger.log(
          `[Mubarkiyah Catalog] Class ${classId} Page ${page}/${totalPages}: Processing ${productsList.length} items...`,
        );

        if (productsList.length === 0) {
          this.logger.log(`[Mubarkiyah Catalog] No items found. End of classification ${classId}.`);
          break;
        }

        if (dryRun) {
          for (const p of productsList) {
            const rawGtin = p.barcode || '';
            const cleanGtin = rawGtin.replace(/\D/g, '');
            if (!/^\d{8,14}$/.test(cleanGtin)) continue;
            totalProcessed++;
            const price = getPrice(p);
            if (isNaN(price) || price <= 0) continue;
            const nameAr = p.descAr || '';
            const imageUrl = p.attachmentPath ? `https://mubarkiyah.com/Images/item/${p.attachmentPath}` : null;
            this.logger.log(`[DRY RUN] Would upsert Mubarkiyah GTIN ${cleanGtin}: name="${nameAr}", price=${price}, image=${imageUrl}`);
          }
        } else {
          try {
            await this.dataSource.transaction(async (manager) => {
              for (const p of productsList) {
                const rawGtin = p.barcode || '';
                const cleanGtin = rawGtin.replace(/\D/g, '');

                // Enforce pure numeric filtering (8 to 14 digits) to filter out internal barcodes
                if (!/^\d{8,14}$/.test(cleanGtin)) {
                  continue;
                }

                totalProcessed++;

                const price = getPrice(p);
                if (isNaN(price) || price <= 0) {
                  this.logger.warn(`[Mubarkiyah Catalog] Skipping product ${p.descAr} (invalid price: ${p.priceWithVat} / ${p.offerPriceWithVat})`);
                  continue;
                }

                const nameAr = p.descAr || '';
                const nameEn = p.descEn || nameAr;
                const imageUrl = p.attachmentPath ? `https://mubarkiyah.com/Images/item/${p.attachmentPath}` : null;
                const productUrl = p.itemId ? `https://mubarkiyah.com/item/${p.itemId}` : `https://mubarkiyah.com/search?c=${classId}&page=${page}`;
                const inStock = p.finalAvailableQty !== null && p.finalAvailableQty !== undefined ? p.finalAvailableQty > 0 : true;

                // 1. Find or create Product
                let product = await manager.findOne(Product, {
                  where: { gtin: cleanGtin },
                });

                if (!product) {
                  product = manager.create(Product, {
                    gtin: cleanGtin,
                    name_ar: nameAr,
                    name_en: nameEn,
                    image_front_url: imageUrl || undefined,
                    category: catNameEn,
                    data_source: 'mubarkiyah',
                    brand_normalized: normalizeBrandStrict(p.brandNameEn || p.brandNameAr || ''),
                    name_normalized: normalizeProductName(nameAr),
                  });
                  product = await manager.save(product);
                  totalAdded++;
                }

                // 2. Find or create ProductPrice
                let productPrice = await manager.findOne(ProductPrice, {
                  where: { product_id: product.id, merchant_id: merchant!.id },
                });

                if (!productPrice) {
                  productPrice = manager.create(ProductPrice, {
                    product_id: product.id,
                    merchant_id: merchant!.id,
                    currency: 'SAR',
                  });
                }

                productPrice.price_sar_incl_vat = price;
                productPrice.in_stock = inStock;
                productPrice.source_url = productUrl;
                productPrice.scraped_at = new Date();

                await manager.save(productPrice);
                totalPricesAdded++;

                // 3. Add to ProductImage if present
                if (imageUrl) {
                  const existingImage = await manager.findOne(ProductImage, {
                    where: { product_id: product.id, url: imageUrl },
                  });
                  if (!existingImage) {
                    const pImage = manager.create(ProductImage, {
                      product_id: product.id,
                      url: imageUrl,
                      source: 'mubarkiyah',
                      image_type: 'catalog',
                    });
                    await manager.save(pImage);
                  }
                }

                // 4. Trigger background search for other store prices
                if (triggerSearch) {
                  const jobId = `seed-gtin-prices-${cleanGtin}`;
                  await this.ingestionQueue.add(
                    'seed-gtin-prices',
                    { gtin: cleanGtin },
                    {
                      jobId,
                      attempts: 3,
                      backoff: { type: 'exponential', delay: 5000 },
                      removeOnComplete: 100,
                      removeOnFail: 50,
                      timeout: 30 * 60 * 1000,
                    } as any
                  );
                  totalOtherStoresEnqueued++;
                }
              }
            });
          } catch (dbErr: any) {
            this.logger.error(`[Mubarkiyah Catalog] Failed to save products/prices for Class ${classId} Page ${page}: ${dbErr.message}`);
          }
        }

        // Increment page and throttled delay
        page++;
        if (delayMs > 0 && page <= totalPages) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      // Mark classification as completed
      if (!dryRun) {
        completedClassificationIds.push(classId);
        try {
          fs.writeFileSync(
            progressFilePath,
            JSON.stringify(
              {
                completedClassificationIds,
                totalProcessed,
                totalAdded,
                totalPricesAdded,
              },
              null,
              2,
            ),
            'utf8',
          );
          this.logger.log(`[Mubarkiyah Catalog] Saved progress after completing classification ${classId}.`);
        } catch (err: any) {
          this.logger.error(`[Mubarkiyah Catalog] Failed to write progress file: ${err.message}`);
        }
      }

      totalClassificationsProcessed++;
    }

    // Clear progress file on successful complete scrape
    if (fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Mubarkiyah Catalog] Scrape finished completely. Cleared progress tracking file.');
      } catch (err: any) {
        this.logger.warn(`[Mubarkiyah Catalog] Failed to clear progress file: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const stats: MubarkiyahCatalogStats = {
      totalClassificationsProcessed,
      totalPagesScraped,
      totalProcessed,
      totalAdded,
      totalPricesAdded,
      totalOtherStoresEnqueued,
      durationMs,
      dryRun,
    };

    this.logger.log(`[Mubarkiyah Catalog] Finished. Stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}
