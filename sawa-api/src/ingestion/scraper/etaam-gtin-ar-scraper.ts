import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { diceCoefficient } from '../../utils/string-similarity';
import { Page } from 'playwright';
import { RobotsTxtService } from './robots-txt.service';
import { ImageHashService } from '../image-hash.service';

export interface EtaamArProductMatch {
  name: string;
  url: string;
  similarity: number;
  image?: string | null;
  matchMethod?: 'text' | 'image';
  hammingDistance?: number;
}

/**
 * Arabic brand guard stopwords — generic Arabic descriptors, colors, and food
 * categories that should NOT be treated as brand tokens. When the first
 * meaningful word of an Arabic product name is in this set, the brand guard is
 * skipped and matching falls back to pure similarity scoring.
 */
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
export class EtaamGtinArScraper extends BaseScraper {
  
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
    private readonly imageHashService: ImageHashService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop'; channel?: string }>('scraper') ?? { headless: true };
    
    // Support toggling headless mode dynamically via environment variables
    const envHeadless = process.env.ETAAM_SCRAPER_HEADLESS;
    if (envHeadless === 'false') {
      scraperConfig.headless = false;
    } else if (envHeadless === 'true') {
      scraperConfig.headless = true;
    }

    scraperConfig.cookieSessionPath = scraperConfig.cookieSessionPath ?? './scraper-sessions/etaam-ar';
    scraperConfig.channel = scraperConfig.channel ?? 'chrome';
    scraperConfig.deviceProfile = scraperConfig.deviceProfile ?? 'desktop';
    super(robotsTxtService, scraperConfig);
  }

  async scrapeListingPage(categoryUrl: string, page: number): Promise<any[]> {
    throw new Error('Method not implemented for EtaamGtinArScraper.');
  }

  async scrapeDetailPage(productUrl: string): Promise<any> {
    throw new Error('Method not implemented for EtaamGtinArScraper. Use scrapeGtinFromProductPage.');
  }

  /**
   * Searches Etaam Express in ARABIC locale for the given Arabic product name.
   * Uses /ar/search endpoint with Arabic query text.
   */
  async searchAndGetBestMatch(
    productNameAr: string,
    threshold: number = 0.7,
    localHashes?: string[],
  ): Promise<EtaamArProductMatch | null> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      const searchUrl = new URL('https://etaamexpress.com/ar/search');
      searchUrl.searchParams.set('q', productNameAr);

      await this.applyThrottling();
      // Salla uses client-side hydration. `load` ensures scripts have run and injected LD+JSON.
      await this.navigateWithEvasion(page, searchUrl.toString(), 'load', 60000, 400, 1200);
      
      // Wait a moment for Salla's Vue/Alpine components to mount and inject the LD+JSON
      await page.waitForTimeout(2000);
      const searchResults = await page.evaluate(() => {
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

        const results: { name: string; url: string; image: string | null }[] = [];
        const ldScripts = Array.from(
          document.querySelectorAll('script[type="application/ld+json"]')
        );

        for (const script of ldScripts) {
          try {
            const json = JSON.parse(script.textContent || '{}');
            const items = Array.isArray(json) ? json : [json];

            for (const obj of items) {
              // Handle BreadcrumbList / ItemList of ListItems
              if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
                for (const el of obj.itemListElement) {
                  const product = el.item;
                  if (product && product.name && product.url) {
                    results.push({
                      name: product.name,
                      url: product.url,
                      image: parseImageUrl(product.image),
                    });
                  }
                }
              }

              // Direct product entries
              if (obj['@type'] === 'Product' && obj.name && obj.url) {
                results.push({
                  name: obj.name,
                  url: obj.url,
                  image: parseImageUrl(obj.image),
                });
              }

              // BreadcrumbList with nested products
              if (Array.isArray(obj.itemListElement)) {
                for (const el of obj.itemListElement) {
                  if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url) {
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
      });

      this.logger.debug(`[AR] Search for '${productNameAr}' found ${searchResults.length} results via script parsing`);

      if (searchResults.length === 0) {
        return null;
      }

      let bestMatch: EtaamArProductMatch | null = null;

      // Normalize Arabic text for comparison — strip diacritics (tashkeel)
      const normalizedQuery = this.normalizeArabic(productNameAr);

      // Arabic brand guard: extract the first meaningful, non-generic word as brand token
      const brandToken = normalizedQuery
        .split(/\s+/)
        .find((w) => w.length >= 2 && !BRAND_GUARD_STOPWORDS_AR.has(w)) ?? '';

      const candidates: Array<EtaamArProductMatch & { image?: string | null }> = [];

      for (const result of searchResults) {
        const candidateName = this.normalizeArabic(result.name);

        // Hard reject: brand token must be present in candidate name
        if (brandToken && !candidateName.includes(brandToken)) {
          this.logger.debug(
            `[AR] Brand guard rejected '${result.name}' for query '${productNameAr}' (brand token: '${brandToken}')`,
          );
          continue;
        }

        // Size guard: reject if the unit size is in the same dimension but differs by > 10%
        if (!this.sizeGuardPasses(productNameAr, result.name)) {
          this.logger.debug(
            `[AR] Size guard rejected '${result.name}' for query '${productNameAr}'`,
          );
          continue;
        }

        const similarity = diceCoefficient(normalizedQuery, candidateName);
        candidates.push({ ...result, similarity });
      }

      // If we have local image hashes to compare with, use the hybrid decision matrix
      if (localHashes && localHashes.length > 0) {
        const fastPathCandidates = candidates.filter((c) => c.similarity >= 0.85);
        if (fastPathCandidates.length > 0) {
          // Select the highest text similarity among fast path candidates
          fastPathCandidates.sort((a, b) => b.similarity - a.similarity);
          const bestFast = fastPathCandidates[0];
          this.logger.log(
            `[AR] [Fast Path Match] High-confidence text match resolved for "${productNameAr}" -> "${bestFast.name}" (Similarity: ${bestFast.similarity.toFixed(2)})`
          );
          return {
            ...bestFast,
            matchMethod: 'text',
          };
        }

        // No fast-path match: evaluate candidates with similarity between 0.50 and 0.85 visually
        const fuzzyCandidates = candidates.filter((c) => c.similarity >= 0.50 && c.similarity < 0.85);
        const visualMatches: Array<EtaamArProductMatch & { hammingDistance: number }> = [];

        for (const candidate of fuzzyCandidates) {
          if (!candidate.image) {
            this.logger.debug(`[AR] Fuzzy candidate has no image, skipping visual matching: "${candidate.name}"`);
            continue;
          }

          try {
            this.logger.debug(`[AR] [Visual Match] Downloading and hashing candidate image: ${candidate.image}`);
            const candidateHash = await this.imageHashService.generateHashFromUrl(candidate.image);
            
            let minDistance = 64;
            for (const localHash of localHashes) {
              const distance = this.imageHashService.calculateHammingDistance(candidateHash, localHash);
              if (distance < minDistance) {
                minDistance = distance;
              }
            }

            this.logger.debug(`[AR] [Visual Match] Min Hamming distance for "${candidate.name}" is ${minDistance}`);

            if (minDistance <= 6) {
              this.logger.log(
                `[AR] [Image Match] Confident visual match found for "${productNameAr}" -> "${candidate.name}" (Hamming Distance: ${minDistance}, Text Similarity: ${candidate.similarity.toFixed(2)})`
              );
              visualMatches.push({
                ...candidate,
                matchMethod: 'image',
                hammingDistance: minDistance,
              });
            }
          } catch (hashError) {
            this.logger.warn(`[AR] Failed to process visual match for candidate "${candidate.name}" image: ${hashError.message}`);
          }
        }

        if (visualMatches.length > 0) {
          // Select the best visual match (lowest Hamming distance)
          visualMatches.sort((a, b) => a.hammingDistance - b.hammingDistance);
          return visualMatches[0];
        }

        this.logger.debug(`[AR] No confident visual or fast path match found for "${productNameAr}" using local hashes.`);
        return null;
      } else {
        // Fallback: pure text-based matching using the original threshold
        for (const candidate of candidates) {
          if (candidate.similarity >= threshold) {
            if (!bestMatch || candidate.similarity > bestMatch.similarity) {
              bestMatch = { ...candidate, matchMethod: 'text' };
            }
          }
        }
        return bestMatch;
      }
    } finally {
      await page.close().catch((err) => this.logger.warn(`Failed to close search page: ${err.message}`));
    }
  }

  /**
   * Normalizes Arabic text for comparison:
   * - Strips tashkeel (diacritics: فَتْحَة، كَسْرَة، ضَمَّة، سُكُون، etc.)
   * - Normalizes alef variants (أ إ آ ا → ا)
   * - Normalizes taa marbouta (ة → ه)
   * - Strips tatweel (ـ kashida)
   * - Lowercases Latin characters mixed in
   * - Collapses whitespace
   */
  private normalizeArabic(text: string): string {
    return text
      // Remove Arabic diacritics (tashkeel)
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // Normalize alef variants → plain alef
      .replace(/[أإآٱ]/g, 'ا')
      // Normalize taa marbouta → haa
      .replace(/ة/g, 'ه')
      // Remove tatweel (kashida)
      .replace(/ـ/g, '')
      // Lowercase any Latin chars mixed in
      .toLowerCase()
      // Collapse whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extracts and normalizes all size/weight tokens from a product name string.
   * Handles Latin units (ml, L, g, kg) AND Arabic units (مل، لتر، جرام، غرام، كجم، كغ، كيلو).
   * Also handles multi-pack notation like "18×185مل" (picks unit size).
   */
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

  /**
   * Size guard: returns true (allow) if the candidate size is compatible with the query size.
   * Hard-rejects when both have a size in the same dimension and they differ by > 10%.
   */
  private sizeGuardPasses(query: string, candidate: string): boolean {
    const qSizes = EtaamGtinArScraper.extractSizes(query);
    const cSizes = EtaamGtinArScraper.extractSizes(candidate);

    for (const dim of ['vol', 'mass'] as const) {
      const qVals = qSizes.filter((s) => s.dim === dim).map((s) => s.normalized);
      const cVals = cSizes.filter((s) => s.dim === dim).map((s) => s.normalized);

      if (qVals.length === 0 || cVals.length === 0) continue; // one side missing size → pass

      // Use the smallest value on each side (= unit size, not pack total)
      const qUnit = Math.min(...qVals);
      const cUnit = Math.min(...cVals);

      const tolerance = 0.10; // ±10% for minor rounding differences on labels
      const diff = Math.abs(qUnit - cUnit) / Math.max(qUnit, cUnit);
      if (diff > tolerance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Scrapes the GTIN / barcode from a product detail page on Etaam Express.
   * Identical logic to the English scraper — GTIN is language-agnostic on the page.
   */
  async scrapeGtinFromProductPage(productUrl: string): Promise<string | null> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.applyThrottling();
      // Salla uses hydration. `load` ensures scripts have run and injected the correct LD+JSON/DOM.
      await this.navigateWithEvasion(page, productUrl, 'load', 60000, 400, 1200);

      await page.waitForTimeout(2000);

      const gtin = await page.evaluate(() => {
        // 1. Try to find the SKU / GTIN in structured data
        try {
          const ldScripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]'),
          );
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const products = Array.isArray(json) ? json : [json];
            const product = products.find((i: any) => i['@type'] === 'Product');
            if (product && (product.gtin13 || product.sku || product.gtin12 || product.gtin)) {
              return product.gtin13 || product.sku || product.gtin12 || product.gtin;
            }
          }
        } catch (e) {
          // ignore parsing errors
        }

        // 2. Fallback to Salla UI elements for Model Number or SKU
        const modelNodes = document.querySelectorAll('.product-details li, .product-info li, .product__details li, [id*="sku"], [class*="sku"], .product-sku');
        for (const node of Array.from(modelNodes)) {
          // If it's the exact Salla Twilight theme element: div.product-sku
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
             // Sometimes the value is in a child span
             const span = node.querySelector('span:not(.label), b, strong, .value');
             if (span?.textContent) {
                 const val = span.textContent.trim();
                 if (/^\d+$/.test(val)) return val;
             }
          }
        }

        // 3. Regex over all scripts for Salla analytics/event data
        const allScripts = document.querySelectorAll('script');
        for (const script of Array.from(allScripts)) {
          const content = script.textContent || '';
          const match = content.match(/"sku"\s*:\s*"(\d{8,})"/);
          if (match && match[1]) {
             return match[1];
          }
        }
        
        // 4. Fallback to any element containing something that looks like a GTIN if labeled clearly
        return null;
      });
      
      return gtin || null;
    } finally {
      await page.close().catch((err) => this.logger.warn(`Failed to close product page: ${err.message}`));
    }
  }

  /**
   * Applies deterministic sleep delay with randomized jitter to mimic human browsing.
   */
  private async applyThrottling(): Promise<void> {
    const delayBase = parseInt(process.env.ETAAM_SCRAPER_REQUEST_DELAY_MS || '3000', 10);
    // Add jitter: between 80% and 120% of base delay
    const jitterFactor = 0.8 + Math.random() * 0.4;
    const finalDelay = Math.round(delayBase * jitterFactor);
    this.logger.debug(`[Throttling] Sleeping for ${finalDelay}ms to evade Salla rate limits...`);
    await new Promise((resolve) => setTimeout(resolve, finalDelay));
  }
}
