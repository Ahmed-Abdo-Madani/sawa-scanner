import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for the Etaam Express Catalog Scrape job.
 * Drives the EtaamExpressCatalogScraperService to scrape all products from the storefront categories dynamically.
 */
export class EtaamExpressCatalogJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** The delay in milliseconds between requests to avoid rate limits */
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;

  /** If true, triggers a background search on the other stores for every discovered GTIN */
  @IsOptional()
  @IsBoolean()
  triggerOtherStoresSearch?: boolean;

  /** If true, clears the progress tracking file and starts a fresh scrape */
  @IsOptional()
  @IsBoolean()
  fresh?: boolean;

  /** Limit the number of categories scraped (useful for tests) */
  @IsOptional()
  @IsNumber()
  @Min(1)
  limitCategories?: number;
}
