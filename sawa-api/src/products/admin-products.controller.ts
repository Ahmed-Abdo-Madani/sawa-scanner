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
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AdminGuard } from '../auth/admin.guard';
import { AdminProductsService } from './admin-products.service';
import { AdminUpsertProductDto } from './dto/admin-upsert-product.dto';
import { AdminAssignGtinDto } from './dto/admin-assign-gtin.dto';
import { AdminMergeDto } from './dto/admin-merge.dto';

@Controller('admin')
@UseGuards(AdminGuard)
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
export class AdminProductsController {
  constructor(private readonly adminService: AdminProductsService) {}

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
  ) {
    return await this.adminService.listProductsNeedingGtin({
      page,
      pageSize,
      search,
      category,
      brand,
      gtinStatus,
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
}
