import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import axios from 'axios';
import { getRandomUA } from './evasion';
import { diceCoefficient } from '../../utils/string-similarity';

@Injectable()
export class MubarkiyahGtinArScraper extends BaseScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
    private readonly imageHashService: ImageHashService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop'; channel?: string }>('scraper') ?? { headless: true };
    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/mubarkiyah-ar';
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
      this.logger.warn(`[Mubarkiyah Axios GET] failed for ${url}: ${err.message}`);
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
    baseUrl: string = 'https://mubarkiyah.com',
  ): Promise<any[]> {
    productNameAr = productNameAr.trim();
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const searchUrl = `${cleanBaseUrl}/search?q=${encodeURIComponent(productNameAr)}`;

    this.logger.log(`[Mubarkiyah Scraper] Gathering candidates for "${productNameAr}" on store: ${baseUrl}...`);

    let candidates: any[] = [];

    // Playwright search
    await this.ensureLaunched();
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, searchUrl, 'domcontentloaded', 60000, 400, 1200);
      try {
        await page.waitForSelector('[class*="horizontalCartContainer"] a[href*="/item/"], a[href*="/item/"], .no-results', { timeout: 4000 });
      } catch (e) { /* ignore */ }

      candidates = await page.evaluate((cleanUrl) => {
        const results: any[] = [];
        
        // CSS Modules card container selectors
        const cards = document.querySelectorAll('[class*="horizontalCartContainer"]');
        for (const card of Array.from(cards)) {
          const anchor = card.querySelector('a[href*="/item/"]') as HTMLAnchorElement;
          const nameEl = card.querySelector('[class*="horizontItemName"]');
          const priceEl = card.querySelector('[class*="priceNum"] div');
          const imgEl = card.querySelector('img');
          
          if (anchor) {
            const name = nameEl?.textContent?.trim() || anchor.getAttribute('title') || anchor.textContent?.trim() || '';
            const href = anchor.href;
            const priceText = priceEl?.textContent?.trim() || '';
            const image = imgEl ? imgEl.src : null;
            
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

        if (results.length > 0) return results;

        // Generic fallback for any anchors on search page pointing to /item/
        const anchors = document.querySelectorAll('a[href*="/item/"]');
        for (const a of Array.from(anchors)) {
          const href = (a as HTMLAnchorElement).href;
          const name = a.getAttribute('title') || a.textContent?.trim() || '';
          if (name && href) {
            results.push({
              name,
              url: href,
              image: null,
            });
          }
        }

        return results;
      }, cleanBaseUrl);
    } catch (e: any) {
      this.logger.error(`Playwright search failed on Mubarkiyah: ${e.message}`);
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
    this.logger.log(`[Mubarkiyah Scraper] Scraping product details for URL: ${productUrl}...`);
    
    // Attempt Axios first
    const html = await this.fetchHtmlWithAxios(productUrl);
    if (html) {
      const parsed = this.parseProductDetailsFromHtml(html, productUrl);
      if (parsed && parsed.gtin && parsed.price !== null) {
        this.logger.log(`[Mubarkiyah Fast Path Axios] Successfully resolved product details!`);
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
        // Try Next.js state first
        const nextDataScript = document.querySelector('script[id="__NEXT_DATA__"]');
        if (nextDataScript && nextDataScript.textContent) {
          try {
            const json = JSON.parse(nextDataScript.textContent);
            const item = json.props?.pageProps?.item;
            if (item) {
              const name = item.descAr || item.descEn || '';
              const price = item.offerPriceWithVat !== null && item.offerPriceWithVat !== undefined ? item.offerPriceWithVat : item.priceWithVat;
              const gtin = item.barcode || '';
              let image = '';
              if (item.attachmentPath) {
                image = 'https://mubarkiyah.com/Images/item/' + item.attachmentPath;
              }
              return { name, priceText: String(price), image, gtin };
            }
          } catch (e) {}
        }

        // Fallback DOM
        const titleEl = document.querySelector('h1, [class*="itemName"], .active');
        const name = titleEl?.textContent?.trim() || '';

        const priceEl = document.querySelector('[class*="priceNum"] div, .price, [class*="price"]');
        const priceText = priceEl?.textContent?.trim() || '';

        const imgEl = document.querySelector('[class*="itemImg"] img, img[class*="product"], img') as HTMLImageElement;
        const image = imgEl ? imgEl.src : null;

        // Try extracting barcode from page DOM or text
        const bodyText = document.body.innerText;
        const gtinMatch = bodyText.match(/\b\d{8,14}\b/g) || [];
        
        let gtin: string | null = null;
        if (gtinMatch && gtinMatch.length > 0) {
          gtin = gtinMatch[0] || null;
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
      this.logger.error(`Playwright details extraction failed on Mubarkiyah: ${e.message}`);
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  }

  private parseProductDetailsFromHtml(html: string, url: string): { gtin: string | null; price: number | null; name: string | null; image: string | null } | null {
    try {
      // Try Next.js state extraction first
      const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if (match) {
        const json = JSON.parse(match[1]);
        const item = json.props?.pageProps?.item;
        if (item) {
          const name = item.descAr || item.descEn || null;
          const price = item.offerPriceWithVat !== null && item.offerPriceWithVat !== undefined ? item.offerPriceWithVat : item.priceWithVat;
          const gtin = item.barcode || null;
          let image: string | null = null;
          if (item.attachmentPath) {
            image = `https://mubarkiyah.com/Images/item/${item.attachmentPath}`;
          }
          return { gtin, price, name, image };
        }
      }

      // Fallback regex
      const nameMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/class="[^"]*itemName[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : null;

      const priceMatch = html.match(/class="[^"]*priceNum[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ||
                         html.match(/class="[^"]*price[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const priceText = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      const price = this.cleanPrice(priceText);

      const imgMatch = html.match(/class="[^"]*itemImg[^"]*"[^>]*src="([^"]*)"/i) ||
                       html.match(/class="[^"]*product[^"]*"[^>]*src="([^"]*)"/i);
      const image = imgMatch ? imgMatch[1] : null;

      let gtin: string | null = null;
      const bodyBarcodes = html.match(/\b\d{8,14}\b/g);
      if (bodyBarcodes) {
        gtin = bodyBarcodes[0];
      }

      return { gtin, price, name, image };
    } catch {
      return null;
    }
  }
}
