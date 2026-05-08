import {
  IsString,
  IsNotEmpty,
  Matches,
  IsOptional,
  IsBoolean,
  IsIn,
  IsInt,
  Min,
  Max,
  IsNumber,
  IsArray,
  IsUrl,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GTIN_REGEX } from '../../utils/gtin';

export class AdminUpsertNutritionDto {
  @IsOptional() @IsNumber() energy_kcal?: number;
  @IsOptional() @IsNumber() fat_g?: number;
  @IsOptional() @IsNumber() saturated_fat_g?: number;
  @IsOptional() @IsNumber() carbs_g?: number;
  @IsOptional() @IsNumber() sugars_g?: number;
  @IsOptional() @IsNumber() fiber_g?: number;
  @IsOptional() @IsNumber() protein_g?: number;
  @IsOptional() @IsNumber() sodium_mg?: number;
  @IsOptional() @IsNumber() serving_size_g?: number;
}

export class AdminUpsertIngredientDto {
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() name_ar?: string;
  @IsOptional() @IsString() e_number?: string;
  @IsOptional() @IsString() sfda_status?: string;
}

export class AdminUpsertAllergenDto {
  @IsNotEmpty() @IsString() allergen_key: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() name_ar?: string;
}

export class AdminUpsertProductDto {
  @IsNotEmpty()
  @Matches(GTIN_REGEX)
  gtin: string;

  @IsOptional() @IsString() name_ar?: string;
  @IsOptional() @IsString() name_en?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() subcategory?: string;
  @IsOptional() @IsString() description_ar?: string;
  @IsOptional() @IsString() description_en?: string;
  @IsOptional() @IsBoolean() halal_certified?: boolean;
  @IsOptional() @IsIn(['a', 'b', 'c', 'd', 'e']) nutri_score_grade?: string;
  @IsOptional() @IsInt() @Min(1) @Max(4) nova_group?: number;
  @IsOptional() @IsInt() sfda_npm_score?: number;
  @IsOptional() @IsNumber() net_weight_value?: number;
  @IsOptional() @IsIn(['g', 'ml']) net_unit?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) allergen_tags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) ingredient_tags?: string[];
  @IsOptional() @IsUrl({ require_protocol: false }) image_front_url?: string;
  @IsOptional() @IsUrl({ require_protocol: false }) image_nutrition_url?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AdminUpsertNutritionDto)
  nutrition?: AdminUpsertNutritionDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminUpsertIngredientDto)
  ingredients?: AdminUpsertIngredientDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminUpsertAllergenDto)
  allergens?: AdminUpsertAllergenDto[];
}
