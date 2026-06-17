import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IngestionService } from './ingestion.service';
import { IngestionJobMode } from './dto/ingestion-job.dto';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ScrapeQueueEntry {
  id: string;
  storeId: string;
  storeUrl: string;
  merchantName: string;
  districtName: string;
  platform: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

@Injectable()
export class StoreScrapeQueueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StoreScrapeQueueService.name);
  private readonly configPath = path.join(process.cwd(), 'uploads', 'store-scrape-queue.json');
  private tickInterval: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly ingestionService: IngestionService,
    @InjectQueue('ingestion-queue')
    private readonly ingestionQueue: Queue,
  ) {}

  onApplicationBootstrap() {
    this.ensureUploadsDir();
    
    // Start queue manager tick loop every 30 seconds
    this.tickInterval = setInterval(() => this.tick(), 30000);
    this.logger.log('StoreScrapeQueueService started tick loop (30s interval)');
    
    // Run initial tick check after 10s to let server stabilize
    setTimeout(() => this.tick(), 10000);
  }

  private ensureUploadsDir() {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
  }

  private loadQueue(): ScrapeQueueEntry[] {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (err: any) {
      this.logger.error(`Failed to load store scrape queue: ${err.message}`);
    }
    return [];
  }

  private saveQueue(queue: ScrapeQueueEntry[]) {
    try {
      this.ensureUploadsDir();
      fs.writeFileSync(this.configPath, JSON.stringify(queue, null, 2), 'utf-8');
    } catch (err: any) {
      this.logger.error(`Failed to save store scrape queue: ${err.message}`);
    }
  }

  async addToQueue(storeIds: string[]): Promise<number> {
    const stores = await this.dataSource.manager.query(`
      SELECT s.id, s.source_url, s.platform, m.name_en as merchant_name, s.district_name_en as district
      FROM store s
      LEFT JOIN merchant m ON s.merchant_id = m.id
      WHERE s.id = ANY($1) AND s.is_active = true
    `, [storeIds]);

    if (stores.length === 0) return 0;

    const queue = this.loadQueue();
    let addedCount = 0;

    for (const store of stores) {
      // Avoid duplicate enqueues for the same store if it's already pending or processing
      const exists = queue.some(
        (entry) => entry.storeId === store.id && (entry.status === 'pending' || entry.status === 'processing')
      );

      if (!exists) {
        queue.push({
          id: uuidv4(),
          storeId: store.id,
          storeUrl: store.source_url,
          merchantName: store.merchant_name || 'Unknown Store',
          districtName: store.district || 'Unknown District',
          platform: store.platform,
          status: 'pending',
          createdAt: new Date().toISOString(),
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.saveQueue(queue);
      this.logger.log(`Added ${addedCount} stores to the paced scrape queue`);
      // Run immediate tick check to start processing if idle
      this.tick();
    }

    return addedCount;
  }

  async getQueueStatus() {
    const queue = this.loadQueue();
    const pending = queue.filter(e => e.status === 'pending');
    const processing = queue.filter(e => e.status === 'processing');
    const completedCount = queue.filter(e => e.status === 'completed').length;
    const failedCount = queue.filter(e => e.status === 'failed').length;

    return {
      summary: {
        pendingCount: pending.length,
        processingCount: processing.length,
        completedCount,
        failedCount,
        totalInQueue: queue.length
      },
      activeEntries: [...processing, ...pending].slice(0, 100), // Return active + pending (limit to 100)
    };
  }

  async clearQueue() {
    this.saveQueue([]);
    this.logger.log('Paced store scrape queue cleared');
    return { success: true };
  }

  async tick() {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const queue = this.loadQueue();
      if (queue.length === 0) {
        this.isTicking = false;
        return;
      }

      // Step 1: Query BullMQ to find what is actively running or waiting
      const bullJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeUrlsInBull = new Set<string>();

      for (const job of bullJobs) {
        if (job.name === 'hs-catalog-scrape' || job.name === 'hs-catalog-scrape-category') {
          if (job.data?.storeUrl) {
            activeUrlsInBull.add(job.data.storeUrl);
          }
        }
      }

      // Step 2: Update status of processing stores that finished
      let queueModified = false;
      for (const entry of queue) {
        if (entry.status === 'processing') {
          if (!activeUrlsInBull.has(entry.storeUrl)) {
            // Store has finished processing all categories
            entry.status = 'completed';
            entry.finishedAt = new Date().toISOString();
            queueModified = true;
            this.logger.log(`Paced Scraper: Store scrape finished for ${entry.merchantName} (${entry.districtName})`);
          }
        }
      }

      // Step 3: Enqueue next pending store if concurrency limit not exceeded
      const MAX_CONCURRENT_STORES = 1; // Exactly 1 store at a time to prevent RAM overload
      const currentProcessingCount = queue.filter(e => e.status === 'processing').length;

      if (currentProcessingCount < MAX_CONCURRENT_STORES) {
        const nextPending = queue.find(e => e.status === 'pending');
        if (nextPending) {
          nextPending.status = 'processing';
          nextPending.startedAt = new Date().toISOString();
          queueModified = true;

          this.logger.log(`Paced Scraper: Launching scrape for ${nextPending.merchantName} (${nextPending.districtName})`);

          try {
            await this.ingestionService.addIngestionJob({
              platform: nextPending.platform,
              mode: IngestionJobMode.HS_CATALOG_SCRAPE,
              storeUrl: nextPending.storeUrl,
              dryRun: false,
            } as any);
          } catch (err: any) {
            this.logger.error(`Failed to trigger BullMQ job for ${nextPending.merchantName}: ${err.message}`);
            nextPending.status = 'failed';
            nextPending.finishedAt = new Date().toISOString();
            nextPending.error = err.message;
          }
        }
      }

      // Keep logs size under control: clean completed/failed entries older than 2 days
      const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const filteredQueue = queue.filter(entry => {
        if (entry.status === 'completed' || entry.status === 'failed') {
          const finishTime = entry.finishedAt ? new Date(entry.finishedAt).getTime() : 0;
          return finishTime > twoDaysAgo;
        }
        return true;
      });

      if (filteredQueue.length !== queue.length) {
        queueModified = true;
      }

      if (queueModified) {
        this.saveQueue(filteredQueue);
      }
    } catch (err: any) {
      this.logger.error(`Error in StoreScrapeQueueService tick: ${err.message}`, err.stack);
    } finally {
      this.isTicking = false;
    }
  }
}
