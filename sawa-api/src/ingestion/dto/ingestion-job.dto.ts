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
  IsBoolean,
  Min,
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
  GTIN_BACKFILL_OFF = 'gtin-backfill-off',
  OFF_IMPORT = 'off-import',
  OFF_ENRICHMENT = 'off-enrichment',
  OFF_PRICE_LINKING = 'off-price-linking',
  BARCODE_LIST_NAMES = 'barcode-list-names',
  HS_CATALOG_SCRAPE = 'hs-catalog-scrape',
  HS_CATALOG_SCRAPE_CATEGORY = 'hs-catalog-scrape-category',
  PARKCENTER_CATALOG_SCRAPE = 'parkcenter-catalog-scrape',
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

/**
 * DTO for dedicated GTIN backfill requests.
 * This DTO excludes scrape-specific fields to allow operators to trigger backfill
 * without providing platform, categoryUrl, pageRange, etc.
 */
export class GtinBackfillJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /**
   * Caps the number of scan rows processed in the backfill.
   * Does not affect the OFF slice pool size.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxProducts?: number;

  /**
   * Caps the number of OFF products indexed from the OFF slice.
   * Independent of maxProducts; if omitted, indexes the full OFF slice.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOffProducts?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brandsOverride?: string[];

  @IsOptional()
  @IsBoolean()
  useDump?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildPool?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAiMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildAiCache?: boolean;

  // Comment 4: Brand-alias cache control flags (independent of rebuildAiCache)
  @IsOptional()
  @IsBoolean()
  rebuildBrandAliasCache?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreBrandAliasCache?: boolean;

  // ── AI Verdict Cache Isolation ──
  @IsOptional()
  @IsBoolean()
  ignoreAiVerdictCache?: boolean;

  @IsOptional()
  @IsBoolean()
  aiVerdictProviderIsolation?: boolean;

  // ── GTIN Embedding Match (Pass G) Configuration ──
  @IsOptional()
  @IsBoolean()
  enableEmbeddingMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildEmbeddingCache?: boolean;

  @IsOptional()
  @IsBoolean()
  embeddingOnly?: boolean;
}

export class IngestionJobDto {
  /**
   * Platform is required for scrape, discovery, and other jobs that actually need it.
   * For GTIN_BACKFILL_OFF mode, platform is not used and can be omitted.
   */
  @ValidateIf((o) => o.mode !== IngestionJobMode.GTIN_BACKFILL_OFF && o.mode !== IngestionJobMode.OFF_IMPORT && o.mode !== IngestionJobMode.OFF_ENRICHMENT && o.mode !== IngestionJobMode.OFF_PRICE_LINKING && o.mode !== IngestionJobMode.BARCODE_LIST_NAMES && o.mode !== IngestionJobMode.HS_CATALOG_SCRAPE && o.mode !== IngestionJobMode.HS_CATALOG_SCRAPE_CATEGORY && o.mode !== IngestionJobMode.PARKCENTER_CATALOG_SCRAPE && (!o.mode || o.mode === IngestionJobMode.SCRAPE))
  @IsEnum(IngestionPlatform)
  platform?: IngestionPlatform;

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

  // ── GTIN Backfill mode ─────────────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /**
   * Caps the number of scan rows processed in the backfill.
   * Does not affect the OFF slice pool size.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxProducts?: number;

  /**
   * Caps the number of OFF products indexed from the OFF slice.
   * Independent of maxProducts; if omitted, indexes the full OFF slice.
   */
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxOffProducts?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  brandsOverride?: string[];

  @IsOptional()
  @IsBoolean()
  useDump?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildPool?: boolean;

  @IsOptional()
  @IsBoolean()
  enableAiMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildAiCache?: boolean;

  // Comment 4: Brand-alias cache control flags (independent of rebuildAiCache)
  @IsOptional()
  @IsBoolean()
  rebuildBrandAliasCache?: boolean;

  @IsOptional()
  @IsBoolean()
  ignoreBrandAliasCache?: boolean;

  // ── AI Verdict Cache Isolation ──
  @IsOptional()
  @IsBoolean()
  ignoreAiVerdictCache?: boolean;

  @IsOptional()
  @IsBoolean()
  aiVerdictProviderIsolation?: boolean;

  // ── GTIN Embedding Match (Pass G) Configuration ──
  @IsOptional()
  @IsBoolean()
  enableEmbeddingMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  rebuildEmbeddingCache?: boolean;

  @IsOptional()
  @IsBoolean()
  embeddingOnly?: boolean;
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
