import { Test, TestingModule } from '@nestjs/testing';
import { IngestionService } from './ingestion.service';
import { IngestionJobDto, IngestionJobMode } from './dto/ingestion-job.dto';
import { ConflictException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';

describe('IngestionService', () => {
  let service: IngestionService;
  let mockQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    mockQueue = {
      getJobs: jest.fn(),
      add: jest.fn(),
      remove: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionService,
        {
          provide: getQueueToken('ingestion-queue'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<IngestionService>(IngestionService);
  });

  describe('addIngestionJob', () => {
    /**
     * Comment 4: Test 1 - New job creation
     * Verify that when no active jobs exist, a new GTIN backfill job is created successfully
     */
    it('should create new GTIN backfill job when queue is empty', async () => {
      mockQueue.getJobs.mockResolvedValue([]);
      const mockJob = { id: 'job-123' } as any;
      mockQueue.add.mockResolvedValue(mockJob);

      const dto: IngestionJobDto = {
        platform: 'hungerstation',
        mode: IngestionJobMode.GTIN_BACKFILL_OFF,
      };

      const response = await service.addIngestionJob(dto);

      expect(response).toBeDefined();
      expect(response.created).toBe(true);
      expect(response.message).toContain('queued successfully');
      expect(response.jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'gtin-backfill-off',
        dto,
        expect.objectContaining({
          attempts: 1,
          timeout: 4 * 60 * 60 * 1000,
        })
      );
      // Verify that options do NOT include a jobId (allowing BullMQ to generate a fresh one)
      const callArgs = mockQueue.add.mock.calls[0][2];
      expect(callArgs.jobId).toBeUndefined();
    });

    /**
     * Comment 4: Test 2 - In-flight duplicate rejection
     * Verify that when an active GTIN backfill job exists, new request is rejected with 409
     */
    it('should reject duplicate GTIN backfill when job is active', async () => {
      const mockActiveJob = {
        id: 'job-existing',
        name: 'gtin-backfill-off',
        getState: jest.fn().mockResolvedValue('active'),
      } as any;

      mockQueue.getJobs.mockResolvedValue([mockActiveJob]);

      const dto: IngestionJobDto = {
        platform: 'hungerstation',
        mode: IngestionJobMode.GTIN_BACKFILL_OFF,
      };

      try {
        await service.addIngestionJob(dto);
        fail('Expected ConflictException to be thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(ConflictException);
        const response = error.getResponse();
        expect(response).toEqual(
          expect.objectContaining({
            jobId: 'job-existing',
            created: false,
            message: expect.stringContaining('already'),
          })
        );
      }

      // Verify queue.add was never called (job not created)
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    /**
     * Comment 4: Test 3 - Fresh job after completed singleton cleanup
     * Verify that after cleaning up a stale singleton job, a new job is created successfully
     */
    it('should create fresh job after cleaning up stale singleton', async () => {
      mockQueue.getJobs.mockResolvedValue([]);
      mockQueue.remove.mockResolvedValue(1); // Successfully removed 1 job
      const mockJob = { id: 'job-456' } as any;
      mockQueue.add.mockResolvedValue(mockJob);

      const dto: IngestionJobDto = {
        platform: 'hungerstation',
        mode: IngestionJobMode.GTIN_BACKFILL_OFF,
      };

      const response = await service.addIngestionJob(dto);

      expect(response).toBeDefined();
      expect(response.created).toBe(true);
      expect(response.jobId).toBe('job-456');

      // Verify that remove was called to clean up stale singleton
      expect(mockQueue.remove).toHaveBeenCalledWith('gtin-backfill-off-singleton');

      // Verify that add was called without jobId option (testing the fresh ID generation)
      const callArgs = mockQueue.add.mock.calls[0][2];
      expect(callArgs.jobId).toBeUndefined();
    });

    /**
     * Comment 4: Test 4 - Regular non-GTIN ingestion job
     * Verify that non-GTIN backfill jobs (e.g., scrape) don't have the in-flight lock logic
     */
    it('should allow multiple concurrent scrape jobs', async () => {
      mockQueue.getJobs.mockResolvedValue([]); // getJobs not called for non-GTIN jobs
      const mockJob = { id: 'scrape-job-1' } as any;
      mockQueue.add.mockResolvedValue(mockJob);

      const dto: IngestionJobDto = {
        platform: 'hungerstation',
        mode: undefined, // Defaults to 'scrape-category'
      };

      const response = await service.addIngestionJob(dto);

      expect(response).toBeDefined();
      expect(response.jobId).toBe('scrape-job-1');
      // For non-GTIN jobs, created flag should not be set
      expect(response.created).toBeUndefined();

      // Verify queue.getJobs was not called (no in-flight lock for non-GTIN jobs)
      expect(mockQueue.getJobs).not.toHaveBeenCalled();
    });
  });
});
