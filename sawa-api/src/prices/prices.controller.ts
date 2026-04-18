import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PricesService } from './prices.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('products/:gtin/prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get()
  async getPrices(@Param('gtin') gtin: string) {
    const prices = await this.pricesService.findPricesByGtin(gtin);

    return prices.map((p) => ({
      merchant: p.merchant?.name_en || 'Unknown',
      merchant_ar: p.merchant?.name_ar || '',
      logo_url: p.merchant?.logo_url,
      source_url: p.source_url,
      price_sar_incl_vat: p.price_sar_incl_vat,
      in_stock: p.in_stock,
      scraped_at: p.scraped_at,
    }));
  }

  @Get('history')
  async getPriceHistory(@Param('gtin') gtin: string) {
    const history = await this.pricesService.findPriceHistory(gtin);
    return history.map((p) => ({
      merchant: p.merchant?.name_en || 'Unknown',
      merchant_ar: p.merchant?.name_ar || '',
      price_sar_incl_vat: p.price_sar_incl_vat,
      scraped_at: p.scraped_at,
    }));
  }

  @Get('by-store')
  async getPricesByStore(
    @Param('gtin') gtin: string,
    @Query('city') city: string,
    @Query('district') district?: string,
    @Query('vertical') vertical?: string,
  ) {
    if (!city) {
      throw new BadRequestException('Query parameter "city" is required');
    }

    const prices = await this.pricesService.findPricesByStore(gtin, {
      city,
      district,
      vertical,
    });

    return prices.map((p) => ({
      store_id: p.store_id,
      vertical: p.store?.vertical,
      merchant: {
        name_en: p.store?.merchant?.name_en,
        name_ar: p.store?.merchant?.name_ar,
        logo_url: p.store?.merchant?.logo_url,
      },
      city: {
        slug: p.store?.city_slug,
        name_ar: p.store?.city_name_ar,
        name_en: p.store?.city_name_en,
      },
      district: {
        slug: p.store?.district_slug,
        name_ar: p.store?.district_name_ar,
        name_en: p.store?.district_name_en,
      },
      source_url: p.store?.source_url,
      price_sar_incl_vat: p.price_sar_incl_vat,
      in_stock: p.in_stock,
      scraped_at: p.scraped_at,
    }));
  }
}
