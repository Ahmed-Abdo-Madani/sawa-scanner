import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Page } from 'playwright';
import * as fs from 'fs';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { YasminGtinArScraper } from './scraper/yasmin-gtin-ar-scraper';
import { YasminCatalogJobDto } from './dto/yasmin-catalog-job.dto';
import { normalizeBrandStrict, normalizeProductName } from '../utils/normalization';

export interface YasminCatalogStats {
  totalCategoriesProcessed: number;
  totalProcessed: number;
  totalAdded: number;
  totalPricesAdded: number;
  totalOtherStoresEnqueued: number;
  durationMs: number;
  dryRun: boolean;
}

@Injectable()
export class YasminCatalogScraperService {
  private readonly logger = new Logger(YasminCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly dataSource: DataSource,
    private readonly yasminScraper: YasminGtinArScraper,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  /**
   * Run the catalog scrape for Yasmin Store.
   */
  async run(opts: YasminCatalogJobDto): Promise<YasminCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;
    const delayMs = opts.delayMs ?? 1000;
    const triggerSearch = opts.triggerOtherStoresSearch ?? false;
    const fresh = opts.fresh ?? false;

    const progressFilePath = './yasmin-scrape-progress.json';
    if (fresh && fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Yasmin Catalog] Deleted progress tracking file for a fresh run.');
      } catch (err: any) {
        this.logger.warn(`[Yasmin Catalog] Failed to delete progress file: ${err.message}`);
      }
    }

    let completedCategoryIds: string[] = [];
    let progressStats = {
      totalProcessed: 0,
      totalAdded: 0,
      totalPricesAdded: 0,
    };

    if (fs.existsSync(progressFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(progressFilePath, 'utf8'));
        completedCategoryIds = data.completedCategoryIds ?? [];
        progressStats.totalProcessed = data.totalProcessed ?? 0;
        progressStats.totalAdded = data.totalAdded ?? 0;
        progressStats.totalPricesAdded = data.totalPricesAdded ?? 0;
        this.logger.log(
          `[Yasmin Catalog] Loaded progress: ${completedCategoryIds.length} categories already processed. Resuming...`,
        );
      } catch (err: any) {
        this.logger.warn(`[Yasmin Catalog] Failed to read progress file: ${err.message}. Starting fresh.`);
      }
    }

    this.logger.log(
      `[Yasmin Catalog] Starting catalog scrape: dryRun=${dryRun}, delayMs=${delayMs}, triggerSearch=${triggerSearch}, fresh=${fresh}`,
    );

    // 1. Resolve or create Yasmin Store Merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'Yasmin Store' },
    });
    if (!merchant) {
      this.logger.log('[Yasmin Catalog] Yasmin Store merchant not found, creating it...');
      merchant = this.merchantRepo.create({
        name_en: 'Yasmin Store',
        name_ar: 'متجر ياسمين',
        base_url: 'https://yasminstore.com',
        data_source_type: 'scraped_live',
      });
      merchant = await this.merchantRepo.save(merchant);
    }

    // 2. Ensure scraper browser is launched
    await this.yasminScraper.ensureLaunched();
    if (!(this.yasminScraper as any).context) {
      throw new Error('Playwright browser context not initialized in Yasmin scraper');
    }

    const homePage = await (this.yasminScraper as any).acquirePage();
    let categories: { name: string; url: string; id: string }[] = [];

    try {
      this.logger.log('[Yasmin Catalog] Discovering categories from home page...');
      await (this.yasminScraper as any).navigateWithEvasion(
        homePage,
        'https://yasminstore.com/ar',
        'domcontentloaded',
        60000,
        400,
        1200,
      );
      await homePage.waitForTimeout(3000);

      categories = await homePage.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a'));
        const results: { name: string; url: string; id: string }[] = [];
        const seenIds = new Set<string>();

        for (const a of anchors) {
          const href = a.href || '';
          const match = href.match(/\/c(\d+)$/);
          if (match) {
            const id = match[1];
            if (!seenIds.has(id)) {
              seenIds.add(id);
              const name = a.textContent?.trim() || '';
              let cleanUrl = href;
              if (!cleanUrl.startsWith('http')) {
                cleanUrl = `${window.location.origin}${cleanUrl}`;
              }
              results.push({ name, url: cleanUrl, id });
            }
          }
        }
        return results;
      });

      this.logger.log(`[Yasmin Catalog] Found ${categories.length} categories on home page.`);
      if (opts.limitCategories && opts.limitCategories > 0) {
        categories = categories.slice(0, opts.limitCategories);
        this.logger.log(`[Yasmin Catalog] Limited category run to: ${categories.map(c => c.name).join(', ')}`);
      }

      // Filter out already processed categories
      if (completedCategoryIds.length > 0) {
        const initialCount = categories.length;
        categories = categories.filter(c => !completedCategoryIds.includes(c.id));
        this.logger.log(
          `[Yasmin Catalog] Resuming scrape: skipped ${initialCount - categories.length} completed categories, ${categories.length} remaining.`,
        );
      }
    } catch (discoveryErr: any) {
      this.logger.error(`[Yasmin Catalog] Category discovery failed: ${discoveryErr.message}`);
      throw discoveryErr;
    } finally {
      await (this.yasminScraper as any).releasePage(homePage);
    }

    if (categories.length === 0) {
      throw new Error('No categories discovered on Yasmin Store. Aborting run.');
    }

    let totalCategoriesProcessed = completedCategoryIds.length;
    let totalProcessed = progressStats.totalProcessed;
    let totalAdded = progressStats.totalAdded;
    let totalPricesAdded = progressStats.totalPricesAdded;
    let totalOtherStoresEnqueued = 0;

    // 3. Sequential category crawling using page pool
    for (const cat of categories) {
      this.logger.log(`[Yasmin Catalog] Crawling category: ${cat.name} (ID: ${cat.id})`);
      totalCategoriesProcessed++;

      const page = await (this.yasminScraper as any).acquirePage();
      const catUrl = `https://yasminstore.com/ar/-/c${cat.id}`;

      try {
        await (this.yasminScraper as any).navigateWithEvasion(
          page,
          catUrl,
          'domcontentloaded',
          60000,
          400,
          1200,
        );
        await page.waitForTimeout(3000);

        // Infinite Scroll Loop
        let lastCount = 0;
        let scrollAttempts = 0;
        const maxScrolls = 40; // Max ~600 items per category

        while (scrollAttempts < maxScrolls) {
          await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
          await page.waitForTimeout(2000); // Dynamic page loading delay

          const currentCount = await page.evaluate(() => {
            return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
          });

          if (currentCount === lastCount) {
            // Scroll up slightly and scroll down again just in case it was a transient timing delay
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight - 500)');
            await page.waitForTimeout(500);
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForTimeout(1500);

            const doubleCheckCount = await page.evaluate(() => {
              return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
            });

            if (doubleCheckCount === lastCount) {
              break; // Stabilized count
            }
          }

          lastCount = currentCount;
          scrollAttempts++;
        }

        this.logger.log(`[Yasmin Catalog] Category ${cat.name}: Finished scrolling. Total cards: ${lastCount}`);

        // Extract DOM elements
        const domProducts = await page.evaluate(() => {
          const cards = document.querySelectorAll('custom-salla-product-card, salla-product-card');
          return Array.from(cards).map((c: any) => {
            const link = c.querySelector('a')?.href || c.href || '';
            const titleEl = c.querySelector('h1, h2, h3, h4, h5, .title, .name');
            const name = titleEl?.textContent?.trim() || '';

            // Extract price
            const priceEl = c.querySelector('.s-product-card-price, .main-price, [class*="price"]');
            const priceText = priceEl?.textContent?.trim() || '';

            // Extract image
            const imgEl = c.querySelector('img');
            const image = imgEl?.src || imgEl?.getAttribute('data-src') || imgEl?.getAttribute('lazy-src') || null;

            // Check if out of stock
            const outOfStock = c.textContent?.includes('نفدت الكمية') || c.textContent?.includes('Out of stock') || false;

            return {
              name,
              url: link,
              priceText,
              image,
              inStock: !outOfStock,
            };
          });
        });

        // Process products
        for (const p of domProducts) {
          if (!p.url) continue;

          // Parse GTIN and English name from URL slug
          const lastSegment = p.url.split('/').pop() || '';
          let cleanGtin = '';
          let cleanNameEn = '';

          const gtinMatch = lastSegment.match(/^(\d{8,14})/);
          if (gtinMatch) {
            cleanGtin = gtinMatch[1];
            // Format English name from slug suffix
            const namePart = lastSegment.substring(cleanGtin.length).replace(/^[-_]+/, '');
            if (namePart) {
              cleanNameEn = namePart
                .split(/[-_]+/)
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
            }
          }

          // Fallback details scraping if barcode not found in slug prefix
          if (!/^\d{8,14}$/.test(cleanGtin)) {
            this.logger.debug(
              `[Yasmin Catalog] Barcode not prefixed in URL slug for "${p.name}". Falling back to detail page...`,
            );
            try {
              // Note: scrapeProductDetails internally opens a new Playwright page context
              const details = await this.yasminScraper.scrapeProductDetails(p.url);
              if (details && details.gtin) {
                cleanGtin = details.gtin;
              }
            } catch (err: any) {
              this.logger.warn(`[Yasmin Catalog] Fallback details scrape failed for ${p.url}: ${err.message}`);
            }
          }

          // Enforce pure numeric EAN check
          if (!/^\d{8,14}$/.test(cleanGtin)) {
            this.logger.warn(`[Yasmin Catalog] Skipping product "${p.name}" (no valid barcode resolved: ${cleanGtin})`);
            continue;
          }

          // Parse Price
          const numericPrice = parseFloat(p.priceText.replace(/[^\d.]/g, ''));
          if (isNaN(numericPrice) || numericPrice <= 0) {
            this.logger.warn(`[Yasmin Catalog] Skipping product "${p.name}" (invalid price: "${p.priceText}")`);
            continue;
          }

          totalProcessed++;

          const nameAr = p.name || '';
          const nameEn = cleanNameEn || nameAr;
          const imageUrl = p.image || null;
          const inStock = p.inStock;

          if (dryRun) {
            this.logger.log(
              `[DRY RUN] Would upsert GTIN ${cleanGtin}: nameAr="${nameAr}", nameEn="${nameEn}", price=${numericPrice}, category="${cat.name}", image="${imageUrl}", inStock=${inStock}`,
            );
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
                  name_en: nameEn,
                  image_front_url: imageUrl || undefined,
                  category: cat.name || undefined,
                  data_source: 'yasmin',
                  brand_normalized: normalizeBrandStrict(''), // Yasmin categories don't expose explicit brand names
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

              productPrice.price_sar_incl_vat = numericPrice;
              productPrice.in_stock = inStock;
              productPrice.source_url = p.url;
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
                    source: 'yasmin',
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
            this.logger.error(
              `[Yasmin Catalog] Failed to save product/price for GTIN ${cleanGtin}: ${dbErr.message}`,
            );
          }
        }

        // Category completed successfully, save progress
        if (!dryRun) {
          completedCategoryIds.push(cat.id);
          try {
            fs.writeFileSync(
              progressFilePath,
              JSON.stringify(
                {
                  completedCategoryIds,
                  totalProcessed,
                  totalAdded,
                  totalPricesAdded,
                },
                null,
                2,
              ),
              'utf8',
            );
            this.logger.log(`[Yasmin Catalog] Saved progress for category "${cat.name}" to progress file.`);
          } catch (err: any) {
            this.logger.error(`[Yasmin Catalog] Failed to write progress file: ${err.message}`);
          }
        }
      } catch (catErr: any) {
        this.logger.error(`[Yasmin Catalog] Failed to process category ${cat.name}: ${catErr.message}`);
      } finally {
        await (this.yasminScraper as any).releasePage(page);
      }

      // Safe delay between category crawls
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    // Clear progress file on successful complete scrape
    if (fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Yasmin Catalog] Scrape finished completely. Cleared progress tracking file.');
      } catch (err: any) {
        this.logger.warn(`[Yasmin Catalog] Failed to clear progress file: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const stats: YasminCatalogStats = {
      totalCategoriesProcessed,
      totalProcessed,
      totalAdded,
      totalPricesAdded,
      totalOtherStoresEnqueued,
      durationMs,
      dryRun,
    };

    this.logger.log(`[Yasmin Catalog] Scraping completed. Stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}
