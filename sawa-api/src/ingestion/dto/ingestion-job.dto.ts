import { IsEnum, IsString, IsUrl, IsObject, ValidateNested, IsNumber, IsPositive, IsArray, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export enum IngestionPlatform {
  NINJA = 'ninja',
  HUNGERSTATION = 'hungerstation',
  PANDA = 'panda',
  CARREFOUR = 'carrefour',
  OTHAIM = 'othaim',
  TAMIMI = 'tamimi',
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

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  visitedUrls?: string[];

  @IsNumber()
  @IsOptional()
  depth?: number;
}

export interface ScrapedProductData {
  name: string;
  name_ar?: string;
  price: number;
  weight?: string;
  productPageUrl: string;
  imageUrls: string[];
  brand?: string;
  description?: string;
  gtin?: string;
  inStock?: boolean;
}
