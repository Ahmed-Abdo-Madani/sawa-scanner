import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import {
  StructuredLabelDto,
  StructuredIngredientDto,
  StructuredNutritionDto,
} from '../scan/dto/structured-label.dto';

interface OffSearchResult {
  count: number;
  products: any[];
}

@Injectable()
export class OpenFoodFactsService {
  private readonly logger = new Logger(OpenFoodFactsService.name);
  private readonly baseUrl = 'https://world.openfoodfacts.org';

  /**
   * Search OFF by product name. Uses the first match if found.
   */
  async searchProductByName(
    productName: string,
  ): Promise<{ label: StructuredLabelDto | null; allergens: string[] }> {
    if (!productName || productName.trim().length < 3)
      return { label: null, allergens: [] };

    // Cleanup name for better search (e.g., removing weights, special chars)
    const cleanName = productName
      .replace(/[0-9]+(ml|g|kg|l|oz)\b/gi, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim();

    if (!cleanName) return { label: null, allergens: [] };

    try {
      const url = `${this.baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(cleanName)}&search_simple=1&action=process&json=1&page_size=1`;
      this.logger.debug(`Searching OpenFoodFacts for: ${cleanName}`);
      const response = await axios.get<OffSearchResult>(url, {
        timeout: 10000,
      });

      if (
        response.data &&
        response.data.products &&
        response.data.products.length > 0
      ) {
        const product = response.data.products[0];
        return this.mapOffProduct(product);
      }
    } catch (err) {
      this.logger.warn(
        `OpenFoodFacts search failed for "${productName}": ${err.message}`,
      );
    }

    return { label: null, allergens: [] };
  }

  private mapOffProduct(product: any): {
    label: StructuredLabelDto | null;
    allergens: string[];
  } {
    const nutriments = product.nutriments || {};

    // Map Nutrition
    // OFF supplies data per 100g/100ml usually.
    const nutrition: StructuredNutritionDto = {
      energy_kcal: this.parseNum(nutriments['energy-kcal_100g']),
      fat_g: this.parseNum(nutriments['fat_100g']),
      saturated_fat_g: this.parseNum(nutriments['saturated-fat_100g']),
      carbs_g: this.parseNum(nutriments['carbohydrates_100g']),
      sugars_g: this.parseNum(nutriments['sugars_100g']),
      fiber_g: this.parseNum(nutriments['fiber_100g']),
      protein_g: this.parseNum(nutriments['proteins_100g']),
      sodium_mg: this.parseNum(nutriments['sodium_100g']),
      serving_size_g: 100, // OFF values mapped are per 100g
    };

    // Keep only if we have at least calories or fat
    const hasNutrition =
      nutrition.energy_kcal !== undefined ||
      nutrition.fat_g !== undefined ||
      nutrition.protein_g !== undefined;

    // Map Ingredients
    const structuredIngredients: StructuredIngredientDto[] = [];
    if (Array.isArray(product.ingredients)) {
      for (const ing of product.ingredients) {
        if (ing.text) {
          structuredIngredients.push({
            name_en: ing.text.trim(),
            name_ar: '', // OFf rarely provides native Arabic ingredient names perfectly
          });
        }
      }
    } else if (product.ingredients_text) {
      const parts = (product.ingredients_text as string).split(/[,.]+/);
      for (const p of parts) {
        const tp = p.trim();
        if (tp) structuredIngredients.push({ name_en: tp, name_ar: '' });
      }
    }

    const label: StructuredLabelDto = {
      name_en: product.product_name_en || product.product_name || '',
      name_ar: product.product_name_ar || '',
      brand: product.brands || '',
      nutrition: hasNutrition ? nutrition : ({} as any),
      ingredients: structuredIngredients,
    };

    // Extract Allergens
    let allergens: string[] = [];
    if (Array.isArray(product.allergens_tags)) {
      allergens = product.allergens_tags.map((a: string) =>
        a.replace(/^en:/, ''),
      );
    }

    return { label, allergens };
  }

  private parseNum(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    const n = Number.parseFloat(val);
    if (Number.isNaN(n)) return undefined;
    return n;
  }
}
