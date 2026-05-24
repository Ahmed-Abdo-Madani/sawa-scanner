import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

/**
   DTO for the Park Center Catalog Scrape job.
   Drives the ParkCenterCatalogScraperService to paginate all products
   and trigger background search queries across other e-commerce platforms.
 */
export class ParkCenterCatalogJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** The first page of the products list to scrape */
  @IsOptional()
  @IsNumber()
  @Min(1)
  startPage?: number;

  /** The last page of the products list to scrape (if omitted, paginates dynamically until empty) */
  @IsOptional()
  @IsNumber()
  @Min(1)
  endPage?: number;

  /** The delay in milliseconds between page requests to avoid rate limits */
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;

  /** If true, triggers a background search on the other stores for every discovered GTIN */
  @IsOptional()
  @IsBoolean()
  triggerOtherStoresSearch?: boolean;
}
