import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { EtaamGtinScraper } from './scraper/etaam-gtin-scraper';
import { EtaamGtinScrapeJobDto } from './dto/etaam-gtin-job.dto';

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

@Processor('etaam-gtin-queue', {
  concurrency: 3, // 3 concurrent pages on a single persistent browser
  lockDuration: 300000,
  stalledInterval: 60000,
})
export class EtaamGtinProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger(EtaamGtinProcessor.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    private readonly etaamGtinScraper: EtaamGtinScraper,
  ) {
    super();
    this.logger.log('EtaamGtinProcessor initialized and ready.');
  }

  /** Shut down the shared browser cleanly when the NestJS module is destroyed. */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Module shutting down — closing shared Etaam browser...');
    await this.etaamGtinScraper.close();
  }

  async process(job: Job<EtaamGtinScrapeJobDto>): Promise<any> {
    const { productId, productName, threshold = 0.8, dryRun = false } = job.data;

    this.logger.log(
      `Processing Etaam GTIN job for product: ${productId} - ${productName} (Dry Run: ${dryRun})`,
    );

    // Reuse the persistent browser; launch once if it hasn't started yet.
    await this.etaamGtinScraper.ensureLaunched();

    try {
      // 1. Search for the best match
      const bestMatch = await this.etaamGtinScraper.searchAndGetBestMatch(
        productName,
        threshold,
      );

      if (!bestMatch) {
        this.logger.warn(`No match found for ${productName} (Threshold: ${threshold})`);
        return { success: false, reason: 'no-match' };
      }

      this.logger.log(
        `Found match for ${productName} -> ${bestMatch.name} (Similarity: ${bestMatch.similarity})`,
      );

      // 2. Scrape GTIN from product page
      const gtin = await this.etaamGtinScraper.scrapeGtinFromProductPage(bestMatch.url);

      if (!gtin) {
        this.logger.warn(`Matched product page does not have a GTIN: ${bestMatch.url}`);
        return { success: false, reason: 'no-gtin' };
      }

      this.logger.log(`Extracted GTIN: ${gtin} for product ${productId}`);

      // 3. Update the database
      const product = await this.productRepo.findOne({ where: { id: productId } });
      if (product) {
        if (!product.gtin) {
          if (dryRun) {
            this.logger.log(`[DRY RUN] Would update product ${productId} with GTIN ${gtin}`);
            return { success: true, gtin, similarity: bestMatch.similarity, dryRun: true };
          } else {
            product.gtin = gtin;
            await this.productRepo.save(product);
            this.logger.log(`Successfully updated product ${productId} with GTIN ${gtin}`);
            return { success: true, gtin, similarity: bestMatch.similarity };
          }
        } else {
          this.logger.warn(`Product ${productId} already has a GTIN in the DB. Skipping update.`);
          return { success: false, reason: 'already-has-gtin' };
        }
      } else {
        this.logger.warn(`Product ${productId} not found in DB.`);
        return { success: false, reason: 'product-not-found' };
      }
    } catch (error) {
      this.logger.error(
        `Error processing Etaam GTIN for product ${productId}: ${error.message}`,
        error.stack,
      );
      // If the browser context died, close it so ensureLaunched() re-creates it on the next job.
      if (isBrowserCrash(error)) {
        this.logger.warn('Browser crash detected — closing for re-launch on next job.');
        await this.etaamGtinScraper.close().catch(() => undefined);
      }
      throw error;
    }
    // ⚠️  NO close() in finally — browser stays alive for the next job.
  }
}
