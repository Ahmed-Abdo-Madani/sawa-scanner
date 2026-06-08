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
import { DukanExpressCatalogJobDto } from './dto/dukanexpress-catalog-job.dto';
import { normalizeBrandStrict, normalizeProductName } from '../utils/normalization';
import { getRandomUA } from './scraper/evasion';

export interface DukanExpressCatalogStats {
  totalPagesScraped: number;
  totalProcessed: number;
  totalAdded: number;
  totalPricesAdded: number;
  totalOtherStoresEnqueued: number;
  durationMs: number;
  dryRun: boolean;
}

@Injectable()
export class DukanExpressCatalogScraperService {
  private readonly logger = new Logger(DukanExpressCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly dataSource: DataSource,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  /**
   * Run the catalog scrape for Dukan Express.
   */
  async run(opts: DukanExpressCatalogJobDto): Promise<DukanExpressCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;
    const startPage = opts.startPage ?? 1;
    const delayMs = opts.delayMs ?? 1000;
    const triggerSearch = opts.triggerOtherStoresSearch ?? false;
    const fresh = opts.fresh ?? false;

    this.logger.log(
      `[Dukan Express Catalog] Starting scrape: startPage=${startPage}, dryRun=${dryRun}, delayMs=${delayMs}, triggerSearch=${triggerSearch}, fresh=${fresh}`,
    );

    const progressFilePath = './dukanexpress-scrape-progress.json';
    if (fresh && fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Dukan Express Catalog] Deleted progress tracking file for a fresh run.');
      } catch (err: any) {
        this.logger.warn(`[Dukan Express Catalog] Failed to delete progress file: ${err.message}`);
      }
    }

    let completedPages: number[] = [];
    let progressStats = {
      totalProcessed: 0,
      totalAdded: 0,
      totalPricesAdded: 0,
    };

    if (fs.existsSync(progressFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
        completedPages = data.completedPages ?? [];
        progressStats.totalProcessed = data.totalProcessed ?? 0;
        progressStats.totalAdded = data.totalAdded ?? 0;
        progressStats.totalPricesAdded = data.totalPricesAdded ?? 0;
        this.logger.log(
          `[Dukan Express Catalog] Loaded progress: ${completedPages.length} pages already processed. Resuming...`,
        );
      } catch (err: any) {
        this.logger.warn(`[Dukan Express Catalog] Failed to read progress file: ${err.message}. Starting fresh.`);
      }
    }

    // Resolve or create Dukan Express Merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'Dukan Express' },
    });
    if (!merchant) {
      this.logger.log('[Dukan Express Catalog] Dukan Express merchant not found, creating it...');
      merchant = this.merchantRepo.create({
        name_en: 'Dukan Express',
        name_ar: 'الدكان المريح',
        base_url: 'https://dukanexpress.com',
        data_source_type: 'scraped_live',
      });
      merchant = await this.merchantRepo.save(merchant);
    }

    let page = startPage;
    let endPage = opts.endPage ?? 10000; // Large dynamic upper bound, will update from API pages_count
    let totalProcessed = progressStats.totalProcessed;
    let totalAdded = progressStats.totalAdded;
    let totalPricesAdded = progressStats.totalPricesAdded;
    let totalOtherStoresEnqueued = 0;

    const getPrice = (item: any): number => {
      const pVal = item.price;
      const spVal = item.sale_price;
      const p = typeof pVal === 'string' ? parseFloat(pVal) : pVal;
      const sp = typeof spVal === 'string' ? parseFloat(spVal) : spVal;
      if (sp !== null && sp !== undefined && !isNaN(sp) && sp > 0) {
        return sp;
      }
      return p;
    };

    while (page <= endPage) {
      if (completedPages.includes(page)) {
        this.logger.log(`[Dukan Express Catalog] Page ${page} already processed. Skipping.`);
        page++;
        continue;
      }

      this.logger.log(`[Dukan Express Catalog] Scraping page ${page} of ${endPage}...`);
      let response;
      try {
        const apiUrl = `https://dukanexpress.com/api/v1/products?page=${page}`;
        const ua = getRandomUA('desktop');
        response = await axios.get(apiUrl, {
          headers: {
            'User-Agent': ua,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            'Referer': 'https://dukanexpress.com/',
            'Connection': 'keep-alive',
          },
          timeout: 15000,
        });
      } catch (err: any) {
        this.logger.error(`[Dukan Express Catalog] Failed to fetch page ${page}: ${err.message}`);
        // Wait and retry once before skipping/breaking
        try {
          this.logger.log(`[Dukan Express Catalog] Retrying page ${page} after 5 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
          const apiUrl = `https://dukanexpress.com/api/v1/products?page=${page}`;
          const ua = getRandomUA('desktop');
          response = await axios.get(apiUrl, {
            headers: {
              'User-Agent': ua,
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
              'Referer': 'https://dukanexpress.com/',
              'Connection': 'keep-alive',
            },
            timeout: 20000,
          });
        } catch (retryErr: any) {
          this.logger.error(`[Dukan Express Catalog] Retry failed for page ${page}: ${retryErr.message}. Aborting run to avoid gaps.`);
          break;
        }
      }

      if (!response || response.status !== 200 || !response.data?.results) {
        this.logger.warn(`[Dukan Express Catalog] Unexpected API response on page ${page}: Status=${response?.status}`);
        break;
      }

      const productsList = response.data.results || [];
      if (productsList.length === 0) {
        this.logger.log(`[Dukan Express Catalog] No products found on page ${page}. Reached end of catalog.`);
        break;
      }

      // Dynamically update endPage if not explicitly set and pages_count is available
      if (!opts.endPage && response.data.pages_count) {
        endPage = response.data.pages_count;
      }

      this.logger.log(
        `[Dukan Express Catalog] Page ${page}/${endPage}: Processing ${productsList.length} products...`,
      );

      if (dryRun) {
        for (const p of productsList) {
          const rawSku = p.sku || '';
          const cleanGtin = rawSku.replace(/\D/g, '');
          if (!/^\d{8,14}$/.test(cleanGtin)) continue;
          totalProcessed++;
          const price = getPrice(p);
          if (isNaN(price) || price <= 0) continue;
          const nameAr = p.name || '';
          const imageUrl = p.images?.[0]?.image?.large || p.main_image?.image?.large || null;
          const categoryName = p.categories?.[0]?.name || null;
          this.logger.log(`[DRY RUN] Would upsert GTIN ${cleanGtin}: name="${nameAr}", price=${price}, category=${categoryName}, image=${imageUrl}`);
        }
      } else {
        try {
          await this.dataSource.transaction(async (manager) => {
            for (const p of productsList) {
              const rawSku = p.sku || '';
              const cleanGtin = rawSku.replace(/\D/g, '');

              // Enforce pure numeric filtering (8 to 14 digits) to filter out alphanumeric SKUs
              if (!/^\d{8,14}$/.test(cleanGtin)) {
                continue;
              }

              totalProcessed++;

              const price = getPrice(p);
              if (isNaN(price) || price <= 0) {
                this.logger.warn(`[Dukan Express Catalog] Skipping product ${p.name} (invalid price: ${p.price} / ${p.sale_price})`);
                continue;
              }

              const nameAr = p.name || '';
              const imageUrl = p.images?.[0]?.image?.large || p.main_image?.image?.large || null;
              const categoryName = p.categories?.[0]?.name || null;
              const subcategoryName = p.categories?.[1]?.name || null;
              const productUrl = p.html_url || `https://dukanexpress.com/products/${p.slug}`;
              const inStock = p.in_stock ?? (p.quantity > 0 || p.is_infinite);

              // 1. Find or create Product
              let product = await manager.findOne(Product, {
                where: { gtin: cleanGtin },
              });

              if (!product) {
                product = manager.create(Product, {
                  gtin: cleanGtin,
                  name_ar: nameAr,
                  name_en: nameAr,
                  image_front_url: imageUrl || undefined,
                  category: categoryName || undefined,
                  subcategory: subcategoryName || undefined,
                  data_source: 'dukanexpress',
                  brand_normalized: normalizeBrandStrict(p.brand || ''),
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
                    source: 'dukanexpress',
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
          this.logger.error(`[Dukan Express Catalog] Failed to save products/prices for page ${page}: ${dbErr.message}`);
        }
      }

      // Save progress
      if (!dryRun) {
        completedPages.push(page);
        try {
          fs.writeFileSync(
            progressFilePath,
            JSON.stringify(
              {
                completedPages,
                totalProcessed,
                totalAdded,
                totalPricesAdded,
              },
              null,
              2,
            ),
            'utf8',
          );
          this.logger.log(`[Dukan Express Catalog] Saved progress for page ${page} to progress file.`);
        } catch (err: any) {
          this.logger.error(`[Dukan Express Catalog] Failed to write progress file: ${err.message}`);
        }
      }

      page++;
      // Safe throttling delay between page hits
      if (delayMs > 0 && page <= endPage) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Clear progress file on successful complete scrape
    if (page > endPage && fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Dukan Express Catalog] Scrape finished completely. Cleared progress tracking file.');
      } catch (err: any) {
        this.logger.warn(`[Dukan Express Catalog] Failed to clear progress file: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const stats: DukanExpressCatalogStats = {
      totalPagesScraped: page - startPage,
      totalProcessed,
      totalAdded,
      totalPricesAdded,
      totalOtherStoresEnqueued,
      durationMs,
      dryRun,
    };

    this.logger.log(`[Dukan Express Catalog] Finished. Stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}
