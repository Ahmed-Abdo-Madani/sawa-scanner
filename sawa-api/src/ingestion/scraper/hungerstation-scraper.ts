import { Page, Response } from 'playwright';
import { Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';
import { findJSONObjects, decodeRscStream } from './hydration-utils';
import { applyJitter } from './evasion';
import {
  HsCity,
  HsDistrict,
  HsBranch,
  HsVertical,
  HUNGERSTATION_ALLOWED_VERTICALS,
  HUNGERSTATION_REJECTED_VERTICALS,
  HUNGERSTATION_URL_SEGMENT_TO_VERTICAL,
  HS_BASE_URL,
  HS_SUPERMARKETS_INDEX,
  HsSearchResult,
} from './hungerstation-types';

const DEFAULT_HS_PILOT_CITIES = ['الرياض', 'riyadh'];
const MAX_PAGES = 30;
const HS_CATEGORY_DENYLIST: RegExp[] = [
  /tobacco/i,
  /cigar/i,
  /vape/i,
  /alcohol/i,
  /alcohol-free beer/i,
  /beer/i,
  /wine/i,
  /spirits/i,
  /restaurant/i,
  /cuisine/i,
  /food court/i,
];

export class HungerStationScraper extends BaseScraper {
  private graphqlEndpointSeen: string | null = null;

  private static readonly HS_ALLOWED_GRAPHQL_HOST_SUFFIXES = [
    'hungerstation.com',
    'delivery-hero.io',
    'deliveryhero.io',
  ];

  async scrapeListingPage(
    categoryUrl: string,
    pageNum: number,
    storeContext?: HsBranch,
  ): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    const url = categoryUrl;

    try {
      const capturedProductsMap = new Map<string, ScrapedProductData>();

      const teardown = this.interceptGraphQL(
        page,
        /MenuItems|CatalogProducts|Items|Products|Search/i,
        (json) => {
          const rawItems = this.extractHsProductNodes(json);
          for (const raw of rawItems) {
            const mapped = this.mapHsProduct(raw, storeContext);
            if (!mapped) continue;
            const key =
              this.extractHsProductKey(raw) ||
              mapped.gtin ||
              mapped.productPageUrl ||
              mapped.name;
            if (!key) continue;
            if (!capturedProductsMap.has(key))
              capturedProductsMap.set(key, mapped);
          }
        },
      );

      const navigationResponse = await this.navigateWithEvasion(
        page,
        url,
        'commit',
        30000,
      );
      await page.waitForTimeout(1500);
      await this.detectCloudflareChallenge(page, navigationResponse);

      const hydrated = await this.sweepHydrationData(page, (json) => {
        const out: ScrapedProductData[] = [];
        for (const raw of this.extractHsProductNodes(json)) {
          const mapped = this.mapHsProduct(raw, storeContext);
          if (mapped) out.push(mapped);
        }
        return out;
      });
      for (const p of hydrated) {
        const key = p.gtin || p.productPageUrl || p.name;
        if (!key || capturedProductsMap.has(key)) continue;
        capturedProductsMap.set(key, p);
      }

      for (let i = 0; i < Math.max(1, pageNum); i++) {
        await this.autoScroll(page);
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(1000);

      const domProducts = await page.evaluate(() => {
        const links = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            'a[href*="/items/"], a[href*="/item/"]',
          ),
        );
        return links
          .map((a) => {
            const href = a.getAttribute('href') || a.href || '';
            const title =
              a
                .querySelector('h1,h2,h3,[class*="name"],[class*="title"]')
                ?.textContent?.trim() ||
              a.textContent?.trim() ||
              '';
            const priceText =
              a.querySelector('[class*="price"],[data-testid*="price"]')
                ?.textContent || '';
            const img = a.querySelector('img')?.getAttribute('src') || '';
            return { href, title, priceText, img };
          })
          .filter((x) => x.href && x.title);
      });

      for (const item of domProducts) {
        const price = parseFloat(
          (item.priceText || '').replace(/[^0-9.]/g, '') || '0',
        );
        if (!Number.isFinite(price) || price <= 0) continue;
        const productPageUrl = new URL(item.href, HS_BASE_URL).toString();
        const key = productPageUrl;
        if (capturedProductsMap.has(key)) continue;
        capturedProductsMap.set(key, {
          name: item.title,
          price,
          productPageUrl,
          imageUrls: item.img
            ? [new URL(item.img, HS_BASE_URL).toString()]
            : [],
        });
      }

      teardown();
      const products = Array.from(capturedProductsMap.values());
      this.logger.log(
        `[HS] scrapeListingPage(page=${pageNum}): found ${products.length} products (dom + intercept)`,
      );
      return products;
    } finally {
      await page.close();
    }
  }

  async searchProducts(query: string, storeUrl: string, branchUuid: string): Promise<HsSearchResult[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    try {
      const baseUrl = storeUrl || `${HS_BASE_URL}/sa-en/restaurant/store/${branchUuid}`;
      const url = baseUrl.includes('?') 
        ? `${baseUrl}&query=${encodeURIComponent(query)}` 
        : `${baseUrl}?query=${encodeURIComponent(query)}`;
      const capturedProductsMap = new Map<string, HsSearchResult>();

      const teardown = this.interceptGraphQL(
        page,
        /Search|MenuItems|CatalogProducts|Items|Products/i,
        (json) => {
          const rawItems = this.extractHsProductNodes(json);
          for (const raw of rawItems) {
            const mapped = this.mapHsProduct(raw);
            if (!mapped) continue;
            const key = mapped.gtin || mapped.productPageUrl || mapped.name;
            if (!key) continue;
            if (!capturedProductsMap.has(key)) {
              capturedProductsMap.set(key, {
                name: mapped.name,
                price: mapped.price,
                imageUrl: mapped.imageUrls[0] || null,
                weight: mapped.weight || null,
                productPageUrl: mapped.productPageUrl,
              });
            }
          }
        },
      );

      const navigationResponse = await this.navigateWithEvasion(
        page,
        url,
        'commit',
        30000,
      );
      await page.waitForTimeout(1500);
      await this.detectCloudflareChallenge(page, navigationResponse);

      const hydrated = await this.sweepHydrationData(page, (json) => {
        const out: HsSearchResult[] = [];
        for (const raw of this.extractHsProductNodes(json)) {
          const mapped = this.mapHsProduct(raw);
          if (mapped) {
            out.push({
              name: mapped.name,
              price: mapped.price,
              imageUrl: mapped.imageUrls[0] || null,
              weight: mapped.weight || null,
              productPageUrl: mapped.productPageUrl,
            });
          }
        }
        return out;
      });

      for (const p of hydrated) {
        const key = p.productPageUrl || p.name;
        if (!key || capturedProductsMap.has(key)) continue;
        capturedProductsMap.set(key, p);
      }

      await applyJitter(2000, 2000);

      teardown();
      const products = Array.from(capturedProductsMap.values());
      this.logger.log(
        `[HS] searchProducts(query="${query}", branch=${branchUuid}): found ${products.length} products`,
      );
      return products;
    } finally {
      await page.close();
    }
  }

  async scrapeDetailPage(
    productUrl: string,
    storeContext?: HsBranch,
  ): Promise<ScrapedProductData & { page?: Page }> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();
    try {
      const captured = new Map<string, ScrapedProductData>();
      const teardown = this.interceptGraphQL(
        page,
        /MenuItem|Product|Item/i,
        (json) => {
          for (const raw of this.extractHsProductNodes(json)) {
            const mapped = this.mapHsProduct(raw, storeContext);
            if (!mapped) continue;
            const key = mapped.gtin || mapped.productPageUrl || mapped.name;
            if (!key) continue;
            captured.set(key, mapped);
          }
        },
      );

      const navigationResponse = await this.navigateWithEvasion(
        page,
        productUrl,
        'commit',
        30000,
      );
      await page.waitForTimeout(1000);
      await this.detectCloudflareChallenge(page, navigationResponse);

      await this.autoScroll(page);
      await page.waitForTimeout(500);

      const hydrated = await this.sweepHydrationData(page, (json) => {
        const out: ScrapedProductData[] = [];
        for (const raw of this.extractHsProductNodes(json)) {
          const mapped = this.mapHsProduct(raw, storeContext);
          if (mapped) out.push(mapped);
        }
        return out;
      });
      for (const p of hydrated) {
        const key = p.gtin || p.productPageUrl || p.name;
        if (key) captured.set(key, p);
      }
      this.logger.debug(
        `[HS] scrapeDetailPage: captured ${captured.size} candidates (intercept=${captured.size - hydrated.length}, hydrated=${hydrated.length})`,
      );

      if (captured.size === 0) {
        const domData = await page.evaluate((url) => {
          const name = document.querySelector('h1')?.textContent?.trim() || '';
          const priceText =
            document.querySelector('[class*="price"],[data-testid*="price"]')
              ?.textContent || '';
          const imageUrls = Array.from(document.querySelectorAll('img'))
            .map((img) => img.getAttribute('src') || '')
            .filter(Boolean)
            .slice(0, 6);
          const description =
            document
              .querySelector(
                '[class*="description"],[data-testid*="description"]',
              )
              ?.textContent?.trim() || '';
          const ldJsonScripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]'),
          )
            .map((s) => s.textContent || '')
            .filter(Boolean);
          let gtin = '';
          for (const text of ldJsonScripts) {
            try {
              const parsed = JSON.parse(text);
              const arr = Array.isArray(parsed) ? parsed : [parsed];
              for (const item of arr) {
                if (item?.gtin || item?.gtin13 || item?.gtin14) {
                  gtin = String(item.gtin || item.gtin13 || item.gtin14);
                  break;
                }
              }
              if (gtin) break;
            } catch (_) {
              // ignore malformed json-ld
            }
          }
          return {
            name,
            price: parseFloat(priceText.replace(/[^0-9.]/g, '') || '0'),
            imageUrls,
            description,
            gtin: gtin || undefined,
            inStock: !/out of stock/i.test(document.body.textContent || ''),
            productPageUrl: url,
          };
        }, productUrl);

        if (
          domData.name &&
          Number.isFinite(domData.price) &&
          domData.price > 0
        ) {
          captured.set(domData.gtin || domData.productPageUrl, domData);
        }
      }

      teardown();

      if (captured.size === 0) {
        throw new Error(
          `Could not capture HungerStation product detail for ${productUrl}`,
        );
      }

      const best = Array.from(captured.values()).sort(
        (a, b) => (b.description?.length || 0) - (a.description?.length || 0),
      )[0];
      return { ...best, productPageUrl: productUrl, page };
    } catch (err) {
      await page.close().catch(() => undefined);
      throw err;
    }
  }

  async discoverCategories(
    branch: HsBranch,
  ): Promise<{ id: string; name: string; url: string }[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();

    const categoryMap = new Map<
      string,
      { id: string; name: string; url: string }
    >();
    const isDenied = (name: string, url: string) => {
      const slug = (() => {
        try {
          return new URL(url, HS_BASE_URL).pathname.toLowerCase();
        } catch {
          return url.toLowerCase();
        }
      })();
      return HS_CATEGORY_DENYLIST.some((rx) => rx.test(name) || rx.test(slug));
    };

    const ingest = (raw: any) => {
      if (!raw || typeof raw !== 'object') return;
      const id = String(raw.id || raw.categoryId || raw.slug || '').trim();
      const name = String(
        raw.name || raw.nameEn || raw.name_en || raw.title || '',
      ).trim();
      const href = String(raw.url || raw.link || raw.href || '').trim();
      if (!name) return;
      const resolvedUrl = href ? new URL(href, HS_BASE_URL).toString() : '';
      if (!resolvedUrl) return;
      if (isDenied(name, resolvedUrl)) return;
      const key = id || resolvedUrl;
      if (!categoryMap.has(key)) {
        categoryMap.set(key, { id: id || key, name, url: resolvedUrl });
      }
    };

    try {
      const teardown = this.interceptGraphQL(
        page,
        /categor(y|ies)|menu|catalog/i,
        (json, op) => {
          this.logger.debug(`[HS] Intercepted GraphQL operation: ${op}`);
          const stack: any[] = [json];
          while (stack.length) {
            const cur = stack.pop();
            if (!cur || typeof cur !== 'object') continue;
            if (Array.isArray(cur)) {
              for (const v of cur) stack.push(v);
              continue;
            }
            for (const [k, v] of Object.entries(cur)) {
              if (/categories|menuCategories/i.test(k) && Array.isArray(v)) {
                for (const entry of v) ingest(entry);
              }
              stack.push(v);
            }
          }
        },
      );

      const navigationResponse = await this.navigateWithEvasion(
        page,
        branch.source_url,
        'domcontentloaded',
        45000,
      );
      // Wait for JS to hydrate categories — poll for any category anchor
      await page
        .waitForSelector(
          'a[href*="/category/"], a[href*="/cat/"], [data-testid*="category"] a',
          { timeout: 10000 },
        )
        .catch(() => undefined); // don't fail if no category links found via selector
      await this.detectCloudflareChallenge(page, navigationResponse);
      await this.dismissConsentModals(page).catch(() => undefined);

      // Scroll to trigger lazy-loaded category tiles
      await this.autoScroll(page);
      await page.waitForTimeout(1500);

      this.logger.debug(
        `[HS] discoverCategories: page loaded and scrolled, sweeping hydration...`,
      );

      const hydrated = await this.sweepHydrationData(page, (json) => {
        const categories: Array<{ id: string; name: string; url: string }> = [];
        const stack: any[] = [json];
        while (stack.length) {
          const cur = stack.pop();
          if (!cur || typeof cur !== 'object') continue;
          if (Array.isArray(cur)) {
            for (const v of cur) stack.push(v);
            continue;
          }
          for (const [k, v] of Object.entries(cur)) {
            if (/categories|menuCategories/i.test(k) && Array.isArray(v)) {
              for (const entry of v) {
                const id = String(entry?.id || entry?.slug || '').trim();
                const name = String(
                  entry?.name || entry?.nameEn || entry?.name_en || '',
                ).trim();
                const href = String(
                  entry?.url || entry?.link || entry?.href || '',
                ).trim();
                if (!name || !href) continue;
                const url = new URL(href, HS_BASE_URL).toString();
                if (isDenied(name, url)) continue;
                categories.push({ id: id || url, name, url });
              }
            }
            stack.push(v);
          }
        }
        return categories;
      });
      for (const c of hydrated) {
        if (!categoryMap.has(c.id)) categoryMap.set(c.id, c);
      }

      const domCategories = await page.evaluate(() => {
        const anchors = Array.from(
          document.querySelectorAll<HTMLAnchorElement>(
            'a[href*="/category/"], a[href*="/cat/"], [data-testid*="category"] a, [class*="category"] a',
          ),
        );
        return anchors
          .map((a) => {
            const href = a.getAttribute('href') || a.href || '';
            const name =
              a.textContent?.trim() ||
              a.getAttribute('aria-label') ||
              a.getAttribute('title') ||
              a.querySelector('span, p, h3, h4')?.textContent?.trim() ||
              '';
            return {
              id: a.getAttribute('data-category-id') || href,
              name,
              url: href,
            };
          })
          .filter(
            (x) =>
              x.name &&
              x.url &&
              (x.url.includes('/category/') || x.url.includes('/cat/')),
          );
      });

      for (const item of domCategories) {
        const url = new URL(item.url, HS_BASE_URL).toString();
        if (isDenied(item.name, url)) continue;
        const id = item.id || url;
        if (!categoryMap.has(id))
          categoryMap.set(id, { id, name: item.name, url });
      }

      teardown();
      this.logger.log(
        `[HS] discoverCategories: found ${categoryMap.size} categories total.`,
      );
      return [...categoryMap.values()];
    } finally {
      await page.close();
    }
  }

  private extractHsProductNodes(json: any): any[] {
    const out: any[] = [];
    const stack: any[] = [json];
    while (stack.length) {
      const cur = stack.pop();
      if (!cur || typeof cur !== 'object') continue;
      if (Array.isArray(cur)) {
        for (const v of cur) stack.push(v);
        continue;
      }
      const looksLikeProduct =
        (cur.id || cur.productId || cur.menuItemId || cur.sku) &&
        (cur.name || cur.nameEn || cur.name_ar || cur.nameAr || cur.title) &&
        (cur.price !== undefined ||
          cur.pricing ||
          cur.prices ||
          cur.offerPrice !== undefined);
      if (looksLikeProduct) {
        out.push(cur);
        continue;
      }
      for (const v of Object.values(cur)) stack.push(v);
    }
    return out;
  }

  private extractHsProductKey(raw: any): string {
    const id = raw?.id ?? raw?.productId ?? raw?.menuItemId ?? raw?.slug;
    return id !== undefined && id !== null ? String(id) : '';
  }

  private mapHsProduct(
    raw: any,
    storeContext?: HsBranch,
  ): ScrapedProductData | null {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(
      raw.name || raw.nameEn || raw.name_en || raw.title || '',
    ).trim();
    if (!name) return null;

    const priceCandidates = [
      raw.price,
      raw.originalPrice,
      raw.offerPrice,
      raw.pricing?.price,
      raw.pricing?.originalPrice,
      raw.pricing?.offerPrice,
      raw.prices?.price,
      raw.prices?.originalPrice,
      raw.prices?.offerPrice,
    ];
    const price = priceCandidates
      .map((v) =>
        typeof v === 'number'
          ? v
          : parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')),
      )
      .find((v) => Number.isFinite(v) && v > 0);
    if (!price) return null;

    // ──── Promo / discount pricing ────
    const originalPriceCandidates = [
      raw.originalPrice,
      raw.pricing?.originalPrice,
      raw.prices?.originalPrice,
      raw.was_price,
      raw.wasPrice,
      raw.price_before_discount,
    ];
    const offerPriceCandidates = [
      raw.offerPrice,
      raw.pricing?.offerPrice,
      raw.prices?.offerPrice,
      raw.discountPrice,
      raw.discount_price,
      raw.salePrice,
      raw.sale_price,
    ];
    let promo_price: number | undefined = undefined;
    const originalPrice = originalPriceCandidates
      .map((v) =>
        typeof v === 'number'
          ? v
          : parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')),
      )
      .find((v) => Number.isFinite(v) && v > 0);
    const offerPrice = offerPriceCandidates
      .map((v) =>
        typeof v === 'number'
          ? v
          : parseFloat(String(v ?? '').replace(/[^0-9.]/g, '')),
      )
      .find((v) => Number.isFinite(v) && v > 0);
    // If original > offer → offer is a promo
    if (originalPrice && offerPrice && originalPrice > offerPrice) {
      promo_price = offerPrice;
    }
    // If the resolved "price" is the original price and there's an offerPrice
    if (
      !promo_price &&
      offerPrice &&
      price !== offerPrice &&
      offerPrice < price
    ) {
      promo_price = offerPrice;
    }

    const images: string[] = [];
    const appendImage = (src: any) => {
      if (!src) return;
      const value = typeof src === 'string' ? src : src.url || src.src;
      if (!value) return;
      try {
        images.push(new URL(String(value), HS_BASE_URL).toString());
      } catch {
        // ignore invalid URL
      }
    };
    appendImage(raw.image);
    if (Array.isArray(raw.images)) raw.images.forEach(appendImage);
    if (Array.isArray(raw.media)) raw.media.forEach(appendImage);

    const id = this.extractHsProductKey(raw);
    const directUrl = raw.link || raw.url || raw.href;
    const productPageUrl = directUrl
      ? new URL(String(directUrl), HS_BASE_URL).toString()
      : `${storeContext?.source_url || HS_BASE_URL}/items/${id || encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`;

    const inStockValue = raw.available ?? raw.isAvailable ?? raw.stock;
    const inStock =
      typeof inStockValue === 'boolean'
        ? inStockValue
        : typeof inStockValue === 'number'
          ? inStockValue > 0
          : undefined;

    // ──── Arabic name ────
    const name_ar = (raw.nameAr || raw.name_ar || '').trim() || undefined;

    // ──── Arabic description ────
    const description_ar =
      (
        raw.descriptionAr ||
        raw.description_ar ||
        raw.shortDescriptionAr ||
        ''
      ).trim() || undefined;

    // ──── Allergens ────
    const allergen_tags = this.extractAllergenTags(raw);

    // ──── Ingredients ────
    const ingredient_tags = this.extractIngredientTags(raw);

    // ──── Subcategory ────
    let subcategory: string | undefined = undefined;
    const catCandidates = [
      raw.category,
      raw.categoryName,
      raw.category_name,
      raw.menuCategoryName,
      raw.subCategory,
      raw.sub_category,
    ];
    for (const c of catCandidates) {
      if (typeof c === 'string' && c.trim()) {
        subcategory = c.trim();
        break;
      }
      if (c && typeof c === 'object' && typeof c.name === 'string') {
        subcategory = c.name.trim();
        break;
      }
    }

    return {
      name,
      name_ar,
      price,
      promo_price,
      weight: raw.weight || raw.size || raw.netWeight,
      productPageUrl,
      imageUrls: [...new Set(images)],
      brand: raw.brand || raw.manufacturer,
      description: raw.description || raw.shortDescription,
      description_ar,
      gtin: raw.gtin || raw.barcode,
      inStock,
      allergen_tags: allergen_tags.length > 0 ? allergen_tags : undefined,
      ingredient_tags: ingredient_tags.length > 0 ? ingredient_tags : undefined,
      subcategory,
    };
  }

  /**
   * Extracts allergen tags from the raw HS product node.
   * Checks `allergens`, `allergenInfo`, and tries to parse
   * from description text if structured fields are absent.
   */
  private extractAllergenTags(raw: any): string[] {
    const tags = new Set<string>();

    // Direct array fields
    const arrayFields = [
      raw.allergens,
      raw.allergenInfo,
      raw.allergen_info,
      raw.allergenTags,
      raw.allergen_tags,
    ];
    for (const field of arrayFields) {
      if (Array.isArray(field)) {
        for (const item of field) {
          const val =
            typeof item === 'string' ? item : item?.name || item?.label;
          if (val && typeof val === 'string') {
            tags.add(val.trim().toLowerCase().replace(/^en:/, ''));
          }
        }
      }
    }

    // String fields (comma-separated)
    const stringFields = [
      raw.allergenList,
      raw.allergen_list,
      raw.allergens_text,
    ];
    for (const field of stringFields) {
      if (typeof field === 'string' && field.trim()) {
        field.split(/[,;]/).forEach((s: string) => {
          const cleaned = s.trim().toLowerCase().replace(/^en:/, '');
          if (cleaned) tags.add(cleaned);
        });
      }
    }

    // Heuristic: check description for common allergen keywords
    if (tags.size === 0) {
      const text = String(
        raw.description || raw.shortDescription || '',
      ).toLowerCase();
      const allergenKeywords = [
        'milk',
        'dairy',
        'lactose',
        'gluten',
        'wheat',
        'soy',
        'soya',
        'peanut',
        'tree nut',
        'almond',
        'cashew',
        'walnut',
        'hazelnut',
        'egg',
        'fish',
        'shellfish',
        'sesame',
        'mustard',
        'celery',
        'sulphite',
        'حليب',
        'قمح',
        'صويا',
        'بيض',
        'سمسم',
        'فول سوداني',
        'مكسرات',
      ];
      for (const kw of allergenKeywords) {
        if (text.includes(kw)) {
          tags.add(kw);
        }
      }
    }

    return [...tags];
  }

  /**
   * Extracts ingredient tags from the raw HS product node.
   */
  private extractIngredientTags(raw: any): string[] {
    const tags = new Set<string>();

    // Direct array fields
    const arrayFields = [
      raw.ingredients,
      raw.ingredientTags,
      raw.ingredient_tags,
    ];
    for (const field of arrayFields) {
      if (Array.isArray(field)) {
        for (const item of field) {
          const val =
            typeof item === 'string' ? item : item?.name || item?.text;
          if (val && typeof val === 'string') {
            tags.add(val.trim().toLowerCase().replace(/^en:/, ''));
          }
        }
      }
    }

    // String fields (comma-separated)
    const stringFields = [
      raw.ingredientsText,
      raw.ingredients_text,
      raw.ingredientsList,
    ];
    for (const field of stringFields) {
      if (typeof field === 'string' && field.trim()) {
        field.split(/[,;]/).forEach((s: string) => {
          const cleaned = s.trim().toLowerCase();
          if (cleaned && cleaned.length > 1) tags.add(cleaned);
        });
      }
    }

    return [...tags];
  }

  private async autoScroll(page: Page): Promise<void> {
    await page.evaluate(async () => {
      const distance = 400;
      for (let i = 0; i < 10; i++) {
        window.scrollBy(0, distance);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    });
  }

  // ─── GraphQL capture helper ───────────────────────────────────────────────

  /**
   * Installs a response listener on `page` that captures JSON from all
   * hungerstation.com GraphQL responses that match `operationPredicate`.
   *
   * Each captured payload is pushed into `sink(json, operationName)`.
   * Returns a teardown function (remove the listener when done).
   */
  private interceptGraphQL(
    page: Page,
    operationPredicate: RegExp,
    sink: (json: any, operationName: string) => void,
  ): () => void {
    const handler = async (response: Response) => {
      try {
        const url = response.url();

        let parsedUrl: URL;
        try {
          parsedUrl = new URL(url);
        } catch (_) {
          return;
        }

        const host = parsedUrl.hostname.toLowerCase();
        const path = parsedUrl.pathname.toLowerCase();
        const contentType = (
          response.headers()['content-type'] || ''
        ).toLowerCase();

        const hostLooksExpected =
          HungerStationScraper.HS_ALLOWED_GRAPHQL_HOST_SUFFIXES.some(
            (suffix) => host === suffix || host.endsWith(`.${suffix}`),
          );
        const pathLooksGraphApi =
          path.includes('graphql') || path.includes('/api/');
        const responseLooksJson = contentType.includes('application/json');

        const request = response.request();
        let operationName = '';
        let postDataParsed: any = null;
        try {
          postDataParsed = JSON.parse(request.postData() || '{}');
          operationName = postDataParsed.operationName || '';
        } catch (_) {
          /* non-JSON body */
        }

        const postDataLooksGraphQl =
          !!postDataParsed &&
          typeof postDataParsed === 'object' &&
          typeof postDataParsed.operationName === 'string' &&
          (postDataParsed.query !== undefined ||
            postDataParsed.variables !== undefined);

        const shouldCaptureByHostAndPath =
          pathLooksGraphApi && hostLooksExpected && responseLooksJson;

        const shouldCaptureByGraphQlShape =
          responseLooksJson && postDataLooksGraphQl && hostLooksExpected;

        if (!shouldCaptureByHostAndPath && !shouldCaptureByGraphQlShape) return;

        // Log the first endpoint host we see
        if (!this.graphqlEndpointSeen) {
          this.graphqlEndpointSeen = host;
          this.logger.log(`[HS] First GraphQL endpoint host observed: ${host}`);
        }

        if (!operationPredicate.test(operationName)) return;

        const json = await response.json();
        sink(json, operationName);
      } catch (_) {
        /* swallow — responses may be non-JSON or already consumed */
      }
    };

    page.on('response', handler);
    return () => page.off('response', handler);
  }

  // ─── Cloudflare guard ─────────────────────────────────────────────────────

  /**
   * Returns true (and throws) if a Cloudflare challenge page is detected.
   * Called immediately after navigateWithEvasion in every discoverX method.
   */
  private async detectCloudflareChallenge(
    page: Page,
    navigationResponse?: Response | null,
  ): Promise<void> {
    await page
      .waitForLoadState('domcontentloaded', { timeout: 5000 })
      .catch(() => {});

    const url = page.url();
    const title = await page.title();
    const status = navigationResponse?.status();
    const cfMitigatedHeader = navigationResponse?.headers()['cf-mitigated'];

    const hasChallenge =
      /just a moment/i.test(title) ||
      /attention required/i.test(title) ||
      !!cfMitigatedHeader ||
      (await page
        .$('#challenge-form')
        .then((el) => !!el)
        .catch(() => false)) ||
      (await page
        .$('iframe[src*="challenges.cloudflare.com"]')
        .then((el) => !!el)
        .catch(() => false));

    if (hasChallenge) {
      this.logger.error(
        `Cloudflare challenge detected for ${url} (status=${status ?? 'unknown'}, cf-mitigated=${cfMitigatedHeader ?? 'absent'}); ensure host is on a Saudi IP`,
      );
      throw new UnrecoverableError(
        `Cloudflare challenge at ${url} (status=${status ?? 'unknown'})`,
      );
    }
  }

  private payloadHasDistrictContainer(json: any): boolean {
    const stack: any[] = [json];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== 'object') continue;

      if (Array.isArray(current)) {
        current.forEach((item) => stack.push(item));
        continue;
      }

      for (const [key, value] of Object.entries(current)) {
        if (
          /districts|areas|neighborhoods/i.test(key) &&
          Array.isArray(value)
        ) {
          return true;
        }
        stack.push(value);
      }
    }

    return false;
  }

  private normalizeForPilotMatch(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  // ─── Hydration sweep (generic) ────────────────────────────────────────────

  private async sweepHydrationData<T>(
    page: Page,
    extractor: (json: any) => T[],
  ): Promise<T[]> {
    const results: T[] = [];

    const scriptContents = await page.evaluate(() =>
      Array.from(document.querySelectorAll('script')).map((s) => ({
        id: s.id,
        type: s.getAttribute('type') || '',
        text: s.textContent || '',
      })),
    );

    for (const { id, type, text } of scriptContents) {
      if (!text) continue;

      // __NEXT_DATA__
      if (id === '__NEXT_DATA__' || text.includes('"pageProps"')) {
        try {
          const json =
            id === '__NEXT_DATA__' ? JSON.parse(text.trim()) : JSON.parse(text);
          if (json) extractor(json).forEach((r) => results.push(r));
        } catch (_) {
          /* malformed */
        }
      }

      // RSC stream  self.__next_f.push(...)
      if (text.includes('self.__next_f.push')) {
        const jsons = decodeRscStream(text);
        for (const json of jsons) {
          extractor(json).forEach((r) => results.push(r));
        }
      }

      // Fallback: any JSON in the script block
      if (type === 'application/json' || type === 'application/ld+json') {
        try {
          const json = JSON.parse(text);
          extractor(json).forEach((r) => results.push(r));
        } catch (_) {
          /* skip */
        }
      }
    }

    return results;
  }

  // ─── Vertical classification ──────────────────────────────────────────────

  private classifyVertical(sourceUrl: string, gqlPayload?: any): HsVertical {
    let pathname = '';
    try {
      pathname = new URL(sourceUrl).pathname;
    } catch (_) {
      pathname = sourceUrl;
    }

    const qcContainerMatch = pathname.match(/\/qc\/\d+\/([^/]+)\//i);
    if (qcContainerMatch?.[1]) {
      const verticalSegment = qcContainerMatch[1].toLowerCase();
      const vertical = HUNGERSTATION_URL_SEGMENT_TO_VERTICAL[verticalSegment];
      if (vertical) return vertical;
    }

    // Fallback: inspect GQL category objects only
    if (gqlPayload) {
      const categoryCandidates: Array<{ slug?: string; name?: string }> = [];

      const addCategory = (candidate: any) => {
        if (!candidate || typeof candidate !== 'object') return;
        categoryCandidates.push({
          slug:
            typeof candidate.slug === 'string'
              ? candidate.slug.toLowerCase()
              : undefined,
          name:
            typeof candidate.name === 'string'
              ? candidate.name.toLowerCase()
              : undefined,
        });
      };

      const categories = gqlPayload.categories;
      if (Array.isArray(categories)) {
        categories.forEach(addCategory);
      }

      for (const category of categoryCandidates) {
        for (const [seg, v] of Object.entries(
          HUNGERSTATION_URL_SEGMENT_TO_VERTICAL,
        )) {
          if (category.slug === seg || category.name === seg) return v;
        }
      }
    }

    return 'other';
  }

  // ─── Branch extraction helper ─────────────────────────────────────────────

  private extractBranchCandidates(
    json: any,
    district: HsDistrict,
    branchMap: Map<string, Partial<HsBranch>>,
  ): void {
    if (!json || typeof json !== 'object') return;
    if (Array.isArray(json)) {
      json.forEach((item) =>
        this.extractBranchCandidates(item, district, branchMap),
      );
      return;
    }

    // Heuristic: does this object look like a branch / vendor?
    const hasId = json.id || json.vendorId || json.branchId;
    const hasName =
      json.name ||
      json.nameEn ||
      json.name_en ||
      json.title ||
      json.nameAr ||
      json.name_ar;
    const linkSource = json.link || json.url || json.href;
    const slug = json.slug;

    if (hasId && hasName) {
      let rawLink = '';
      if (typeof linkSource === 'string' && linkSource.trim()) {
        rawLink = linkSource;
      }

      if (!rawLink && typeof slug === 'string' && slug.trim()) {
        const idStr = String(hasId);
        const inferredVertical = this.classifyVertical(district.url, json);
        if (inferredVertical !== 'other') {
          const verticalSegment = Object.entries(
            HUNGERSTATION_URL_SEGMENT_TO_VERTICAL,
          ).find(([, value]) => value === inferredVertical)?.[0];
          if (verticalSegment) {
            rawLink = `/qc/${idStr}/${verticalSegment}/branch/${slug}~${idStr}`;
          }
        }
      }

      if (!rawLink) {
        // Skip ambiguous branch candidates that only provide merchant slug
        return;
      }

      const vertical = this.classifyVertical(rawLink, json);
      if (HUNGERSTATION_REJECTED_VERTICALS.has(vertical)) return;

      const uuid = this.extractPlatformUuid(rawLink, String(hasId));
      if (!uuid) return;

      branchMap.set(uuid, {
        platform_branch_id: String(hasId),
        platform_branch_uuid: uuid,
        merchant_name_en: String(
          json.name ||
            json.nameEn ||
            json.name_en ||
            json.title ||
            json.nameAr ||
            json.name_ar,
        ),
        merchant_name_ar:
          json.nameAr ||
          json.name_ar ||
          String(json.name || json.nameEn || json.name_en || json.title || ''),
        vertical,
        lat: json.lat ?? json.latitude,
        lng: json.lng ?? json.longitude,
        source_url: rawLink ? new URL(rawLink, HS_BASE_URL).toString() : '',
        citySlug: district.citySlug,
        districtSlug: district.slug,
      });
    }

    // Recurse into child objects
    for (const val of Object.values(json)) {
      this.extractBranchCandidates(val, district, branchMap);
    }
  }

  private extractPlatformUuid(link: string, fallbackId: string): string | null {
    // HungerStation branch URLs look like:
    // /sa-en/qc/12345/hmarket/branch/abcd-efgh-...~67890
    // We use everything after /branch/ as the canonical uuid key.
    const branchMatch = link.match(/\/branch\/([^?#]+)/);
    if (branchMatch) return branchMatch[1];

    // Fallback: use the numeric vendor id itself
    return fallbackId || null;
  }

  // ─── City extraction helper ───────────────────────────────────────────────

  private extractCitiesFromJson(json: any): HsCity[] {
    const results: HsCity[] = [];
    const slugLooksSane = (slug: string) => /^[a-z0-9-]+$/.test(slug);

    const recurse = (obj: any, keyPath: string[] = []) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((item) => recurse(item, keyPath));
        return;
      }

      const slug: string = obj.slug ?? obj.citySlug ?? '';
      const nameEn: string = obj.name_en ?? obj.nameEn ?? obj.name ?? '';
      const nameAr: string | undefined = obj.name_ar ?? obj.nameAr;

      const hasCountryFilter =
        obj.country !== undefined || obj.countryCode !== undefined;
      const matchesCountry =
        !hasCountryFilter || obj.country === 'SA' || obj.countryCode === 'SA';
      const inCityContainer = keyPath.some((key) =>
        /cities|locations/i.test(key),
      );

      if (
        slug &&
        nameEn &&
        matchesCountry &&
        (inCityContainer || slugLooksSane(slug))
      ) {
        results.push({
          slug,
          name_en: nameEn,
          name_ar: nameAr,
          // HungerStation regions page with supermarkets module filter
          url: `${HS_BASE_URL}/sa-en/regions/${slug}?module=supermarkets`,
        });
      }

      for (const [key, val] of Object.entries(obj))
        recurse(val, [...keyPath, key]);
    };

    recurse(json, []);
    return results;
  }

  // ─── District extraction helper ───────────────────────────────────────────

  private extractDistrictsFromJson(
    json: any,
    citySlug: string,
    cityUrl: string,
  ): HsDistrict[] {
    const results: HsDistrict[] = [];
    const verticalContainerSlugs = new Set(
      Object.keys(HUNGERSTATION_URL_SEGMENT_TO_VERTICAL),
    );

    const hasDistrictMarker = (obj: any): boolean => {
      const hasLatLng =
        (obj.lat !== undefined || obj.latitude !== undefined) &&
        (obj.lng !== undefined || obj.longitude !== undefined);
      const hasIdAndCityId =
        (obj.id !== undefined ||
          obj.districtId !== undefined ||
          obj.areaId !== undefined) &&
        (obj.city_id !== undefined || obj.cityId !== undefined);
      return hasLatLng || hasIdAndCityId;
    };

    const recurse = (obj: any, keyPath: string[] = []) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        const inDistrictContainer = keyPath.some((key) =>
          /districts|areas|neighborhoods/i.test(key),
        );
        if (inDistrictContainer) {
          for (const item of obj) {
            if (!item || typeof item !== 'object' || Array.isArray(item))
              continue;

            const slug: string =
              item.slug ?? item.districtSlug ?? item.areaSlug ?? '';
            const nameEn: string =
              item.name_en ?? item.nameEn ?? item.name ?? '';
            const nameAr: string | undefined = item.name_ar ?? item.nameAr;
            const normalizedSlug = String(slug).toLowerCase();

            if (
              slug &&
              nameEn &&
              normalizedSlug !== citySlug.toLowerCase() &&
              !verticalContainerSlugs.has(normalizedSlug) &&
              hasDistrictMarker(item)
            ) {
              results.push({
                slug,
                name_en: nameEn,
                name_ar: nameAr,
                url: `${cityUrl}/${slug}`,
                citySlug,
              });
            }
          }
        }

        obj.forEach((item) => recurse(item, keyPath));
        return;
      }

      const slug: string = obj.slug ?? obj.districtSlug ?? obj.areaSlug ?? '';
      const nameEn: string = obj.name_en ?? obj.nameEn ?? obj.name ?? '';
      const nameAr: string | undefined = obj.name_ar ?? obj.nameAr;
      const normalizedSlug = String(slug).toLowerCase();
      const inDistrictContainer = keyPath.some((key) =>
        /districts|areas|neighborhoods/i.test(key),
      );

      // Looks like a district object
      if (
        inDistrictContainer &&
        slug &&
        nameEn &&
        normalizedSlug !== citySlug.toLowerCase() &&
        !verticalContainerSlugs.has(normalizedSlug) &&
        hasDistrictMarker(obj)
      ) {
        results.push({
          slug,
          name_en: nameEn,
          name_ar: nameAr,
          url: `${cityUrl}/${slug}`,
          citySlug,
        });
      }

      for (const [key, val] of Object.entries(obj))
        recurse(val, [...keyPath, key]);
    };

    recurse(json, []);
    return results;
  }

  // ─── Pilot-city gate ──────────────────────────────────────────────────────

  private applyPilotCityGate(cities: HsCity[]): HsCity[] {
    const envVal = process.env.HS_PILOT_CITIES ?? '';
    if (envVal === '*' || envVal.toLowerCase() === 'all') return cities;

    const allowed = envVal
      ? envVal.split(',').map((s) => this.normalizeForPilotMatch(s))
      : DEFAULT_HS_PILOT_CITIES.map((s) => this.normalizeForPilotMatch(s));

    return cities.filter((city) => {
      const slug = this.normalizeForPilotMatch(city.slug);
      const nameEn = this.normalizeForPilotMatch(city.name_en);
      const nameAr = this.normalizeForPilotMatch(city.name_ar ?? '');
      return allowed.some((a) => slug === a || nameEn === a || nameAr === a);
    });
  }

  // ─── Public discovery API ─────────────────────────────────────────────────

  async discoverCities(): Promise<HsCity[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();

    const gqlPayloads: any[] = [];
    const teardown = this.interceptGraphQL(
      page,
      /cities|areas|locations/i,
      (json) => gqlPayloads.push(json),
    );

    try {
      const navigationResponse = await this.navigateWithEvasion(
        page,
        HS_BASE_URL + HS_SUPERMARKETS_INDEX,
        'commit',
        30000,
      );
      await page.waitForTimeout(2000);
      await this.detectCloudflareChallenge(page, navigationResponse);

      const cityMap = new Map<string, HsCity>();

      // Source 1: GraphQL payloads
      for (const payload of gqlPayloads) {
        for (const city of this.extractCitiesFromJson(payload)) {
          if (!cityMap.has(city.slug)) cityMap.set(city.slug, city);
        }
      }

      // Source 2: Hydration sweep
      const hydrated = await this.sweepHydrationData(page, (json) =>
        this.extractCitiesFromJson(json),
      );
      for (const city of hydrated) {
        if (!cityMap.has(city.slug)) cityMap.set(city.slug, city);
      }

      // Source 3: DOM fallback — scrape the rendered city region links.
      // HungerStation uses /sa-en/regions/{slug}?module=supermarkets for city listings.
      const domCities = await page.evaluate(
        ({ base }: { base: string }) => {
          // Selectors for both the old /qc/supermarkets/ pattern and the new /regions/ pattern
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
              'a[href*="/regions/"], a[href*="/qc/supermarkets/"]',
            ),
          );
          return anchors
            .map((a) => {
              const href = a.getAttribute('href') ?? '';
              const resolved = new URL(a.href || href, location.origin);
              // Strip ?module=... query params for slug extraction
              const parts = resolved.pathname.split('/').filter(Boolean);
              const slug = parts[parts.length - 1] ?? '';
              const nameEn = a.textContent?.trim() ?? slug;
              // Always use the regions URL with supermarkets module filter
              const cityUrl = `${base}/sa-en/regions/${slug}?module=supermarkets`;
              return { slug, name_en: nameEn, url: cityUrl };
            })
            .filter(
              (c) =>
                c.slug &&
                !c.slug.includes('?') &&
                // Exclude vertical container slugs (hmarket, grocery, etc.)
                !/^(supermarkets|hmarket|grocery|pharmacy|bakery|sweets|flowers|pet|regions)$/.test(
                  c.slug,
                ),
            );
        },
        { base: HS_BASE_URL },
      );
      for (const city of domCities) {
        if (city.slug && !cityMap.has(city.slug)) {
          cityMap.set(city.slug, {
            slug: city.slug,
            name_en: city.name_en,
            url: city.url,
          });
        }
      }

      const cities = this.applyPilotCityGate([...cityMap.values()]);
      this.logger.log(
        `[HS] discoverCities: ${cities.length} pilot cities found. First GQL endpoint: ${this.graphqlEndpointSeen ?? 'none'}`,
      );
      teardown();
      return cities;
    } finally {
      await page.close();
    }
  }

  async discoverDistricts(city: HsCity): Promise<HsDistrict[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();

    const gqlPayloads: any[] = [];
    const teardown = this.interceptGraphQL(
      page,
      /districts|areas|neighborhoods|.*/i,
      (json) => {
        if (!this.payloadHasDistrictContainer(json)) return;
        gqlPayloads.push(json);
      },
    );

    try {
      const navigationResponse = await this.navigateWithEvasion(
        page,
        city.url,
        'commit',
        30000,
      );
      await page.waitForTimeout(2000);
      await this.detectCloudflareChallenge(page, navigationResponse);

      // Try clicking area/district picker to expose the list
      for (const selector of [
        '[data-testid*="area"]',
        '[data-testid*="district"]',
        'button:has-text("Select area")',
        'button:has-text("Districts")',
        'button:has-text("Choose area")',
      ]) {
        try {
          const el = await page.$(selector);
          if (el && (await el.isVisible())) {
            await el.click();
            await page.waitForTimeout(1000);
            break;
          }
        } catch (_) {
          /* best effort */
        }
      }

      const districtMap = new Map<string, HsDistrict>();

      // Source 1: GraphQL
      for (const payload of gqlPayloads) {
        for (const d of this.extractDistrictsFromJson(
          payload,
          city.slug,
          city.url,
        )) {
          if (!districtMap.has(d.slug)) districtMap.set(d.slug, d);
        }
      }

      // Source 2: Hydration
      const hydrated = await this.sweepHydrationData(page, (json) =>
        this.extractDistrictsFromJson(json, city.slug, city.url),
      );
      for (const d of hydrated) {
        if (!districtMap.has(d.slug)) districtMap.set(d.slug, d);
      }

      // Source 3: DOM fallback — links one level deeper than city URL
      const cityPath = new URL(city.url).pathname;
      const domDistricts = (await page.evaluate(
        ({
          cityPath,
          cityUrl,
          base,
        }: {
          cityPath: string;
          cityUrl: string;
          base: string;
        }) => {
          const anchors = Array.from(
            document.querySelectorAll<HTMLAnchorElement>(
              `a[href^="${cityPath}/"]`,
            ),
          );
          return anchors
            .map((a) => {
              const href = a.getAttribute('href') ?? '';
              const resolved = new URL(a.href || href, location.origin);
              const parts = resolved.pathname
                .replace(cityPath, '')
                .split('/')
                .filter(Boolean);
              if (parts.length !== 1) return null;
              const slug = parts[0];
              return {
                slug,
                name_en: a.textContent?.trim() ?? slug,
                url: new URL(resolved.pathname, base).toString(),
              };
            })
            .filter(Boolean);
        },
        { cityPath, cityUrl: city.url, base: HS_BASE_URL },
      )) as Array<{ slug: string; name_en: string; url: string }>;

      for (const d of domDistricts) {
        if (d.slug && !districtMap.has(d.slug)) {
          districtMap.set(d.slug, {
            slug: d.slug,
            name_en: d.name_en,
            url: d.url,
            citySlug: city.slug,
          });
        }
      }

      // Source 4: DOM fallback for the /regions/{citySlug}?module=supermarkets layout.
      // HungerStation renders district links as /sa-en/qc/supermarkets/{citySlug}/{districtSlug}
      // on the regions page rather than under the city URL path.
      if (districtMap.size === 0) {
        const qcDistrictPath = `/sa-en/qc/supermarkets/${city.slug}/`;
        const qcDistricts = (await page.evaluate(
          ({ qcPath, base }: { qcPath: string; base: string }) => {
            const anchors = Array.from(
              document.querySelectorAll<HTMLAnchorElement>(
                `a[href*="${qcPath}"]`,
              ),
            );
            return anchors
              .map((a) => {
                const href = a.getAttribute('href') ?? '';
                const resolved = new URL(a.href || href, location.origin);
                const parts = resolved.pathname.split('/').filter(Boolean);
                const slug = parts[parts.length - 1] ?? '';
                if (!slug || slug === 'supermarkets') return null;
                return {
                  slug,
                  name_en: a.textContent?.trim() ?? slug,
                  url: `${base}${resolved.pathname}`,
                };
              })
              .filter(Boolean);
          },
          { qcPath: qcDistrictPath, base: HS_BASE_URL },
        )) as Array<{ slug: string; name_en: string; url: string }>;

        for (const d of qcDistricts) {
          if (d.slug && !districtMap.has(d.slug)) {
            districtMap.set(d.slug, {
              slug: d.slug,
              name_en: d.name_en,
              url: d.url,
              citySlug: city.slug,
            });
          }
        }
        if (qcDistricts.length > 0) {
          this.logger.log(
            `[HS] discoverDistricts(${city.slug}): Source 4 (QC DOM) found ${qcDistricts.length} districts.`,
          );
        }
      }

      this.logger.log(
        `[HS] discoverDistricts(${city.slug}): ${districtMap.size} districts found.`,
      );
      teardown();
      return [...districtMap.values()];
    } finally {
      await page.close();
    }
  }

  async discoverBranches(district: HsDistrict): Promise<HsBranch[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    const page = await this.context.newPage();

    const branchMap = new Map<string, Partial<HsBranch>>();

    try {
      let consecutiveEmpty = 0;

      for (let pageNum = 1; pageNum <= MAX_PAGES; pageNum++) {
        const url =
          pageNum === 1 ? district.url : `${district.url}?page=${pageNum}`;
        const sizeBeforePage = branchMap.size;
        const pageBranchMap = new Map<string, Partial<HsBranch>>();
        const teardownGraphQL = this.interceptGraphQL(
          page,
          /branches|vendors|shops|restaurants|stores/i,
          (json) => {
            this.extractBranchCandidates(json, district, pageBranchMap);
          },
        );

        const navigationResponse = await this.navigateWithEvasion(
          page,
          url,
          'commit',
          30000,
        );
        await page.waitForTimeout(2000);
        await this.detectCloudflareChallenge(page, navigationResponse);
        await page
          .waitForLoadState('networkidle', { timeout: 5000 })
          .catch(() => {});

        // Hydration sweep for this page
        await this.sweepHydrationData(page, (json) => {
          this.extractBranchCandidates(json, district, pageBranchMap);
          return []; // side-effect only; we use branchMap not the return value
        });

        // DOM sweep for branch tiles
        const domBranches = await page.evaluate(() => {
          const links = Array.from(
            document.querySelectorAll<HTMLAnchorElement>('a[href*="/qc/"]'),
          );
          return links
            .map((a) => {
              const href = a.getAttribute('href') ?? '';
              const nameEl = a.querySelector(
                '[data-testid*="vendor-name"], h2, h3, [class*="name"]',
              );
              const arEl = a.querySelector('[lang="ar"]');
              const nameAr = arEl?.textContent?.trim() ?? '';
              const rawName =
                nameEl?.textContent?.trim() ?? a.textContent?.trim() ?? '';
              return {
                href,
                nameEn: rawName || nameAr,
                nameAr,
              };
            })
            .filter((b) => b.href && b.nameEn);
        });

        for (const { href, nameEn, nameAr } of domBranches) {
          // Branch URLs are /sa-en/qc/{vendorId}/{VendorName}/branch/{citySlug}~{districtSlug}~{uuid}
          // Vertical is NOT in the URL — these are all supermarket/grocery branches since
          // we're navigating a /qc/supermarkets/{city}/{district} page.
          const qcMatch = href.match(/\/qc\/(\d+)\//);
          const branchId = qcMatch?.[1] ?? '';
          if (!branchId) continue;

          // Classify from URL.  Branch URLs look like:
          //   /sa-en/qc/{vendorId}/{VendorName}/branch/{citySlug}~{districtSlug}~{uuid}
          // They carry NO explicit vertical segment because we are already navigating the
          // /qc/supermarkets/{city}/{district} index.  Default to 'hypermarket'.
          const classified = this.classifyVertical(href);
          const vertical: HsVertical =
            classified !== 'other' ? classified : 'hypermarket';

          if (HUNGERSTATION_REJECTED_VERTICALS.has(vertical)) continue;

          const uuid = this.extractPlatformUuid(href, branchId);
          if (!uuid || branchMap.has(uuid)) continue;

          branchMap.set(uuid, {
            platform_branch_id: branchId,
            platform_branch_uuid: uuid,
            merchant_name_en: nameEn,
            merchant_name_ar: nameAr || nameEn,
            vertical,
            source_url: new URL(href, HS_BASE_URL).toString(),
            citySlug: district.citySlug,
            districtSlug: district.slug,
          });
        }

        for (const [uuid, branch] of pageBranchMap.entries()) {
          if (!branchMap.has(uuid)) {
            branchMap.set(uuid, branch);
          }
        }

        teardownGraphQL();

        const seenThisPage = branchMap.size - sizeBeforePage;
        if (seenThisPage === 0) {
          consecutiveEmpty++;
          if (consecutiveEmpty >= 2) break;
        } else {
          consecutiveEmpty = 0;
        }

        // Apply jitter between paginated requests (inherited from BaseScraper)
        if (pageNum < MAX_PAGES) await applyJitter(1500, 4000);
      }

      // Filter and validate
      const result: HsBranch[] = [];
      for (const [, branch] of branchMap) {
        if (!branch.vertical) continue;
        if (HUNGERSTATION_REJECTED_VERTICALS.has(branch.vertical)) continue;
        if (!HUNGERSTATION_ALLOWED_VERTICALS.has(branch.vertical)) {
          this.logger.warn(
            `Unclassifiable branch ${branch.source_url}, skipping`,
          );
          continue;
        }
        if (!branch.platform_branch_uuid || !branch.merchant_name_en) continue;

        result.push(branch as HsBranch);
      }

      this.logger.log(
        `[HS] discoverBranches(${district.citySlug}/${district.slug}): ${result.length} branches found.`,
      );
      return result;
    } finally {
      await page.close();
    }
  }
}
