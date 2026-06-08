import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
 * DTO for the Dukan Express Catalog Scrape job.
 * Drives the DukanExpressCatalogScraperService to scrape all products from the storefront API.
 */
export class DukanExpressCatalogJobDto {
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

  /** The page to start scraping from */
  @IsOptional()
  @IsNumber()
  @Min(1)
  startPage?: number;

  /** The page to stop scraping at */
  @IsOptional()
  @IsNumber()
  @Min(1)
  endPage?: number;

  /** If true, clears the progress tracking file and starts a fresh scrape */
  @IsOptional()
  @IsBoolean()
  fresh?: boolean;
}
