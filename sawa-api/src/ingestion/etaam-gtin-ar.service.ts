import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Product } from '../entities/product.entity';
import { Merchant } from '../entities/merchant.entity';
import { INGESTION_JOB_OPTIONS } from './ingestion.service';
import { EtaamGtinArScrapeJobDto } from './dto/etaam-gtin-ar-job.dto';

@Injectable()
export class EtaamGtinArService {
  private readonly logger = new Logger(EtaamGtinArService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue('etaam-gtin-ar-queue')
    private readonly etaamArQueue: Queue,
  ) {}

  /**
   * Enqueues GTIN scrape jobs for HungerStation products that:
   *   1. Have a populated name_ar (Arabic name)
   *   2. Still have gtin = NULL
   *
   * This complements the English-based EtaamGtinService by searching
   * the Arabic version of Etaam Express, catching products that the
   * English search missed (e.g., Arabic-only named products or products
   * whose English name didn't match well).
   */
  async enqueueMissingGtins(
    limit: number = 1000,
    merchantName: string = 'HungerStation',
    similarityThreshold: number = 0.7,
    dryRun: boolean = false,
    storeUrl: string = 'https://etaamexpress.com',
    storePlatform: 'salla' | 'zid' = 'salla',
  ): Promise<{ enqueued: number; skipped: number }> {
    let merchantIds: string[] = [];
    if (merchantName) {
      const merchants = await this.merchantRepo.find({
        where: [
          { name_en: merchantName },
          { name_ar: merchantName },
        ],
      });
      merchantIds = merchants.map(m => m.id);
      if (merchantIds.length === 0) {
        this.logger.warn(`No merchant found for name: ${merchantName}`);
        return { enqueued: 0, skipped: 0 };
      }
    }

    // Query products that have an Arabic name but NO GTIN
    const query = this.productRepo
      .createQueryBuilder('product')
      .leftJoin('product.prices', 'price')
      .leftJoin('price.store', 'store')
      .where('product.gtin IS NULL')
      .andWhere('product.name_ar IS NOT NULL')
      .andWhere("product.name_ar != ''");

    if (merchantIds.length > 0) {
      const dataSourceName = merchantName.toLowerCase();
      query.andWhere(
        '(store.merchant_id IN (:...merchantIds) OR product.data_source = :dataSourceName)', 
        { merchantIds, dataSourceName }
      );
    }

    query.limit(limit);

    const products = await query.getMany();
    this.logger.log(`[AR] Found ${products.length} products with Arabic names and no GTIN for merchant ${merchantName} (Store: ${storeUrl}, Platform: ${storePlatform})`);

    const host = new URL(storeUrl).hostname.replace(/\./g, '-');
    let enqueued = 0;
    let skipped = 0;

    for (const product of products) {
      try {
        const jobId = `etaam-gtin-ar-${storePlatform}-${host}-${product.id}`;
        
        await this.etaamArQueue.add(
          'scrape-etaam-gtin-ar',
          {
            productId: product.id,
            productNameAr: product.name_ar,
            threshold: similarityThreshold,
            dryRun,
            storeUrl,
            storePlatform,
          } as EtaamGtinArScrapeJobDto,
          {
            ...INGESTION_JOB_OPTIONS,
            jobId, // Prevent duplicate enqueues
          }
        );
        enqueued++;
      } catch (err) {
        this.logger.error(`[AR] Failed to enqueue GTIN scrape for product ${product.id} on ${storeUrl}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(`[AR] ${storeUrl} GTIN Arabic Enqueue Summary: Enqueued=${enqueued}, Skipped=${skipped}`);
    return { enqueued, skipped };
  }

  /**
   * Enqueues GTIN scrape jobs for products across multiple stores in an interleaved (round-robin) order.
   * This maximizes scraping speed by switching hosts between consecutive jobs, reducing throttle sleeps.
   */
  async enqueueMissingGtinsInterleaved(
    limit: number = 1000,
    merchantName: string = 'HungerStation',
    similarityThreshold: number = 0.7,
    dryRun: boolean = false,
    stores: Array<{ url: string; platform: 'salla' | 'zid' }> = [],
    offset: number = 0,
  ): Promise<{ enqueued: number; skipped: number }> {
    let merchantIds: string[] = [];
    if (merchantName) {
      const merchants = await this.merchantRepo.find({
        where: [
          { name_en: merchantName },
          { name_ar: merchantName },
        ],
      });
      merchantIds = merchants.map(m => m.id);
      if (merchantIds.length === 0) {
        this.logger.warn(`No merchant found for name: ${merchantName}`);
        return { enqueued: 0, skipped: 0 };
      }
    }

    // Query products that have an Arabic name but NO GTIN
    const query = this.productRepo
      .createQueryBuilder('product')
      .leftJoin('product.prices', 'price')
      .leftJoin('price.store', 'store')
      .where('product.gtin IS NULL')
      .andWhere('product.name_ar IS NOT NULL')
      .andWhere("product.name_ar != ''");

    if (merchantIds.length > 0) {
      const dataSourceName = merchantName.toLowerCase();
      query.andWhere(
        '(store.merchant_id IN (:...merchantIds) OR product.data_source = :dataSourceName)', 
        { merchantIds, dataSourceName }
      );
    }

    query.orderBy('product.id', 'ASC')
         .limit(limit)
         .offset(offset);

    const products = await query.getMany();
    this.logger.log(`[AR-Interleaved] Found ${products.length} products with Arabic names and no GTIN for merchant ${merchantName} (offset: ${offset}, limit: ${limit})`);

    const targetStores = stores.length > 0 ? stores : [
      { url: 'https://parkcentersa.com', platform: 'zid' as const },
      { url: 'https://menhal.sa', platform: 'zid' as const },
      { url: 'https://store.shonaksa.com', platform: 'salla' as const },
      { url: 'https://yasminstore.com', platform: 'salla' as const },
      { url: 'https://mrlogman.com', platform: 'salla' as const },
    ];

    this.logger.log(`[AR-Interleaved] Target stores: ${JSON.stringify(targetStores.map(s => s.url))}`);

    let enqueued = 0;
    let skipped = 0;

    // Interleave enqueuing: outer loop is products, inner loop is stores
    for (const product of products) {
      for (const store of targetStores) {
        try {
          const host = new URL(store.url).hostname.replace(/\./g, '-');
          const jobId = `etaam-gtin-ar-${store.platform}-${host}-${product.id}`;

          await this.etaamArQueue.add(
            'scrape-etaam-gtin-ar',
            {
              productId: product.id,
              productNameAr: product.name_ar,
              threshold: similarityThreshold,
              dryRun,
              storeUrl: store.url,
              storePlatform: store.platform,
            } as EtaamGtinArScrapeJobDto,
            {
              ...INGESTION_JOB_OPTIONS,
              jobId, // Prevent duplicate enqueues
            }
          );
          enqueued++;
        } catch (err) {
          this.logger.error(`[AR-Interleaved] Failed to enqueue GTIN scrape for product ${product.id} on ${store.url}: ${err.message}`);
          skipped++;
        }
      }
    }

    this.logger.log(`[AR-Interleaved] Interleaved GTIN Arabic Enqueue Summary: Enqueued=${enqueued}, Skipped=${skipped}`);
    return { enqueued, skipped };
  }
}
