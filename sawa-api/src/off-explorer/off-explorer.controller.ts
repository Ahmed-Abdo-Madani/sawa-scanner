import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  Res,
  NotFoundException,
  Body,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Response } from 'express';
import { Repository } from 'typeorm';
import { join } from 'path';
import { AdminGuard } from '../auth/admin.guard';
import { Public } from '../auth/public.decorator';
import { Product } from '../entities/product.entity';
import { OffExplorerIndexService } from './off-explorer-index.service';
import { OffExplorerQueryDto } from './dto/off-explorer-query.dto';

interface BootstrapDto {
  secret: string;
}

@Controller('admin/off-explorer')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OffExplorerController {
  constructor(
    private readonly indexService: OffExplorerIndexService,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
  ) {}

  @Public()
  @Get()
  getUI(@Res() res: Response): void {
    res.sendFile('public/off-explorer/index.html', { root: process.cwd() });
  }

  @Public()
  @Post('bootstrap')
  @HttpCode(200)
  bootstrap(@Body() dto: BootstrapDto, @Res() res: Response): void {
    const devSecret = dto.secret?.trim();
    const DEV_ADMIN_SECRET = process.env.DEV_ADMIN_SECRET;

    if (
      process.env.NODE_ENV !== 'development' ||
      !DEV_ADMIN_SECRET ||
      !devSecret ||
      devSecret !== DEV_ADMIN_SECRET
    ) {
      throw new BadRequestException('Invalid or missing dev admin secret');
    }

    // Set HttpOnly cookie that FirebaseAuthGuard will validate.
    // Node: At this point, NODE_ENV is narrowed to 'development' by the guard above.
    res.cookie('__admin_session', 'admin', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({ success: true });
  }

  @UseGuards(AdminGuard)
  @Get('stats')
  getStats(): ReturnType<OffExplorerIndexService['getStats']> {
    return this.indexService.getStats();
  }

  @UseGuards(AdminGuard)
  @Get('products')
  async queryProducts(@Query() dto: OffExplorerQueryDto): Promise<ReturnType<OffExplorerIndexService['query']>> {
    return await this.indexService.query(dto);
  }

  @UseGuards(AdminGuard)
  @Get('products/:gtin')
  async getProductDetail(@Param('gtin') gtin: string) {
    const product = await this.indexService.getProductRaw(gtin);
    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found in OFF`);
    }
    return product;
  }

  @UseGuards(AdminGuard)
  @Post('index/rebuild')
  async rebuildIndex() {
    const result = await this.indexService.rebuildIndex();
    return { rebuilt: true, ...result };
  }

  @UseGuards(AdminGuard)
  @Get('db-comparison/:gtin')
  async dbComparison(@Param('gtin') gtin: string) {
    const [off, db] = await Promise.all([
      this.indexService.getProductRaw(gtin),
      this.productRepo.findOne({ where: { gtin } }),
    ]);

    return { off, db };
  }
}
