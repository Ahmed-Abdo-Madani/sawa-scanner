import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import axios from 'axios';
import { getRandomUA } from './evasion';
import { diceCoefficient } from '../../utils/string-similarity';

@Injectable()
export class AtayibGtinArScraper extends BaseScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
    private readonly imageHashService: ImageHashService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop'; channel?: string }>('scraper') ?? { headless: true };
    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/atayib-ar';
    super(robotsTxtService, scraperConfig);
  }

  async scrapeListingPage(categoryUrl: string, page: number): Promise<any[]> {
    throw new Error('Not implemented');
  }

  async scrapeDetailPage(productUrl: string): Promise<any> {
    throw new Error('Not implemented. Use scrapeProductDetails.');
  }

  private async fetchHtmlWithAxios(url: string): Promise<string> {
    const ua = getRandomUA('desktop');
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Referer': new URL(url).origin,
          'Connection': 'keep-alive',
        },
        timeout: 10000,
      });
      if (response.status === 200 && typeof response.data === 'string') {
        return response.data;
      }
    } catch (err: any) {
      this.logger.warn(`[Atayib Axios GET] failed for ${url}: ${err.message}`);
    }
    return '';
  }

  private normalizeArabic(text: string): string {
    return text
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ـ/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  private cleanPrice(priceText: string): number | null {
    if (!priceText) return null;
    const cleaned = priceText.replace(/[^\d.]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }

  async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://www.atayib.com',
  ): Promise<any[]> {
    productNameAr = productNameAr.trim();
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const searchUrl = `${cleanBaseUrl}/search?q=${encodeURIComponent(productNameAr)}`;

    this.logger.log(`[Atayib Scraper] Gathering candidates for "${productNameAr}" on store: ${baseUrl}...`);

    let candidates: any[] = [];

    // Attempt Axios first
    const html = await this.fetchHtmlWithAxios(searchUrl);
    if (html) {
      const parsed = this.parseCandidatesFromHtml(html, cleanBaseUrl);
      if (parsed.length > 0) {
        candidates = parsed;
        this.logger.log(`[Atayib Fast Path Axios] Successfully resolved ${candidates.length} candidates!`);
      }
    }

    // Playwright fallback
    if (candidates.length === 0) {
      await this.ensureLaunched();
      if (!this.context) throw new Error('Browser context not initialized');

      const page = await this.context.newPage();
      try {
        await this.navigateWithEvasion(page, searchUrl, 'domcontentloaded', 60000, 400, 1200);
        try {
          await page.waitForSelector('article.art, .art-picture-block, .no-results', { timeout: 4000 });
        } catch (e) { /* ignore */ }

        candidates = await page.evaluate((cleanUrl) => {
          const results: any[] = [];
          const arts = document.querySelectorAll('article.art');
          
          for (const art of Array.from(arts)) {
            const nameEl = art.querySelector('.art-name a, .art-name span, h3.art-name');
            const linkEl = art.querySelector('a.art-picture, .art-name a') as HTMLAnchorElement;
            const imgEl = art.querySelector('.art-picture img, img') as HTMLImageElement;
            const priceEl = art.querySelector('.art-price, [class*="price"]');
            
            if (linkEl && nameEl) {
              const name = nameEl.textContent?.trim() || '';
              const href = linkEl.href;
              const image = imgEl ? imgEl.src || imgEl.getAttribute('data-src') : null;
              const priceText = priceEl?.textContent?.trim() || '';
              
              if (name && href) {
                results.push({
                  name,
                  url: href,
                  image,
                  priceText,
                });
              }
            }
          }
          return results;
        }, cleanBaseUrl);
      } catch (e: any) {
        this.logger.error(`Playwright search failed on Atayib: ${e.message}`);
      } finally {
        await page.close().catch(() => {});
      }
    }

    if (candidates.length === 0) return [];

    const isPureBarcode = /^\d{8,14}$/.test(productNameAr);
    if (isPureBarcode) {
      return candidates.slice(0, 3).map(c => ({
        ...c,
        similarity: 1.0,
        matchMethod: 'text',
      }));
    }

    const normalizedQuery = this.normalizeArabic(productNameAr);
    const filteredCandidates: any[] = [];

    for (const cand of candidates) {
      const normalizedName = this.normalizeArabic(cand.name);
      const similarity = diceCoefficient(normalizedQuery, normalizedName);
      if (similarity >= threshold) {
        filteredCandidates.push({
          ...cand,
          similarity,
          matchMethod: 'text',
        });
      }
    }

    filteredCandidates.sort((a, b) => b.similarity - a.similarity);
    return filteredCandidates;
  }

  async searchAndGetBestMatch(
    productNameAr: string,
    threshold: number = 0.7,
    localHashes?: string[],
  ): Promise<any | null> {
    const candidates = await this.searchAndGetCandidates(productNameAr, threshold, localHashes);
    return candidates.length > 0 ? candidates[0] : null;
  }

  async scrapeProductDetails(productUrl: string): Promise<{ gtin: string | null; price: number | null; name: string | null; image: string | null } | null> {
    this.logger.log(`[Atayib Scraper] Scraping product details for URL: ${productUrl}...`);
    
    // Attempt Axios first
    const html = await this.fetchHtmlWithAxios(productUrl);
    if (html) {
      const parsed = this.parseProductDetailsFromHtml(html, productUrl);
      if (parsed && parsed.gtin && parsed.price !== null) {
        this.logger.log(`[Atayib Fast Path Axios] Successfully resolved product details!`);
        return parsed;
      }
    }

    // Playwright fallback
    await this.ensureLaunched();
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, productUrl, 'domcontentloaded', 60000, 400, 1200);
      await page.waitForTimeout(1000);

      const details = await page.evaluate(() => {
        const titleEl = document.querySelector('h1, .pd-name, .active');
        const name = titleEl?.textContent?.trim() || '';

        const priceEl = document.querySelector('.pd-price, .art-price, .price, [class*="price"]');
        const priceText = priceEl?.textContent?.trim() || '';

        const imgEl = document.querySelector('.pd-image img, img.art-picture, [class*="picture"] img') as HTMLImageElement;
        const image = imgEl ? imgEl.src : null;

        // Try extracting barcode from page DOM or text
        const bodyText = document.body.innerText;
        const gtinMatch = bodyText.match(/\b\d{8,14}\b/g) || [];
        
        let gtin: string | null = null;
        if (gtinMatch && gtinMatch.length > 0) {
          gtin = gtinMatch[0] || null;
        }

        // Try searching for SKU / barcode inside smartstore scripts
        const allScripts = Array.from(document.querySelectorAll('script'));
        for (const s of allScripts) {
          const content = s.textContent || '';
          const m = content.match(/"sku"\s*:\s*"(\d{8,14})"/i) || content.match(/"gtin"\s*:\s*"(\d{8,14})"/i);
          if (m && m[1]) {
            gtin = m[1];
            break;
          }
        }

        return {
          name,
          priceText,
          image,
          gtin,
        };
      });

      const parsedPrice = this.cleanPrice(details.priceText);

      return {
        gtin: details.gtin || null,
        price: parsedPrice,
        name: details.name || null,
        image: details.image || null,
      };
    } catch (e: any) {
      this.logger.error(`Playwright details extraction failed on Atayib: ${e.message}`);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private parseCandidatesFromHtml(html: string, baseUrl: string): any[] {
    const results: any[] = [];
    try {
      const artMatches = html.match(/<article\s+[^>]*class="[^"]*art[^"]*"([\s\S]*?)<\/article>/gi);
      if (!artMatches) return results;

      for (const cardHtml of artMatches) {
        const nameMatch = cardHtml.match(/<h3\s+class="art-name"[^>]*>([\s\S]*?)<\/h3>/i) ||
                          cardHtml.match(/class="[^"]*art-name[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
        if (!nameMatch) continue;
        const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();

        const hrefMatch = cardHtml.match(/href="([^"]*)"/i);
        if (!hrefMatch) continue;
        let url = hrefMatch[1];
        if (!url.startsWith('http')) {
          url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
        }

        const imgMatch = cardHtml.match(/<img\s+[^>]*src="([^"]*)"|<img\s+[^>]*data-src="([^"]*)"/i);
        const image = imgMatch ? (imgMatch[1] || imgMatch[2]) : null;

        const priceMatch = cardHtml.match(/class="[^"]*art-price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                           cardHtml.match(/class="[^"]*art-price[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const priceText = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, '').trim() : '';

        if (name && url) {
          results.push({ name, url, image, priceText });
        }
      }
    } catch (e) {
      this.logger.warn(`Failed to parse candidates from HTML: ${e.message}`);
    }
    return results;
  }

  private parseProductDetailsFromHtml(html: string, url: string): { gtin: string | null; price: number | null; name: string | null; image: string | null } | null {
    try {
      const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/class="[^"]*pd-name[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : null;

      const priceMatch = html.match(/class="[^"]*pd-price[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                         html.match(/class="[^"]*art-price[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const priceText = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const price = this.cleanPrice(priceText);

      const imgMatch = html.match(/class="[^"]*pd-image[^"]*"[^>]*src="([^"]*)"/i) ||
                       html.match(/class="[^"]*art-picture[^"]*"[^>]*src="([^"]*)"/i);
      const image = imgMatch ? imgMatch[1] : null;

      // Extract GTIN/SKU
      let gtin: string | null = null;
      const gtinScriptMatch = html.match(/"sku"\s*:\s*"(\d{8,14})"/i) || html.match(/"gtin"\s*:\s*"(\d{8,14})"/i);
      if (gtinScriptMatch) {
        gtin = gtinScriptMatch[1];
      }

      if (!gtin) {
        const bodyBarcodes = html.match(/\b\d{8,14}\b/g);
        if (bodyBarcodes) {
          gtin = bodyBarcodes[0];
        }
      }

      return { gtin, price, name, image };
    } catch {
      return null;
    }
  }
}
