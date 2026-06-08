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

    return prices.map((p) => {
      const isHungerStation = p.merchant?.name_en?.toLowerCase() === 'hungerstation' || p.store?.platform === 'hungerstation';
      let displayMerchant = (isHungerStation && p.store?.merchant) ? p.store.merchant : p.merchant;

      // Fallback: If it is HungerStation but has no store association, try to infer the merchant from the source_url
      if (isHungerStation && (!displayMerchant || displayMerchant.name_en?.toLowerCase() === 'hungerstation') && p.source_url) {
        try {
          const urlObj = new URL(p.source_url);
          const pathSegments = urlObj.pathname.split('/');
          const qcIndex = pathSegments.indexOf('qc');
          if (qcIndex !== -1 && pathSegments.length > qcIndex + 2) {
            const slug = pathSegments[qcIndex + 2];
            const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedSlug.includes('othaim')) {
              displayMerchant = { name_en: 'Othaim', name_ar: 'العثيم', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/564da9a81d46c97f906e970a5a2dfbb9.jpg' } as any;
            } else if (normalizedSlug.includes('panda')) {
              displayMerchant = { name_en: 'Panda', name_ar: 'بندا', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/c69e2c6082218055ee8ff69e8011be1b.jpg' } as any;
            } else if (normalizedSlug.includes('carrefour') || normalizedSlug.includes('karfour')) {
              displayMerchant = { name_en: 'Carrefour', name_ar: 'كارفور', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/4df0c068ce4914c6e91bf97d39a2cf1b.jpg' } as any;
            } else if (normalizedSlug.includes('danube')) {
              displayMerchant = { name_en: 'Danube', name_ar: 'الدانوب', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/ea1b0df3c156479f806e970a5a2dfbb9.jpg' } as any;
            } else if (normalizedSlug.includes('tamimi')) {
              displayMerchant = { name_en: 'Tamimi Markets', name_ar: 'أسواق التميمي', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/ea5e2e8f1d46c97f906e970a5a2dfbb9.jpg' } as any;
            } else if (normalizedSlug.includes('lulu')) {
              displayMerchant = { name_en: 'Lulu', name_ar: 'لولو', logo_url: 'https://images.deliveryhero.io/image/hungerstation/restaurant/logo/ea6e2e8f1d46c97f906e970a5a2dfbb9.jpg' } as any;
            } else if (normalizedSlug.includes('spinneys')) {
              displayMerchant = { name_en: 'Spinneys', name_ar: 'سبينس', logo_url: '' } as any;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      let logoUrl = displayMerchant?.logo_url || null;
      let baseUrl = displayMerchant?.base_url;
      if (!logoUrl && displayMerchant?.name_en) {
        const lowerName = displayMerchant.name_en.toLowerCase();
        if (lowerName.includes('lulu')) {
          baseUrl = 'https://www.luluhypermarket.com';
        } else if (lowerName.includes('othaim')) {
          baseUrl = 'https://www.othaimmarkets.com';
        } else if (lowerName.includes('panda')) {
          baseUrl = 'https://www.pfrh.com';
        } else if (lowerName.includes('tamimi')) {
          baseUrl = 'https://www.tamimimarkets.com';
        } else if (lowerName.includes('carrefour')) {
          baseUrl = 'https://www.carrefourksa.com';
        }
      }
      if (!logoUrl && baseUrl) {
        try {
          const hostname = new URL(baseUrl).hostname;
          logoUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
        } catch (e) {
          // ignore
        }
      }

      let merchantName = displayMerchant?.name_en || 'Unknown';
      let merchantNameAr = displayMerchant?.name_ar || '';
      if (isHungerStation) {
        merchantName = `${merchantName} (HungerStation)`;
        merchantNameAr = `${merchantNameAr || merchantName} (هنقرستيشن)`;
      }

      return {
        merchant: {
          name_en: merchantName,
          name_ar: merchantNameAr,
          logo_url: logoUrl,
        },
        source_url: p.source_url,
        price_sar_incl_vat: p.price_sar_incl_vat,
        in_stock: p.in_stock,
        scraped_at: p.scraped_at,
      };
    });
  }

  @Get('history')
  async getPriceHistory(@Param('gtin') gtin: string) {
    const history = await this.pricesService.findPriceHistory(gtin);
    return history.map((p) => {
      const isHungerStation = p.merchant?.name_en?.toLowerCase() === 'hungerstation' || p.store?.platform === 'hungerstation';
      let displayMerchant = (isHungerStation && p.store?.merchant) ? p.store.merchant : p.merchant;

      // Fallback: If it is HungerStation but has no store association, try to infer the merchant from the source_url
      if (isHungerStation && (!displayMerchant || displayMerchant.name_en?.toLowerCase() === 'hungerstation') && p.source_url) {
        try {
          const urlObj = new URL(p.source_url);
          const pathSegments = urlObj.pathname.split('/');
          const qcIndex = pathSegments.indexOf('qc');
          if (qcIndex !== -1 && pathSegments.length > qcIndex + 2) {
            const slug = pathSegments[qcIndex + 2];
            const normalizedSlug = slug.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normalizedSlug.includes('othaim')) {
              displayMerchant = { name_en: 'Othaim', name_ar: 'العثيم' } as any;
            } else if (normalizedSlug.includes('panda')) {
              displayMerchant = { name_en: 'Panda', name_ar: 'بندا' } as any;
            } else if (normalizedSlug.includes('carrefour') || normalizedSlug.includes('karfour')) {
              displayMerchant = { name_en: 'Carrefour', name_ar: 'كارفور' } as any;
            } else if (normalizedSlug.includes('danube')) {
              displayMerchant = { name_en: 'Danube', name_ar: 'الدانوب' } as any;
            } else if (normalizedSlug.includes('tamimi')) {
              displayMerchant = { name_en: 'Tamimi Markets', name_ar: 'أسواق التميمي' } as any;
            } else if (normalizedSlug.includes('lulu')) {
              displayMerchant = { name_en: 'Lulu', name_ar: 'لولو' } as any;
            } else if (normalizedSlug.includes('spinneys')) {
              displayMerchant = { name_en: 'Spinneys', name_ar: 'سبينس' } as any;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      let merchantName = displayMerchant?.name_en || 'Unknown';
      let merchantNameAr = displayMerchant?.name_ar || '';
      if (isHungerStation) {
        merchantName = `${merchantName} (HungerStation)`;
        merchantNameAr = `${merchantNameAr || merchantName} (هنقرستيشن)`;
      }

      return {
        merchant: {
          name_en: merchantName,
          name_ar: merchantNameAr,
        },
        price_sar_incl_vat: p.price_sar_incl_vat,
        scraped_at: p.scraped_at,
      };
    });
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

    return prices.map((p) => {
      const isHungerStation = p.store?.platform === 'hungerstation' || p.merchant?.name_en?.toLowerCase() === 'hungerstation';
      const displayMerchant = (isHungerStation && p.store?.merchant) ? p.store.merchant : p.merchant;

      let merchantName = displayMerchant?.name_en || 'Unknown';
      let merchantNameAr = displayMerchant?.name_ar || '';
      if (isHungerStation) {
        merchantName = `${merchantName} (HungerStation)`;
        merchantNameAr = `${merchantNameAr || merchantName} (هنقرستيشن)`;
      }

      return {
        store_id: p.store_id,
        vertical: p.store?.vertical,
        merchant: {
          name_en: merchantName,
          name_ar: merchantNameAr,
          logo_url: displayMerchant?.logo_url || null,
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
      };
    });
  }
}
