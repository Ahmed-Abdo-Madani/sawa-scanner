import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import axios from 'axios';
import { getRandomUA } from './evasion';
import { diceCoefficient } from '../../utils/string-similarity';

@Injectable()
export class WawGtinArScraper extends BaseScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
    private readonly imageHashService: ImageHashService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop'; channel?: string }>('scraper') ?? { headless: true };
    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/waw-ar';
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
      this.logger.warn(`[Waw Axios GET] failed for ${url}: ${err.message}`);
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
    baseUrl: string = 'https://waw.sa',
  ): Promise<any[]> {
    productNameAr = productNameAr.trim();
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const searchUrl = `${cleanBaseUrl}/search/node/${encodeURIComponent(productNameAr)}`;

    this.logger.log(`[Waw Scraper] Gathering candidates for "${productNameAr}" on store: ${baseUrl}...`);

    let candidates: any[] = [];

    // Playwright search
    await this.ensureLaunched();
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, searchUrl, 'domcontentloaded', 60000, 400, 1200);
      try {
        await page.waitForSelector('.search-results a, a[href*="/product/"], .no-results', { timeout: 4000 });
      } catch (e) { /* ignore */ }

      candidates = await page.evaluate((cleanUrl) => {
        const results: any[] = [];
        const anchors = Array.from(document.querySelectorAll('.search-results a, a[href*="/product/"]'));
        
        for (const a of anchors) {
          const href = (a as HTMLAnchorElement).href;
          if (href && href.includes('/product/')) {
            const name = a.textContent?.trim() || '';
            if (name && name.length > 2) {
              results.push({
                name,
                url: href,
                image: null,
              });
            }
          }
        }
        return results;
      }, cleanBaseUrl);
    } catch (e: any) {
      this.logger.error(`Playwright search failed on Waw: ${e.message}`);
    } finally {
      await page.close().catch(() => {});
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
    this.logger.log(`[Waw Scraper] Scraping product details for URL: ${productUrl}...`);
    
    // Attempt Axios first
    const html = await this.fetchHtmlWithAxios(productUrl);
    if (html) {
      const parsed = this.parseProductDetailsFromHtml(html, productUrl);
      if (parsed && parsed.gtin && parsed.price !== null) {
        this.logger.log(`[Waw Fast Path Axios] Successfully resolved product details!`);
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
        const titleEl = document.querySelector('h1, [class*="product-title"], .active');
        const name = titleEl?.textContent?.trim() || '';

        const priceEl = document.querySelector('.price, [class*="price"], .amount');
        const priceText = priceEl?.textContent?.trim() || '';

        // Extract image
        let image: string | null = null;
        const imgEls = Array.from(document.querySelectorAll('img'));
        for (const img of imgEls) {
          const src = img.src || '';
          if (src.includes('/styles/height380/') || src.includes('/public/')) {
            image = src;
            break;
          }
        }
        if (!image && imgEls.length > 0) {
          const fallbackImg = imgEls.find(i => i.src && (i.src.includes('/styles/') || i.src.includes('/files/')));
          if (fallbackImg) image = fallbackImg.src;
        }

        // Barcode matching
        const bodyText = document.body.innerText;
        const bodyBarcodes = bodyText.match(/\b\d{8,14}\b/g) || [];
        
        let gtin: string | null = null;
        if (bodyBarcodes && bodyBarcodes.length > 0) {
          gtin = bodyBarcodes[0] || null;
        }

        // Try extracting barcode from image URL itself if present
        if (!gtin && image) {
          const filenameMatch = image.match(/-(\d{8,14})\./);
          if (filenameMatch) {
            gtin = filenameMatch[1];
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
      this.logger.error(`Playwright details extraction failed on Waw: ${e.message}`);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private parseProductDetailsFromHtml(html: string, url: string): { gtin: string | null; price: number | null; name: string | null; image: string | null } | null {
    try {
      const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<li[^>]*class="active"[^>]*>([\s\S]*?)<\/li>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : null;

      const priceMatch = html.match(/class="[^"]*(?:price|amount)[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/class="[^"]*(?:price|amount)[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const priceText = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const price = this.cleanPrice(priceText);

      // Main styled image URL
      const imgMatch = html.match(/src="([^"]*\/styles\/height380\/public\/[^"]*)"/i) ||
                       html.match(/src="([^"]*\/sites\/default\/files\/public\/[^"]*)"/i);
      const image = imgMatch ? imgMatch[1] : null;

      // Extract GTIN
      let gtin: string | null = null;
      if (image) {
        const filenameMatch = image.match(/-(\d{8,14})\./);
        if (filenameMatch) {
          gtin = filenameMatch[1];
        }
      }

      if (!gtin) {
        const barcodeMatch = html.match(/\b\d{8,14}\b/g);
        if (barcodeMatch) {
          gtin = barcodeMatch[0];
        }
      }

      return { gtin, price, name, image };
    } catch {
      return null;
    }
  }
}
