import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import { Logger, NotFoundException, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import axios from 'axios';

import {
  IngestionJobDto,
  IngestionPlatform,
  IngestionJobMode,
  ScrapedProductData,
} from './dto/ingestion-job.dto';
import { INGESTION_JOB_OPTIONS } from './ingestion.service';
import { BaseScraper } from './scraper/base-scraper';

type ScrapedProductDetail = ScrapedProductData & { page?: any };
import { RobotsTxtService } from './scraper/robots-txt.service';
import { NinjaScraper } from './scraper/ninja-scraper';
import { HungerStationScraper } from './scraper/hungerstation-scraper';
import { normalizeHsMerchantName } from './scraper/hydration-utils';
import { PandaPriceScraper } from './scraper/panda-price-scraper';
import { CarrefourPriceScraper } from './scraper/carrefour-price-scraper';
import { OthaimPriceScraper } from './scraper/othaim-price-scraper';
import { TamimiPriceScraper } from './scraper/tamimi-price-scraper';
import { ProductClusteringService } from './product-clustering.service';
import { StoresService } from '../stores/stores.service';
import { OpenFoodFactsService } from './open-food-facts.service';
import {
  HUNGERSTATION_ALLOWED_VERTICALS,
  HUNGERSTATION_REJECTED_VERTICALS,
} from './scraper/hungerstation-types';

import { SfdaMatcherService } from '../scan/sfda-matcher.service';
import { LabelCoreService } from '../scan/label-core.service';
import { StructuredLabelDto } from '../scan/dto/structured-label.dto';
import { PricesService } from '../prices/prices.service';
import { GtinBackfillService } from './gtin-backfill.service';
import { Semaphore } from './ai-match/ai-match-runtime';
import { isPlaceholderBrand, inferBrandAndWeightFromName, normalizeBrandStrict, isMajorSupermarket } from '../utils/normalization';
import { GLOBAL_BRANDS_FOR_POOL } from './constants/global-brands';

import { OffImportService } from './off-import.service';
import { OffImportJobDto } from './dto/off-import-job.dto';
import { OffEnrichmentService } from './off-enrichment.service';
import { OffEnrichmentJobDto } from './dto/off-enrichment-job.dto';
import { OffPriceLinkerService } from './off-price-linker.service';
import { OffPriceLinkingJobDto } from './dto/off-price-linking-job.dto';
import { BarcodeListScraperService } from './barcode-list-scraper.service';
import { BarcodeListNamesJobDto } from './dto/barcode-list-names-job.dto';
import { HsCatalogScraperService } from './hs-catalog-scraper.service';
import { HsCatalogJobDto } from './dto/hs-catalog-job.dto';
import { ParkCenterCatalogScraperService } from './parkcenter-catalog-scraper.service';
import { ParkCenterCatalogJobDto } from './dto/parkcenter-catalog-job.dto';
import { YasminCatalogScraperService } from './yasmin-catalog-scraper.service';
import { YasminCatalogJobDto } from './dto/yasmin-catalog-job.dto';
import { DukanExpressCatalogScraperService } from './dukanexpress-catalog-scraper.service';
import { DukanExpressCatalogJobDto } from './dto/dukanexpress-catalog-job.dto';
import { MubarkiyahCatalogScraperService } from './mubarkiyah-catalog-scraper.service';
import { MubarkiyahCatalogJobDto } from './dto/mubarkiyah-catalog-job.dto';
import { EtaamExpressCatalogScraperService } from './etaamexpress-catalog-scraper.service';
import { EtaamExpressCatalogJobDto } from './dto/etaamexpress-catalog-job.dto';
import { AliaqtisadiaCatalogScraperService } from './aliaqtisadia-catalog-scraper.service';
import { AliaqtisadiaCatalogJobDto } from './dto/aliaqtisadia-catalog-job.dto';
import { ProductsService } from '../products/products.service';

import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import {
  detectAllergensFromText,
  getAllergenByKey,
} from './constants/sfda-allergens';

const INGESTION_WORKER_CONCURRENCY = Number.parseInt(
  process.env.INGESTION_WORKER_CONCURRENCY ?? '2',
  10,
);

const HS_DAILY_STAGGER_MS = Number.parseInt(
  process.env.HUNGERSTATION_DAILY_STAGGER_MS ?? '30000',
  10,
);

@Processor('ingestion-queue', {
  // GLOBAL queue concurrency (all platforms), kept low by default for HungerStation Cloudflare friendliness
  concurrency:
    Number.isFinite(INGESTION_WORKER_CONCURRENCY) &&
    INGESTION_WORKER_CONCURRENCY > 0
      ? INGESTION_WORKER_CONCURRENCY
      : 2,
  lockDuration: 300000,
  stalledInterval: 60000,
})
export class IngestionProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(IngestionProcessor.name);
  private rejectedProductsCount = 0;

  // Comment 2: Proper async lock for GTIN backfill using Semaphore with concurrency=1
  // Ensures that only one GTIN backfill job executes at a time, acquired before run() and released in finally
  private gtinBackfillLock = new Semaphore(1);
  private offImportLock = new Semaphore(1);
  private offEnrichmentLock = new Semaphore(1);
  private offPriceLinkingLock = new Semaphore(1);
  private barcodeListNamesLock = new Semaphore(1);
  private hsCatalogLock = new Semaphore(1);
  private parkCenterCatalogLock = new Semaphore(1);
  private yasminCatalogLock = new Semaphore(1);
  private dukanExpressCatalogLock = new Semaphore(1);
  private mubarkiyahCatalogLock = new Semaphore(1);
  private etaamExpressCatalogLock = new Semaphore(1);
  private aliaqtisadiaCatalogLock = new Semaphore(1);

  private todayDateSuffix(): string {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  constructor(
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
    private readonly robotsTxtService: RobotsTxtService,
    private readonly productClusteringService: ProductClusteringService,
    private readonly labelCoreService: LabelCoreService,
    private readonly sfdaMatcherService: SfdaMatcherService,
    private readonly dataSource: DataSource,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    private readonly pricesService: PricesService,
    private readonly storesService: StoresService,
    private readonly openFoodFactsService: OpenFoodFactsService,
    private readonly gtinBackfillService: GtinBackfillService,
    private readonly offImportService: OffImportService,
    private readonly offEnrichmentService: OffEnrichmentService,
    private readonly offPriceLinkerService: OffPriceLinkerService,
    private readonly barcodeListScraperService: BarcodeListScraperService,
    private readonly hsCatalogScraperService: HsCatalogScraperService,
    private readonly parkCenterCatalogScraperService: ParkCenterCatalogScraperService,
    private readonly yasminCatalogScraperService: YasminCatalogScraperService,
    private readonly dukanExpressCatalogScraperService: DukanExpressCatalogScraperService,
    private readonly mubarkiyahCatalogScraperService: MubarkiyahCatalogScraperService,
    private readonly etaamExpressCatalogScraperService: EtaamExpressCatalogScraperService,
    private readonly aliaqtisadiaCatalogScraperService: AliaqtisadiaCatalogScraperService,
    @Inject(forwardRef(() => ProductsService))
    private readonly productsService: ProductsService,
  ) {
    super();
    this.logger.log(
      'IngestionProcessor initialized and ready to pick up jobs.',
    );
  }

  async onModuleInit() {
    if (process.env.DISABLE_QUEUE_PROCESSORS === 'true') {
      this.logger.warn('DISABLE_QUEUE_PROCESSORS is enabled. Pausing ingestion worker...');
      await this.worker.pause();
    }
  }

  async process(job: Job<IngestionJobDto>): Promise<any> {
    this.logger.log(`Worker received job: ${job.id} (name: ${job.name})`);
    switch (job.name) {
      case 'scrape':
        return this.handleScrapeJob(job);
      case 'scrape-category':
        return this.handleScrapeJob(job);
      case 'discover-cities':
        return this.handleDiscoverCities(job);
      case 'daily-refresh-hungerstation':
        return this.handleDailyRefreshHungerStation(job);
      case 'discover-districts':
        return this.handleDiscoverDistricts(job);
      case 'discover-branches':
        return this.handleDiscoverBranches(job);
      case 'products-for-store':
        return this.handleProductsForStore(job);
      case 'gtin-backfill-off':
        return this.handleGtinBackfill(job);
      case 'off-import':
        return this.handleOffImport(job);
      case 'off-enrichment':
        return this.handleOffEnrichment(job);
      case 'off-price-linking':
        return this.handleOffPriceLinking(job);
      case 'barcode-list-names':
        return this.handleBarcodeListNames(job);
      case 'hs-catalog-scrape':
        return this.handleHsCatalogScrape(job);
      case 'hs-catalog-scrape-category':
        return this.handleHsCatalogScrapeCategory(job);
      case 'parkcenter-catalog-scrape':
        return this.handleParkCenterCatalogScrape(job);
      case 'yasmin-catalog-scrape':
        return this.handleYasminCatalogScrape(job);
      case 'dukanexpress-catalog-scrape':
        return this.handleDukanExpressCatalogScrape(job);
      case 'mubarkiyah-catalog-scrape':
        return this.handleMubarkiyahCatalogScrape(job);
      case 'etaamexpress-catalog-scrape':
        return this.handleEtaamExpressCatalogScrape(job);
      case 'aliaqtisadia-catalog-scrape':
        return this.handleAliaqtisadiaCatalogScrape(job);
      case 'seed-gtin-prices':
        return this.handleSeedGtinPrices(job);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleScrapeJob(job: Job<IngestionJobDto>) {
    const { platform, categoryUrl, pageRange, mode } = job.data;

    if (mode && mode !== IngestionJobMode.SCRAPE) {
      this.logger.warn(
        `Job ${job.id} called with mode ${mode} but routed to handleScrapeJob. Skipping.`,
      );
      return;
    }

    if (!platform || !categoryUrl || !pageRange) {
      this.logger.error(
        `scrape-category job ${job.id} is missing platform, categoryUrl, or pageRange — skipping.`,
      );
      return;
    }
    this.logger.log(`Starting ingestion job for ${platform} - ${categoryUrl}`);

    const scraper = this.getScraper(platform);
    await scraper.launch();

    try {
      const totalPages = pageRange.end - pageRange.start + 1;
      let processedCount = 0;

      for (let pageNum = pageRange.start; pageNum <= pageRange.end; pageNum++) {
        this.logger.log(`Scraping page ${pageNum} of ${platform}`);
        const listingProducts = await scraper.scrapeListingPage(
          categoryUrl,
          pageNum,
        );

        // Ninja: Exhaustive recursion logic
        if (platform === IngestionPlatform.NINJA && pageNum === 1) {
          const depth = job.data.depth || 0;
          const maxDepth = 4; // Default safe limit for Ninja structure

          if (depth < maxDepth) {
            this.logger.log(
              `[Depth ${depth}] Checking for subcategories at ${categoryUrl}`,
            );
            const subcategories = await (
              scraper as NinjaScraper
            ).getSubcategories(categoryUrl);

            if (subcategories.length > 0) {
              const visitedUrls = job.data.visitedUrls || [categoryUrl];
              const newCategories = subcategories.filter(
                (sub) => !visitedUrls.includes(sub.url),
              );

              this.logger.log(
                `Discovered ${subcategories.length} subcategories, ${newCategories.length} new. Enqueueing recursion.`,
              );
              for (const sub of newCategories) {
                const base64Url = Buffer.from(sub.url).toString('base64');
                const dedupeId = `recursive-${IngestionPlatform.NINJA}-${base64Url}-1-20`; // Increased to 20 pages

                await this.ingestionQueue.add(
                  'scrape-category',
                  {
                    platform: IngestionPlatform.NINJA,
                    categoryUrl: sub.url,
                    pageRange: { start: 1, end: 20 },
                    visitedUrls: [...visitedUrls, sub.url],
                    depth: depth + 1,
                  },
                  { ...INGESTION_JOB_OPTIONS, jobId: dedupeId },
                );
              }

              // If we found NO products and NO new subcategories on the first page, we stop this branch.
              if (listingProducts.length === 0 && newCategories.length === 0) {
                return { processedCount: 0, status: 'exhausted' };
              }
            }
          } else {
            this.logger.warn(
              `Max depth (${maxDepth}) reached at ${categoryUrl}. Skipping further discovery.`,
            );
          }
        }

        for (const listingItem of listingProducts) {
          let detailPage: any = null;
          try {
            this.logger.debug(`Processing product: ${listingItem.name}`);
            let detailData: any = {};
            try {
              const scrapeResult = await scraper.scrapeDetailPage(
                listingItem.productPageUrl,
              );
              detailPage = scrapeResult.page;
              detailData = scrapeResult;
            } catch (err) {
              this.logger.warn(
                `Detail capture failed for ${listingItem.name} at ${listingItem.productPageUrl}. Saving listing data only. Error: ${err.message}`,
              );
            }

            const combinedData = { ...listingItem, ...detailData };

            // 4. Pass the active page and scraper context to allow browser-based image downloads
            await this.processProductData(
              platform,
              scraper,
              combinedData,
              detailPage || null,
            );

            processedCount++;
            const progress = Math.floor(
              (processedCount / (listingProducts.length * totalPages)) * 100,
            );
            await job.updateProgress(progress);
          } catch (error) {
            this.logger.error(
              `Failed to process product ${listingItem.name}: ${error.message}`,
            );
          } finally {
            if (detailPage) {
              await detailPage
                .close()
                .catch((err) =>
                  this.logger.warn(`Failed to close page: ${err.message}`),
                );
            }
          }
        }
      }

      this.logger.log(
        `Ingestion job completed. Processed ${processedCount} products.`,
      );
      return { processedCount };
    } finally {
      await scraper.close();
    }
  }

  // ─── HungerStation discovery handlers ──────────────────────────────────────

  private async handleDiscoverCities(job: Job<IngestionJobDto>) {
    const scraper = this.getScraper(
      IngestionPlatform.HUNGERSTATION,
    ) as HungerStationScraper;
    await scraper.launch();
    try {
      const cities = await scraper.discoverCities();
      let citiesFailed = 0;
      const dateSuffix = this.todayDateSuffix();
      for (const city of cities) {
        try {
          const jobId = `hs-disc-cities-${city.slug}-${dateSuffix}`;
          await this.ingestionQueue.add(
            'discover-districts',
            {
              platform: IngestionPlatform.HUNGERSTATION,
              mode: IngestionJobMode.DISCOVER_DISTRICTS,
              citySlug: city.slug,
              city_name_en: city.name_en,
              cityUrl: city.url,
            } as IngestionJobDto,
            { ...INGESTION_JOB_OPTIONS, jobId },
          );
        } catch (err) {
          citiesFailed++;
          this.logger.error(
            `[HS] discover-cities: failed to enqueue districts job for ${city.slug}: ${err.message}`,
          );
        }
      }
      this.logger.log(
        `[HS] discover-cities: enqueued=${cities.length - citiesFailed}, failed=${citiesFailed}.`,
      );
      return { citiesEnqueued: cities.length - citiesFailed, citiesFailed };
    } finally {
      await scraper.close();
    }
  }

  private async handleDiscoverDistricts(job: Job<IngestionJobDto>) {
    const { citySlug, city_name_en, cityUrl } = job.data;
    const scraper = this.getScraper(
      IngestionPlatform.HUNGERSTATION,
    ) as HungerStationScraper;
    await scraper.launch();
    try {
      const city = {
        slug: citySlug!,
        name_en: city_name_en ?? citySlug!,
        url: cityUrl!,
      };
      const districts = await scraper.discoverDistricts(city);
      let districtsFailed = 0;
      const dateSuffix = this.todayDateSuffix();
      for (const district of districts) {
        try {
          const jobId = `hs-disc-${citySlug}-${district.slug}-${dateSuffix}`;
          await this.ingestionQueue.add(
            'discover-branches',
            {
              platform: IngestionPlatform.HUNGERSTATION,
              mode: IngestionJobMode.DISCOVER_BRANCHES,
              citySlug,
              districtSlug: district.slug,
              city_name_en,
              district_name_en: district.name_en,
              districtUrl: district.url,
              cityUrl,
            } as IngestionJobDto,
            { ...INGESTION_JOB_OPTIONS, jobId },
          );
        } catch (err) {
          districtsFailed++;
          this.logger.error(
            `[HS] discover-districts(${citySlug}): failed to enqueue branches job for ${district.slug}: ${err.message}`,
          );
        }
      }
      this.logger.log(
        `[HS] discover-districts(${citySlug}): enqueued=${districts.length - districtsFailed}, failed=${districtsFailed}.`,
      );
      return {
        districtsEnqueued: districts.length - districtsFailed,
        districtsFailed,
      };
    } finally {
      await scraper.close();
    }
  }

  private async handleDiscoverBranches(job: Job<IngestionJobDto>) {
    const {
      citySlug,
      districtSlug,
      city_name_en,
      district_name_en,
      districtUrl,
      cityUrl,
    } = job.data;
    const scraper = this.getScraper(
      IngestionPlatform.HUNGERSTATION,
    ) as HungerStationScraper;
    await scraper.launch();
    let branchesUpserted = 0;
    let branchesSkipped = 0;
    let branchesFailed = 0;
    const skippedMerchantCounts = new Map<string, number>();
    try {
      const district = {
        slug: districtSlug!,
        name_en: district_name_en ?? districtSlug!,
        url: districtUrl!,
        citySlug: citySlug!,
      };
      const branches = await scraper.discoverBranches(district);
      const upsertedUuids = new Set<string>();

      for (const branch of branches) {
        try {
          await this.storesService.upsertByPlatformUuid({
            platform: 'hungerstation',
            platform_branch_id: branch.platform_branch_id,
            platform_branch_uuid: branch.platform_branch_uuid,
            merchant_name_en: normalizeHsMerchantName(branch.merchant_name_en),
            merchant_name_ar: branch.merchant_name_ar,
            vertical: branch.vertical,
            city_slug: citySlug!,
            city_name_en,
            district_slug: districtSlug,
            district_name_en,
            lat: branch.lat ?? null,
            lng: branch.lng ?? null,
            source_url: branch.source_url,
            logo_url: branch.logo_url,
          });
          branchesUpserted++;
          upsertedUuids.add(branch.platform_branch_uuid);
        } catch (err) {
          if (err instanceof NotFoundException) {
            const merchantName =
              branch.merchant_name_en ||
              branch.merchant_name_ar ||
              branch.platform_branch_uuid;
            skippedMerchantCounts.set(
              merchantName,
              (skippedMerchantCounts.get(merchantName) ?? 0) + 1,
            );
            branchesSkipped++;
          } else {
            branchesFailed++;
            this.logger.error(
              `Upsert failed for branch ${branch.platform_branch_uuid}: ${err.message}`,
            );
          }
        }
      }
      if (branches.length > 0 && branchesFailed / branches.length > 0.25) {
        throw new Error(
          `[HS] discover-branches(${citySlug}/${districtSlug}): failure ratio too high (${branchesFailed}/${branches.length})`,
        );
      }
      if (skippedMerchantCounts.size > 0) {
        const skippedSummary = [...skippedMerchantCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([name, count]) => `${name}=${count}`)
          .join(', ');
        this.logger.warn(`Skipped (unseeded merchants): ${skippedSummary}`);
      }
      if (branches.length === 0) {
        this.logger.warn(
          `[HS] discover-branches(${citySlug}/${districtSlug}): NO branches found. URL: ${districtUrl}`,
        );
        return {
          branchesUpserted: 0,
          branchesSkipped: 0,
          branchesFailed: 0,
          warning: 'no-branches-discovered',
        };
      }

      this.logger.log(
        `[HS] discover-branches(${citySlug}/${districtSlug}): upserted=${branchesUpserted}, skipped=${branchesSkipped}, failed=${branchesFailed}`,
      );

      const stores = await this.storesService.findByDistrict(
        citySlug!,
        districtSlug!,
      );
      let productsJobsEnqueued = 0;
      let productsJobsFailed = 0;
      const dateSuffix = this.todayDateSuffix();

      for (const store of stores.filter(
        (s) =>
          s.platform === IngestionPlatform.HUNGERSTATION &&
          upsertedUuids.has(s.platform_branch_uuid),
      )) {
        try {
          const jobId = `hs-prod-${store.platform_branch_uuid}-${dateSuffix}`;
          await this.ingestionQueue.add(
            'products-for-store',
            {
              platform: IngestionPlatform.HUNGERSTATION,
              mode: IngestionJobMode.PRODUCTS_FOR_STORE,
              storeId: store.id,
            } as IngestionJobDto,
            { ...INGESTION_JOB_OPTIONS, jobId },
          );
          productsJobsEnqueued++;
        } catch (err) {
          productsJobsFailed++;
          this.logger.error(
            `[HS] products enqueue failed for store ${store.id}: ${err.message}`,
          );
        }
      }

      this.logger.log(
        `[HS] discover-branches → fan-out: enqueued=${productsJobsEnqueued}, failed=${productsJobsFailed}`,
      );

      return {
        branchesUpserted,
        branchesSkipped,
        branchesFailed,
        productsJobsEnqueued,
        productsJobsFailed,
      };
    } finally {
      await scraper.close();
    }
  }

  private async handleProductsForStore(job: Job<IngestionJobDto>) {
    const { storeId } = job.data;
    if (!storeId) {
      throw new UnrecoverableError(
        'products-for-store requires storeId in job payload',
      );
    }

    let store;
    try {
      store = await this.storesService.findById(storeId);
    } catch (err) {
      if (err instanceof NotFoundException) {
        throw new UnrecoverableError(
          `products-for-store received missing storeId=${storeId}`,
        );
      }
      throw err;
    }
    const branch = {
      platform_branch_id:
        store.platform_branch_id || store.platform_branch_uuid,
      platform_branch_uuid: store.platform_branch_uuid,
      merchant_name_en: store.merchant?.name_en || '',
      merchant_name_ar: store.merchant?.name_ar || undefined,
      vertical: store.vertical || 'other',
      lat: store.lat ?? undefined,
      lng: store.lng ?? undefined,
      source_url: store.source_url || '',
      citySlug: store.city_slug,
      districtSlug: store.district_slug || '',
    };

    if (HUNGERSTATION_REJECTED_VERTICALS.has(branch.vertical)) {
      this.logger.warn(
        `[HS] products-for-store skipped storeId=${storeId} due to rejected vertical=${branch.vertical}`,
      );
      return { skipped: true, reason: 'rejected-vertical' };
    }
    if (!HUNGERSTATION_ALLOWED_VERTICALS.has(branch.vertical)) {
      this.logger.warn(
        `[HS] products-for-store skipped storeId=${storeId} due to unsupported vertical=${branch.vertical}`,
      );
      return { skipped: true, reason: 'unsupported-vertical' };
    }

    const scraper = this.getScraper(
      IngestionPlatform.HUNGERSTATION,
    ) as HungerStationScraper;
    await scraper.launch();

    let categoriesProcessed = 0;
    let categoriesFailed = 0;
    let productsProcessed = 0;
    const startTime = Date.now();
    const TIMEOUT_THRESHOLD = 25 * 60 * 1000; // 25 minutes

    try {
      const categories = await scraper.discoverCategories(branch as any);

      for (const [catIdx, category] of categories.entries()) {
        const elapsed = Date.now() - startTime;
        if (elapsed > TIMEOUT_THRESHOLD) {
          this.logger.warn(
            `[HS] products-for-store storeId=${storeId} reached 25m threshold. Breaking early. ${categories.length - catIdx} categories remaining.`,
          );
          break;
        }
        try {
          let consecutiveEmpty = 0;
          let previousPageUrls = new Set<string>();
          for (let pageNum = 1; pageNum <= 25; pageNum++) {
            const listingItems = await scraper.scrapeListingPage(
              category.url,
              pageNum,
              branch as any,
            );

            const currentPageUrls = new Set(
              listingItems
                .map((item) => item.productPageUrl)
                .filter((url): url is string => !!url),
            );

            const sameAsPreviousPage =
              currentPageUrls.size > 0 &&
              currentPageUrls.size === previousPageUrls.size &&
              [...currentPageUrls].every((url) => previousPageUrls.has(url));

            if (listingItems.length === 0 || sameAsPreviousPage) {
              consecutiveEmpty++;
              if (consecutiveEmpty >= 2) break;
              previousPageUrls = currentPageUrls;
              continue;
            }
            consecutiveEmpty = 0;
            previousPageUrls = currentPageUrls;

            for (const listingItem of listingItems) {
              let detailPage: any = null;
              try {
                let detailData: any = {};
                try {
                  const scrapeResult = await scraper.scrapeDetailPage(
                    listingItem.productPageUrl,
                    branch as any,
                  );
                  detailPage = scrapeResult.page;
                  detailData = scrapeResult;
                } catch (err) {
                  this.logger.warn(
                    `[HS] detail capture failed for ${listingItem.productPageUrl}: ${err.message}`,
                  );
                }

                const combinedData = { ...listingItem, ...detailData };
                await this.processProductData(
                  IngestionPlatform.HUNGERSTATION,
                  scraper,
                  combinedData,
                  detailPage || null,
                  {
                    storeDbId: store.id,
                    merchantName: branch.merchant_name_en,
                    merchantNameAr: branch.merchant_name_ar,
                  },
                );
                productsProcessed++;
              } catch (err) {
                this.logger.error(
                  `[HS] product processing failed (${listingItem.name}): ${err.message}`,
                );
              } finally {
                if (detailPage) {
                  await detailPage.close().catch(() => undefined);
                }
              }
            }
          }
          categoriesProcessed++;
        } catch (err) {
          categoriesFailed++;
          this.logger.error(
            `[HS] category failed (${category.name}) for store ${storeId}: ${err.message}`,
          );
        }
      }

      this.logger.log(
        `[HS] products-for-store storeId=${storeId} finished: categoriesProcessed=${categoriesProcessed}, productsProcessed=${productsProcessed}`,
      );
      return { categoriesProcessed, categoriesFailed, productsProcessed };
    } catch (err) {
      this.logger.error(
        `[HS] products-for-store storeId=${storeId} CRITICAL failure: ${err.message}`,
      );
      throw err;
    } finally {
      await scraper.close();
    }
  }

  private async handleDailyRefreshHungerStation(job: Job<IngestionJobDto>) {
    const allStores = await this.storesService.findActiveByPlatform(
      IngestionPlatform.HUNGERSTATION,
    );
    const stores = allStores.filter((s) =>
      isMajorSupermarket(s.merchant?.name_en, s.merchant?.name_ar),
    );

    let enqueued = 0;
    let skipped = 0;
    const dateSuffix = this.todayDateSuffix();

    for (const [index, store] of stores.entries()) {
      try {
        const jobId = `hs-daily-${store.id}-${dateSuffix}`;
        await this.ingestionQueue.add(
          'products-for-store',
          {
            platform: IngestionPlatform.HUNGERSTATION,
            mode: IngestionJobMode.PRODUCTS_FOR_STORE,
            storeId: store.id,
          } as IngestionJobDto,
          {
            ...INGESTION_JOB_OPTIONS,
            jobId,
            delay: index * HS_DAILY_STAGGER_MS,
          },
        );
        enqueued++;
      } catch (err) {
        skipped++;
        this.logger.error(
          `[HS] daily refresh enqueue failed for store ${store.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `[HS] daily refresh dispatcher: enqueued=${enqueued}, skipped=${skipped}`,
    );

    return { enqueued, skipped };
  }

  private async handleGtinBackfill(job: Job<IngestionJobDto>) {
    // Comment 2: Acquire lock before run() starts and release in finally block
    // Uses Semaphore with concurrency=1 for proper async locking
    return this.gtinBackfillLock.run(async () => {
      try {
        const { dryRun, maxProducts, maxOffProducts, brandsOverride, useDump, rebuildPool, enableAiMatch, rebuildAiCache, rebuildBrandAliasCache, ignoreBrandAliasCache, enableEmbeddingMatch, rebuildEmbeddingCache, embeddingOnly, ignoreAiVerdictCache, aiVerdictProviderIsolation } = job.data;
        this.logger.log('Starting GTIN Backfill...');
        const stats = await this.gtinBackfillService.run({
          dryRun,
          maxProducts,
          maxOffProducts,
          brandsOverride,
          useDump,
          rebuildPool,
          enableAiMatch,
          rebuildAiCache,
          rebuildBrandAliasCache,
          ignoreBrandAliasCache,
          enableEmbeddingMatch,
          rebuildEmbeddingCache,
          embeddingOnly,
          ignoreAiVerdictCache,
          aiVerdictProviderIsolation,
        });
        this.logger.log(`GTIN Backfill completed: ${JSON.stringify(stats)}`);
        if (stats.reportDir) {
          this.logger.log(`GTIN Backfill report: ${stats.reportDir}`);
        }
        return stats;
      } catch (error) {
        this.logger.error(`GTIN Backfill failed: ${error.message}`, error.stack);
        throw error;
      }
      // Lock is automatically released in finally block by Semaphore.run()
    });
  }

  private async handleOffImport(job: Job<IngestionJobDto>) {
    return this.offImportLock.run(async () => {
      try {
        const opts = job.data as unknown as OffImportJobDto;
        this.logger.log('Starting OFF Import...');
        const stats = await this.offImportService.run(opts);
        this.logger.log(`OFF Import completed: ${JSON.stringify(stats)}`);
        return stats;
      } catch (error) {
        this.logger.error(`OFF Import failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleOffEnrichment(job: Job<IngestionJobDto>) {
    return this.offEnrichmentLock.run(async () => {
      try {
        const opts = job.data as unknown as OffEnrichmentJobDto;
        this.logger.log('Starting OFF Enrichment...');
        const stats = await this.offEnrichmentService.run(opts);
        this.logger.log(`OFF Enrichment completed: ${JSON.stringify(stats)}`);
        return stats;
      } catch (error) {
        this.logger.error(`OFF Enrichment failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleOffPriceLinking(job: Job<IngestionJobDto>) {
    return await this.offPriceLinkingLock.run(async () => {
      this.logger.log(`Starting OFF price linking job ${job.id}`);
      try {
        const result = await this.offPriceLinkerService.run(
          job.data as unknown as OffPriceLinkingJobDto,
        );
        this.logger.log(`Completed OFF price linking job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`OFF Price Linking failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleBarcodeListNames(job: Job<IngestionJobDto>) {
    return await this.barcodeListNamesLock.run(async () => {
      this.logger.log(`Starting barcode-list name scraping job ${job.id}`);
      try {
        const result = await this.barcodeListScraperService.run(
          job.data as unknown as BarcodeListNamesJobDto,
          job
        );
        this.logger.log(`Completed barcode-list name scraping job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Barcode-list name scraping failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }
  // ─── HS Catalog Scrape handler ──────────────────────────────────────────────

  private async handleHsCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.hsCatalogLock.run(async () => {
      this.logger.log(`Starting HS catalog scrape job ${job.id}`);
      try {
        const result = await this.hsCatalogScraperService.run(
          job.data as unknown as HsCatalogJobDto,
        );
        this.logger.log(`Completed HS catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`HS catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleHsCatalogScrapeCategory(job: Job<IngestionJobDto>) {
    // No explicit lock to allow parallel execution up to INGESTION_WORKER_CONCURRENCY
    this.logger.log(`Starting HS catalog category scrape job ${job.id}`);
    try {
      const result = await this.hsCatalogScraperService.run(
        job.data as unknown as HsCatalogJobDto,
      );
      this.logger.log(`Completed HS catalog category scrape job ${job.id}`);
      return result;
    } catch (error: any) {
      this.logger.error(`HS catalog category scrape failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async handleParkCenterCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.parkCenterCatalogLock.run(async () => {
      this.logger.log(`Starting Park Center catalog scrape job ${job.id}`);
      try {
        const result = await this.parkCenterCatalogScraperService.run(
          job.data as unknown as ParkCenterCatalogJobDto,
        );
        this.logger.log(`Completed Park Center catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Park Center catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleYasminCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.yasminCatalogLock.run(async () => {
      this.logger.log(`Starting Yasmin Store catalog scrape job ${job.id}`);
      try {
        const result = await this.yasminCatalogScraperService.run(
          job.data as unknown as YasminCatalogJobDto,
        );
        this.logger.log(`Completed Yasmin Store catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Yasmin Store catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleDukanExpressCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.dukanExpressCatalogLock.run(async () => {
      this.logger.log(`Starting Dukan Express catalog scrape job ${job.id}`);
      try {
        const result = await this.dukanExpressCatalogScraperService.run(
          job.data as unknown as DukanExpressCatalogJobDto,
        );
        this.logger.log(`Completed Dukan Express catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Dukan Express catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleMubarkiyahCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.mubarkiyahCatalogLock.run(async () => {
      this.logger.log(`Starting Mubarkiyah catalog scrape job ${job.id}`);
      try {
        const result = await this.mubarkiyahCatalogScraperService.run(
          job.data as unknown as MubarkiyahCatalogJobDto,
        );
        this.logger.log(`Completed Mubarkiyah catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Mubarkiyah catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleEtaamExpressCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.etaamExpressCatalogLock.run(async () => {
      this.logger.log(`Starting Etaam Express catalog scrape job ${job.id}`);
      try {
        const result = await this.etaamExpressCatalogScraperService.run(
          job.data as unknown as EtaamExpressCatalogJobDto,
        );
        this.logger.log(`Completed Etaam Express catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Etaam Express catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleAliaqtisadiaCatalogScrape(job: Job<IngestionJobDto>) {
    return await this.aliaqtisadiaCatalogLock.run(async () => {
      this.logger.log(`Starting Aliaqtisadia catalog scrape job ${job.id}`);
      try {
        const result = await this.aliaqtisadiaCatalogScraperService.run(
          job.data as unknown as AliaqtisadiaCatalogJobDto,
        );
        this.logger.log(`Completed Aliaqtisadia catalog scrape job ${job.id}`);
        return result;
      } catch (error: any) {
        this.logger.error(`Aliaqtisadia catalog scrape failed: ${error.message}`, error.stack);
        throw error;
      }
    });
  }

  private async handleSeedGtinPrices(job: Job<any>) {
    const { gtin } = job.data;
    this.logger.log(`Starting background seed of other store prices for GTIN: ${gtin}`);
    try {
      const product = await this.productsService.findByGtin(gtin);
      this.logger.log(`Successfully completed price seeding for GTIN: ${gtin}`);
      return { success: true, productId: product.id };
    } catch (error: any) {
      this.logger.error(`Failed background price seeding for GTIN ${gtin}: ${error.message}`);
      throw error;
    }
  }

  // ─── Scraper factory ────────────────────────────────────────────────────────

  private getScraper(platform: IngestionPlatform) {
    const baseConfig = {
      headless: true,
      cookieSessionPath: `./scraper-sessions/${platform}`,
    };
    switch (platform) {
      case IngestionPlatform.NINJA:
        return new NinjaScraper(this.robotsTxtService, {
          ...baseConfig,
          deviceProfile: 'mobile',
        });
      case IngestionPlatform.HUNGERSTATION:
        return new HungerStationScraper(this.robotsTxtService, {
          headless: baseConfig.headless,
          deviceProfile: 'mobile',
        });
      case IngestionPlatform.PANDA:
        return new PandaPriceScraper(this.robotsTxtService, {
          ...baseConfig,
          deviceProfile: 'desktop',
        });
      case IngestionPlatform.CARREFOUR:
        return new CarrefourPriceScraper(this.robotsTxtService, {
          ...baseConfig,
          deviceProfile: 'desktop',
        });
      case IngestionPlatform.OTHAIM:
        return new OthaimPriceScraper(this.robotsTxtService, {
          ...baseConfig,
          deviceProfile: 'mobile',
        });
      case IngestionPlatform.TAMIMI:
        return new TamimiPriceScraper(this.robotsTxtService, {
          ...baseConfig,
          deviceProfile: 'desktop',
        });
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  private async processProductData(
    platform: IngestionPlatform,
    scraper: BaseScraper,
    data: ScrapedProductData,
    page: any = null,
    options?: {
      storeDbId?: string;
      merchantName?: string;
      merchantNameAr?: string;
    },
  ) {
    if (!data.price || data.price <= 0) {
      this.logger.warn(
        `Skipping non-positive price for ${data.name} (${data.productPageUrl}): ${data.price}`,
      );
      return;
    }

    // 1. Image Processing & AI Extraction (Best Effort)
    let structuredLabel: StructuredLabelDto | null = null;
    let offAllergens: string[] = [];
    const enableAi = process.env.ENABLE_AI_EXTRACTION === 'true';

    // We only attempt OCR if we have both a valid image and an active browser page context
    if (enableAi && page && data.imageUrls.length > 0) {
      for (const imageUrl of data.imageUrls) {
        try {
          const base64 = await (scraper as any).downloadImageAsBase64(
            page,
            imageUrl,
          );
          structuredLabel = await this.labelCoreService.processImage(base64);
          this.logger.debug(
            `Successfully extracted AI structured data for product: ${data.name}`,
          );
          break;
        } catch (err) {
          // We log the warning but don't abort, as catalog images often aren't labels
          this.logger.warn(
            `AI extraction skipped for ${data.name} (image ${imageUrl}): ${err.message}`,
          );
        }
      }
    } else if (!enableAi) {
      this.logger.debug(
        `Skipping AI extraction for ${data.name} - ENABLE_AI_EXTRACTION is false or disabled.`,
      );
    } else {
      this.logger.debug(
        `Skipping AI extraction for ${data.name} - no page context or images.`,
      );
    }

    // Fallback 1: OpenFoodFacts via Text Search
    if (!structuredLabel && data.name) {
      this.logger.debug(
        `Attempting Free OpenFoodFacts Name Lookup for: ${data.name}`,
      );
      const offMatch = await this.openFoodFactsService.searchProductByName(
        data.name,
      );
      if (offMatch.label) {
        structuredLabel = offMatch.label;
        offAllergens = offMatch.allergens;
        this.logger.debug(`Found suitable OFF match for ${data.name}`);
      }
    }

    // Fallback 2: Fallback to structured items using scraped tags directly
    if (
      !structuredLabel &&
      ((data.ingredient_tags?.length ?? 0) > 0 ||
        (data.allergen_tags?.length ?? 0) > 0)
    ) {
      structuredLabel = {
        name_ar: data.name_ar || '',
        name_en: data.name || '',
        brand: data.brand || '',
        nutrition: {} as any,
        ingredients: (data.ingredient_tags || []).map((t) => ({
          name_en: t,
          name_ar: '',
        })),
      };
    }

    // 2. Find or Create Product (Robust Fallback Identity)
    // If no GTIN provided by catalog, we derive a unique one from the URL hash
    // to ensure we can match/update this product in future crawls without duplicates.
    const fallbackGtin = data.productPageUrl
      ? `URL-${Buffer.from(data.productPageUrl).toString('base64').slice(-16)}`
      : null;

    // Comment 2: Wire brand inference into catalog ingestion
    // Resolve brand and weight with proper precedence:
    // brand: data.brand → structuredLabel?.brand → inferred → 'Generic'
    // weight: data.weight → structuredLabel?.net_weight → inferred → ''
    const { brand: candidateBrand, weight: candidateWeight } = this.resolveCatalogBrandAndWeight(
      data,
      structuredLabel,
    );

    const product = await this.productClusteringService.findOrCreateProduct(
      data.gtin || fallbackGtin,
      candidateBrand,
      data.name || (structuredLabel?.name_en as string) || 'Unnamed Product',
      candidateWeight,
      data.name_ar,
    );

    if (!product) {
      this.rejectedProductsCount++;
      this.logger.warn(
        `Product rejected by clustering (metric total: ${this.rejectedProductsCount}): ${data.name} - ${data.productPageUrl}`,
      );
      return;
    }

    // 3. Enrich product metadata from scraped data (don't overwrite non-null with null)
    if (data.description && !product.description_en) {
      product.description_en = data.description;
    }
    if (data.description_ar && !product.description_ar) {
      product.description_ar = data.description_ar;
    }
    if (data.subcategory && !product.subcategory) {
      product.subcategory = data.subcategory;
    }
    if (data.allergen_tags && data.allergen_tags.length > 0) {
      product.allergen_tags = data.allergen_tags;
    }
    if (data.ingredient_tags && data.ingredient_tags.length > 0) {
      product.ingredient_tags = data.ingredient_tags;
    }

    // Set canonical image URLs from scraped data
    if (data.imageUrls.length > 0 && !product.image_front_url) {
      const frontIdx = data.imageTypes?.indexOf('front') ?? -1;
      product.image_front_url =
        frontIdx >= 0 ? data.imageUrls[frontIdx] : data.imageUrls[0];
    }
    if (
      data.imageTypes &&
      data.imageUrls.length > 0 &&
      !product.image_nutrition_url
    ) {
      const nutritionIdx = data.imageTypes.indexOf('nutrition');
      if (nutritionIdx >= 0) {
        product.image_nutrition_url = data.imageUrls[nutritionIdx];
      }
    }

    // Compute unit price if weight is known
    const computedUnitPrice = this.computeUnitPrice(
      data.price,
      product.net_weight_value,
      product.net_unit,
    );

    // 4. Database Updates in Transaction
    await this.dataSource.transaction(async (manager) => {
      // Update Product with AI data if available
      if (structuredLabel) {
        product.name_ar = product.name_ar || structuredLabel.name_ar;
        product.name_en = product.name_en || structuredLabel.name_en;

        if (structuredLabel.nutrition) {
          // Flatten/map structure to entity fields if they differ
          let nf = await manager.findOne(NutritionFact, {
            where: { product: { id: product.id } },
          });
          if (!nf) {
            nf = manager.create(NutritionFact, {
              ...structuredLabel.nutrition,
              product,
            });
          } else {
            Object.assign(nf, structuredLabel.nutrition);
          }
          await manager.save(nf);
          product.nutrition_data_complete = true;
        }

        if (
          structuredLabel.ingredients &&
          structuredLabel.ingredients.length > 0
        ) {
          // Use SfdaMatcherService to check ingredients
          const enrichedIngredients =
            await this.sfdaMatcherService.matchIngredients(
              structuredLabel.ingredients,
            );

          await manager.delete(Ingredient, { product: { id: product.id } });
          for (const ing of enrichedIngredients) {
            const ingredient = manager.create(Ingredient, {
              name_ar: ing.name_ar,
              name_en: ing.name_en,
              e_number: ing.e_number,
              sfda_status: ing.sfda_status,
              restriction_note: ing.restriction_note,
              product,
            });
            await manager.save(ingredient);
          }
        }
      }
      await manager.save(product);

      // Detect allergens from ingredient tags and upsert ProductAllergen rows
      const allergenSources: string[] = [
        ...offAllergens,
        ...(data.allergen_tags || []),
        ...(data.ingredient_tags || []),
      ];
      if (allergenSources.length > 0) {
        const detectedKeys = detectAllergensFromText(allergenSources);
        for (const key of detectedKeys) {
          const def = getAllergenByKey(key);
          if (!def) continue;
          await manager.upsert(
            ProductAllergen,
            {
              product_id: product.id,
              allergen_key: key,
              name_en: def.name_en,
              name_ar: def.name_ar,
              source: 'scrape',
            },
            ['product_id', 'allergen_key'],
          );
        }
      }

      // Find or Create Merchant (Transaction-safe)
      const merchantName = this.resolveMerchantName(platform, scraper, options);
      let merchant = await manager.findOne(Merchant, {
        where: { name_en: merchantName },
      });

      if (!merchant) {
        if (platform === IngestionPlatform.HUNGERSTATION) {
          const merchantData = {
            name_en: merchantName,
            name_ar: options?.merchantNameAr || merchantName,
            base_url: 'https://hungerstation.com',
            data_source_type: 'hungerstation',
          };

          // Use upsert to handle race conditions atomically
          await manager.upsert(Merchant, merchantData, ['name_en']);
          merchant = await manager.findOne(Merchant, {
            where: { name_en: merchantName },
          });
        }

        if (!merchant) {
          throw new Error(
            `Merchant ${merchantName} not found and could not be created.`,
          );
        }
      }

      const storeId =
        platform === IngestionPlatform.HUNGERSTATION
          ? options?.storeDbId || null
          : null;

      // store_id IS NULL rows represent chain-wide pricing (non-store-scoped platforms)
      // Check for price deduplication (if identical price exists for this merchant/product, just update scraped_at)
      const existingPrice = await manager.findOne(ProductPrice, {
        where: {
          product_id: product.id,
          merchant_id: merchant.id,
          store_id: storeId ?? IsNull(),
        },
        order: { scraped_at: 'DESC' },
      });

      if (existingPrice && existingPrice.price_sar_incl_vat === data.price) {
        // Price hasn't changed. Just bump the timestamp
        existingPrice.scraped_at = new Date();
        existingPrice.in_stock = data.inStock ?? existingPrice.in_stock;
        // Update unit/promo prices even on unchanged price
        if (computedUnitPrice) {
          existingPrice.unit_price_sar = computedUnitPrice.value;
          existingPrice.unit_price_unit = computedUnitPrice.unit;
        }
        if (data.promo_price && data.promo_price > 0) {
          existingPrice.promo_price_sar = data.promo_price;
        }
        await manager.save(existingPrice);
        if (product.gtin) {
          await this.pricesService.invalidateGtinCache(product.gtin);
        }
      } else {
        // Insert new Product Price
        const priceRecord = manager.create(ProductPrice, {
          product_id: product.id,
          merchant_id: merchant.id,
          store_id: storeId ?? undefined,
          price_sar_incl_vat: data.price,
          promo_price_sar:
            data.promo_price && data.promo_price > 0
              ? data.promo_price
              : undefined,
          unit_price_sar: computedUnitPrice?.value ?? undefined,
          unit_price_unit: computedUnitPrice?.unit ?? undefined,
          currency: 'SAR',
          source_url: data.productPageUrl,
          in_stock: data.inStock ?? true,
          scraped_at: new Date(),
        });
        await manager.save(priceRecord);
        if (product.gtin) {
          await this.pricesService.invalidateGtinCache(product.gtin);
        }
      }

      // Upsert Images
      const existingImages = await manager.find(ProductImage, {
        where: { product_id: product.id },
      });
      const existingUrls = new Set(existingImages.map((img) => img.url));

      for (let i = 0; i < data.imageUrls.length; i++) {
        const url = data.imageUrls[i];
        if (!existingUrls.has(url)) {
          const img = manager.create(ProductImage, {
            product_id: product.id,
            url: url,
            source: platform,
            image_type: data.imageTypes?.[i] || undefined,
          });
          await manager.save(img);
          existingUrls.add(url);
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

  private resolveMerchantName(
    platform: IngestionPlatform,
    scraper: BaseScraper,
    options?: { merchantName?: string },
  ): string {
    if (platform === IngestionPlatform.HUNGERSTATION) {
      const chainName = options?.merchantName?.trim();
      if (chainName) return chainName;
    }
    return this.capitalize(platform);
  }

  /**
   * Compute unit price (per kg or per L) from the overall price and product weight.
   */
  private computeUnitPrice(
    price: number,
    weightValue?: number,
    weightUnit?: string,
  ): { value: number; unit: string } | null {
    if (!weightValue || weightValue <= 0 || !weightUnit) return null;

    const unit = weightUnit.toLowerCase();
    if (unit === 'g' || unit === 'kg') {
      const weightInKg = unit === 'g' ? weightValue / 1000 : weightValue;
      if (weightInKg <= 0) return null;
      return {
        value: Math.round((price / weightInKg) * 100) / 100,
        unit: 'kg',
      };
    }
    if (unit === 'ml' || unit === 'l') {
      const volumeInL = unit === 'ml' ? weightValue / 1000 : weightValue;
      if (volumeInL <= 0) return null;
      return { value: Math.round((price / volumeInL) * 100) / 100, unit: 'L' };
    }

    return null;
  }

  /**
   * Placeholder-aware resolver for catalog brand and weight.
   * Precedence for brand: data.brand → structuredLabel?.brand → inferred → 'Generic'
   * Precedence for weight: data.weight → structuredLabel?.net_weight → inferred → ''
   */
  private resolveCatalogBrandAndWeight(
    data: ScrapedProductData,
    structuredLabel: StructuredLabelDto | null,
  ): { brand: string; weight: string } {
    // Step 1: Resolve brand
    let resolvedBrand: string;
    
    // Check data.brand first
    if (data.brand && !isPlaceholderBrand(data.brand)) {
      resolvedBrand = data.brand;
    } else if (structuredLabel?.brand && !isPlaceholderBrand(structuredLabel.brand)) {
      // Check structuredLabel.brand second
      resolvedBrand = structuredLabel.brand;
    } else {
      // Try to infer from product name
      const productName = data.name || (structuredLabel?.name_en as string) || '';
      if (productName) {
        const knownBrandSlugs = GLOBAL_BRANDS_FOR_POOL.map(normalizeBrandStrict);
        const inference = inferBrandAndWeightFromName(productName, knownBrandSlugs);
        if (inference.brand) {
          resolvedBrand = inference.brand;
        } else {
          resolvedBrand = 'Generic';
        }
      } else {
        resolvedBrand = 'Generic';
      }
    }

    // Step 2: Resolve weight
    let resolvedWeight: string;

    // Check data.weight first
    if (data.weight) {
      resolvedWeight = data.weight;
    } else if (structuredLabel?.net_weight) {
      // Check structuredLabel.net_weight second
      resolvedWeight = structuredLabel.net_weight;
    } else {
      // Try to infer from product name (reuse single inference call)
      const productName = data.name || (structuredLabel?.name_en as string) || '';
      if (productName) {
        const knownBrandSlugs = GLOBAL_BRANDS_FOR_POOL.map(normalizeBrandStrict);
        const inference = inferBrandAndWeightFromName(productName, knownBrandSlugs);
        resolvedWeight = inference.weightRaw || '';
      } else {
        resolvedWeight = '';
      }
    }

    return { brand: resolvedBrand, weight: resolvedWeight };
  }
}
