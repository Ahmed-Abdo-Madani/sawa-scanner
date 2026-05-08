import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class OffEnrichmentJobDto {
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxProducts?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  completenessThreshold?: number;

  @IsOptional()
  @IsBoolean()
  rebuildDonorCache?: boolean;
}
