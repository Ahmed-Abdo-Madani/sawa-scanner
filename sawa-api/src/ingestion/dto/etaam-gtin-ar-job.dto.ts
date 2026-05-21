export interface EtaamGtinArScrapeJobDto {
  productId: string;
  productNameAr: string;
  threshold?: number;
  dryRun?: boolean;
  storeUrl?: string;
  storePlatform?: 'salla' | 'zid';
}
