import {
  IsEnum,
  IsString,
  IsUrl,
  IsObject,
  ValidateNested,
  IsNumber,
  IsPositive,
  IsArray,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum IngestionPlatform {
  NINJA = 'ninja',
  HUNGERSTATION = 'hungerstation',
  PANDA = 'panda',
  CARREFOUR = 'carrefour',
  OTHAIM = 'othaim',
  TAMIMI = 'tamimi',
}

export enum IngestionJobMode {
  SCRAPE = 'scrape',
  DISCOVER_CITIES = 'discover-cities',
  DISCOVER_DISTRICTS = 'discover-districts',
  DISCOVER_BRANCHES = 'discover-branches',
  PRODUCTS_FOR_STORE = 'products-for-store',
  DAILY_REFRESH_HUNGERSTATION = 'daily-refresh-hungerstation',
}

export class PageRangeDto {
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  start: number;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  end: number;
}

export class IngestionJobDto {
  @IsEnum(IngestionPlatform)
  platform: IngestionPlatform;

  /** Required only for regular scrape jobs (not discovery jobs). */
  @ValidateIf((o) => !o.mode || o.mode === IngestionJobMode.SCRAPE)
  @IsUrl()
  categoryUrl?: string;

  /** Required only for regular scrape jobs (not discovery jobs). */
  @ValidateIf((o) => !o.mode || o.mode === IngestionJobMode.SCRAPE)
  @IsObject()
  @ValidateNested()
  @Type(() => PageRangeDto)
  pageRange?: PageRangeDto;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  visitedUrls?: string[];

  @IsNumber()
  @IsOptional()
  depth?: number;

  // ── Discovery mode ─────────────────────────────────────────────────────────

  @IsOptional()
  @IsEnum(IngestionJobMode)
  mode?: IngestionJobMode;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_DISTRICTS)
  @IsString()
  citySlug?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_BRANCHES)
  @IsString()
  districtSlug?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_DISTRICTS)
  @IsString()
  city_name_en?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_BRANCHES)
  @IsString()
  district_name_en?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_DISTRICTS)
  @IsString()
  cityUrl?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.DISCOVER_BRANCHES)
  @IsString()
  districtUrl?: string;

  @ValidateIf((o) => o.mode === IngestionJobMode.PRODUCTS_FOR_STORE)
  @IsString()
  storeId?: string;
}

export interface ScrapedProductData {
  name: string;
  name_ar?: string;
  price: number;
  promo_price?: number;
  weight?: string;
  productPageUrl: string;
  imageUrls: string[];
  imageTypes?: string[]; // parallel array: 'front' | 'nutrition' | 'ingredients'
  brand?: string;
  description?: string;
  description_ar?: string;
  gtin?: string;
  inStock?: boolean;
  allergen_tags?: string[];
  ingredient_tags?: string[];
  subcategory?: string;
}

