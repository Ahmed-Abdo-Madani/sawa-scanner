import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class OffImportJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  batchSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxProducts?: number;
}
