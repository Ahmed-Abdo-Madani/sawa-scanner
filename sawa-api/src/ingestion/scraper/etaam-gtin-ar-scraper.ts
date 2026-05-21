import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import { SallaGtinArScraper, SallaArProductMatch } from './salla-gtin-ar-scraper';

@Injectable()
export class EtaamGtinArScraper extends SallaGtinArScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    configService: ConfigService,
    imageHashService: ImageHashService,
  ) {
    super(robotsTxtService, configService, imageHashService);
  }

  /**
   * Searches the Arabic locale of Etaam Express (etaamexpress.com).
   */
  override async searchAndGetBestMatch(
    productNameAr: string,
    threshold: number = 0.7,
    localHashes?: string[],
  ): Promise<SallaArProductMatch | null> {
    return super.searchAndGetBestMatch(
      productNameAr,
      threshold,
      localHashes,
      'https://etaamexpress.com',
    );
  }
}
