import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestionJobDto, IngestionJobMode } from './dto/ingestion-job.dto';

export const INGESTION_JOB_OPTIONS = {
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
  ) { }

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

    const job = await this.ingestionQueue.add(
      jobName,
      dto,
      INGESTION_JOB_OPTIONS,
    );

    return { jobId: job.id };
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
