import {
  Controller,
  Get,
  Param,
  Post,
  Body,
  Request,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  Sse,
  MessageEvent,
  Query,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProductsService } from './products.service';
import { Public } from '../auth/public.decorator';
import { OptionalAuth } from '../auth/optional-auth.decorator';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Sse(':gtin/scan-stream')
  getProductScanStream(@Param('gtin') gtin: string): Observable<MessageEvent> {
    return this.productsService.streamFindByGtin(gtin).pipe(
      map((event) => {
        const data = event.data as any;
        if (data && (data.type === 'product' || data.type === 'done')) {
          if (data.payload) {
            return {
              data: {
                type: data.type,
                payload: this.formatProduct(data.payload),
              },
            };
          }
        }
        return event;
      }),
    );
  }

  @Public()
  @Get('search')
  async searchProducts(@Query('q') q: string) {
    const products = await this.productsService.search(q);
    return products.map((p) => this.formatProduct(p));
  }

  @Public()
  @Get(':gtin')
  async getProductByGtin(@Param('gtin') gtin: string) {
    const product = await this.productsService.findByGtin(gtin);
    return this.formatProduct(product);
  }

  private formatProduct(product: any) {
    const crypto = require('crypto');
    return {
      id: product.id || crypto.randomUUID(),
      gtin: product.gtin,
      name_ar: product.name_ar || null,
      name_en: product.name_en || null,
      brand: product.brand || null,
      category: product.category || null,
      subcategory: product.subcategory || null,
      description_ar: product.description_ar || null,
      description_en: product.description_en || null,
      sfda_registration_status: product.sfda_registration_status || null,
      halal_certified: product.halal_certified ?? null,
      nutri_score_grade: product.nutri_score_grade || null,
      nova_group: product.nova_group ?? null,
      sfda_npm_score: product.sfda_npm_score ?? null,
      net_weight_value: product.net_weight_value ?? null,
      net_unit: product.net_unit || null,
      allergen_tags: product.allergen_tags || [],
      ingredient_tags: product.ingredient_tags || [],
      image_front_url: product.image_front_url || null,
      image_nutrition_url: product.image_nutrition_url || null,
      nutrition_data_complete: product.nutrition_data_complete ?? false,
      nutrition: product.nutritionFact
        ? {
            energy_kcal: product.nutritionFact.energy_kcal,
            fat_g: product.nutritionFact.fat_g,
            saturated_fat_g: product.nutritionFact.saturated_fat_g,
            carbs_g: product.nutritionFact.carbs_g,
            sugars_g: product.nutritionFact.sugars_g,
            fiber_g: product.nutritionFact.fiber_g,
            protein_g: product.nutritionFact.protein_g,
            sodium_mg: product.nutritionFact.sodium_mg,
            serving_size_g: product.nutritionFact.serving_size_g,
          }
        : null,
      ingredients: (product.ingredients || []).map((i) => ({
        name_ar: i.name_ar,
        name_en: i.name_en,
        e_number: i.e_number,
        sfda_status: i.sfda_status,
      })),
      allergens: (product.allergens || []).map((a) => ({
        key: a.allergen_key,
        name_ar: a.name_ar,
        name_en: a.name_en,
        source: a.source,
      })),
      prices: (() => {
        const rawPrices = product.prices || [];

        const isHsPrice = (p: any) => {
          if (!p) return false;
          const name = p.merchant?.name_en?.toLowerCase() || '';
          return name === 'hungerstation' || name === 'hunger station' || p.store?.platform === 'hungerstation';
        };

        const hasSpecificHsPrices = rawPrices.some(
          (p) => isHsPrice(p) && p.store_id !== null && p.store_id !== undefined
        );

        // Filter out HungerStation prices with null store_id if specific ones exist
        const filteredPrices = rawPrices.filter((p) => {
          const isHs = isHsPrice(p);
          if (isHs && p.store_id === null && hasSpecificHsPrices) {
            return false;
          }
          return true;
        });

        const latestPricesMap = new Map<string, any>();
        const sortedPrices = [...filteredPrices].sort(
          (a, b) => new Date(b.scraped_at).getTime() - new Date(a.scraped_at).getTime()
        );
        for (const p of sortedPrices) {
          const merchantId = p.merchant_id || p.merchant?.id || '';
          const storeId = p.store_id || p.store?.id || '';
          const key = `${merchantId}:${storeId}`;
          if (!latestPricesMap.has(key)) {
            latestPricesMap.set(key, p);
          }
        }
        const uniquePrices = Array.from(latestPricesMap.values());

        // Sort HungerStation results first, then by price
        uniquePrices.sort((a, b) => {
          const aIsHs = isHsPrice(a);
          const bIsHs = isHsPrice(b);
          if (aIsHs && !bIsHs) return -1;
          if (!aIsHs && bIsHs) return 1;
          return a.price_sar_incl_vat - b.price_sar_incl_vat;
        });

        return uniquePrices.map((p) => {
          const isHungerStation = isHsPrice(p);
          let displayMerchant = (isHungerStation && p.store?.merchant) ? p.store.merchant : p.merchant;

          // Fallback: If it is HungerStation but has no store association, try to infer the merchant from the source_url
          const displayMerchantName = displayMerchant?.name_en?.toLowerCase() || '';
          if (isHungerStation && (!displayMerchant || displayMerchantName === 'hungerstation' || displayMerchantName === 'hunger station') && p.source_url) {
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

          return {
            merchant: {
              name_en: merchantName,
              name_ar: merchantNameAr,
              logo_url: logoUrl,
            },
            price_sar_incl_vat: p.price_sar_incl_vat,
            promo_price_sar: p.promo_price_sar || null,
            unit_price_sar: p.unit_price_sar || null,
            unit_price_unit: p.unit_price_unit || null,
            in_stock: p.in_stock,
            scraped_at: p.scraped_at,
            source_url: p.source_url || null,
            store_id: p.store_id || null,
            store_name: p.store?.platform_branch_id || p.store?.platform_branch_uuid || null,
            store_name_ar: p.store?.platform_branch_id || p.store?.platform_branch_uuid || null,
            district_name: p.store?.district_name_en || null,
            district_name_ar: p.store?.district_name_ar || null,
            store_lat: p.store?.lat !== null && p.store?.lat !== undefined ? Number(p.store.lat) : null,
            store_lng: p.store?.lng !== null && p.store?.lng !== undefined ? Number(p.store.lng) : null,
          };
        });
      })(),
      images: (product.images || []).map((i) => ({
        url: i.url,
        image_type: i.image_type,
        source: i.source || null,
      })),
    };
  }

  /**
   * Step 1 of the contribution flow: upload photos for a specific gtin.
   * Accepts up to 3 image files (front, ingredients, nutrition) as
   * multipart/form-data. Returns a map of slot → data-URL so the caller
   * can embed the references in the final JSON report without sending raw
   * binary bytes inside application/json.
   *
   * Each file is limited to 5 MB and must be image/jpeg or image/png.
   */
  @OptionalAuth()
  @Post(':gtin/reports/images')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'front', maxCount: 1 },
        { name: 'ingredients', maxCount: 1 },
        { name: 'nutrition', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: './uploads/reports',
          filename: (_req, file, cb) => {
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(
              null,
              `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
            );
          },
        }),
        limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
        fileFilter: (_req, file, cb) => {
          if (
            !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
          ) {
            return cb(
              new BadRequestException(
                `Unsupported image type: ${file.mimetype}`,
              ),
              false,
            );
          }
          cb(null, true);
        },
      },
    ),
  )
  async uploadReportImages(
    @UploadedFiles()
    files: {
      front?: Express.Multer.File[];
      ingredients?: Express.Multer.File[];
      nutrition?: Express.Multer.File[];
    },
  ) {
    const images: Record<string, string> = {};

    // Return relative URLs that point to the ServeStatic route.
    if (files?.front?.[0])
      images.front = `/uploads/reports/${files.front[0].filename}`;
    if (files?.ingredients?.[0])
      images.ingredients = `/uploads/reports/${files.ingredients[0].filename}`;
    if (files?.nutrition?.[0])
      images.nutrition = `/uploads/reports/${files.nutrition[0].filename}`;

    return { images };
  }

  @OptionalAuth()
  @Post(':gtin/reports')
  async createProductReport(
    @Param('gtin') gtin: string,
    @Body() body: any,
    @Request() req: any,
  ) {
    const reporterUid: string | undefined = req.user?.uid;
    const report = await this.productsService.createReport(
      gtin,
      body,
      reporterUid,
    );
    return { success: true, id: report.id };
  }
}
