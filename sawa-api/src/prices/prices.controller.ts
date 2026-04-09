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
      price_sar_incl_vat: p.price_sar_incl_vat,
      scraped_at: p.scraped_at,
    }));
  }
}
