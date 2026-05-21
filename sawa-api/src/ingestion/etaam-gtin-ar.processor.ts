import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { EtaamGtinArScraper } from './scraper/etaam-gtin-ar-scraper';
import { EtaamGtinArScrapeJobDto } from './dto/etaam-gtin-ar-job.dto';

/** Errors that indicate the browser/context died and must be re-launched. */
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
  concurrency: 1, // 1 page at a time to mimic human behavior and avoid rate-limiting
  lockDuration: 300000,
  stalledInterval: 60000,
})
export class EtaamGtinArProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(EtaamGtinArProcessor.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly etaamGtinArScraper: EtaamGtinArScraper,
  ) {
    super();
    this.logger.log('EtaamGtinArProcessor (Arabic) initialized and ready.');
  }

  /** Shut down the shared browser cleanly when the NestJS module is destroyed. */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Module shutting down — closing shared Etaam Arabic browser...');
    await this.etaamGtinArScraper.close();
  }

  async process(job: Job<EtaamGtinArScrapeJobDto>): Promise<any> {
    const { productId, productNameAr, threshold = 0.7, dryRun = false } = job.data;

    this.logger.log(
      `[AR] Processing Etaam GTIN job for product: ${productId} - ${productNameAr} (Dry Run: ${dryRun})`,
    );

    // Reuse the persistent browser; launch once if it hasn't started yet.
    await this.etaamGtinArScraper.ensureLaunched();

    try {
      // Find the database product along with its images relation
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

      // Extract all valid, non-failed perceptual hashes
      const localHashes = product.images
        ?.map((img) => img.image_hash)
        .filter((hash): hash is string => !!hash && hash !== 'FAILED') || [];

      this.logger.log(
        `[AR] Loaded ${localHashes.length} local image hash(es) for product ${productId}`,
      );

      // 1. Search Arabic Etaam for the best match (pass local hashes for perceptual image matching)
      const bestMatch = await this.etaamGtinArScraper.searchAndGetBestMatch(
        productNameAr,
        threshold,
        localHashes,
      );

      if (!bestMatch) {
        this.logger.warn(`[AR] No match found for "${productNameAr}" (Threshold: ${threshold})`);
        return { success: false, reason: 'no-match' };
      }

      this.logger.log(
        `[AR] Found match for "${productNameAr}" -> "${bestMatch.name}" (Similarity: ${bestMatch.similarity.toFixed(3)})`,
      );

      // 2. Scrape GTIN from product page
      const gtin = await this.etaamGtinArScraper.scrapeGtinFromProductPage(bestMatch.url);

      if (!gtin) {
        this.logger.warn(`[AR] Matched product page does not have a GTIN: ${bestMatch.url}`);
        return { success: false, reason: 'no-gtin' };
      }

      this.logger.log(`[AR] Extracted GTIN: ${gtin} for product ${productId}`);

      // 3. Update the database
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
        `[AR] Error processing Etaam GTIN for product ${productId}: ${error.message}`,
        error.stack,
      );
      // If the browser context died, close it so ensureLaunched() re-creates it on the next job.
      if (isBrowserCrash(error)) {
        this.logger.warn('[AR] Browser crash detected — closing for re-launch on next job.');
        await this.etaamGtinArScraper.close().catch(() => undefined);
      }
      throw error;
    }
    // ⚠️  NO close() in finally — browser stays alive for the next job.
  }
}
