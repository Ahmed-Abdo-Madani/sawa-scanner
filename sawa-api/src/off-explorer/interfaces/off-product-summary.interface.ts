/**
 * OFF (OpenFoodFacts) product summary — a lightweight, indexed view of OFF data.
 * This interface represents the normalized product data stored in the OffExplorerIndexService.
 */
export interface OffProductSummary {
  gtin: string;
  name_en: string | null;
  name_ar: string | null;
  brand: string | null;
  brands_tags: string[];
  countries_tags: string[];
  categories_tags: string[];
  quantity: string | null;
  image_front_url: string | null;
  has_nutrition: boolean;
  has_ingredients: boolean;
  nutriscore_grade: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  nova_group: 1 | 2 | 3 | 4 | null;
  weight_grams: number | null;
}
