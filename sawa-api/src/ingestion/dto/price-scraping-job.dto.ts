import { IsEnum } from 'class-validator';

export enum PriceScrapingRetailer {
  PANDA = 'PANDA',
  CARREFOUR = 'CARREFOUR',
  OTHAIM = 'OTHAIM',
  TAMIMI = 'TAMIMI',
}

export class PriceScrapingJobDto {
  @IsEnum(PriceScrapingRetailer)
  retailer: PriceScrapingRetailer;
}
