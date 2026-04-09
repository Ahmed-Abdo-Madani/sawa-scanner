import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'ingestion-queue',
    }),
    BullModule.registerQueue({
      name: 'price-scrape-queue',
    }),
  ],
  providers: [IngestionService],
})
export class IngestionModule {}
