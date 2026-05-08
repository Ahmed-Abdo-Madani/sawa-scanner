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
}
