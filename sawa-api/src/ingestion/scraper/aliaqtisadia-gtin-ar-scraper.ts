import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import { SallaGtinArScraper, SallaArProductMatch } from './salla-gtin-ar-scraper';

@Injectable()
export class AliaqtisadiaGtinArScraper extends SallaGtinArScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    configService: ConfigService,
    imageHashService: ImageHashService,
  ) {
    super(robotsTxtService, configService, imageHashService);
    // Isolate session cookies to prevent parallel file lock conflicts
    this.config.cookieSessionPath = './scraper-sessions/aliaqtisadia-ar';
  }

  /**
   * Searches Aliaqtisadia Store locale (aliaqtisadia.sa).
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
      'https://aliaqtisadia.sa',
    );
  }

  override async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://aliaqtisadia.sa',
  ): Promise<SallaArProductMatch[]> {
    return super.searchAndGetCandidates(productNameAr, threshold, localHashes, baseUrl);
  }
}
