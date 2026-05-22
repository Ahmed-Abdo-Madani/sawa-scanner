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
  Delete,
} from '@nestjs/common';
import * as path from 'path';
import { IngestionService } from './ingestion.service';
import { IngestionJobDto, IngestionJobMode, GtinBackfillJobDto } from './dto/ingestion-job.dto';
import { OffImportJobDto } from './dto/off-import-job.dto';
import { OffEnrichmentJobDto } from './dto/off-enrichment-job.dto';
import { OffPriceLinkingJobDto } from './dto/off-price-linking-job.dto';
import { BarcodeListNamesJobDto } from './dto/barcode-list-names-job.dto';
import { HsCatalogJobDto } from './dto/hs-catalog-job.dto';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { getOffPoolFilter, getOffPoolHash } from './constants/off-pool';
import { EtaamGtinService } from './etaam-gtin.service';
import { EtaamGtinArService } from './etaam-gtin-ar.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('ingestion')
export class IngestionController {
  constructor(
    private readonly ingestionService: IngestionService,
    private readonly dumpService: OpenFoodFactsDumpService,
    private readonly etaamGtinService: EtaamGtinService,
    private readonly etaamGtinArService: EtaamGtinArService,
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

  @Post('barcode-list-names')
  async startBarcodeListNames(@Body() dto: BarcodeListNamesJobDto) {
    return this.ingestionService.addIngestionJob({
      mode: IngestionJobMode.BARCODE_LIST_NAMES,
      ...dto,
    });
  }

  @Post('hs-catalog-scrape')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async startHsCatalogScrape(@Body() dto: HsCatalogJobDto) {
    return this.ingestionService.addIngestionJob({
      mode: IngestionJobMode.HS_CATALOG_SCRAPE,
      ...dto,
    });
  }

  @Post('etaam-gtin')
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async startEtaamGtinScrape(@Body() body: { limit?: number; merchantName?: string; threshold?: number; dryRun?: boolean }) {
    const { limit = 1000, merchantName = 'HungerStation', threshold = 0.8, dryRun = false } = body;
    return this.etaamGtinService.enqueueMissingGtins(limit, merchantName, threshold, dryRun);
  }

  @Post('etaam-gtin-ar')
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async startEtaamGtinArScrape(
    @Body() body: {
      limit?: number;
      merchantName?: string;
      threshold?: number;
      dryRun?: boolean;
      storeUrl?: string;
      storePlatform?: 'salla' | 'zid';
    },
  ) {
    const {
      limit = 1000,
      merchantName = 'HungerStation',
      threshold = 0.7,
      dryRun = false,
      storeUrl = 'https://etaamexpress.com',
      storePlatform = 'salla',
    } = body;
    return this.etaamGtinArService.enqueueMissingGtins(
      limit,
      merchantName,
      threshold,
      dryRun,
      storeUrl,
      storePlatform,
    );
  }

  @Post('etaam-gtin-ar/multistore')
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async startEtaamGtinArMultistoreScrape(
    @Body() body: {
      limit?: number;
      merchantName?: string;
      threshold?: number;
      dryRun?: boolean;
      stores?: Array<{ url: string; platform: 'salla' | 'zid' }>;
      offset?: number;
    },
  ) {
    const {
      limit = 1000,
      merchantName = 'HungerStation',
      threshold = 0.7,
      dryRun = false,
      stores = [],
      offset = 0,
    } = body;
    return this.etaamGtinArService.enqueueMissingGtinsInterleaved(
      limit,
      merchantName,
      threshold,
      dryRun,
      stores,
      offset,
    );
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const status = await this.ingestionService.getJobStatus(id);
    if (!status) {
      throw new NotFoundException(`Job with ID ${id} not found`);
    }
    return status;
  }

  @Delete('jobs/stale/:jobName')
  async cleanStaleJobs(@Param('jobName') jobName: string) {
    return this.ingestionService.cleanStaleJobs(jobName);
  }
}
