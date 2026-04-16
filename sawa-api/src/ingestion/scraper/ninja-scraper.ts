import { Page, Request, Response } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';
import { Logger } from '@nestjs/common';

export interface NinjaCategoryLink {
  name: string;
  url: string;
}

function findJSONObjects(text: string, marker: string): any[] {
  const results: any[] = [];
  let searchIndex = 0;
  
  while ((searchIndex = text.indexOf(marker, searchIndex)) !== -1) {
    let pos = searchIndex;
    let found = false;

    // Search backwards for potential starting braces
    while (pos >= 0) {
      pos = text.lastIndexOf('{', pos);
      if (pos === -1) break;

      let braceCount = 0;
      let inString = false;
      let isEscaped = false;
      let closedIndex = -1;

      for (let i = pos; i < text.length; i++) {
        const char = text[i];
        if (inString) {
          if (char === '\\') { isEscaped = !isEscaped; } 
          else if (char === '"' && !isEscaped) { inString = false; } 
          else { isEscaped = false; }
        } else {
          if (char === '"') { inString = true; } 
          else if (char === '{') { braceCount++; } 
          else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              closedIndex = i;
              break;
            }
          }
        }
      }

      if (closedIndex !== -1 && closedIndex >= searchIndex) {
        const potentialJson = text.substring(pos, closedIndex + 1);
        try {
          const parsed = JSON.parse(potentialJson);
          // If it's a valid JSON and it's the smallest one containing our marker
          results.push(parsed);
          found = true;
          break; // Found the immediate containing object
        } catch (e) {}
      }
      pos--; // Move before this '{' to look for a parent
    }
    searchIndex += marker.length;
  }
  return results;
}

export class NinjaScraper extends BaseScraper {
  private readonly GRAPHQL_ENDPOINT = 'graphql.ananinja.com';

  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    const url = pageNum > 1 ? `${categoryUrl}?page=${pageNum}` : categoryUrl;
    
    try {
      const capturedProductsMap = new Map<string, ScrapedProductData>();

      // 1. GQL Interception
      page.on('response', async (response: Response) => {
        if (response.url().includes(this.GRAPHQL_ENDPOINT)) {
          try {
            const request = response.request();
            const postData = JSON.parse(request.postData() || '{}');
            
            // Only capture from the actual listing operation
            if (postData.operationName === 'CatalogProducts' || postData.operationName === 'GetCategory') {
              const json = await response.json();
              const categoryPath = new URL(categoryUrl).pathname;
              const products = this.extractProductsFromList(json, categoryPath);
              products.forEach(p => {
                if (p.gtin && p.gtin !== '1') {
                  capturedProductsMap.set(p.gtin, p);
                }
              });
            }
          } catch (err) {}
        }
      });

      // 2. Navigation
      this.logger.log(`Navigating to category: ${url}`);
      await this.navigateWithEvasion(page, url, 'commit', 30000);

      // 3. Hydration Sweep BEFORE logic (Static SSR)
      const categoryPath = new URL(categoryUrl).pathname;
      const staticProducts = await this.sweepHydrationData(page, categoryPath);
      staticProducts.forEach(p => {
        if (p.gtin && p.gtin !== '1') capturedProductsMap.set(p.gtin, p);
      });

      // 4. Auto-Scroll to trigger dynamic GQL/Hydration
      this.logger.debug('Auto-scrolling for dynamic content...');
      await this.autoScroll(page);
      await page.waitForTimeout(3000);

      // 5. Final Hydration Sweep (Dynamic CSR)
      const dynamicProducts = await this.sweepHydrationData(page, categoryPath);
      dynamicProducts.forEach(p => {
        if (p.gtin && p.gtin !== '1' && p.productPageUrl) capturedProductsMap.set(p.gtin, p);
      });

      const products = Array.from(capturedProductsMap.values());
      this.logger.log(`Page ${pageNum}: Found ${products.length} products.`);
      return products;
    } finally {
      await page.close();
    }
  }

  async getSubcategories(categoryUrl: string): Promise<NinjaCategoryLink[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, categoryUrl, 'commit', 30000);
      const subcategories = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/category/"]'))
          .filter(a => !a.closest('header, nav, footer, aside, [class*="nav"], [class*="header"], [class*="sidebar"], [class*="menu"]'));
        const uniqueLinks = Array.from(new Map(
          links.map(a => {
            const anchor = a as HTMLAnchorElement;
            return [anchor.href, {
              name: anchor.textContent?.trim() || anchor.getAttribute('aria-label') || 'Category',
              url: anchor.href
            }];
          })
        ).values());
        return uniqueLinks.filter(link => {
          const isCurrent = (link.url as string).endsWith(window.location.pathname);
          const isRestaurant = (link.url as string).includes('/restaurant/') || (link.url as string).includes('cuisine');
          return link.url && !isCurrent && !isRestaurant;
        });
      });
      return subcategories as NinjaCategoryLink[];
    } finally {
      await page.close();
    }
  }

  async scrapeDetailPage(productUrl: string): Promise<ScrapedProductData & { page?: Page }> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    try {
      const captured = new Map<string, ScrapedProductData>();
      const productIdFromUrl = productUrl.split('/').pop()?.split('-').pop();

      page.on('response', async (response: Response) => {
        if (response.url().includes(this.GRAPHQL_ENDPOINT)) {
          try {
            const request = response.request();
            const postData = JSON.parse(request.postData() || '{}');

            if (postData.operationName === 'GetProductDetail') {
              const json = await response.json();
              this.extractProductsFromList(json).forEach(p => {
                const storefrontId = p.productPageUrl.split('/').pop()?.split('-').pop();
                if (storefrontId === productIdFromUrl || productUrl.includes(storefrontId || '')) {
                  captured.set(storefrontId || p.gtin || 'unknown', p);
                }
              });
            }
          } catch (err) {}
        }
      });

      await this.navigateWithEvasion(page, productUrl, 'commit', 30000);
      await page.waitForTimeout(1000);
      await this.autoScroll(page);
      await page.waitForTimeout(500);
      
      const hydration = await this.sweepHydrationData(page);
      if (hydration && hydration.length > 0) {
        let matched = hydration.find(p => {
          const storefrontId = p.productPageUrl.split('/').pop()?.split('-').pop() || p.gtin;
          return storefrontId === productIdFromUrl || productUrl.includes(storefrontId || '');
        });
        
        if (!matched && hydration.length > 0) {
           matched = hydration[0]; 
        }

        if (matched) {
           captured.set(matched.gtin || 'unknown', matched);
        }
      }

      if (captured.size === 0) {
        this.logger.debug(`Hydration/GQL extraction failed for ${productUrl}. Attempting DOM fallback...`);
        const domData = await page.evaluate((url) => {
          const h1 = document.querySelector('h1');
          const name = h1?.textContent?.trim();
          if (!name) return null;

          const priceEl = document.querySelector('[class*="Price"], [class*="price"]');
          const priceText = priceEl?.textContent || '';
          
          const img = document.querySelector('img[src*="/product/"], img[class*="Product"]');
          const imageUrl = img?.getAttribute('src');

          const urlParts = url.split('-');
          const id = urlParts[urlParts.length - 1];

          return {
            name,
            price: parseFloat(priceText.replace(/[^0-9.]/g, '') || '0'),
            gtin: id,
            imageUrls: imageUrl ? [imageUrl] : [],
            inStock: !document.body.textContent?.includes('Out of stock'),
            description: document.querySelector('[class*="description"], [class*="Description"]')?.textContent?.trim() || ''
          };
        }, productUrl);

        if (domData && domData.gtin) {
          captured.set(domData.gtin, domData as any);
        }
      }

      if (captured.size === 0) {
        await page.close();
        throw new Error('Could not capture product detail');
      }
      
      const products = Array.from(captured.values());
      const best = products.sort((a: ScrapedProductData, b: ScrapedProductData) => (b.description?.length || 0) - (a.description?.length || 0))[0];
      return { ...best, productPageUrl: productUrl, page };
    } catch (err) {
      await page.close().catch(() => {});
      throw err;
    }
  }

  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      let totalHeight = 0;
      const distance = 400;
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, distance);
        totalHeight += distance;
        await new Promise(r => setTimeout(r, 200));
      }
    });
  }

  private async sweepHydrationData(page: Page, filterPath?: string): Promise<ScrapedProductData[]> {
    const products: ScrapedProductData[] = [];
    const rscStrings = new Map<string, string>(); // To resolve referenced strings (e.g. descriptions)

    const scriptContents = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('script')).map(s => {
        return {
          id: s.id,
          type: s.getAttribute('type') || '',
          text: s.textContent || ''
        };
      });
    });

    for (const { id, type, text } of scriptContents) {
      if (!text) continue;
      
      // 1. Handle application/ld+json (Structured Data)
      if (type === 'application/ld+json') {
        try {
          const json = JSON.parse(text);
          // JSON-LD can be a single object or an array (Graph)
          const items = Array.isArray(json) ? json : (json['@graph'] || [json]);
          items.forEach((item: any) => {
            if (item['@type'] === 'Product' || item.name) {
              const mapped = this.mapProduct(item);
              if (mapped) products.push(mapped);
            }
          });
        } catch (e) {}
      }

      // 2. Handle __NEXT_DATA__
      if (id === '__NEXT_DATA__' || text.includes('"pageProps"')) {
         try {
           const json = text.startsWith('{') ? JSON.parse(text) : null;
           if (json) {
             this.extractProductsFromList(json, filterPath).forEach(p => products.push(p));
           }
         } catch (e) {}
      }

      // 3. Handle self.__next_f.push (Modern Next.js RSC)
      if (text.includes('self.__next_f.push')) {
        const chunks: string[] = [];
        const regexNextF = /self\.__next_f\.push\(\[\d+,\s*"(?<content>(?:[^"\\]|\\.)*)"\]\)/gs;
        let match;
        while ((match = regexNextF.exec(text)) !== null) {
          try {
             const rawEncoded = (match.groups as any).content;
             let raw = rawEncoded
               .replace(/\\"/g, '"')
               .replace(/\\\\/g, '\\')
               .replace(/\\n/g, '\n')
               .replace(/\\t/g, '\t');
             chunks.push(raw);

             const stringMatch = raw.match(/^([a-f0-9]+):(?:T|I)(.*)$/);
             if (stringMatch) {
               rscStrings.set(stringMatch[1], stringMatch[2]);
             }
          } catch(e) {}
        }

        const fullStream = chunks.join('');
        const jsons = [...findJSONObjects(fullStream, '"productId"'), ...findJSONObjects(fullStream, '"gtin"')];
        jsons.forEach(json => {
          const mapped = this.mapProduct(json);
          if (mapped) {
            if (mapped.description?.startsWith('$')) {
              const refId = mapped.description.substring(1);
              mapped.description = rscStrings.get(refId) || mapped.description;
            }
            products.push(mapped);
          }
        });
      }

      // 4. Fallback: Deep search in any script text
      const rawJsons = [
        ...findJSONObjects(text, '"productId"'), 
        ...findJSONObjects(text, '"gtin"'), 
        ...findJSONObjects(text, '"@type":"Product"'),
        ...findJSONObjects(text, '"nameAr"')
      ];
      rawJsons.forEach(json => {
        const mapped = this.mapProduct(json);
        if (mapped) products.push(mapped);
      });
    }

    const seen = new Set<string>();
    return products.filter(p => {
      // Use Storefront ID from URL as part of uniqueness if available
      const id = p.gtin || p.productPageUrl.split('/').pop()?.split('-').pop();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private extractProductsFromList(json: any, filterPath?: string): ScrapedProductData[] {
    const products: ScrapedProductData[] = [];
    const seen = new Set<string>();

    const recursiveFind = (obj: any) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach(o => recursiveFind(o));
        return;
      }
      
      const id = obj.productId || obj.id || obj.gtin;
      const name = obj.name || obj.nameEn || obj.displayName || obj.title;
      const hasProductKeys = obj.price !== undefined || obj.priceCents !== undefined || obj.isAvailable !== undefined || obj.inStock !== undefined || obj.gtin || obj.offers;
      
      if (id && name && name.length > 2 && id !== '1' && hasProductKeys) {
        const mapped = this.mapProduct(obj);
        if (mapped && mapped.gtin && !seen.has(mapped.gtin)) {
          products.push(mapped);
          seen.add(mapped.gtin);
        }
      }
      
      Object.values(obj).forEach(val => recursiveFind(val));
    };

    recursiveFind(json);
    return products;
  }

  private mapProduct(p: any): ScrapedProductData | null {
    const name = p.name || p.nameEn || p.displayName || p.title;
    if (!name || name.length < 2) return null;

    // Ignore banners and placeholders
    const lowerName = name.toLowerCase();
    if (lowerName.includes('banner') || lowerName.includes('promo') || lowerName.includes('deal of the day')) {
      return null;
    }

    // Capture price from multiple sources (Cents vs JSON-LD vs Nested Object)
    let price: number = 0;
    
    // 1. Check cents fields (Next.js Hydration)
    const priceCents = p.priceCents || p.discountedPriceCents || p.originalPriceCents || 0;
    if (priceCents > 0) {
      price = priceCents / 100;
    } 
    // 2. Check JSON-LD offers (Static SSR)
    else if (p.offers?.price) {
      price = parseFloat(p.offers.price);
    }
    // 3. Fallback to raw price strings/objects
    else {
      const rawPrice = p.price?.amount || p.price || p.currentPrice || p.current_price || '0';
      price = typeof rawPrice === 'number' ? rawPrice : parseFloat(rawPrice.toString().replace(/[^0-9.]/g, '') || '0');
    }

    const gtin = (p.gtin || p.barcode || '').toString().replace(/^\/+/, ''); // Strip leading slashes found in research
    const rawId = (p.productId || p.id || '').toString();
    
    // Extract storefront ID from slug or handle if it contains the numeric suffix (e.g. name-12345)
    const slug = p.slug || p.urlPath || p.handle || '';
    const idMatch = slug.match(/-(\d+)$/) || slug.match(/^(\d+)$/);
    
    // If we have productId (numeric string), use it. Otherwise try to extract from slug.
    let storefrontId = '';
    if (p.productId && /^\d+$/.test(p.productId.toString())) {
      storefrontId = p.productId.toString();
    } else if (idMatch) {
      storefrontId = idMatch[1];
    } else if (rawId) {
      storefrontId = rawId.replace('Product:', '');
      // If it's a hybrid ID (ID-ID), take the last part
      if (storefrontId.includes('-')) {
        const parts = storefrontId.split('-');
        // If the last part is numeric and longer than 4 chars, it's likely our ID
        const last = parts.pop() || '';
        storefrontId = /^\d{4,}$/.test(last) ? last : storefrontId;
      }
    }

    if (!storefrontId || storefrontId === '1') return null;
    
    // Ignore internal IDs that aren't likely storefront IDs if they are too short (unless we have high confidence)
    if (storefrontId.length < 4 && !idMatch && !p.productId) return null;

    let productPageUrl = p.productPageUrl || '';
    
    if (!productPageUrl || !productPageUrl.includes(`/product/${storefrontId}`)) {
      const base = slug.includes('/pharmacy/') || p.isPharmacy ? '/sa/en/pharmacy/product/' : '/sa/en/product/';
      productPageUrl = `https://ananinja.com${base}${storefrontId}`;
    }

    let brand = p.brand?.name || p.brand || '';
    if (!brand && name) {
      const firstWord = name.trim().split(' ')[0];
      if (firstWord && firstWord.length > 2 && /^[A-Za-z]+$/.test(firstWord)) {
        brand = firstWord;
      }
    }

    const asArray = (val: any) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      return [val];
    };

    const imageUrls = p.imageUrls || [
      ...asArray(p.medias).map((m: any) => (m.url || m.path || (typeof m === 'string' ? m : ''))),
      ...asArray(p.images).map((img: any) => (img.url || img.path || (typeof img === 'string' ? img : ''))),
      ...(p.image ? [typeof p.image === 'string' ? p.image : (p.image.url || p.image.path || '')] : [])
    ].filter(url => url && url.length > 5);
    return {
      name,
      name_ar: p.nameAr || p.name_ar || p.nameAr_sa || p.display_name_ar || '',
      price: price || 0,
      productPageUrl,
      imageUrls: [...new Set(imageUrls)], // Deduplicate URLs
      inStock: p.isAvailable ?? p.inventory?.available ?? true,
      gtin: gtin || storefrontId, // Fallback GTIN to Storefront ID
      weight: (typeof p.weight === 'object' && p.weight !== null ? (p.weight.value ? `${p.weight.value}${p.weight.unit || ''}` : JSON.stringify(p.weight)) : p.weight) || (typeof p.size === 'object' && p.size != null ? JSON.stringify(p.size) : p.size) || '',
      description: p.description || '',
      brand: brand,
    };
  }
}
