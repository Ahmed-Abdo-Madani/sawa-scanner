import {
  IsOptional,
  IsArray,
  IsString,
  MaxLength,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsInt,
  IsIn,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class OffExplorerQueryDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : (value ? [value] : [])
  )
  brands?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : (value ? [value] : [])
  )
  countryTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) =>
    Array.isArray(value) ? value : (value ? [value] : [])
  )
  categoryTags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsString()
  gtinPrefix?: string;

  @IsOptional()
  @IsString()
  gtinExact?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasNutrition?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasImage?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasIngredientsText?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  minGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => (typeof value === 'string' ? parseFloat(value) : value))
  maxGrams?: number;

  @IsOptional()
  @IsArray()
  @IsIn(['a', 'b', 'c', 'd', 'e'], { each: true })
  nutriScoreGrades?: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @IsIn([1, 2, 3, 4], { each: true })
  @Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((v) => (typeof v === 'string' ? parseInt(v, 10) : v))
      : value
  )
  novaGroups?: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  @Transform(({ value }) => (typeof value === 'string' ? parseInt(value, 10) : value))
  pageSize?: number = 50;

  @IsOptional()
  @IsIn(['name', 'gtin', 'recent'])
  sort?: string;
}
