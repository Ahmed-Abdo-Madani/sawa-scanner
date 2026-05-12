import { IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class BarcodeListNamesJobDto {
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
}
