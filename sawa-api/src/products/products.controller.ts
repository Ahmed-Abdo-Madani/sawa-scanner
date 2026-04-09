import { Controller, Get, Param } from '@nestjs/common';
import { ProductsService } from './products.service';
import { Public } from '../auth/public.decorator';

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
      sfda_registration_status: product.sfda_registration_status,
      halal_certified: product.halal_certified,
      nutri_score_grade: product.nutri_score_grade,
      nova_group: product.nova_group,
      sfda_npm_score: product.sfda_npm_score,
      nutrition: product.nutritionFact ? {
        energy_kcal: product.nutritionFact.energy_kcal,
        fat_g: product.nutritionFact.fat_g,
        saturated_fat_g: product.nutritionFact.saturated_fat_g,
        carbs_g: product.nutritionFact.carbs_g,
        sugars_g: product.nutritionFact.sugars_g,
        fiber_g: product.nutritionFact.fiber_g,
        protein_g: product.nutritionFact.protein_g,
        sodium_mg: product.nutritionFact.sodium_mg,
        serving_size_g: product.nutritionFact.serving_size_g,
      } : null,
      ingredients: product.ingredients.map(i => ({
        name_ar: i.name_ar,
        name_en: i.name_en,
        e_number: i.e_number,
        sfda_status: i.sfda_status,
      })),
      prices: product.prices.map(p => ({
        merchant: p.merchant?.name_en || 'Unknown',
        price_sar_incl_vat: p.price_sar_incl_vat,
        scraped_at: p.scraped_at,
      })),
      images: product.images?.map(i => ({
        url: i.url,
        image_type: i.image_type,
      })),
    };
  }
}
