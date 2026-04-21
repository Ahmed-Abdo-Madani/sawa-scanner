import { Controller, Get, Param, Query } from '@nestjs/common';
import { NutritionService } from './nutrition.service';
import { Public } from '../auth/public.decorator';

@Public()
@Controller('products/:gtin')
export class NutritionController {
  constructor(private readonly nutritionService: NutritionService) {}

  /**
   * Full nutrition analysis for a product.
   * Includes NutriScore, traffic light, harmful substances, and allergen warnings.
   */
  @Get('nutrition')
  async getNutritionAnalysis(
    @Param('gtin') gtin: string,
    @Query('allergens') allergens?: string,
  ) {
    const userAllergens = allergens
      ? allergens.split(',').map((a) => a.trim().toLowerCase())
      : undefined;
    return this.nutritionService.getFullAnalysis(gtin, userAllergens);
  }

  /**
   * Allergen warnings for a product, optionally filtered by user's allergen list.
   */
  @Get('allergen-check')
  async getAllergenCheck(
    @Param('gtin') gtin: string,
    @Query('allergens') allergens?: string,
  ) {
    const userAllergens = allergens
      ? allergens.split(',').map((a) => a.trim().toLowerCase())
      : undefined;

    // We need product ID first
    const analysis = await this.nutritionService.getFullAnalysis(
      gtin,
      userAllergens,
    );
    return {
      allergen_warnings: analysis.allergen_warnings,
      total: analysis.allergen_warnings.length,
    };
  }

  /**
   * Quick traffic-light health summary for a product.
   */
  @Get('health-summary')
  async getHealthSummary(@Param('gtin') gtin: string) {
    const analysis = await this.nutritionService.getFullAnalysis(gtin);
    return {
      nutri_score_grade: analysis.nutri_score_grade,
      health_summary: analysis.health_summary,
      nutrition_data_complete: analysis.nutrition_data_complete,
    };
  }
}
