import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { diceCoefficient } from '../../utils/string-similarity';
import { Page } from 'playwright';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import axios from 'axios';
import { getRandomUA } from './evasion';

export interface SallaArProductMatch {
  name: string;
  url: string;
  similarity: number;
  image?: string | null;
  matchMethod?: 'text' | 'image';
  hammingDistance?: number;
}

export function isGenericButtonOrLabel(name: string): boolean {
  if (!name) return true;
  const clean = name.trim().replace(/\s+/g, ' ').toLowerCase();
  const blacklisted = [
    'اضف الى السلة', 'أضف إلى السلة', 'اضف للسلة', 'أضف للسلة',
    'اضافة للسلة', 'إضافة للسلة', 'اضافة الى السلة', 'إضافة إلى السلة',
    'اشتر الآن', 'اشتري الآن', 'شراء الآن', 'نفدت الكمية', 'نفذت الكمية',
    'غير متوفر', 'تفاصيل المنتج', 'عرض المنتج', 'قراءة المزيد', 'تفاصيل',
    'المزيد', 'سلة المشتريات', 'أضف للمقارنة', 'أضف للمفضلة', 'معاينة', 'سريع',
    'add to cart', 'add to basket', 'buy now', 'out of stock', 'sold out',
    'read more', 'details', 'view product', 'quick view', 'add to wishlist',
    'add to compare', 'go to cart'
  ];
  return clean.length <= 2 || blacklisted.some(term => clean === term);
}

const BRAND_GUARD_STOPWORDS_AR = new Set([
  // Colors (Arabic)
  'أصفر', 'أحمر', 'أخضر', 'أزرق', 'أبيض', 'أسود', 'ذهبي', 'بني', 'برتقالي',
  'وردي', 'بنفسجي', 'رمادي', 'فضي',
  // Generic adjectives (Arabic)
  'كلاسيكي', 'كلاسيك', 'أصلي', 'ممتاز', 'طازج', 'نقي', 'طبيعي', 'عضوي',
  'خفيف', 'لايت', 'إكسترا', 'سوبر', 'ميني', 'كبير', 'صغير',
  'جديد', 'قديم', 'تقليدي', 'خاص', 'عادي', 'كامل', 'منزوع', 'قليل',
  'دسم', 'خالي', 'سكر', 'زيرو', 'دايت', 'عالي', 'غني', 'ناعم', 'مقرمش',
  'فاخر', 'مختار', 'أفضل',
  // Arabic articles / connectors
  'ال', 'من', 'مع', 'في', 'بنكهة', 'نكهة', 'طعم',
  // Food category words (Arabic)
  'حليب', 'عصير', 'ماء', 'زيت', 'جبن', 'جبنة', 'زبدة', 'كريم', 'كريمة', 'خبز',
  'دجاج', 'لحم', 'سمك', 'أرز', 'رز', 'طحين', 'ملح', 'سكر', 'عسل',
  'موز', 'تفاح', 'مانجو', 'تمر', 'تمور', 'طماطم', 'بطاطس', 'بصل',
  'بيض', 'زبادي', 'لبن', 'سمن', 'شوكولاتة', 'شوكولا', 'قهوة',
  'شاي', 'بسكويت', 'كيك', 'شيبس', 'سناك', 'حلوى', 'علكة',
  'معجون', 'صلصة', 'معكرونة', 'مكرونة', 'فول', 'حمص', 'فاصوليا',
  // Generic packaging / format words
  'علبة', 'كيس', 'عبوة', 'قطعة', 'حبة', 'قطع', 'حبات', 'جرام', 'غرام',
  'مل', 'لتر', 'كغ', 'كيلو',
]);

@Injectable()
export class SallaGtinArScraper extends BaseScraper {
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
    private readonly imageHashService: ImageHashService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop'; channel?: string }>('scraper') ?? { headless: true };
    const envHeadless = process.env.ETAAM_SCRAPER_HEADLESS;
    if (envHeadless === 'false') {
      scraperConfig.headless = false;
    } else if (envHeadless === 'true') {
      scraperConfig.headless = true;
    }

    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/salla-ar';
    scraperConfig.channel = scraperConfig.channel ?? 'chrome';
    scraperConfig.deviceProfile = scraperConfig.deviceProfile ?? 'desktop';
    super(robotsTxtService, scraperConfig);
  }

  async scrapeListingPage(categoryUrl: string, page: number): Promise<any[]> {
    throw new Error('Method not implemented for SallaGtinArScraper.');
  }

  async scrapeDetailPage(productUrl: string): Promise<any> {
    throw new Error('Method not implemented for SallaGtinArScraper. Use scrapeGtinFromProductPage.');
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
      this.logger.warn(`[Axios GET] failed for ${url}: ${err.message}`);
    }
    return '';
  }

  private isValidSallaProductUrl(url: string, baseUrl?: string): boolean {
    if (!url) return false;
    try {
      const lower = url.toLowerCase();
      if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:') || lower.startsWith('whatsapp:') || lower.startsWith('sms:')) {
        return false;
      }
      if (lower.includes('/c/') || lower.includes('/category/') || lower.includes('/categories/')) {
        return false;
      }
      const blacklist = [
        '/cart', '/checkout', '/wishlist', '/login', '/register', '/sign-in', '/sign-up', 
        '/logout', '/profile', '/account', '/contact', '/about', '/terms', '/privacy', 
        '/shipping', '/refund', '/faq', '/help', '/support', '/home', '/search', '/pages/'
      ];
      if (blacklist.some(term => lower.includes(term))) {
        return false;
      }

      if (url.startsWith('http://') || url.startsWith('https://')) {
        const parsed = new URL(url);
        if (baseUrl) {
          const baseParsed = new URL(baseUrl);
          if (parsed.host !== baseParsed.host) {
            return false;
          }
        } else {
          const host = parsed.host.toLowerCase();
          if (host.includes('wa.me') || host.includes('whatsapp') || host.includes('facebook') || host.includes('instagram') || host.includes('twitter') || host.includes('youtube') || host.includes('snapchat')) {
            return false;
          }
        }
      }

      // Standard Salla route with p followed by ID
      if (/[\/-]p\d+/.test(lower)) {
        return true;
      }
      // Clean SEO URL suffix containing SKU barcode prefix
      const lastSegment = lower.split('/').pop() || '';
      if (/^\d{6,}/.test(lastSegment)) {
        return true;
      }
      // Generic fallback for any URLs containing a barcode digits pattern
      if (/\b\d{8,14}\b/.test(lower)) {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  private parseSallaJsonLd(html: string): any[] {
    const results: any[] = [];
    const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (!matches) return results;

    function parseImageUrl(imageField: any): string | null {
      if (!imageField) return null;
      if (typeof imageField === 'string') return imageField;
      if (Array.isArray(imageField) && imageField.length > 0) {
        const first = imageField[0];
        if (typeof first === 'string') return first;
        return first?.url || null;
      }
      if (typeof imageField === 'object') {
        return imageField.url || null;
      }
      return null;
    }

    for (const match of matches) {
      try {
        const jsonText = match
          .replace(/<script\s+type="application\/ld\+json">/i, '')
          .replace(/<\/script>/i, '')
          .trim();
        const json = JSON.parse(jsonText);
        const items = Array.isArray(json) ? json : [json];

        for (const obj of items) {
          if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
            for (const el of obj.itemListElement) {
              const product = el.item;
              if (product && product.name && product.url && this.isValidSallaProductUrl(product.url)) {
                results.push({
                  name: product.name,
                  url: product.url,
                  image: parseImageUrl(product.image),
                });
              }
            }
          }

          if (obj['@type'] === 'Product' && obj.name && obj.url && this.isValidSallaProductUrl(obj.url)) {
            results.push({
              name: obj.name,
              url: obj.url,
              image: parseImageUrl(obj.image),
            });
          }

          if (Array.isArray(obj.itemListElement)) {
            for (const el of obj.itemListElement) {
              if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url && this.isValidSallaProductUrl(el.item.url)) {
                results.push({
                  name: el.item.name,
                  url: el.item.url,
                  image: parseImageUrl(el.item.image),
                });
              }
            }
          }
        }
      } catch { /* ignore */ }
    }
    return results;
  }

  async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://etaamexpress.com',
  ): Promise<SallaArProductMatch[]> {
    productNameAr = productNameAr.trim();
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    let searchUrl = `${cleanBaseUrl}/search?q=${encodeURIComponent(productNameAr)}`;

    this.logger.log(`[Salla Scraper] Gathering search candidates for "${productNameAr}" on store: ${baseUrl}...`);

    let searchResults: { name: string; url: string; image: string | null }[] = [];

    // --- Fast Path: Axios ---
    const html = await this.fetchHtmlWithAxios(searchUrl);
    if (html) {
      const parsed = this.parseSallaJsonLd(html);
      searchResults = parsed.filter(r => !isGenericButtonOrLabel(r.name));
      if (searchResults.length > 0) {
        this.logger.log(`[Fast Path Axios] Successfully scraped ${searchResults.length} search candidates via Axios!`);
      }
    }

    // --- Fallback Path: Playwright-stealth ---
    if (searchResults.length === 0) {
      this.logger.log(`[Fallback Path] Axios returned empty or failed. Initializing Playwright browser fallback...`);
      await this.ensureLaunched();
      if (!this.context) throw new Error('Browser context not initialized');

      const page = await this.acquirePage();
      try {
        await this.applyHostThrottling(searchUrl);
        await this.navigateWithEvasion(page, searchUrl, 'domcontentloaded', 60000, 400, 1200);
        
        try {
          await page.waitForSelector('custom-salla-product-card a, salla-product-card a, salla-products-list a, .product-block a, .product-card a, salla-empty-state, .s-infinite-scroll-empty, .no-results', {
            timeout: this.getAdaptiveSelectorTimeout(baseUrl),
          });
        } catch (e) {
          this.logger.debug(`[Salla Scraper] Timeout waiting for product selectors on search page: ${e.message}`);
        }
        await page.waitForTimeout(500);

        searchResults = await page.evaluate(() => {
          function parseImageUrl(imageField: any): string | null {
            if (!imageField) return null;
            if (typeof imageField === 'string') return imageField;
            if (Array.isArray(imageField) && imageField.length > 0) {
              const first = imageField[0];
              if (typeof first === 'string') return first;
              return first?.url || null;
            }
            if (typeof imageField === 'object') {
              return imageField.url || null;
            }
            return null;
          }

          function isValidSallaProductUrl(url: string): boolean {
            if (!url) return false;
            try {
              const parsed = new URL(url, window.location.href);
              if (parsed.host !== window.location.host) {
                return false; // MUST be on the same domain
              }
              const lower = parsed.pathname.toLowerCase();
              if (lower.includes('/c/') || lower.includes('/category/') || lower.includes('/categories/')) {
                return false;
              }
              const blacklist = [
                '/cart', '/checkout', '/wishlist', '/login', '/register', '/sign-in', '/sign-up', 
                '/logout', '/profile', '/account', '/contact', '/about', '/terms', '/privacy', 
                '/shipping', '/refund', '/faq', '/help', '/support', '/home', '/search', '/pages/'
              ];
              if (blacklist.some(term => lower.includes(term))) {
                return false;
              }
              // Standard Salla route with p followed by ID
              if (/[\/-]p\d+/.test(lower)) {
                return true;
              }
              // Clean SEO URL suffix containing SKU barcode prefix
              const lastSegment = lower.split('/').pop() || '';
              if (/^\d{6,}/.test(lastSegment)) {
                return true;
              }
              // Generic fallback for any URLs containing a barcode digits pattern
              if (/\b\d{8,14}\b/.test(lower)) {
                return true;
              }
              return false;
            } catch {
              return false;
            }
          }

          function isGenericButtonOrLabel(name: string): boolean {
            if (!name) return true;
            const clean = name.trim().replace(/\s+/g, ' ').toLowerCase();
            const blacklisted = [
              'اضف الى السلة', 'أضف إلى السلة', 'اضف للسلة', 'أضف للسلة',
              'اضافة للسلة', 'إضافة للسلة', 'اضافة الى السلة', 'إضافة إلى السلة',
              'اشتر الآن', 'اشتري الآن', 'شراء الآن', 'نفدت الكمية', 'نفذت الكمية',
              'غير متوفر', 'تفاصيل المنتج', 'عرض المنتج', 'قراءة المزيد', 'تفاصيل',
              'المزيد', 'سلة المشتريات', 'أضف للمقارنة', 'أضف للمفضلة', 'معاينة', 'سريع',
              'add to cart', 'add to basket', 'buy now', 'out of stock', 'sold out',
              'read more', 'details', 'view product', 'quick view', 'add to wishlist',
              'add to compare', 'go to cart'
            ];
            return clean.length <= 2 || blacklisted.some(term => clean === term);
          }

          const results: { name: string; url: string; image: string | null }[] = [];
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));

          for (const script of ldScripts) {
            try {
              const json = JSON.parse(script.textContent || '{}');
              const items = Array.isArray(json) ? json : [json];

              for (const obj of items) {
                if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
                  for (const el of obj.itemListElement) {
                    const product = el.item;
                    if (product && product.name && product.url && isValidSallaProductUrl(product.url) && !isGenericButtonOrLabel(product.name)) {
                      results.push({
                        name: product.name,
                        url: product.url,
                        image: parseImageUrl(product.image),
                      });
                    }
                  }
                }

                if (obj['@type'] === 'Product' && obj.name && obj.url && isValidSallaProductUrl(obj.url) && !isGenericButtonOrLabel(obj.name)) {
                  results.push({
                    name: obj.name,
                    url: obj.url,
                    image: parseImageUrl(obj.image),
                  });
                }

                if (Array.isArray(obj.itemListElement)) {
                  for (const el of obj.itemListElement) {
                    if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url && isValidSallaProductUrl(el.item.url) && !isGenericButtonOrLabel(el.item.name)) {
                      results.push({
                        name: el.item.name,
                        url: el.item.url,
                        image: parseImageUrl(el.item.image),
                      });
                    }
                  }
                }
              }
            } catch { /* ignore */ }
          }

          if (results.length > 0) {
            return results;
          }

          // 2. Direct DOM element selectors for Salla search page
          // Look for custom Salla product cards
          const productCards = document.querySelectorAll('salla-product-card, custom-salla-product-card');
          for (const card of Array.from(productCards)) {
            const linkEl = card.querySelector('a') as HTMLAnchorElement;
            if (!linkEl) continue;
            const url = linkEl.href;

            const titleEl = card.querySelector('h1, h2, h3, h4, h5, .title, .name, [class*="title"], [class*="name"]');
            const name = titleEl?.textContent?.trim() || linkEl.textContent?.trim() || card.textContent?.trim() || '';

            let image: string | null = null;
            const imgEl = card.querySelector('img');
            if (imgEl) {
              image = imgEl.src || imgEl.getAttribute('data-src') || imgEl.getAttribute('lazy-src') || null;
            }

            if (name && url && isValidSallaProductUrl(url) && !isGenericButtonOrLabel(name)) {
              results.push({ name, url, image });
            }
          }

          if (results.length > 0) {
            return results;
          }

          // 3. Fallback to salla-products-list
          const listEl = document.querySelector('salla-products-list');
          if (listEl) {
            const anchors = listEl.querySelectorAll('a');
            for (const a of Array.from(anchors)) {
              const url = a.href;
              if (!url || url.includes('/c/') || url.includes('/category/')) continue;

              const name = a.textContent?.trim() || '';
              let image: string | null = null;
              const imgEl = a.querySelector('img') || a.parentElement?.querySelector('img');
              if (imgEl) {
                image = imgEl.src || imgEl.getAttribute('data-src') || null;
              }

              if (name && name.length > 3 && isValidSallaProductUrl(url) && !isGenericButtonOrLabel(name)) {
                results.push({ name, url, image });
              }
            }
          }

          if (results.length > 0) {
            return results;
          }

          // 4. Fallback: Generic product item/card classes
          const productItemEls = document.querySelectorAll('[class*="product-item"], [class*="product-card"], .product, .item');
          for (const item of Array.from(productItemEls)) {
            const linkEl = item.querySelector('a') as HTMLAnchorElement;
            if (!linkEl) continue;
            const url = linkEl.href;
            if (!url || url.includes('/c/') || url.includes('/category/')) continue;

            const name = linkEl.textContent?.trim() || item.textContent?.trim() || '';
            let image: string | null = null;
            const imgEl = item.querySelector('img');
            if (imgEl) {
              image = imgEl.src || imgEl.getAttribute('data-src') || null;
            }

            if (name && name.length > 3 && isValidSallaProductUrl(url) && !isGenericButtonOrLabel(name)) {
              results.push({ name, url, image });
            }
          }

          if (results.length > 0) {
            return results;
          }

          // 5. Ultimate fallback: Match any anchors pointing to potential product pages
          const anchors = document.querySelectorAll('a');
          for (const a of Array.from(anchors)) {
            const url = a.href;
            if (!url || url.includes('/c/') || url.includes('/category/') || url.includes('/page-') || url.includes('facebook') || url.includes('instagram')) continue;

            const text = a.textContent?.trim() || '';
            if (text.length > 5 && isValidSallaProductUrl(url) && !isGenericButtonOrLabel(text)) {
              let image: string | null = null;
              const imgEl = a.querySelector('img') || a.parentElement?.querySelector('img');
              if (imgEl) {
                image = imgEl.src || imgEl.getAttribute('data-src') || null;
              }
              results.push({ name: text, url, image });
            }
          }

          return results;
        });

        this.logger.log(`[Fallback Playwright] Scraped ${searchResults.length} candidates.`);
      } finally {
        await this.releasePage(page);
      }
    }

    searchResults = searchResults.filter((r) => this.isValidSallaProductUrl(r.url, baseUrl));

    if (searchResults.length === 0) {
      return [];
    }

    const isPureBarcode = /^\d{8,14}$/.test(productNameAr);
    if (isPureBarcode) {
      this.logger.log(`[Barcode Bypass] Pure barcode query detected: ${productNameAr}. Returning top ${Math.min(searchResults.length, 12)} candidate(s).`);
      return searchResults.slice(0, 12).map((r) => ({
        name: r.name,
        url: r.url,
        image: r.image,
        similarity: 1.0,
        matchMethod: 'text',
      }));
    }

    const normalizedQuery = this.normalizeArabic(productNameAr);
    const brandToken = normalizedQuery
      .split(/\s+/)
      .find((w) => w.length >= 2 && !BRAND_GUARD_STOPWORDS_AR.has(w)) ?? '';

    const candidates: Array<SallaArProductMatch & { image?: string | null }> = [];

    for (const result of searchResults) {
      const candidateName = this.normalizeArabic(result.name);

      if (brandToken && !candidateName.includes(brandToken)) {
        this.logger.debug(
          `[Brand Guard] Rejected '${result.name}' for query '${productNameAr}' (missing brand token: '${brandToken}')`,
        );
        continue;
      }

      if (!this.sizeGuardPasses(productNameAr, result.name)) {
        this.logger.debug(
          `[Size Guard] Rejected '${result.name}' for query '${productNameAr}'`,
        );
        continue;
      }

      const similarity = diceCoefficient(normalizedQuery, candidateName);
      if (similarity >= threshold) {
        candidates.push({ ...result, similarity, matchMethod: 'text' });
      }
    }

    candidates.sort((a, b) => b.similarity - a.similarity);
    return candidates;
  }

  async searchAndGetBestMatch(
    productNameAr: string,
    threshold: number = 0.7,
    localHashes?: string[],
    baseUrl: string = 'https://etaamexpress.com',
  ): Promise<SallaArProductMatch | null> {
    const candidates = await this.searchAndGetCandidates(productNameAr, threshold, localHashes, baseUrl);
    if (candidates.length === 0) {
      return null;
    }

    if (localHashes && localHashes.length > 0) {
      const fastPathCandidates = candidates.filter((c) => c.similarity >= 0.85);
      if (fastPathCandidates.length > 0) {
        fastPathCandidates.sort((a, b) => b.similarity - a.similarity);
        const bestFast = fastPathCandidates[0];
        this.logger.log(
          `[Fast Path Match] High-confidence text match resolved for "${productNameAr}" -> "${bestFast.name}" (Similarity: ${bestFast.similarity.toFixed(2)})`
        );
        return { ...bestFast, matchMethod: 'text' };
      }

      const fuzzyCandidates = candidates.filter((c) => c.similarity >= 0.50 && c.similarity < 0.85);
      const visualMatches: Array<SallaArProductMatch & { hammingDistance: number }> = [];

      for (const candidate of fuzzyCandidates) {
        if (!candidate.image) {
          this.logger.debug(`[Visual Match] Candidate has no image, skipping: "${candidate.name}"`);
          continue;
        }

        try {
          this.logger.debug(`[Visual Match] Downloading and hashing: ${candidate.image}`);
          const candidateHash = await this.imageHashService.generateHashFromUrl(candidate.image);
          
          let minDistance = 64;
          for (const localHash of localHashes) {
            const distance = this.imageHashService.calculateHammingDistance(candidateHash, localHash);
            if (distance < minDistance) {
              minDistance = distance;
            }
          }

          this.logger.debug(`[Visual Match] Min Hamming distance for "${candidate.name}" is ${minDistance}`);

          if (minDistance <= 6) {
            this.logger.log(
              `[Image Match] Confident visual match found for "${productNameAr}" -> "${candidate.name}" (Hamming Distance: ${minDistance}, Text Similarity: ${candidate.similarity.toFixed(2)})`
            );
            visualMatches.push({
              ...candidate,
              matchMethod: 'image',
              hammingDistance: minDistance,
            });
          }
        } catch (hashError) {
          this.logger.warn(`Failed to process visual match for candidate "${candidate.name}": ${hashError.message}`);
        }
      }

      if (visualMatches.length > 0) {
        visualMatches.sort((a, b) => a.hammingDistance - b.hammingDistance);
        return visualMatches[0];
      }

      this.logger.debug(`No confident visual or fast path match found for "${productNameAr}" using local hashes.`);
      return null;
    } else {
      return candidates[0];
    }
  }

  async scrapeGtinFromProductPage(productUrl: string): Promise<string | null> {
    // --- Fast Path: Axios ---
    const html = await this.fetchHtmlWithAxios(productUrl);
    if (html) {
      const gtin = this.parseGtinFromHtml(html);
      if (gtin) {
        this.logger.log(`[Fast Path Axios] Successfully resolved GTIN: ${gtin} via Axios!`);
        return gtin;
      }
    }

    // --- Fallback Path: Playwright-stealth ---
    this.logger.log(`[Fallback Path] Axios GTIN parsing failed. Loading Playwright page fallback...`);
    await this.ensureLaunched();
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.acquirePage();
    try {
      await this.applyHostThrottling(productUrl);
      await this.navigateWithEvasion(page, productUrl, 'domcontentloaded', 60000, 400, 1200);
      try {
        await page.waitForSelector('h1, .product-title, .title', { timeout: 5000 });
      } catch (e) {
        this.logger.debug(`[Salla Scraper] Timeout waiting for selectors on product page: ${e.message}`);
      }
      await page.waitForTimeout(500);

      const gtin = await page.evaluate(() => {
        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const products = Array.isArray(json) ? json : [json];
            const product = products.find((i: any) => i['@type'] === 'Product');
            if (product && (product.gtin13 || product.sku || product.gtin12 || product.gtin)) {
              return product.gtin13 || product.sku || product.gtin12 || product.gtin;
            }
          }
        } catch (e) { /* ignore */ }

        const modelNodes = document.querySelectorAll('.product-details li, .product-info li, .product__details li, [id*="sku"], [class*="sku"], .product-sku');
        for (const node of Array.from(modelNodes)) {
          if (node.classList.contains('product-sku')) {
            const valSpan = node.querySelector('span.font-bold, span:last-child');
            if (valSpan?.textContent) {
               const val = valSpan.textContent.trim();
               if (/^\d{8,}$/.test(val)) return val;
            }
          }
        
          const text = node.textContent?.toLowerCase() || '';
          if (text.includes('رقم الموديل') || text.includes('model number') || text.includes('sku') || text.includes('barcode') || text.includes('باركود')) {
             const valueMatch = text
               .replace('رقم الموديل', '').replace('model number', '')
               .replace('sku', '').replace('barcode', '').replace('باركود', '')
               .replace(':', '').trim();
             if (valueMatch && valueMatch.length > 5 && /^\d+$/.test(valueMatch)) {
               return valueMatch;
             }
             const span = node.querySelector('span:not(.label), b, strong, .value');
             if (span?.textContent) {
                 const val = span.textContent.trim();
                 if (/^\d+$/.test(val)) return val;
             }
          }
        }

        const allScripts = document.querySelectorAll('script');
        for (const script of Array.from(allScripts)) {
          const content = script.textContent || '';
          const match = content.match(/"sku"\s*:\s*"(\d{8,})"/);
          if (match && match[1]) {
             return match[1];
          }
        }
        return null;
      });

      return gtin || null;
      } finally {
        await this.releasePage(page);
      }
  }

  private parseGtinFromHtml(html: string): string | null {
    // 1. Try matching the text-unicode class or sicon-barcode structure in Salla HTML (our most direct and reliable barcode element)
    const textUnicodeMatch = html.match(/class="[^"]*text-unicode[^"]*"[^>]*>\s*(\d{8,14})\s*</i);
    if (textUnicodeMatch && textUnicodeMatch[1]) {
      return textUnicodeMatch[1].trim();
    }

    // 2. Regex over application/ld+json matches, accepting only numeric barcodes
    const ldMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (ldMatches) {
      for (const script of ldMatches) {
        try {
          const jsonText = script
            .replace(/<script\s+type="application\/ld\+json">/i, '')
            .replace(/<\/script>/i, '')
            .trim();
          const json = JSON.parse(jsonText);
          const products = Array.isArray(json) ? json : [json];
          const product = products.find((i: any) => i['@type'] === 'Product');
          if (product) {
            const possible = product.gtin13 || product.sku || product.gtin12 || product.gtin;
            if (possible) {
              const cleaned = String(possible).trim();
              if (/^\d{8,14}$/.test(cleaned)) {
                return cleaned;
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    // 3. Direct SKU match inside JavaScript script elements if pure numeric
    const scriptMatches = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        const match = script.match(/"sku"\s*:\s*"(\d{8,14})"/);
        if (match && match[1]) {
          return match[1];
        }
      }
    }

    return null;
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

  private static extractSizes(
    text: string,
  ): Array<{ normalized: number; dim: 'vol' | 'mass' }> {
    const sizes: Array<{ normalized: number; dim: 'vol' | 'mass' }> = [];

    // Latin units
    const reLatin = /(?:\d+[x×])?([\d]+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = reLatin.exec(text)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      if (unit === 'ml') sizes.push({ normalized: val, dim: 'vol' });
      else if (unit === 'oz') sizes.push({ normalized: val * 29.574, dim: 'vol' });
      else if (unit === 'l') sizes.push({ normalized: val * 1000, dim: 'vol' });
      else if (unit === 'g') sizes.push({ normalized: val, dim: 'mass' });
      else if (unit === 'kg') sizes.push({ normalized: val * 1000, dim: 'mass' });
    }

    // Arabic units
    const reArabic = /(?:\d+[x×])?([\d]+(?:[.,]\d+)?)\s*(مل|ملل|لتر|جرام|غرام|غ|جم|كجم|كغ|كيلو|كيلوجرام|كيلوغرام)(?![a-zA-Z0-9\u0600-\u06FF])/g;
    while ((m = reArabic.exec(text)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      if (['مل', 'ملل'].includes(unit)) {
        sizes.push({ normalized: val, dim: 'vol' });
      } else if (unit === 'لتر') {
        sizes.push({ normalized: val * 1000, dim: 'vol' });
      } else if (['جرام', 'غرام', 'غ', 'جم'].includes(unit)) {
        sizes.push({ normalized: val, dim: 'mass' });
      } else if (['كجم', 'كغ', 'كيلو', 'كيلوجرام', 'كيلوغرام'].includes(unit)) {
        sizes.push({ normalized: val * 1000, dim: 'mass' });
      }
    }

    return sizes;
  }

  private sizeGuardPasses(query: string, candidate: string): boolean {
    const qSizes = SallaGtinArScraper.extractSizes(query);
    const cSizes = SallaGtinArScraper.extractSizes(candidate);

    for (const dim of ['vol', 'mass'] as const) {
      const qVals = qSizes.filter((s) => s.dim === dim).map((s) => s.normalized);
      const cVals = cSizes.filter((s) => s.dim === dim).map((s) => s.normalized);

      if (qVals.length === 0 || cVals.length === 0) continue;

      const qUnit = Math.min(...qVals);
      const cUnit = Math.min(...cVals);

      const tolerance = 0.10;
      const diff = Math.abs(qUnit - cUnit) / Math.max(qUnit, cUnit);
      if (diff > tolerance) {
        return false;
      }
    }

    return true;
  }

  private parseProductDetailsFromHtml(html: string): { gtin: string | null; price: number | null; name: string | null; image: string | null } | null {
    const ldMatches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    let name: string | null = null;
    let image: string | null = null;
    let gtin: string | null = null;
    let price: number | null = null;

    // 1. Try meta tag product:sale_price:amount FIRST to prioritize the active promotional offer price
    const salePriceMeta = html.match(/<meta\s+property="product:sale_price:amount"\s+content="([^"]+)"/i);
    if (salePriceMeta) {
      const parsed = parseFloat(salePriceMeta[1]);
      if (!isNaN(parsed)) {
        price = parsed;
      }
    }

    if (ldMatches) {
      for (const script of ldMatches) {
        try {
          const jsonText = script
            .replace(/<script\s+type="application\/ld\+json">/i, '')
            .replace(/<\/script>/i, '')
            .trim();
          const json = JSON.parse(jsonText);
          let products = Array.isArray(json) ? json : [json];
          const graphItems = products.filter((item: any) => Array.isArray(item['@graph'])).flatMap((item: any) => item['@graph']);
          products = [...products, ...graphItems];
          const product = products.find((i: any) => i['@type'] === 'Product');
          if (product) {
            if (!name && product.name) name = String(product.name);
            if (!image && product.image) {
              if (typeof product.image === 'string') image = product.image;
              else if (Array.isArray(product.image) && product.image.length > 0) {
                image = typeof product.image[0] === 'string' ? product.image[0] : (product.image[0]?.url || null);
              } else if (typeof product.image === 'object') {
                image = product.image.url || null;
              }
            }
            if (!gtin) {
              const possible = product.gtin13 || product.sku || product.gtin12 || product.gtin || null;
              if (possible) {
                const cleaned = String(possible).trim();
                // Reject non-numeric slugs and paths (only accept numeric barcodes)
                if (/^\d{8,14}$/.test(cleaned)) {
                  gtin = cleaned;
                }
              }
            }
            if (price === null && product.offers) {
              const offers = product.offers;
              if (typeof offers.price !== 'undefined') {
                price = parseFloat(String(offers.price));
              } else if (typeof offers.lowPrice !== 'undefined') {
                price = parseFloat(String(offers.lowPrice));
              } else if (Array.isArray(offers) && offers.length > 0) {
                price = parseFloat(String(offers[0].price));
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    if (!gtin) {
      gtin = this.parseGtinFromHtml(html);
    }
    if (!name) {
      const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i) ||
                    html.match(/<meta\s+name="twitter:title"\s+content="([^"]+)"/i);
      if (ogTitle) name = ogTitle[1];
      else {
        const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
        if (titleMatch) name = titleMatch[1].trim();
      }
    }
    if (!image) {
      const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i);
      if (ogImage) image = ogImage[1];
    }
    if (price === null) {
      const priceMeta = html.match(/<meta\s+property="product:price:amount"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+name="twitter:data1"\s+content="([^"]+)"/i) ||
                        html.match(/class="[^"]*price[^"]*"[^>]*>\s*([\d.]+)/i) ||
                        html.match(/"price"\s*:\s*"([\d.]+)"/i) ||
                        html.match(/"price"\s*:\s*([\d.]+)"/i);
      if (priceMeta) {
        const parsed = parseFloat(priceMeta[1]);
        if (!isNaN(parsed)) price = parsed;
      }
    }

    if (name || gtin || price !== null || image) {
      return { gtin, price, name, image };
    }
    return null;
  }

  async scrapeProductDetails(productUrl: string): Promise<{ gtin: string | null; price: number | null; name: string | null; image: string | null } | null> {
    const html = await this.fetchHtmlWithAxios(productUrl);
    if (html) {
      const details = this.parseProductDetailsFromHtml(html);
      if (details && details.price !== null && details.name) {
        this.logger.log(`[Fast Path Axios] Successfully resolved product details for ${productUrl} (gtin: ${details.gtin})`);
        return details;
      }
    }

    this.logger.log(`[Fallback Path] Axios details retrieval incomplete or failed. Loading Playwright page...`);
    await this.ensureLaunched();
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.applyHostThrottling(productUrl);
      await this.navigateWithEvasion(page, productUrl, 'domcontentloaded', 60000, 400, 1200);
      try {
        await page.waitForSelector('h1, .product-title, .title', { timeout: 5000 });
      } catch (e) {
        this.logger.debug(`[Salla Scraper] Timeout waiting for selectors on details page: ${e.message}`);
      }
      await page.waitForTimeout(500);

      const details = await page.evaluate(() => {
        let name: string | null = null;
        let image: string | null = null;
        let gtin: string | null = null;
        let price: number | null = null;

        // 1. Prioritize sale price meta tag first
        const saleMeta = document.querySelector('meta[property="product:sale_price:amount"]');
        if (saleMeta) {
          const parsed = parseFloat(saleMeta.getAttribute('content') || '');
          if (!isNaN(parsed)) price = parsed;
        }

        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            let products = Array.isArray(json) ? json : [json];
            const graphItems = products.filter((item: any) => Array.isArray(item['@graph'])).flatMap((item: any) => item['@graph']);
            products = [...products, ...graphItems];
            const product = products.find((i: any) => i['@type'] === 'Product');
            if (product) {
              if (!name && product.name) name = String(product.name);
              if (!image && product.image) {
                if (typeof product.image === 'string') image = product.image;
                else if (Array.isArray(product.image) && product.image.length > 0) {
                  image = typeof product.image[0] === 'string' ? product.image[0] : (product.image[0]?.url || null);
                } else if (typeof product.image === 'object') {
                  image = product.image.url || null;
                }
              }
              if (!gtin) {
                const possible = product.gtin13 || product.sku || product.gtin12 || product.gtin || null;
                if (possible) {
                  const cleaned = String(possible).trim();
                  if (/^\d{8,14}$/.test(cleaned)) {
                    gtin = cleaned;
                  }
                }
              }
              if (price === null && product.offers) {
                const offers = product.offers;
                if (typeof offers.price !== 'undefined') {
                  price = parseFloat(String(offers.price));
                } else if (typeof offers.lowPrice !== 'undefined') {
                  price = parseFloat(String(offers.lowPrice));
                }
              }
            }
          }
        } catch (e) { /* ignore */ }

        if (!name) {
          const titleHeader = document.querySelector('h1, .product-title, .title');
          name = titleHeader?.textContent?.trim() || document.title || null;
        }

        if (!image) {
          const mainImg = document.querySelector('.product-image img, .main-image img, img.product-main-image');
          image = mainImg?.getAttribute('src') || mainImg?.getAttribute('data-src') || null;
        }

        if (!gtin) {
          const textUnicodeEl = document.querySelector('.text-unicode');
          if (textUnicodeEl?.textContent) {
            const cleaned = textUnicodeEl.textContent.trim();
            if (/^\d{8,14}$/.test(cleaned)) {
              gtin = cleaned;
            }
          }
        }

        if (!gtin) {
          const skuDiv = document.querySelector('div.div-product-sku, .product-sku, .sku-label');
          if (skuDiv?.textContent) {
            const cleanedSku = skuDiv.textContent.replace(/[^\d]/g, '').trim();
            if (cleanedSku && cleanedSku.length >= 8 && cleanedSku.length <= 14) {
              gtin = cleanedSku;
            }
          }
        }

        if (price === null) {
          const priceEl = document.querySelector('.product-price, .price, [class*="price"]');
          if (priceEl?.textContent) {
            const match = priceEl.textContent.match(/[\d.]+/);
            if (match) price = parseFloat(match[0]);
          }
        }

        return { gtin, price, name, image };
      });

      return details;
    } finally {
      await page.close().catch((err) => this.logger.warn(`Failed to close product details page: ${err.message}`));
    }
  }
}
