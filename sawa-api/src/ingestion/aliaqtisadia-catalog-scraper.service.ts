import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as fs from 'fs';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { AliaqtisadiaGtinArScraper } from './scraper/aliaqtisadia-gtin-ar-scraper';
import { AliaqtisadiaCatalogJobDto } from './dto/aliaqtisadia-catalog-job.dto';
import { normalizeBrandStrict, normalizeProductName } from '../utils/normalization';

export interface AliaqtisadiaCatalogStats {
  totalCategoriesProcessed: number;
  totalProcessed: number;
  totalAdded: number;
  totalPricesAdded: number;
  totalOtherStoresEnqueued: number;
  durationMs: number;
  dryRun: boolean;
}

@Injectable()
export class AliaqtisadiaCatalogScraperService {
  private readonly logger = new Logger(AliaqtisadiaCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly dataSource: DataSource,
    private readonly aliaqtisadiaScraper: AliaqtisadiaGtinArScraper,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  /**
   * Run the catalog scrape for Aliaqtisadia Store.
   */
  async run(opts: AliaqtisadiaCatalogJobDto): Promise<AliaqtisadiaCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;
    const delayMs = opts.delayMs ?? 1000;
    const triggerSearch = opts.triggerOtherStoresSearch ?? false;
    const fresh = opts.fresh ?? false;

    const progressFilePath = './aliaqtisadia-scrape-progress.json';
    if (fresh && fs.existsSync(progressFilePath)) {
      try {
        fs.unlinkSync(progressFilePath);
        this.logger.log('[Aliaqtisadia Catalog] Deleted progress tracking file for a fresh run.');
      } catch (err: any) {
        this.logger.warn(`[Aliaqtisadia Catalog] Failed to delete progress file: ${err.message}`);
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
          `[Aliaqtisadia Catalog] Loaded progress: ${completedCategoryIds.length} categories already processed. Resuming...`,
        );
      } catch (err: any) {
        this.logger.warn(`[Aliaqtisadia Catalog] Failed to read progress file: ${err.message}. Starting fresh.`);
      }
    }

    this.logger.log(
      `[Aliaqtisadia Catalog] Starting catalog scrape: dryRun=${dryRun}, delayMs=${delayMs}, triggerSearch=${triggerSearch}, fresh=${fresh}`,
    );

    // 1. Resolve or create Aliaqtisadia Store Merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'Aliaqtisadia' },
    });
    if (!merchant) {
      this.logger.log('[Aliaqtisadia Catalog] Aliaqtisadia merchant not found, creating it...');
      merchant = this.merchantRepo.create({
        name_en: 'Aliaqtisadia',
        name_ar: 'صالة تبوك الاقتصادية',
        base_url: 'https://aliaqtisadia.sa',
        data_source_type: 'scraped_live',
      });
      merchant = await this.merchantRepo.save(merchant);
    }

    // 2. Ensure scraper browser is launched
    await this.aliaqtisadiaScraper.ensureLaunched();
    if (!(this.aliaqtisadiaScraper as any).context) {
      throw new Error('Playwright browser context not initialized in Aliaqtisadia scraper');
    }

    const homePage = await (this.aliaqtisadiaScraper as any).acquirePage();
    let categories: { name: string; url: string; id: string }[] = [];

    try {
      this.logger.log('[Aliaqtisadia Catalog] Discovering categories from home page...');
      await (this.aliaqtisadiaScraper as any).navigateWithEvasion(
        homePage,
        'https://aliaqtisadia.sa/ar',
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

      this.logger.log(`[Aliaqtisadia Catalog] Found ${categories.length} categories on home page.`);
      if (opts.limitCategories && opts.limitCategories > 0) {
        categories = categories.slice(0, opts.limitCategories);
        this.logger.log(`[Aliaqtisadia Catalog] Limited category run to: ${categories.map(c => c.name).join(', ')}`);
      }

      // Filter out already processed categories
      if (completedCategoryIds.length > 0) {
        const initialCount = categories.length;
        categories = categories.filter(c => !completedCategoryIds.includes(c.id));
        this.logger.log(
          `[Aliaqtisadia Catalog] Resuming scrape: skipped ${initialCount - categories.length} completed categories, ${categories.length} remaining.`,
        );
      }
    } catch (discoveryErr: any) {
      this.logger.error(`[Aliaqtisadia Catalog] Category discovery failed: ${discoveryErr.message}`);
      throw discoveryErr;
    } finally {
      await (this.aliaqtisadiaScraper as any).releasePage(homePage);
    }

    if (categories.length === 0) {
      throw new Error('No categories discovered on Aliaqtisadia Store. Aborting run.');
    }

    let totalCategoriesProcessed = completedCategoryIds.length;
    let totalProcessed = progressStats.totalProcessed;
    let totalAdded = progressStats.totalAdded;
    let totalPricesAdded = progressStats.totalPricesAdded;
    let totalOtherStoresEnqueued = 0;

    // 3. Sequential category crawling using page pool
    for (const cat of categories) {
      this.logger.log(`[Aliaqtisadia Catalog] Crawling category: ${cat.name} (ID: ${cat.id})`);
      totalCategoriesProcessed++;

      const page = await (this.aliaqtisadiaScraper as any).acquirePage();
      const catUrl = `https://aliaqtisadia.sa/ar/-/c${cat.id}`;

      try {
        await (this.aliaqtisadiaScraper as any).navigateWithEvasion(
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
        const maxScrolls = 80; // Max ~1200 items per category

        while (scrollAttempts < maxScrolls) {
          await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
          await page.waitForTimeout(1500); // Dynamic page loading delay

          const currentCount = await page.evaluate(() => {
            return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
          });

          // Check if Load More button is visible and click it
          const buttonSelector = 'button.s-infinite-scroll-btn';
          const isButtonVisible = await page.evaluate((sel) => {
            const btn = document.querySelector(sel) as HTMLButtonElement | null;
            if (!btn) return false;
            const rect = btn.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && btn.style.display !== 'none';
          }, buttonSelector);

          if (isButtonVisible) {
            this.logger.log(`[Aliaqtisadia Catalog] Clicking Load More button. Current cards: ${currentCount}`);
            await page.click(buttonSelector);
            await page.waitForTimeout(2500); // Wait for content load after click
            lastCount = currentCount;
            scrollAttempts++;
            continue;
          }

          if (currentCount === lastCount) {
            // Scroll up slightly and scroll down again just in case it was a transient timing delay
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight - 500)');
            await page.waitForTimeout(500);
            await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForTimeout(1500);

            const doubleCheckCount = await page.evaluate(() => {
              return document.querySelectorAll('custom-salla-product-card, salla-product-card').length;
            });

            // Re-evaluate button in case it appeared after double check scroll
            const isButtonVisiblePost = await page.evaluate((sel) => {
              const btn = document.querySelector(sel) as HTMLButtonElement | null;
              if (!btn) return false;
              const rect = btn.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && btn.style.display !== 'none';
            }, buttonSelector);

            if (isButtonVisiblePost) {
              continue;
            }

            if (doubleCheckCount === lastCount) {
              break; // Stabilized count and no load-more button
            }
          }

          lastCount = currentCount;
          scrollAttempts++;
        }

        this.logger.log(`[Aliaqtisadia Catalog] Category ${cat.name}: Finished scrolling. Total cards: ${lastCount}`);

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

        // Batch-process Axios details fetching in parallel batches of size 4
        const batchSize = 4;
        const productsWithGtin: any[] = [];

        for (let i = 0; i < domProducts.length; i += batchSize) {
          const batch = domProducts.slice(i, i + batchSize);

          await Promise.all(
            batch.map(async (p) => {
              if (!p.url) return;

              let cleanGtin = '';
              let details: any = null;

              try {
                // Call Salla details scraper to resolve EAN/GTIN
                details = await this.aliaqtisadiaScraper.scrapeProductDetails(p.url);
                if (details && details.gtin) {
                  const cleaned = details.gtin.trim();
                  if (/^\d{8,14}$/.test(cleaned)) {
                    cleanGtin = cleaned;
                  }
                }
              } catch (err: any) {
                this.logger.warn(`[Aliaqtisadia Catalog] Fallback details scrape failed for ${p.url}: ${err.message}`);
              }

              // Enforce pure numeric EAN check
              if (!cleanGtin) {
                this.logger.warn(`[Aliaqtisadia Catalog] Skipping product "${p.name}" (no valid barcode resolved: ${cleanGtin})`);
                return;
              }

              // Parse Price
              const finalPriceText = (details?.price !== null && details?.price !== undefined)
                ? String(details.price)
                : p.priceText;

              const numericPrice = parseFloat(finalPriceText.replace(/[^\d.]/g, ''));
              if (isNaN(numericPrice) || numericPrice <= 0) {
                this.logger.warn(`[Aliaqtisadia Catalog] Skipping product "${p.name}" (invalid price: "${finalPriceText}")`);
                return;
              }

              const nameAr = details?.name || p.name || '';
              const imageUrl = details?.image || p.image || null;

              productsWithGtin.push({
                ...p,
                gtin: cleanGtin,
                price: numericPrice,
                nameAr,
                imageUrl,
              });
            }),
          );

          if (delayMs > 0 && i + batchSize < domProducts.length) {
            await new Promise((resolve) => setTimeout(resolve, delayMs / 2));
          }
        }

        // Commit products transactionally to PostgreSQL
        for (const p of productsWithGtin) {
          totalProcessed++;

          const nameAr = p.nameAr || '';
          const nameEn = nameAr;
          const imageUrl = p.imageUrl || null;
          const inStock = p.inStock;
          const numericPrice = p.price;

          if (dryRun) {
            this.logger.log(
              `[DRY RUN] Would upsert GTIN ${p.gtin}: nameAr="${nameAr}", nameEn="${nameEn}", price=${numericPrice}, category="${cat.name}", image="${imageUrl}", inStock=${inStock}`,
            );
            continue;
          }

          try {
            await this.dataSource.transaction(async (manager) => {
              // 1. Find or create Product
              let product = await manager.findOne(Product, {
                where: { gtin: p.gtin },
              });

              if (!product) {
                product = manager.create(Product, {
                  gtin: p.gtin,
                  name_ar: nameAr,
                  name_en: nameEn,
                  image_front_url: imageUrl || undefined,
                  category: cat.name || undefined,
                  data_source: 'aliaqtisadia',
                  brand_normalized: normalizeBrandStrict(''),
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
                    source: 'aliaqtisadia',
                    image_type: 'catalog',
                  });
                  await manager.save(pImage);
                }
              }
            });

            // 4. Trigger background search for other store prices
            if (triggerSearch) {
              const jobId = `seed-gtin-prices-${p.gtin}`;
              await this.ingestionQueue.add(
                'seed-gtin-prices',
                { gtin: p.gtin },
                {
                  jobId,
                  attempts: 3,
                  backoff: { type: 'exponential', delay: 5000 },
                  removeOnComplete: 100,
                  removeOnFail: 50,
                  timeout: 30 * 60 * 1000,
                } as any,
              );
              totalOtherStoresEnqueued++;
            }
          } catch (dbErr: any) {
            this.logger.error(
              `[Aliaqtisadia Catalog] Failed to save product/price for GTIN ${p.gtin}: ${dbErr.message}`,
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
            this.logger.log(`[Aliaqtisadia Catalog] Saved progress for category "${cat.name}" to progress file.`);
          } catch (err: any) {
            this.logger.error(`[Aliaqtisadia Catalog] Failed to write progress file: ${err.message}`);
          }
        }
      } catch (catErr: any) {
        this.logger.error(`[Aliaqtisadia Catalog] Failed to process category ${cat.name}: ${catErr.message}`);
      } finally {
        await (this.aliaqtisadiaScraper as any).releasePage(page);
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
        this.logger.log('[Aliaqtisadia Catalog] Scrape finished completely. Cleared progress tracking file.');
      } catch (err: any) {
        this.logger.warn(`[Aliaqtisadia Catalog] Failed to clear progress file: ${err.message}`);
      }
    }

    const durationMs = Date.now() - startTime;
    const stats: AliaqtisadiaCatalogStats = {
      totalCategoriesProcessed,
      totalProcessed,
      totalAdded,
      totalPricesAdded,
      totalOtherStoresEnqueued,
      durationMs,
      dryRun,
    };

    this.logger.log(`[Aliaqtisadia Catalog] Scraping completed. Stats: ${JSON.stringify(stats)}`);
    return stats;
  }
}
