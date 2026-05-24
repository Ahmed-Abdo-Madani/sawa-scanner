import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import { ZidGtinArScraper, ZidArProductMatch } from './zid-gtin-ar-scraper';

@Injectable()
export class Mo0o0natGtinArScraper extends ZidGtinArScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    configService: ConfigService,
    imageHashService: ImageHashService,
  ) {
    super(robotsTxtService, configService, imageHashService);
    // Isolate session cookies to prevent parallel file lock conflicts
    this.config.cookieSessionPath = './scraper-sessions/mo0o0nat-ar';
  }

  /**
   * Searches Mo0o0nat Store locale (mo0o0nat.com).
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
      'https://mo0o0nat.com',
    );
  }

  override async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://mo0o0nat.com',
  ): Promise<ZidArProductMatch[]> {
    return super.searchAndGetCandidates(productNameAr, threshold, localHashes, baseUrl);
  }
}
