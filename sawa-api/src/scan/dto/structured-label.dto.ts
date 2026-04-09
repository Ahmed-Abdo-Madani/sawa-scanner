export class StructuredNutritionDto {
  energy_kcal?: number;
  fat_g?: number;
  saturated_fat_g?: number;
  carbs_g?: number;
  sugars_g?: number;
  fiber_g?: number;
  protein_g?: number;
  sodium_mg?: number;
  serving_size_g?: number;
}

export class StructuredIngredientDto {
  name_ar: string;
  name_en: string;
  e_number?: string;
}

export class StructuredLabelDto {
  name_ar: string;
  name_en: string;
  brand: string;
  net_weight?: string;
  nutrition: StructuredNutritionDto;
  ingredients: StructuredIngredientDto[];
}
