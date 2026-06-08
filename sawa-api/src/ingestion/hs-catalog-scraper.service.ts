import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { Store } from '../entities/store.entity';
import { HsCatalogJobDto } from './dto/hs-catalog-job.dto';
import { HungerStationScraper } from './scraper/hungerstation-scraper';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { StoresService } from '../stores/stores.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ScrapedProductData } from './dto/ingestion-job.dto';
import { normalizeBrandStrict, normalizeProductName, gtinPrefix } from '../utils/normalization';

/** Extract the HS numeric or UUID product ID from a product URL */
function extractHsProductId(url: string): string | null {
  // Pattern 1: /items/{uuid}
  const itemMatch = url.match(/\/items\/([a-f0-9-]+)/i);
  if (itemMatch) return itemMatch[1];
  
  // Pattern 2: /product/{slug}/{productId}
  const match = url.match(/\/product\/[^/]+\/([a-zA-Z0-9-]+)/);
  return match ? match[1] : null;
}

interface HsCatalogStats {
  categoriesTotal: number;
  categoriesProcessed: number;
  categoriesFailed: number;
  productsTotal: number;
  productsUpserted: number;
  productsSkipped: number;
  productsFailed: number;
  pricesUpserted: number;
  imagesUpserted: number;
  subcategoriesEnqueued: number;
  dryRun: boolean;
  durationMs: number;
  storeUrl: string;
}

@Injectable()
export class HsCatalogScraperService {
  private readonly logger = new Logger(HsCatalogScraperService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly robotsTxtService: RobotsTxtService,
    private readonly storesService: StoresService,
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  async run(opts: HsCatalogJobDto): Promise<HsCatalogStats> {
    const startTime = Date.now();
    const dryRun = opts.dryRun ?? false;

    const storeUrl =
      opts.storeUrl ||
      this.configService.get<string>('HS_CATALOG_STORE_URL') ||
      '';
    if (!storeUrl) {
      throw new Error('HS_CATALOG_STORE_URL is not configured and no storeUrl provided');
    }

    const maxCategories =
      opts.maxCategories ??
      Number(this.configService.get<string>('HS_CATALOG_MAX_CATEGORIES') || '0');
    const maxProductsPerCat =
      opts.maxProductsPerCategory ??
      Number(this.configService.get<string>('HS_CATALOG_MAX_PRODUCTS_PER_CAT') || '0');
    const requestDelayMs =
      opts.requestDelayMs ??
      Number(this.configService.get<string>('HS_CATALOG_REQUEST_DELAY_MS') || '2000');

    this.logger.log(
      `[HS Catalog] Starting scrape: storeUrl=${storeUrl}, maxCategories=${maxCategories}, maxProductsPerCat=${maxProductsPerCat}, dryRun=${dryRun}`,
    );

    // ── Resolve store and merchant ─────────────────────────────────────────
    const storeInfo = this.parseStoreUrl(storeUrl);
    let store = await this.storeRepo.findOne({
      where: { platform_branch_uuid: storeInfo.branchUuid },
      relations: ['merchant'],
    });

    // Ensure the HungerStation merchant exists
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: 'HungerStation' },
    });
    if (!merchant) {
      merchant = await this.merchantRepo.findOne({
        where: { name_en: 'hungerstation' },
      });
    }
    if (!merchant) {
      this.logger.warn(
        '[HS Catalog] HungerStation merchant not found, creating one',
      );
      merchant = this.merchantRepo.create({ name_en: 'HungerStation' });
      merchant = await this.merchantRepo.save(merchant);
    }

    // ── Launch scraper ────────────────────────────────────────────────────
    const scraper = new HungerStationScraper(this.robotsTxtService, {
      headless: true,
      deviceProfile: 'mobile',
    });
    await scraper.launch();

    const stats: HsCatalogStats = {
      categoriesTotal: 0,
      categoriesProcessed: 0,
      categoriesFailed: 0,
      productsTotal: 0,
      productsUpserted: 0,
      productsSkipped: 0,
      productsFailed: 0,
      pricesUpserted: 0,
      imagesUpserted: 0,
      subcategoriesEnqueued: 0,
      dryRun,
      durationMs: 0,
      storeUrl,
    };

    try {
      // ── Determine execution mode ──────────────────────────────────────
      const branch = this.buildBranchContext(storeUrl, storeInfo, store);

      if (!opts.categoryUrl) {
        // ORCHESTRATOR MODE: Discover categories and queue them
        this.logger.log(`[HS Catalog Orchestrator] Discovering categories for store...`);
        const categories = await scraper.discoverCategories(branch);
        stats.categoriesTotal = categories.length;

        const categoriesToScrape =
          maxCategories > 0 ? categories.slice(0, maxCategories) : categories;

        // Collect all top-level category IDs so workers can exclude them
        // from subcategory discovery (the HS tab bar shows all siblings).
        const allTopLevelCategoryIds = categories.map((c) => c.id);

        this.logger.log(
          `[HS Catalog Orchestrator] Discovered ${categories.length} categories, enqueueing ${categoriesToScrape.length} category jobs.`,
        );

        for (const [catIdx, category] of categoriesToScrape.entries()) {
          const jobId = `hs-cat-${storeInfo.branchUuid}-${category.name.substring(0, 15)}-${Date.now()}`;
          await this.ingestionQueue.add(
            'hs-catalog-scrape-category',
            {
              ...opts,
              categoryUrl: category.url,
              categoryName: category.name,
              depth: 0,
              siblingCategoryIds: allTopLevelCategoryIds,
            },
            {
              jobId,
              attempts: 3,
              timeout: 2 * 60 * 60 * 1000, // 2 hours
            } as any
          );
        }

        stats.durationMs = Date.now() - startTime;
        return stats;
      }

      // WORKER MODE: Scrape specific category
      const currentDepth = opts.depth ?? 0;
      const MAX_SUBCATEGORY_DEPTH = 3;
      this.logger.log(
        `[HS Catalog Worker] Processing category: ${opts.categoryName} (${opts.categoryUrl}) [depth=${currentDepth}]`,
      );
      
      const category = { url: opts.categoryUrl, name: opts.categoryName || 'Unknown Category' };
      stats.categoriesTotal = 1;

      // ── Step 1: Leaf category — paginate and scrape products ──────────
      try {
        let productsInCategory = 0;

        const listingItems = await scraper.scrapeListingPage(
          category.url,
          1,
          branch,
        );

        if (listingItems.length === 0) {
          this.logger.debug(
            `[HS Catalog] Category ${category.name} is empty.`,
          );
        } else {
          for (const listingItem of listingItems) {
            if (
              maxProductsPerCat > 0 &&
              productsInCategory >= maxProductsPerCat
            ) {
              break;
            }

            stats.productsTotal++;

            // ── Skip-existing optimization ─────────────────────────────
            const hsProductIdFromListing = extractHsProductId(
              listingItem.productPageUrl,
            );
            if (hsProductIdFromListing && !dryRun) {
              const existing = await this.productRepo.findOne({
                where: { hs_product_id: hsProductIdFromListing },
              });
              if (existing) {
                // Product exists — update price from listing data only (no detail page needed)
                await this.quickUpdatePrice(
                  existing,
                  listingItem,
                  category.name,
                  merchant!,
                  store ?? null,
                );
                stats.productsSkipped++;
                stats.pricesUpserted++;
                productsInCategory++;
                continue; // Skip expensive detail page navigation
              }
            }

            // ── New product — fetch detail page ────────────────────────
            let detailPage: any = null;

            try {
              // Get detail page data
              let detailData: ScrapedProductData = {} as any;
              if (listingItem.hasDetailPage !== false) {
                try {
                  const scrapeResult = await scraper.scrapeDetailPage(
                    listingItem.productPageUrl,
                    branch,
                  );
                  detailPage = scrapeResult.page;
                  detailData = scrapeResult;
                } catch (err) {
                  this.logger.warn(
                    `[HS Catalog] Detail page failed for ${listingItem.name}: ${err.message}`,
                  );
                }
              }

              const combined: ScrapedProductData = {
                ...listingItem,
                ...detailData,
              };
              const hsProductId = extractHsProductId(
                combined.productPageUrl,
              );

              if (!hsProductId) {
                this.logger.warn(
                  `[HS Catalog] Could not extract HS product ID from URL: ${combined.productPageUrl}`,
                );
                stats.productsFailed++;
                continue;
              }

              if (dryRun) {
                this.logger.log(
                  `[DRY RUN] Would upsert: hs_id=${hsProductId}, name=${combined.name}, price=${combined.price}, promo=${combined.promo_price}, images=${combined.imageUrls?.length ?? 0}`,
                );
                stats.productsUpserted++;
              } else {
                const upsertResult = await this.upsertProduct(
                  hsProductId,
                  combined,
                  category.name,
                  merchant!,
                  store ?? null,
                );
                if (upsertResult) {
                  stats.productsUpserted++;
                  stats.pricesUpserted += upsertResult.pricesUpserted;
                  stats.imagesUpserted += upsertResult.imagesUpserted;
                } else {
                  stats.productsFailed++;
                }
              }

              productsInCategory++;

              // Throttle between products
              await this.delay(requestDelayMs);
            } catch (err) {
              stats.productsFailed++;
              this.logger.error(
                `[HS Catalog] Product failed (${listingItem.name}): ${err.message}`,
              );
            } finally {
              if (detailPage) {
                await detailPage.close().catch(() => undefined);
              }
            }
          }
        }

        stats.categoriesProcessed++;
      } catch (err) {
        stats.categoriesFailed++;
        this.logger.error(
          `[HS Catalog] Category failed (${category.name}): ${err.message}`,
        );
      }

      stats.durationMs = Date.now() - startTime;
      this.logger.log(
        `[HS Catalog] Completed: ${JSON.stringify(stats)}`,
      );
      return stats;
    } finally {
      await scraper.close();
    }
  }

  // ── Product upsert ──────────────────────────────────────────────────────

  private async upsertProduct(
    hsProductId: string,
    data: ScrapedProductData,
    categoryName: string,
    merchant: Merchant,
    store: Store | null,
  ): Promise<{ pricesUpserted: number; imagesUpserted: number } | null> {
    if (!data.price || data.price <= 0) {
      this.logger.warn(
        `[HS Catalog] Skipping ${data.name} — invalid price: ${data.price}`,
      );
      return null;
    }

    let pricesUpserted = 0;
    let imagesUpserted = 0;

    await this.dataSource.transaction(async (manager) => {
      // ── Find or create product by hs_product_id ─────────────────────
      let product = await manager.findOne(Product, {
        where: { hs_product_id: hsProductId },
      });

      if (!product) {
        product = manager.create(Product, {
          hs_product_id: hsProductId,
          hs_product_url: data.productPageUrl,
          gtin: null,
          data_source: 'hungerstation',
        });
      }

      // Update product fields (don't overwrite non-null with null)
      product.name_en = data.name || product.name_en;
      product.name_ar = data.name_ar || product.name_ar;
      product.brand = data.brand || product.brand;
      product.category = categoryName || product.category;
      product.subcategory = data.subcategory || product.subcategory;
      product.description_en = data.description || product.description_en;
      product.description_ar = data.description_ar || product.description_ar;
      product.hs_product_url = data.productPageUrl || product.hs_product_url;

      // Set canonical image URLs
      if (data.imageUrls && data.imageUrls.length > 0) {
        product.image_front_url = product.image_front_url || data.imageUrls[0];
      }

      // Normalized fields
      product.brand_normalized = normalizeBrandStrict(product.brand ?? '');
      product.name_normalized = normalizeProductName(
        product.name_en ?? product.name_ar ?? '',
      );

      // Allergen/ingredient tags from scraper
      if (data.allergen_tags && data.allergen_tags.length > 0) {
        product.allergen_tags = data.allergen_tags;
      }
      if (data.ingredient_tags && data.ingredient_tags.length > 0) {
        product.ingredient_tags = data.ingredient_tags;
      }

      await manager.save(product);

      // ── Upsert ProductPrice (one-to-many per store) ─────────────────
      // Check for existing price for this product + store combination
      const existingPriceWhere: any = {
        product_id: product.id,
        merchant_id: merchant.id,
      };
      if (store) {
        existingPriceWhere.store_id = store.id;
      }

      let price = await manager.findOne(ProductPrice, {
        where: existingPriceWhere,
      });

      if (!price) {
        price = manager.create(ProductPrice, {
          product_id: product.id,
          merchant_id: merchant.id,
          store_id: store?.id ?? null,
        });
      }

      price.price_sar_incl_vat = data.price;
      price.promo_price_sar = data.promo_price ?? null;
      price.currency = 'SAR';
      price.in_stock = data.inStock ?? true;
      price.source_url = data.productPageUrl;
      price.scraped_at = new Date();

      await manager.save(price);
      pricesUpserted++;

      // ── Upsert ProductImages ────────────────────────────────────────
      if (data.imageUrls && data.imageUrls.length > 0) {
        for (const imageUrl of data.imageUrls) {
          const existing = await manager.findOne(ProductImage, {
            where: { product_id: product.id, url: imageUrl },
          });
          if (!existing) {
            const image = manager.create(ProductImage, {
              product_id: product.id,
              url: imageUrl,
              source: 'hungerstation',
              image_type: 'catalog',
            });
            await manager.save(image);
            imagesUpserted++;
          }
        }
      }
    });

    return { pricesUpserted, imagesUpserted };
  }

  // ── Quick price update (skip-existing optimization) ─────────────────────

  /**
   * Lightweight price update for products that already exist in the DB.
   * Uses listing data only — skips the expensive detail page navigation.
   * This saves ~3-5 seconds per product on re-scrape runs.
   */
  private async quickUpdatePrice(
    product: Product,
    listingData: ScrapedProductData,
    categoryName: string,
    merchant: Merchant,
    store: Store | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Update category if not set
      if (categoryName && !product.category) {
        product.category = categoryName;
        await manager.save(product);
      }

      // Upsert the price record
      const priceWhere: any = {
        product_id: product.id,
        merchant_id: merchant.id,
      };
      if (store) {
        priceWhere.store_id = store.id;
      }

      let price = await manager.findOne(ProductPrice, {
        where: priceWhere,
      });

      if (!price) {
        price = manager.create(ProductPrice, {
          product_id: product.id,
          merchant_id: merchant.id,
          store_id: store?.id ?? null,
        });
      }

      price.price_sar_incl_vat = listingData.price;
      price.promo_price_sar = listingData.promo_price ?? price.promo_price_sar;
      price.currency = 'SAR';
      price.in_stock = listingData.inStock ?? true;
      price.source_url = listingData.productPageUrl;
      price.scraped_at = new Date();

      await manager.save(price);
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private parseStoreUrl(url: string): {
    branchUuid: string;
    chainId: string;
    chainName: string;
  } {
    // Pattern: /sa-en/qc/{chainId}/{chainName}/branch/{branchUuid}
    const match = url.match(
      /\/qc\/(\d+)\/([^/]+)\/branch\/([^/?#\s]+)/,
    );
    if (match) {
      return {
        chainId: match[1],
        chainName: match[2],
        branchUuid: match[3],
      };
    }
    // Fallback: extract everything after branch/
    const fallbackMatch = url.match(/\/branch\/([^/?#\s]+)/);
    if (fallbackMatch) {
      return {
        branchUuid: fallbackMatch[1],
        chainId: '',
        chainName: '',
      };
    }
    const uuidMatch = url.match(/([a-f0-9-]{36}(?:~\d+)?)/);
    return {
      branchUuid: uuidMatch?.[1] ?? '',
      chainId: '',
      chainName: '',
    };
  }

  private buildBranchContext(
    storeUrl: string,
    storeInfo: { branchUuid: string; chainId: string; chainName: string },
    store?: Store | null,
  ): any {
    return {
      platform_branch_id: storeInfo.chainId || storeInfo.branchUuid,
      platform_branch_uuid: storeInfo.branchUuid,
      merchant_name_en: store?.merchant?.name_en || storeInfo.chainName || 'AL Othaim',
      merchant_name_ar: store?.merchant?.name_ar,
      vertical: store?.vertical || 'supermarket',
      lat: store?.lat,
      lng: store?.lng,
      source_url: storeUrl,
      citySlug: store?.city_slug || 'riyadh',
      districtSlug: store?.district_slug || '',
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
