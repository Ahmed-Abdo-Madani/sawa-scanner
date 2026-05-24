import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import { IngestionJobDto, IngestionJobMode } from './dto/ingestion-job.dto';

export const INGESTION_JOB_OPTIONS: JobsOptions & { timeout?: number } = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
  removeOnComplete: 100,
  removeOnFail: 50,
  timeout: 30 * 60 * 1000, // 30 minutes
};

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  async addIngestionJob(dto: IngestionJobDto) {
    this.logger.log(
      `Adding ingestion job for ${dto.platform}: mode=${dto.mode ?? 'scrape'}`,
    );

    let jobName = 'scrape-category';
    if (dto.mode === IngestionJobMode.DISCOVER_CITIES)
      jobName = 'discover-cities';
    else if (dto.mode === IngestionJobMode.DISCOVER_DISTRICTS)
      jobName = 'discover-districts';
    else if (dto.mode === IngestionJobMode.DISCOVER_BRANCHES)
      jobName = 'discover-branches';
    else if (dto.mode === IngestionJobMode.PRODUCTS_FOR_STORE)
      jobName = 'products-for-store';
    else if (dto.mode === IngestionJobMode.DAILY_REFRESH_HUNGERSTATION)
      jobName = 'daily-refresh-hungerstation';
    else if (dto.mode === IngestionJobMode.GTIN_BACKFILL_OFF)
      jobName = 'gtin-backfill-off';
    else if (dto.mode === IngestionJobMode.OFF_IMPORT)
      jobName = 'off-import';
    else if (dto.mode === IngestionJobMode.OFF_ENRICHMENT)
      jobName = 'off-enrichment';
    else if (dto.mode === IngestionJobMode.OFF_PRICE_LINKING)
      jobName = 'off-price-linking';
    else if (dto.mode === IngestionJobMode.BARCODE_LIST_NAMES)
      jobName = 'barcode-list-names';
    else if (dto.mode === IngestionJobMode.HS_CATALOG_SCRAPE)
      jobName = 'hs-catalog-scrape';
    else if (dto.mode === IngestionJobMode.PARKCENTER_CATALOG_SCRAPE)
      jobName = 'parkcenter-catalog-scrape';

    const options: JobsOptions & { timeout?: number; jobId?: string } = { ...INGESTION_JOB_OPTIONS };
    if (jobName === 'gtin-backfill-off') {
      options.attempts = 1;
      // Comment 3: Keep timeout at 4 hours until BullMQ durability verified
      // TODO(durability): Do not raise timeout until:
      //  1. Redis backend is verified durable across restarts
      //  2. Checkpoint/resume mechanism tested with failures
      //  3. attempts > 1 is proven safe for idempotent writes
      // Durable-resume work is owned by gtin-backfill.service.ts cursor-based checkpointing.
      options.timeout = 4 * 60 * 60 * 1000; // 4 hours

      // Comment 4: Use state-based in-flight lock instead of deterministic job ID
      // Enforce at most one active/waiting/delayed GTIN backfill to avoid duplicate AI calls and writes.
      
      // Check for any active GTIN backfill jobs
      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeGtinBackfills = activeJobs.filter(
        (job) => job.name === 'gtin-backfill-off'
      );
      
      if (activeGtinBackfills.length > 0) {
        const activeJobId = activeGtinBackfills[0].id;
        const activeJobState = await activeGtinBackfills[0].getState();
        // Return 409 with created: false flag
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `A GTIN backfill is already ${activeJobState} (job ID: ${activeJobId}). ` +
            `Wait for it to complete or manually remove it from the queue before starting a new run.`,
        });
        this.logger.warn(`Conflict: GTIN backfill already in-flight as ${activeJobState}`);
        throw err;
      }

      // Safety net: attempt to remove any old singleton job that may be persisted in completed state
      try {
        await this.ingestionQueue.remove('gtin-backfill-off-singleton');
        this.logger.debug('Cleaned up stale gtin-backfill-off-singleton job');
      } catch (removeErr: any) {
        // Ignore errors on best-effort cleanup
        this.logger.debug(`Could not clean stale singleton: ${removeErr instanceof Error ? removeErr.message : String(removeErr)}`);
      }

      // Let BullMQ generate a fresh unique jobId (no options.jobId set)
    } else if (jobName === 'off-import') {
      options.attempts = 1;
      options.timeout = 4 * 60 * 60 * 1000; // 4 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeOffImports = activeJobs.filter((job) => job.name === 'off-import');
      
      if (activeOffImports.length > 0) {
        const activeJobId = activeOffImports[0].id;
        const activeJobState = await activeOffImports[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `An OFF import is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: OFF import already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'off-enrichment') {
      options.attempts = 1;
      options.timeout = 6 * 60 * 60 * 1000; // 6 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeEnrichments = activeJobs.filter((job) => job.name === 'off-enrichment');
      
      if (activeEnrichments.length > 0) {
        const activeJobId = activeEnrichments[0].id;
        const activeJobState = await activeEnrichments[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `An OFF enrichment is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: OFF enrichment already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'off-price-linking') {
      options.attempts = 1;
      options.timeout = 8 * 60 * 60 * 1000; // 8 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeLinkings = activeJobs.filter((job) => job.name === 'off-price-linking');
      
      if (activeLinkings.length > 0) {
        const activeJobId = activeLinkings[0].id;
        const activeJobState = await activeLinkings[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `An OFF price linking is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: OFF price linking already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'barcode-list-names') {
      options.attempts = 1;
      options.timeout = 8 * 60 * 60 * 1000; // 8 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeBarcodeList = activeJobs.filter((job) => job.name === 'barcode-list-names');
      
      if (activeBarcodeList.length > 0) {
        const activeJobId = activeBarcodeList[0].id;
        const activeJobState = await activeBarcodeList[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `A barcode-list name scraping is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: barcode-list name scraping already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'hs-catalog-scrape') {
      options.attempts = 1;
      options.timeout = 8 * 60 * 60 * 1000; // 8 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activeHsCatalog = activeJobs.filter((job) => job.name === 'hs-catalog-scrape');
      
      if (activeHsCatalog.length > 0) {
        const activeJobId = activeHsCatalog[0].id;
        const activeJobState = await activeHsCatalog[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `An HS catalog scrape is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: HS catalog scrape already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'parkcenter-catalog-scrape') {
      options.attempts = 1;
      options.timeout = 8 * 60 * 60 * 1000; // 8 hours

      const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed', 'prioritized']);
      const activePC = activeJobs.filter((job) => job.name === 'parkcenter-catalog-scrape');
      
      if (activePC.length > 0) {
        const activeJobId = activePC[0].id;
        const activeJobState = await activePC[0].getState();
        const err = new ConflictException({
          jobId: activeJobId,
          created: false,
          message: `A Park Center catalog scrape is already ${activeJobState} (job ID: ${activeJobId}). Wait for it to complete.`,
        });
        this.logger.warn(`Conflict: Park Center catalog scrape already in-flight as ${activeJobState}`);
        throw err;
      }
    } else if (jobName === 'hs-catalog-scrape-category') {
      options.attempts = 3;
      options.timeout = 2 * 60 * 60 * 1000; // 2 hours
    }

    const job = await this.ingestionQueue.add(jobName, dto, options);

    const response: any = { jobId: job.id };
    if (jobName === 'gtin-backfill-off') {
      response.created = true;
      response.message = 'GTIN backfill job queued successfully.';
    } else if (jobName === 'off-import') {
      response.created = true;
      response.message = 'OFF import job queued successfully.';
    } else if (jobName === 'off-enrichment') {
      response.created = true;
      response.message = 'OFF enrichment job queued successfully.';
    } else if (jobName === 'off-price-linking') {
      response.created = true;
      response.message = 'OFF price linking job queued successfully.';
    } else if (jobName === 'barcode-list-names') {
      response.created = true;
      response.message = 'Barcode-list name scraping job queued successfully.';
    } else if (jobName === 'hs-catalog-scrape') {
      response.created = true;
      response.message = 'HS catalog scrape job queued successfully.';
    } else if (jobName === 'hs-catalog-scrape-category') {
      response.created = true;
      response.message = 'HS catalog category scrape job queued successfully.';
    } else if (jobName === 'parkcenter-catalog-scrape') {
      response.created = true;
      response.message = 'Park Center catalog scrape job queued successfully.';
    }
    return response;
  }

  async getJobStatus(jobId: string) {
    const job = await this.ingestionQueue.getJob(jobId);
    if (!job) return null;

    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue,
      failedReason: job.failedReason,
    };
  }

  /**
   * Clean stale/stuck jobs for a given job name.
   * This is needed when a distributed worker crashes and leaves
   * zombie jobs in 'active' state that block new runs.
   */
  async cleanStaleJobs(jobName: string): Promise<{ removed: number; ids: string[] }> {
    const activeJobs = await this.ingestionQueue.getJobs(['active', 'waiting', 'delayed']);
    const staleJobs = activeJobs.filter((job) => job.name === jobName);

    const removedIds: string[] = [];
    for (const job of staleJobs) {
      try {
        try {
          await job.remove();
        } catch (removeErr) {
          // If remove() fails due to lock, discard and move to failed
          await job.discard();
          await job.moveToFailed(new Error('Manually cleaned: stale/zombie job'), '0', false).catch(() => {});
          await job.remove().catch(() => {});
        }
        removedIds.push(String(job.id));
        this.logger.warn(`Removed stale ${jobName} job: ${job.id}`);
      } catch (err: any) {
        this.logger.warn(`Could not remove job ${job.id}: ${err.message}`);
      }
    }

    return { removed: removedIds.length, ids: removedIds };
  }
}
