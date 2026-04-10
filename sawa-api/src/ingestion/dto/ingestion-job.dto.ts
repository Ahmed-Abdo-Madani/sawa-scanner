import { IsEnum, IsString, IsUrl, IsObject, ValidateNested, IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export enum IngestionPlatform {
  NINJA = 'ninja',
  HUNGERSTATION = 'hungerstation',
  // PANDA = 'panda', // Future implementation
  // CARREFOUR = 'carrefour', // Future implementation
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

  @IsUrl()
  categoryUrl: string;

  @IsObject()
  @ValidateNested()
  @Type(() => PageRangeDto)
  pageRange: PageRangeDto;
}

export interface ScrapedProductData {
  name: string;
  price: number;
  weight?: string;
  productPageUrl: string;
  imageUrls: string[];
  brand?: string;
  description?: string;
  gtin?: string;
}
