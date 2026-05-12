import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO for the HungerStation Catalog Scrape job.
 * Drives the HsCatalogScraperService to scrape a single HS store branch
 * and populate the product database with HS product data.
 */
export class HsCatalogJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Override the store URL from .env */
  @IsOptional()
  @IsString()
  storeUrl?: string;

  /** Limit the number of categories to scrape (0 = all) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCategories?: number;

  /** Limit products per category (0 = all) */
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxProductsPerCategory?: number;

  /** Override request delay between pages in ms */
  @IsOptional()
  @IsNumber()
  @Min(500)
  requestDelayMs?: number;

  /** Specific category URL to scrape (worker mode) */
  @IsOptional()
  @IsString()
  categoryUrl?: string;

  /** Specific category name (worker mode) */
  @IsOptional()
  @IsString()
  categoryName?: string;
}
