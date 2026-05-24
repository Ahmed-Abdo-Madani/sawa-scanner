import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import axios from 'axios';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { ParkCenterGtinArScraper } from './scraper/parkcenter-gtin-ar-scraper';
import { ParkCenterCatalogJobDto } from './dto/parkcenter-catalog-job.dto';
import { normalizeBrandStrict, normalizeProductName } from '../utils/normalization';
import { getRandomUA } from './scraper/evasion';

export interface ParkCenterCatalogStats {
  totalPagesScraped: number;
  totalProcessed: number;
  totalAdded: number;
  totalPricesAdded: number;
  totalOtherStoresEnqueued: number;
  durationMs: number;
  dryRun: boolean;
}

@Injectable()
export class ParkCenterCatalogScraperService {
  private readonly logger = new Logger(ParkCenterCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly dataSource: DataSource,
    private readonly parkCenterScraper: ParkCenterGtinArScraper,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  /**
   * Helper to retrieve Zid storefront credentials (authorization token & store ID).
   * Attempts fast-path Axios first, falls back to Playwright if Axios fails or is empty.
   */
  private async fetchAuthTokens(): Promise<{ apiAuth: string; storeId: number } | null> {
    const url = 'https://parkcentersa.com/products?page=1';
    const ua = getRandomUA('desktop');

    // 1. Fast Path: Axios
    try {
      this.logger.log('[Fast Path Axios] Fetching initial page for Zid credentials...');
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Connection': 'keep-alive',
        },
        timeout: 10000,
      });

      if (response.status === 200 && typeof response.data === 'string') {
        const stateMatch = response.data.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
        if (stateMatch) {
          const base64Str = stateMatch[1];
          const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
          const state = JSON.parse(decoded);
          const apiAuth = state.apiAuthorization;
          const storeId = state.storeId;

          if (apiAuth && storeId) {
            this.logger.log(`[Fast Path Axios] Credentials extracted: storeId=${storeId}`);
            return { apiAuth, storeId };
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`[Fast Path Axios] Failed to fetch initial page: ${err.message}`);
    }

    // 2. Fallback Path: Playwright-stealth
    this.logger.log('[Fallback Path] Initializing Playwright browser fallback...');
    try {
      await this.parkCenterScraper.ensureLaunched();
      const page = await (this.parkCenterScraper as any).acquirePage();

      try {
        await (this.parkCenterScraper as any).navigateWithEvasion(
          page,
          url,
          'domcontentloaded',
          60000,
          400,
          1200,
        );

        const stateBase64 = await page.evaluate(() => (window as any).__INITIAL_STATE__);
        if (stateBase64) {
          const decoded = Buffer.from(stateBase64, 'base64').toString('utf-8');
          const state = JSON.parse(decoded);
          const apiAuth = state.apiAuthorization;
          const storeId = state.storeId;

          if (apiAuth && storeId) {
            this.logger.log(`[Fallback Path] Credentials extracted successfully via Playwright: storeId=${storeId}`);
            return { apiAuth, storeId };
          }
        }
      } finally {
        await (this.parkCenterScraper as any).releasePage(page);
      }
    } catch (pwErr: any) {
      this.logger.error(`[Fallback Path] Playwright extraction failed: ${pwErr.message}`);
    }

    return null;
  }

  /**
   * Run the catalog scrape for Park Center.
   */
  async run(opts: ParkCenterCatalogJobDto): Promise<ParkCenterCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;
    const startPage = opts.startPage ?? 1;
    const delayMs = opts.delayMs ?? 1000;
    const triggerSearch = opts.triggerOtherStoresSearch ?? true;

    this.logger.log(
      `[Park Center Catalog] Starting scrape: startPage=${startPage}, dryRun=${dryRun}, delayMs=${delayMs}, triggerSearch=${triggerSearch}`,
    );

    // Resolve Zid storefront API credentials
    const tokens = await this.fetchAuthTokens();
    if (!tokens) {
      throw new Error('Failed to resolve Zid storefront API credentials for Park Center');
    }

    const { apiAuth, storeId } = tokens;

    // Resolve or create Park Center Merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'Park Center' },
    });
    if (!merchant) {
      this.logger.log('[Park Center Catalog] Park Center merchant not found, creating it...');
      merchant = this.merchantRepo.create({
        name_en: 'Park Center',
        name_ar: 'بارك سنتر',
        base_url: 'https://parkcentersa.com',
        data_source_type: 'scraped_live',
      });
      merchant = await this.merchantRepo.save(merchant);
    }

    let page = startPage;
    let endPage = opts.endPage ?? 10000; // Large dynamic upper bound
    let totalProcessed = 0;
    let totalAdded = 0;
    let totalPricesAdded = 0;
    let totalOtherStoresEnqueued = 0;

    const apiHeaders = {
      'User-Agent': getRandomUA('desktop'),
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://parkcentersa.com/',
      'Authorization': `Bearer ${apiAuth}`,
      'X-Authorization': apiAuth,
      'Store-Id': String(storeId),
      'X-Store-ID': String(storeId),
    };

    while (page <= endPage) {
      this.logger.log(`[Park Center Catalog] Scraping page ${page} of ${endPage}...`);
      let response;
      try {
        const apiUrl = `https://parkcentersa.com/api/v1/products?page=${page}`;
        response = await axios.get(apiUrl, {
          headers: apiHeaders,
          timeout: 15000,
        });
      } catch (err: any) {
        this.logger.error(`[Park Center Catalog] Failed to fetch page ${page}: ${err.message}`);
        // Terminate loop on repeated request failure
        break;
      }

      if (response.status !== 200 || !response.data?.data?.products) {
        this.logger.warn(`[Park Center Catalog] Unexpected API response on page ${page}: Status=${response.status}`);
        break;
      }

      const productsObj = response.data.data.products;
      const productsList = productsObj.data || [];
      if (productsList.length === 0) {
        this.logger.log(`[Park Center Catalog] No products found on page ${page}. Reached end of catalog.`);
        break;
      }

      // Dynamically update endPage if not explicitly set
      if (!opts.endPage && productsObj.last_page) {
        endPage = productsObj.last_page;
      }

      this.logger.log(
        `[Park Center Catalog] Page ${page}/${endPage}: Processing ${productsList.length} products...`,
      );

      for (const p of productsList) {
        const rawSku = p.sku || '';
        const cleanGtin = rawSku.replace(/\D/g, '');

        // Enforce pure numeric filtering (8 to 14 digits) to filter out alphanumeric SKUs
        if (!/^\d{8,14}$/.test(cleanGtin)) {
          continue;
        }

        totalProcessed++;

        const price = p.sale_price !== null && p.sale_price !== undefined ? parseFloat(p.sale_price) : parseFloat(p.price);
        if (isNaN(price) || price <= 0) {
          this.logger.warn(`[Park Center Catalog] Skipping product ${p.name} (invalid price: ${p.price} / ${p.sale_price})`);
          continue;
        }

        const nameAr = p.name || '';
        const imageUrl = p.images?.[0]?.image?.large || p.images?.[0]?.image?.full_size || p.images?.[0]?.image?.medium || null;
        const categoryName = p.categories?.[0]?.name || null;
        const subcategoryName = p.categories?.[1]?.name || null;
        const productUrl = p.html_url || `https://parkcentersa.com/products/${p.slug}`;
        const inStock = p.quantity > 0 || p.is_infinite;

        if (dryRun) {
          this.logger.log(`[DRY RUN] Would upsert GTIN ${cleanGtin}: name="${nameAr}", price=${price}, category=${categoryName}, image=${imageUrl}`);
          continue;
        }

        try {
          await this.dataSource.transaction(async (manager) => {
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
                data_source: 'parkcenter',
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
                  source: 'parkcenter',
                  image_type: 'catalog',
                });
                await manager.save(pImage);
              }
            }
          });

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
        } catch (dbErr: any) {
          this.logger.error(`[Park Center Catalog] Failed to save product/price for GTIN ${cleanGtin}: ${dbErr.message}`);
        }
      }

      page++;
      // Safe throttling delay between page hits
      if (delayMs > 0 && page <= endPage) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    const durationMs = Date.now() - startTime;
    const stats: ParkCenterCatalogStats = {
      totalPagesScraped: page - startPage,
      totalProcessed,
      totalAdded,
      totalPricesAdded,
      totalOtherStoresEnqueued,
      durationMs,
      dryRun,
    };

    this.logger.log(`[Park Center Catalog] Finished. Stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}
