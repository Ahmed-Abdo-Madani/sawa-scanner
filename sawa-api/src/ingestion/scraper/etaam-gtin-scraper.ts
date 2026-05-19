import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseScraper } from './base-scraper';
import { diceCoefficient } from '../../utils/string-similarity';
import { Page } from 'playwright';
import { RobotsTxtService } from './robots-txt.service';

export interface EtaamProductMatch {
  name: string;
  url: string;
  similarity: number;
}

/**
 * First-word tokens that are generic descriptors, colors, or food categories —
 * NOT brand names. When the first meaningful word of a product name is in this
 * set, the brand guard is skipped and matching falls back to similarity scoring.
 */
const BRAND_GUARD_STOPWORDS = new Set([
  // Colors
  'yellow', 'red', 'green', 'blue', 'white', 'black', 'golden', 'gold', 'brown', 'orange',
  'pink', 'purple', 'grey', 'gray', 'silver',
  // Generic adjectives
  'classic', 'original', 'premium', 'fresh', 'pure', 'natural', 'organic',
  'light', 'lite', 'extra', 'super', 'mini', 'big', 'large', 'small',
  'new', 'old', 'traditional', 'special', 'regular', 'whole', 'full', 'low',
  'fat', 'free', 'sugar', 'zero', 'diet', 'high', 'rich', 'smooth', 'crispy',
  'deluxe', 'select', 'choice', 'finest', 'best', 'top', 'pro', 'plus', 'ultra',
  // Arabic-rooted transliterations (not brand-specific)
  'al', 'el',
  // Food category words (not brands)
  'milk', 'juice', 'water', 'oil', 'cheese', 'butter', 'cream', 'bread',
  'chicken', 'beef', 'lamb', 'fish', 'rice', 'flour', 'salt', 'sugar', 'honey',
  'banana', 'apple', 'mango', 'date', 'dates', 'tomato', 'potato', 'onion',
  'egg', 'eggs', 'yoghurt', 'yogurt', 'laban', 'ghee', 'chocolate', 'coffee',
  'tea', 'biscuit', 'cake', 'chips', 'snack', 'candy', 'gum',
]);

@Injectable()
export class EtaamGtinScraper extends BaseScraper {
  
  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
  ) {
    const scraperConfig = configService.get<{ headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop' }>('scraper') ?? { headless: true };
    super(robotsTxtService, scraperConfig);
  }

  async scrapeListingPage(categoryUrl: string, page: number): Promise<any[]> {
    throw new Error('Method not implemented for EtaamGtinScraper.');
  }

  async scrapeDetailPage(productUrl: string): Promise<any> {
    throw new Error('Method not implemented for EtaamGtinScraper. Use scrapeGtinFromProductPage.');
  }

  async searchAndGetBestMatch(
    productName: string,
    threshold: number = 0.8,
  ): Promise<EtaamProductMatch | null> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      const searchUrl = new URL('https://etaamexpress.com/en/search');
      searchUrl.searchParams.set('q', productName);
      searchUrl.searchParams.set('lang', 'en');

      // Salla uses client-side hydration. `load` ensures scripts have run and injected LD+JSON.
      await this.navigateWithEvasion(page, searchUrl.toString(), 'load', 60000, 400, 1200);
      
      // Wait a moment for Salla's Vue/Alpine components to mount and inject the LD+JSON
      await page.waitForTimeout(2000);
      const searchResults = await page.evaluate(() => {
        const results: { name: string; url: string }[] = [];
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
                    results.push({ name: product.name, url: product.url });
                  }
                }
              }

              // Direct product entries
              if (obj['@type'] === 'Product' && obj.name && obj.url) {
                results.push({ name: obj.name, url: obj.url });
              }

              // BreadcrumbList with nested products
              if (Array.isArray(obj.itemListElement)) {
                for (const el of obj.itemListElement) {
                  if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url) {
                    results.push({ name: el.item.name, url: el.item.url });
                  }
                }
              }
            }
          } catch { /* ignore */ }
        }

        return results;
      });

      this.logger.debug(`Search for '${productName}' found ${searchResults.length} results via script parsing`);

      if (searchResults.length === 0) {
        return null;
      }

      let bestMatch: EtaamProductMatch | null = null;
      const normalizedQuery = productName.toLowerCase();

      // Brand-name guard: extract the first meaningful, non-generic word as the brand token.
      // Tokens in BRAND_GUARD_STOPWORDS (colors, adjectives, food categories) are skipped
      // so generic product names like "Yellow Banana" or "Classic Hummus" don't false-reject.
      const brandToken = normalizedQuery
        .split(/\s+/)
        .find((w) => w.length >= 3 && !BRAND_GUARD_STOPWORDS.has(w)) ?? '';

      for (const result of searchResults) {
        const candidateName = result.name.toLowerCase();

        // Hard reject: brand must be present in candidate name
        if (brandToken && !candidateName.includes(brandToken)) {
          this.logger.debug(
            `Brand guard rejected '${result.name}' for query '${productName}' (brand token: '${brandToken}')`,
          );
          continue;
        }

        // Size guard: reject if the unit size is in the same dimension but differs by > 10%
        if (!this.sizeGuardPasses(productName, result.name)) {
          this.logger.debug(
            `Size guard rejected '${result.name}' for query '${productName}'`,
          );
          continue;
        }

        const similarity = diceCoefficient(normalizedQuery, candidateName);

        if (similarity >= threshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            bestMatch = { ...result, similarity };
          }
        }
      }

      return bestMatch;
    } finally {
      await page.close().catch((err) => this.logger.warn(`Failed to close search page: ${err.message}`));
    }
  }

  /**
   * Extracts and normalizes all size/weight tokens from a product name string.
   * Handles: ml, mL, L, g, kg — and multi-pack notation like "18x185ml" (picks unit size).
   * Returns an array of { normalized: number, dim: 'vol' | 'mass' }
   */
  private static extractSizes(
    text: string,
  ): Array<{ normalized: number; dim: 'vol' | 'mass' }> {
    const sizes: Array<{ normalized: number; dim: 'vol' | 'mass' }> = [];
    // Match optional "NxM" multi-pack prefix then the numeric value and unit
    const re = /(?:\d+x)?(\d+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz)\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const val = parseFloat(m[1].replace(',', '.'));
      const unit = m[2].toLowerCase();
      if (unit === 'ml') {
        sizes.push({ normalized: val, dim: 'vol' });
      } else if (unit === 'oz') {
        sizes.push({ normalized: val * 29.574, dim: 'vol' });
      } else if (unit === 'l') {
        sizes.push({ normalized: val * 1000, dim: 'vol' });
      } else if (unit === 'g') {
        sizes.push({ normalized: val, dim: 'mass' });
      } else if (unit === 'kg') {
        sizes.push({ normalized: val * 1000, dim: 'mass' });
      }
    }
    return sizes;
  }

  /**
   * Size guard: returns true (allow) if the candidate size is compatible with the query size.
   * Hard-rejects when both have a size in the same dimension and they differ by > 10%.
   * Examples that PASS: "1L" vs "18x1L" (multi-pack of same unit), "330ml" vs "320ml" (≤10% diff)
   * Examples that FAIL: "400ml" vs "800ml" (100% diff), "500g" vs "1kg" (100% diff)
   */
  private sizeGuardPasses(query: string, candidate: string): boolean {
    const qSizes = EtaamGtinScraper.extractSizes(query);
    const cSizes = EtaamGtinScraper.extractSizes(candidate);

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

  async scrapeGtinFromProductPage(productUrl: string): Promise<string | null> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
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
          if (text.includes('رقم الموديل') || text.includes('model number') || text.includes('sku') || text.includes('barcode')) {
             const valueMatch = text.replace('رقم الموديل', '').replace('model number', '').replace('sku', '').replace('barcode', '').replace(':', '').trim();
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
}
