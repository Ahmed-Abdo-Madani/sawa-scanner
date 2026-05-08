import { isPlaceholderBrand } from '../utils/normalization';

/**
 * Shared completeness scoring logic used by both OffImportService and OffEnrichmentService.
 * Computes a 0–1 score reflecting how complete a product's data is.
 *
 * Scoring breakdown:
 *   name_en (>2 chars)           → 0.15
 *   name_ar (>2 chars)           → 0.15
 *   brand (non-placeholder)      → 0.10
 *   category                     → 0.05
 *   image_front_url              → 0.10
 *   nutrition_data_complete      → 0.20
 *   ingredients (>=1)            → 0.10
 *   allergen_tags (>=1)          → 0.05
 *   net_weight_value (>0)        → 0.05
 *   nutri_score_grade            → 0.05
 *                          Total → 1.00
 */
export function computeCompletenessScore(
  product: {
    name_en?: string;
    name_ar?: string;
    brand?: string;
    category?: string;
    image_front_url?: string;
    nutrition_data_complete?: boolean;
    allergen_tags?: string[];
    net_weight_value?: number | null;
    nutri_score_grade?: string | null;
  },
  hasNutrition: boolean,
  ingredientCount: number,
): number {
  let score = 0;
  if (product.name_en && product.name_en.length > 2) score += 0.15;
  if (product.name_ar && product.name_ar.length > 2) score += 0.15;
  if (product.brand && !isPlaceholderBrand(product.brand)) score += 0.10;
  if (product.category) score += 0.05;
  if (product.image_front_url) score += 0.10;
  if (product.nutrition_data_complete || hasNutrition) score += 0.20;
  if (ingredientCount >= 1) score += 0.10;
  if (product.allergen_tags && product.allergen_tags.length > 0) score += 0.05;
  if (product.net_weight_value && product.net_weight_value > 0) score += 0.05;
  if (product.nutri_score_grade) score += 0.05;
  return score;
}
