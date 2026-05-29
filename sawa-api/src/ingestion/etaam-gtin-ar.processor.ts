import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { SallaGtinArScraper } from './scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from './scraper/zid-gtin-ar-scraper';
import { EtaamGtinArScrapeJobDto } from './dto/etaam-gtin-ar-job.dto';

const BROWSER_CRASH_PATTERNS = [
  'Target page',
  'context or browser has been closed',
  'Browser has been closed',
  'Connection closed',
];

function isBrowserCrash(err: Error): boolean {
  return BROWSER_CRASH_PATTERNS.some((p) => err.message?.includes(p));
}

@Processor('etaam-gtin-ar-queue', {
  concurrency: 1, // Sequential processing to prevent rate limiting
  lockDuration: 300000,
  stalledInterval: 60000,
})
export class EtaamGtinArProcessor extends WorkerHost implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(EtaamGtinArProcessor.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly sallaScraper: SallaGtinArScraper,
    private readonly zidScraper: ZidGtinArScraper,
  ) {
    super();
    this.logger.log('EtaamGtinArProcessor (Arabic Multi-Store) initialized and ready.');
  }

  async onModuleInit() {
    if (process.env.DISABLE_QUEUE_PROCESSORS === 'true') {
      this.logger.warn('DISABLE_QUEUE_PROCESSORS is enabled. Pausing Etaam GTIN Arabic worker...');
      await this.worker.pause();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Module shutting down — closing shared multi-store Arabic browsers...');
    await this.sallaScraper.close().catch(() => undefined);
    await this.zidScraper.close().catch(() => undefined);
  }

  async process(job: Job<EtaamGtinArScrapeJobDto>): Promise<any> {
    const {
      productId,
      productNameAr,
      threshold = 0.7,
      dryRun = false,
      storeUrl = 'https://etaamexpress.com',
      storePlatform = 'salla',
    } = job.data;

    this.logger.log(
      `[AR] Processing GTIN job for product: ${productId} - ${productNameAr} (Store: ${storeUrl}, Platform: ${storePlatform}, Dry Run: ${dryRun})`,
    );

    const scraper = storePlatform === 'zid' ? this.zidScraper : this.sallaScraper;

    await scraper.ensureLaunched();

    try {
      const product = await this.productRepo.findOne({
        where: { id: productId },
        relations: ['images'],
      });

      if (!product) {
        this.logger.warn(`[AR] Product ${productId} not found in DB.`);
        return { success: false, reason: 'product-not-found' };
      }

      if (product.gtin) {
        this.logger.warn(`[AR] Product ${productId} already has a GTIN in the DB. Skipping update.`);
        return { success: false, reason: 'already-has-gtin' };
      }

      const localHashes = product.images
        ?.map((img) => img.image_hash)
        .filter((hash): hash is string => !!hash && hash !== 'FAILED') || [];

      this.logger.log(
        `[AR] Loaded ${localHashes.length} local image hash(es) for product ${productId}`,
      );

      const bestMatch = await scraper.searchAndGetBestMatch(
        productNameAr,
        threshold,
        localHashes,
        storeUrl,
      );

      if (!bestMatch) {
        this.logger.warn(`[AR] No match found for "${productNameAr}" on ${storeUrl} (Threshold: ${threshold})`);
        return { success: false, reason: 'no-match' };
      }

      this.logger.log(
        `[AR] Found match for "${productNameAr}" -> "${bestMatch.name}" (Similarity: ${bestMatch.similarity.toFixed(3)})`,
      );

      const gtin = await scraper.scrapeGtinFromProductPage(bestMatch.url);

      if (!gtin) {
        this.logger.warn(`[AR] Matched product page does not have a GTIN: ${bestMatch.url}`);
        return { success: false, reason: 'no-gtin' };
      }

      this.logger.log(`[AR] Extracted GTIN: ${gtin} for product ${productId}`);

      if (dryRun) {
        this.logger.log(`[AR] [DRY RUN] Would update product ${productId} with GTIN ${gtin}`);
        return { success: true, gtin, similarity: bestMatch.similarity, dryRun: true };
      } else {
        product.gtin = gtin;
        await this.productRepo.save(product);
        this.logger.log(`[AR] Successfully updated product ${productId} with GTIN ${gtin}`);
        return { success: true, gtin, similarity: bestMatch.similarity };
      }
    } catch (error) {
      this.logger.error(
        `[AR] Error processing GTIN for product ${productId} on ${storeUrl}: ${error.message}`,
        error.stack,
      );
      if (isBrowserCrash(error)) {
        this.logger.warn('[AR] Browser crash detected — closing for re-launch on next job.');
        await scraper.close().catch(() => undefined);
      }
      throw error;
    }
  }
}
