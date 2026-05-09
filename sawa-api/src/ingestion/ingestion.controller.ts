import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  NotFoundException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import * as path from 'path';
import { IngestionService } from './ingestion.service';
import { IngestionJobDto, IngestionJobMode, GtinBackfillJobDto } from './dto/ingestion-job.dto';
import { OffImportJobDto } from './dto/off-import-job.dto';
import { OffEnrichmentJobDto } from './dto/off-enrichment-job.dto';
import { OffPriceLinkingJobDto } from './dto/off-price-linking-job.dto';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { getOffPoolFilter, getOffPoolHash } from './constants/off-pool';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly dumpService: OpenFoodFactsDumpService,
  ) {}

  @Post('jobs')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async createJob(@Body() dto: IngestionJobDto) {
    return this.ingestionService.addIngestionJob(dto);
  }

  @Post('backfill-gtins')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async triggerBackfill(@Body() backfillDto: GtinBackfillJobDto) {
    // Convert GtinBackfillJobDto to IngestionJobDto with mode set to GTIN_BACKFILL_OFF
    // Note: platform is not included for backfill jobs, as it's not used by the backfill processor
    const dto: IngestionJobDto = {
      ...backfillDto,
      mode: IngestionJobMode.GTIN_BACKFILL_OFF,
    };
    return this.ingestionService.addIngestionJob(dto);
  }

  @Post('off-import')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async triggerOffImport(@Body() importDto: OffImportJobDto) {
    const dto: IngestionJobDto = {
      ...importDto,
      mode: IngestionJobMode.OFF_IMPORT,
    };
    return this.ingestionService.addIngestionJob(dto);
  }

  @Post('off-enrichment')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async triggerOffEnrichment(@Body() enrichDto: OffEnrichmentJobDto) {
    const dto: IngestionJobDto = {
      ...enrichDto,
      mode: IngestionJobMode.OFF_ENRICHMENT,
    };
    return this.ingestionService.addIngestionJob(dto);
  }

  @Post('off-pool/rebuild')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async rebuildOffPool() {
    const filter = getOffPoolFilter();
    const poolHash = getOffPoolHash(filter);
    const sliceDir = path.join(process.cwd(), 'uploads', 'off-slice');
    const slicePath = path.join(sliceDir, `off_pool_${poolHash}.ndjson.gz`);

    const result = await this.dumpService.materializeSlice(filter, slicePath);

    return {
      written: result.written,
      durationMs: result.durationMs,
      slicePath,
    };
  }

  @Post('off-price-linking')
  async startOffPriceLinking(@Body() dto: OffPriceLinkingJobDto) {
    return this.ingestionService.addIngestionJob({
      mode: IngestionJobMode.OFF_PRICE_LINKING,
      ...dto,
    });
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const status = await this.ingestionService.getJobStatus(id);
    if (!status) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return status;
  }
}
