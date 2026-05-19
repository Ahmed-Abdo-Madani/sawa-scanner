import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Product } from '../entities/product.entity';
import { Merchant } from '../entities/merchant.entity';
import { INGESTION_JOB_OPTIONS } from './ingestion.service';
import { EtaamGtinScrapeJobDto } from './dto/etaam-gtin-job.dto';

@Injectable()
export class EtaamGtinService {
  private readonly logger = new Logger(EtaamGtinService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectQueue('etaam-gtin-queue')
    private readonly etaamQueue: Queue,
  ) {}

  async enqueueMissingGtins(
    limit: number = 1000,
    merchantName: string = 'HungerStation',
    similarityThreshold: number = 0.8,
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

    const query = this.productRepo
      .createQueryBuilder('product')
      .leftJoin('product.prices', 'price')
      .leftJoin('price.store', 'store')
      .where('product.gtin IS NULL')
      .andWhere('product.name_en IS NOT NULL')
      .andWhere('product.name_en != :empty', { empty: '' });

    if (merchantIds.length > 0) {
      const dataSourceName = merchantName.toLowerCase();
      query.andWhere(
        '(store.merchant_id IN (:...merchantIds) OR product.data_source = :dataSourceName)', 
        { merchantIds, dataSourceName }
      );
    }

    query.limit(limit);

    const products = await query.getMany();
    this.logger.log(`Found ${products.length} products without GTIN for merchant ${merchantName}`);

    let enqueued = 0;
    let skipped = 0;

    for (const product of products) {
      try {
        const jobId = `etaam-gtin-${product.id}`;
        
        await this.etaamQueue.add(
          'scrape-etaam-gtin',
          {
            productId: product.id,
            productName: product.name_en,
            threshold: similarityThreshold,
            dryRun,
          } as EtaamGtinScrapeJobDto,
          {
            ...INGESTION_JOB_OPTIONS,
            jobId, // Prevent duplicate enqueues
          }
        );
        enqueued++;
      } catch (err) {
        this.logger.error(`Failed to enqueue GTIN scrape for product ${product.id}: ${err.message}`);
        skipped++;
      }
    }

    this.logger.log(`Etaam GTIN Enqueue Summary: Enqueued=${enqueued}, Skipped=${skipped}`);
    return { enqueued, skipped };
  }
}
