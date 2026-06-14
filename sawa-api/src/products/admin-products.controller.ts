import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  Delete,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AdminGuard } from '../auth/admin.guard';
import { AdminProductsService } from './admin-products.service';
import { AdminUpsertProductDto } from './dto/admin-upsert-product.dto';
import { AdminAssignGtinDto } from './dto/admin-assign-gtin.dto';
import { AdminMergeDto } from './dto/admin-merge.dto';
import { LocalMatcherService } from './local-matcher.service';
import { SchedulerService } from './scheduler.service';
import { IngestionService } from '../ingestion/ingestion.service';
import { IngestionJobMode } from '../ingestion/dto/ingestion-job.dto';

@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AdminProductsController {
  constructor(
    private readonly adminService: AdminProductsService,
    private readonly schedulerService: SchedulerService,
    private readonly localMatcherService: LocalMatcherService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Get('products')
  async listMissingGtin(
    @Query('missingGtin') missingGtin: string,
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('search') search: string,
  ) {
    if (missingGtin !== 'true') {
      throw new BadRequestException('Only missing GTIN products can be listed via this route');
    }
    return await this.adminService.listMissingGtin({ page, pageSize, search });
  }

  @Get('products/needs-gtin')
  async listNeedsGtin(
    @Query('page') page: number,
    @Query('pageSize') pageSize: number,
    @Query('search') search: string,
    @Query('category') category: string,
    @Query('brand') brand?: string,
    @Query('gtinStatus') gtinStatus?: string,
    @Query('onlyMultiStore') onlyMultiStore?: string,
  ) {
    return await this.adminService.listProductsNeedingGtin({
      page,
      pageSize,
      search,
      category,
      brand,
      gtinStatus,
      onlyMultiStore,
    });
  }

  @Get('products/filters-meta')
  async getFiltersMeta() {
    return await this.adminService.getFilterOptions();
  }

  @Get('products/search')
  async searchByGtinPrefix(@Query('gtinPrefix') gtinPrefix: string) {
    return await this.adminService.searchByGtinPrefix(gtinPrefix);
  }

  @Get('products/:idOrGtin')
  async getOne(@Param('idOrGtin') idOrGtin: string) {
    return await this.adminService.getOne(idOrGtin);
  }

  @Post('products/upsert')
  async upsertByGtin(@Body() dto: AdminUpsertProductDto, @Request() req: any) {
    return await this.adminService.upsertByGtin(dto, req.user?.uid);
  }

  @Patch('products/:id/assign-gtin')
  async assignGtin(
    @Param('id') id: string,
    @Body() body: AdminAssignGtinDto,
    @Request() req: any,
  ) {
    return await this.adminService.assignGtin(id, body.gtin, req.user?.uid);
  }

  @Post('products/merge')
  async mergeProducts(@Body() body: AdminMergeDto, @Request() req: any) {
    return await this.adminService.mergeProducts(body.winnerId, body.loserId, req.user?.uid);
  }

  @Post('products/:id/images')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'ingredients', maxCount: 1 },
        { name: 'nutrition', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/products',
          filename: (_req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
          },
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
            return cb(new BadRequestException(`Unsupported image type: ${file.mimetype}`), false);
          }
          cb(null, true);
        },
      },
    ),
  )
  async attachImages(
    @Param('id') id: string,
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      ingredients?: Express.Multer.File[];
      nutrition?: Express.Multer.File[];
    },
    @Request() req: any,
  ) {
    return await this.adminService.attachImages(id, files, req.user?.uid);
  }

  @Get('merge-logs')
  async listMergeLogs(
    @Query('productId') productId: string,
    @Query('limit') limit: number,
  ) {
    return await this.adminService.listMergeLogs({ productId, limit });
  }

  @Get('dashboard/stats')
  async getDashboardStats() {
    return await this.adminService.getDashboardStats();
  }

  @Get('dashboard/districts/:district/stores')
  async getStoresByDistrict(@Param('district') district: string) {
    return await this.adminService.getStoresByDistrict(district);
  }

  @Post('dashboard/scrape-stores')
  async scrapeStores(@Body() body: { storeIds: string[] }) {
    if (!body.storeIds || !Array.isArray(body.storeIds)) {
      throw new BadRequestException('storeIds array is required');
    }
    const manager = (this.adminService as any).dataSource.manager;
    const stores = await manager.query(
      `SELECT id, source_url, platform FROM store WHERE id = ANY($1) AND is_active = true`,
      [body.storeIds]
    );

    const enqueued: string[] = [];
    for (const store of stores) {
      try {
        await this.ingestionService.addIngestionJob({
          platform: store.platform,
          mode: IngestionJobMode.HS_CATALOG_SCRAPE,
          storeUrl: store.source_url,
          dryRun: false,
        } as any);
        enqueued.push(store.id);
      } catch (err: any) {
        // Continue
      }
    }
    return { enqueuedCount: enqueued.length, enqueuedStoreIds: enqueued };
  }

  @Post('dashboard/scrape-zero-districts')
  async scrapeZeroDistricts(@Body() body: { limit?: number }) {
    await this.schedulerService.triggerScheduleManually('default-scrape-zero-districts');
    return { success: true, message: 'Zero-districts scraping batch triggered successfully.' };
  }

  @Post('dashboard/match/trigger')
  async triggerMatcher(@Body() body: { limit?: number; threshold?: number; dryRun?: boolean }) {
    return await this.localMatcherService.triggerMatching(body);
  }

  @Get('dashboard/match/status')
  async getMatcherStatus() {
    return this.localMatcherService.getStatus();
  }

  @Get('dashboard/schedules')
  async getSchedules() {
    return this.schedulerService.getSchedules();
  }

  @Post('dashboard/schedules')
  async upsertSchedule(@Body() body: any) {
    return this.schedulerService.upsertSchedule(body);
  }

  @Delete('dashboard/schedules/:id')
  async deleteSchedule(@Param('id') id: string) {
    return { success: this.schedulerService.deleteSchedule(id) };
  }

  @Post('dashboard/schedules/:id/trigger')
  async triggerSchedule(@Param('id') id: string) {
    return { success: await this.schedulerService.triggerScheduleManually(id) };
  }

  @Get('dashboard/schedules/logs')
  async getScheduleLogs() {
    return this.schedulerService.getLogs();
  }

  @Get('dashboard/queues/status')
  async getQueueStatus() {
    return await this.ingestionService.getQueueCounts();
  }

  @Post('dashboard/queues/clean')
  async cleanQueue(@Body() body: { types: any[] }) {
    const types = body.types || ['completed', 'failed'];
    return await this.ingestionService.cleanQueue(types);
  }
}
