import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for the Yasmin Catalog Scrape job.
 * Drives the YasminCatalogScraperService to scrape all products in all categories
 * and trigger background search queries across other e-commerce platforms.
 */
export class YasminCatalogJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** The delay in milliseconds between page requests to avoid rate limits */
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;

  /** If true, triggers a background search on the other stores for every discovered GTIN */
  @IsOptional()
  @IsBoolean()
  triggerOtherStoresSearch?: boolean;

  /** Limit the number of categories to process (for testing/diagnostic runs) */
  @IsOptional()
  @IsNumber()
  @Min(1)
  limitCategories?: number;

  /** If true, clears the progress tracking file and starts a fresh scrape */
  @IsOptional()
  @IsBoolean()
  fresh?: boolean;
}
