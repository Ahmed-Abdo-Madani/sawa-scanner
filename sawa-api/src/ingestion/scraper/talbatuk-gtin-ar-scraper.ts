import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import { ZidGtinArScraper, ZidArProductMatch } from './zid-gtin-ar-scraper';

@Injectable()
export class TalbatukGtinArScraper extends ZidGtinArScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    configService: ConfigService,
    imageHashService: ImageHashService,
  ) {
    super(robotsTxtService, configService, imageHashService);
    // Isolate session cookies to prevent parallel file lock conflicts
    this.config.cookieSessionPath = './scraper-sessions/talbatuk-ar';
  }

  /**
   * Searches Talbatuk Store locale (talbatuk.com).
   */
  override async searchAndGetBestMatch(
    productNameAr: string,
    threshold: number = 0.7,
    localHashes?: string[],
  ): Promise<ZidArProductMatch | null> {
    return super.searchAndGetBestMatch(
      productNameAr,
      threshold,
      localHashes,
      'https://talbatuk.com',
    );
  }

  override async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://talbatuk.com',
  ): Promise<ZidArProductMatch[]> {
    return super.searchAndGetCandidates(productNameAr, threshold, localHashes, baseUrl);
  }
}
