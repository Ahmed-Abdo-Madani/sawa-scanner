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
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ProductsService } from './products.service';
import { Public } from '../auth/public.decorator';
import { OptionalAuth } from '../auth/optional-auth.decorator';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get(':gtin')
  async getProductByGtin(@Param('gtin') gtin: string) {
    const product = await this.productsService.findByGtin(gtin);

    return {
      id: product.id,
      gtin: product.gtin,
      name_ar: product.name_ar,
      name_en: product.name_en,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      description_ar: product.description_ar,
      description_en: product.description_en,
      sfda_registration_status: product.sfda_registration_status,
      halal_certified: product.halal_certified,
      nutri_score_grade: product.nutri_score_grade,
      nova_group: product.nova_group,
      sfda_npm_score: product.sfda_npm_score,
      net_weight_value: product.net_weight_value,
      net_unit: product.net_unit,
      allergen_tags: product.allergen_tags,
      ingredient_tags: product.ingredient_tags,
      image_front_url: product.image_front_url,
      image_nutrition_url: product.image_nutrition_url,
      nutrition_data_complete: product.nutrition_data_complete,
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
      ingredients: product.ingredients.map((i) => ({
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
      prices: product.prices.map((p) => ({
        merchant: p.merchant?.name_en || 'Unknown',
        price_sar_incl_vat: p.price_sar_incl_vat,
        scraped_at: p.scraped_at,
      })),
      images: product.images?.map((i) => ({
        url: i.url,
        image_type: i.image_type,
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
