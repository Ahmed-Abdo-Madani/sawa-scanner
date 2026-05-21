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
    this.logger.log(`[AR] Found ${products.length} products with Arabic names and no GTIN for merchant ${merchantName}`);

    let enqueued = 0;
    let skipped = 0;

    for (const product of products) {
      try {
        const jobId = `etaam-gtin-ar-${product.id}`;
        
        await this.etaamArQueue.add(
          'scrape-etaam-gtin-ar',
          {
            productId: product.id,
            productNameAr: product.name_ar,
            threshold: similarityThreshold,
            dryRun,
          } as EtaamGtinArScrapeJobDto,
          {
            ...INGESTION_JOB_OPTIONS,
            jobId, // Prevent duplicate enqueues
          }
        );
        enqueued++;
      } catch (err) {
        this.logger.error(`[AR] Failed to enqueue GTIN scrape for product ${product.id}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(`[AR] Etaam GTIN Arabic Enqueue Summary: Enqueued=${enqueued}, Skipped=${skipped}`);
    return { enqueued, skipped };
  }
}
