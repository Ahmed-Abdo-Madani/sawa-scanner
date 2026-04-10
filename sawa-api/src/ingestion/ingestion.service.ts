import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestionJobDto } from './dto/ingestion-job.dto';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectQueue('ingestion-queue') private readonly ingestionQueue: Queue,
  ) {}

  async addIngestionJob(dto: IngestionJobDto) {
    this.logger.log(`Adding ingestion job for ${dto.platform}: ${dto.categoryUrl}`);
    
    const job = await this.ingestionQueue.add('scrape-category', dto, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

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
