import { IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OffPriceLinkingJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxProducts?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  dailyBudget?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minConfidence?: number;
}
