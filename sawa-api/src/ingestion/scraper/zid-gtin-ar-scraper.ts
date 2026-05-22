import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { diceCoefficient } from '../../utils/string-similarity';
import { Page } from 'playwright';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';
import axios from 'axios';
import { getRandomUA } from './evasion';

export interface ZidArProductMatch {
  name: string;
  url: string;
  similarity: number;
  image?: string | null;
  matchMethod?: 'text' | 'image';
  hammingDistance?: number;
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
export class ZidGtinArScraper extends BaseScraper {
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

    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/zid-ar';
    scraperConfig.channel = scraperConfig.channel ?? 'chrome';
    scraperConfig.deviceProfile = scraperConfig.deviceProfile ?? 'desktop';
    super(robotsTxtService, scraperConfig);
  }

  async scrapeListingPage(categoryUrl: string, page: number): Promise<any[]> {
    throw new Error('Method not implemented for ZidGtinArScraper.');
  }

  async scrapeDetailPage(productUrl: string): Promise<any> {
    throw new Error('Method not implemented for ZidGtinArScraper. Use scrapeGtinFromProductPage.');
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

  private isValidZidProductUrl(url: string): boolean {
    if (!url) return false;
    try {
      const lower = url.toLowerCase();
      if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:') || lower.startsWith('whatsapp:') || lower.startsWith('sms:')) {
        return false;
      }
      if (!lower.includes('/products/')) {
        return false;
      }
      let path = lower;
      if (lower.startsWith('http://') || lower.startsWith('https://')) {
        path = new URL(lower).pathname;
      }
      if (path === '/products' || path === '/products/' || path.includes('/categories') || path.includes('/c/')) {
        return false;
      }
      const blacklist = [
        '/cart', '/checkout', '/wishlist', '/login', '/register', '/sign-in', '/sign-up', 
        '/logout', '/profile', '/account', '/contact', '/about', '/terms', '/privacy', 
        '/shipping', '/refund', '/faq', '/help', '/support', '/home', '/search'
      ];
      if (blacklist.some(term => lower.includes(term))) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper to parse product cards from raw Zid HTML string.
   */
  private parseZidProductsFromHtml(html: string, origin: string): any[] {
    const results: any[] = [];

    // 1. Try JSON-LD first (Zid sometimes embeds product list JSON-LD)
    const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (matches) {
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
                if (product && product.name && product.url) {
                  const fullUrl = product.url.startsWith('http') ? product.url : `${origin}${product.url.startsWith('/') ? '' : '/'}${product.url}`;
                  if (this.isValidZidProductUrl(fullUrl)) {
                    results.push({
                      name: product.name,
                      url: fullUrl,
                      image: product.image || (Array.isArray(product.image) ? product.image[0] : null),
                    });
                  }
                }
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    if (results.length > 0) return results;

    // 2. Fallback to Regex product-item card extraction
    const cardRegex = /<div\s+[^>]*class="[^"]*(?:product-item|product-card)[^"]*"([\s\S]*?)<\/div>/gi;
    let cardMatch: RegExpExecArray | null;
    
    // To handle nested divs, we search within each matched card snippet
    while ((cardMatch = cardRegex.exec(html)) !== null) {
      const cardHtml = cardMatch[1];

      // Extract href link
      const hrefMatch = cardHtml.match(/href="([^"]*\/products\/[^"]*)"/i);
      if (!hrefMatch) continue;

      let url = hrefMatch[1];
      if (!url.startsWith('http')) {
        url = `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
      }

      if (!this.isValidZidProductUrl(url)) continue;

      // Extract image source (ignoring spinner/placeholders)
      let image: string | null = null;
      const imgRegex = /<img\s+[^>]*src="([^"]*)"|<img\s+[^>]*data-src="([^"]*)"/gi;
      let imgMatch: RegExpExecArray | null;
      while ((imgMatch = imgRegex.exec(cardHtml)) !== null) {
        const src = imgMatch[1] || imgMatch[2];
        if (src && !src.includes('spinner') && !src.includes('placeholder') && !src.includes('.gif')) {
          image = src;
          break;
        }
      }

      // Extract title / name
      let name = '';
      const titleMatch = cardHtml.match(/<h[1-6]\s+[^>]*>([\s\S]*?)<\/h[1-6]>/i) ||
                         cardHtml.match(/<span\s+[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i) ||
                         cardHtml.match(/class="product-title"[^>]*>([\s\S]*?)<\/div>/i);
      if (titleMatch) {
        name = titleMatch[1].replace(/<[^>]*>/g, '').trim();
      }

      if (!name) {
        // Fallback to text inside link containing title
        const textMatch = cardHtml.match(/<a\s+[^>]*>([\s\S]*?)<\/a>/i);
        if (textMatch) {
          name = textMatch[1].replace(/<[^>]*>/g, '').trim();
        }
      }

      if (name && url) {
        results.push({ name, url, image });
      }
    }

    return results;
  }

  async searchAndGetCandidates(
    productNameAr: string,
    threshold: number = 0.5,
    localHashes?: string[],
    baseUrl: string = 'https://parkcentersa.com',
  ): Promise<ZidArProductMatch[]> {
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    let searchUrl = `${cleanBaseUrl}/products?q=${encodeURIComponent(productNameAr)}`;

    this.logger.log(`[Zid Scraper] Gathering search candidates for "${productNameAr}" on store: ${baseUrl}...`);

    let searchResults: { name: string; url: string; image: string | null }[] = [];

    // --- Fast Path: Axios ---
    const html = await this.fetchHtmlWithAxios(searchUrl);
    if (html) {
      // 1. Try parsing directly from HTML (for server-side rendered Zid storefronts if any)
      searchResults = this.parseZidProductsFromHtml(html, cleanBaseUrl);
      
      // 2. If empty, Zid might be a client-side rendered SPA. Attempt to extract initial state and query its storefront API directly
      if (searchResults.length === 0) {
        const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
        if (stateMatch) {
          try {
            const base64Str = stateMatch[1];
            const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
            const state = JSON.parse(decoded);
            const apiAuth = state.apiAuthorization;
            const storeId = state.storeId;
            
            if (apiAuth && storeId) {
              this.logger.log(`[Fast Path Zid API] Extracted authorization and store ID. Querying storefront API directly...`);
              const apiHeaders = {
                'User-Agent': getRandomUA('desktop'),
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                'Referer': `${cleanBaseUrl}/`,
                'Authorization': `Bearer ${apiAuth}`,
                'X-Authorization': apiAuth,
                'Store-Id': String(storeId),
                'X-Store-ID': String(storeId),
              };
              
              const apiUrl = `${cleanBaseUrl}/api/v1/products?q=${encodeURIComponent(productNameAr)}`;
              const apiRes = await axios.get(apiUrl, {
                headers: apiHeaders as any,
                timeout: 10000,
              });
              
              if (apiRes.status === 200 && apiRes.data?.data?.products?.data) {
                const apiProducts = apiRes.data.data.products.data;
                for (const p of apiProducts) {
                  if (p.name && p.slug) {
                    const productUrl = `${cleanBaseUrl}/products/${p.slug}`;
                    let imgUrl: string | null = null;
                    if (p.images && p.images.length > 0) {
                      imgUrl = p.images[0]?.image?.large || p.images[0]?.image?.small || p.images[0]?.image?.full_size || null;
                    }
                    searchResults.push({
                      name: p.name,
                      url: productUrl,
                      image: imgUrl,
                    });
                  }
                }
                this.logger.log(`[Fast Path Zid API] Successfully scraped ${searchResults.length} search candidates via API!`);
              }
            }
          } catch (apiErr: any) {
            this.logger.warn(`[Fast Path Zid API] failed to fetch from Zid storefront API: ${apiErr.message}`);
          }
        }
      }

      if (searchResults.length > 0) {
        this.logger.log(`[Fast Path Axios] Successfully resolved ${searchResults.length} search candidates via Axios/API!`);
      }
    }

    // --- Fallback Path: Playwright-stealth ---
    if (searchResults.length === 0) {
      this.logger.log(`[Fallback Path] Axios returned empty or failed. Initializing Playwright browser fallback...`);
      await this.ensureLaunched();
      if (!this.context) throw new Error('Browser context not initialized');

      const page = await this.context.newPage();
      try {
        await this.applyHostThrottling(searchUrl);
        await this.navigateWithEvasion(page, searchUrl, 'domcontentloaded', 60000, 400, 1200);
        await page.waitForTimeout(2000);

        searchResults = await page.evaluate(() => {
          function isValidZidProductUrl(url: string): boolean {
            if (!url) return false;
            const lower = url.toLowerCase();
            if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('javascript:') || lower.startsWith('whatsapp:') || lower.startsWith('sms:')) {
              return false;
            }
            if (!lower.includes('/products/')) {
              return false;
            }
            const blacklist = [
              '/cart', '/checkout', '/wishlist', '/login', '/register', '/sign-in', '/sign-up', 
              '/logout', '/profile', '/account', '/contact', '/about', '/terms', '/privacy', 
              '/shipping', '/refund', '/faq', '/help', '/support', '/home', '/search'
            ];
            if (blacklist.some(term => lower.includes(term))) {
              return false;
            }
            return true;
          }

          const results: { name: string; url: string; image: string | null }[] = [];
          
          // Selectors matching product items or cards in Zid storefronts
          const cards = document.querySelectorAll('.product-item, .product-card, [class*="product-card"], [class*="product-item"]');

          for (const card of Array.from(cards)) {
            const linkEl = card.querySelector('a[href*="/products/"]') as HTMLAnchorElement;
            if (!linkEl) continue;

            const url = linkEl.href;
            if (!isValidZidProductUrl(url)) continue;
            
            // Find non-gif product image
            let image: string | null = null;
            const imgs = card.querySelectorAll('img');
            for (const img of Array.from(imgs)) {
              const src = img.src || img.getAttribute('data-src');
              if (src && !src.includes('spinner') && !src.includes('placeholder') && !src.includes('.gif')) {
                image = src;
                break;
              }
            }

            // Find title
            const titleEl = card.querySelector('.product-title, .title, h3, h4, span.product-name');
            const name = titleEl?.textContent?.trim() || linkEl.textContent?.trim() || '';

            if (name && url) {
              results.push({ name, url, image });
            }
          }
          return results;
        });

        this.logger.log(`[Fallback Playwright] Scraped ${searchResults.length} candidates.`);
      } finally {
        await page.close().catch((err) => this.logger.warn(`Failed to close search page: ${err.message}`));
      }
    }

    searchResults = searchResults.filter((r) => this.isValidZidProductUrl(r.url));

    if (searchResults.length === 0) {
      return [];
    }

    const isPureBarcode = /^\d{8,14}$/.test(productNameAr);
    if (isPureBarcode) {
      this.logger.log(`[Barcode Bypass] Pure barcode query detected: ${productNameAr}. Returning top ${Math.min(searchResults.length, 3)} candidate(s).`);
      return searchResults.slice(0, 3).map((r) => ({
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

    const candidates: Array<ZidArProductMatch & { image?: string | null }> = [];

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
    baseUrl: string = 'https://parkcentersa.com',
  ): Promise<ZidArProductMatch | null> {
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
      const visualMatches: Array<ZidArProductMatch & { hammingDistance: number }> = [];

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
      let bestMatch: ZidArProductMatch | null = null;
      for (const candidate of candidates) {
        if (candidate.similarity >= threshold) {
          if (!bestMatch || candidate.similarity > bestMatch.similarity) {
            bestMatch = { ...candidate, matchMethod: 'text' };
          }
        }
      }
      return bestMatch;
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

    const page = await this.context.newPage();
    try {
      await this.applyHostThrottling(productUrl);
      await this.navigateWithEvasion(page, productUrl, 'domcontentloaded', 60000, 400, 1200);
      await page.waitForTimeout(2000);

      const gtin = await page.evaluate(() => {
        // 1. Try standard JSON-LD
        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const products = Array.isArray(json) ? json : [json];
            const product = products.find((i: any) => i['@type'] === 'Product');
            if (product && (product.sku || product.gtin13 || product.gtin || product.gtin12)) {
              return product.sku || product.gtin13 || product.gtin || product.gtin12;
            }
          }
        } catch (e) { /* ignore */ }

        // 2. Try Zid's barcode DOM fallback
        const skuDiv = document.querySelector('div.div-product-sku, .product-sku, .sku-label');
        if (skuDiv?.textContent) {
          const cleanedSku = skuDiv.textContent.replace(/[^\d]/g, '').trim();
          if (cleanedSku && cleanedSku.length >= 8) {
            return cleanedSku;
          }
        }

        // 3. Fallback: search for numbers that look like barcode
        const allText = document.body.innerText;
        const matches = allText.match(/\b\d{8,14}\b/g) || [];
        if (matches.length > 0) {
          // Typically pick the first one that fits standard GTIN formats
          return matches[0];
        }

        return null;
      });

      return gtin || null;
    } finally {
      await page.close().catch((err) => this.logger.warn(`Failed to close product page: ${err.message}`));
    }
  }

  private parseGtinFromHtml(html: string): string | null {
    // 1. Regex over application/ld+json matches
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
          if (product && (product.sku || product.gtin13 || product.gtin || product.gtin12)) {
            return String(product.sku || product.gtin13 || product.gtin || product.gtin12);
          }
        } catch { /* ignore */ }
      }
    }

    // 2. Direct SKU matching from div-product-sku DOM element matching
    const skuMatch = html.match(/class="[^"]*div-product-sku[^"]*"[^>]*>\s*([\d]+)\s*<\/div>/i) ||
                     html.match(/class="[^"]*product-sku[^"]*"[^>]*>\s*([\d]+)\s*<\/div>/i);
    if (skuMatch && skuMatch[1]) {
      return skuMatch[1];
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
    const qSizes = ZidGtinArScraper.extractSizes(query);
    const cSizes = ZidGtinArScraper.extractSizes(candidate);

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
              gtin = product.gtin13 || product.sku || product.gtin12 || product.gtin || null;
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
      if (details && details.gtin && details.price !== null && details.name) {
        this.logger.log(`[Fast Path Axios] Successfully resolved product details for ${productUrl}!`);
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
      await page.waitForTimeout(2000);

      const details = await page.evaluate(() => {
        let name: string | null = null;
        let image: string | null = null;
        let gtin: string | null = null;
        let price: number | null = null;

        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const products = Array.isArray(json) ? json : [json];
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
                gtin = product.gtin13 || product.sku || product.gtin12 || product.gtin || null;
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
          const skuDiv = document.querySelector('div.div-product-sku, .product-sku, .sku-label');
          if (skuDiv?.textContent) {
            const cleanedSku = skuDiv.textContent.replace(/[^\d]/g, '').trim();
            if (cleanedSku && cleanedSku.length >= 8) {
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
