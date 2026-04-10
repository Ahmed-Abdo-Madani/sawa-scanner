import { Controller, Get, Param } from '@nestjs/common';
import { PricesService } from './prices.service';

@Controller('products/:gtin/prices')
export class PricesController {
  constructor(private readonly pricesService: PricesService) {}

  @Get()
  async getPrices(@Param('gtin') gtin: string) {
    const prices = await this.pricesService.findPricesByGtin(gtin);
    
    return prices.map(p => ({
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
    return history.map(p => ({
      merchant: p.merchant?.name_en || 'Unknown',
      merchant_ar: p.merchant?.name_ar || '',
      price_sar_incl_vat: p.price_sar_incl_vat,
      scraped_at: p.scraped_at,
    }));
  }
}
