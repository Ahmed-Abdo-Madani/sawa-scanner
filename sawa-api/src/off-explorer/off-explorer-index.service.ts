import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createReadStream } from 'fs';
import { existsSync } from 'fs';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';
import { getOffPoolFilter, getOffPoolHash } from '../ingestion/constants/off-pool';
import { OpenFoodFactsDumpService } from '../ingestion/open-food-facts-dump.service';
import { normalizeBrandStrict, normalizeWeightToGrams, getGtinPrefix } from '../utils/normalization';
import { OffProductSummary } from './interfaces/off-product-summary.interface';
import { OffExplorerQueryDto } from './dto/off-explorer-query.dto';

interface Facet {
  label: string;
  count: number;
}

interface QueryResult {
  results: OffProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    topBrands?: Facet[];
    topCountries?: Facet[];
    topCategories?: Facet[];
  };
}

interface RebuildResult {
  totalProducts: number;
  durationMs: number;
}

interface StatsResult {
  totalProducts: number;
  indexBuiltAt: Date | null;
  slicePath: string | null;
  slicePoolHash: string | null;
  byCountryCount: number;
  byBrandCount: number;
}

@Injectable()
export class OffExplorerIndexService implements OnModuleInit {
  private readonly logger = new Logger(OffExplorerIndexService.name);

  // Internal state
  private products = new Map<string, OffProductSummary>();
  private byBrand = new Map<string, string[]>();
  private byCountry = new Map<string, string[]>();
  private byCategory = new Map<string, string[]>();
  private byGtinPrefix = new Map<string, string[]>();
  private nameTokens = new Map<string, string[]>();

  private indexBuiltAt: Date | null = null;
  private slicePath: string | null = null;
  private slicePoolHash: string | null = null;
  private building = false;

  constructor(private readonly dumpService: OpenFoodFactsDumpService) {}

  async onModuleInit(): Promise<void> {
    // Check if slice file exists; if so, rebuild index on startup
    const filter = getOffPoolFilter();
    const hash = getOffPoolHash(filter);
    const slicePath = `./uploads/off-slice/off_pool_${hash}.ndjson.gz`;

    if (existsSync(slicePath)) {
      this.logger.log(`Slice file found at ${slicePath}. Building OFF Explorer index...`);
      try {
        await this.rebuildIndex();
      } catch (error) {
        this.logger.error(`Failed to build index on startup: ${error.message}`);
      }
    } else {
      this.logger.warn(
        `Slice file not found at ${slicePath}. Index will be built on first rebuild request.`
      );
    }
  }

  /**
   * Rebuild the entire index from the slice file.
   * Concurrent calls are guarded to prevent simultaneous rebuilds.
   */
  async rebuildIndex(): Promise<RebuildResult> {
    if (this.building) {
      throw new Error('Index rebuild already in progress');
    }

    this.building = true;
    const startTime = Date.now();

    try {
      const filter = getOffPoolFilter();
      const slicePoolHash = getOffPoolHash(filter);
      const slicePath = `./uploads/off-slice/off_pool_${slicePoolHash}.ndjson.gz`;

      // Create slice file if it doesn't exist
      if (!existsSync(slicePath)) {
        this.logger.log(`Slice file not found. Creating from dump...`);
        await this.dumpService.materializeSlice(filter, slicePath);
      }

      // Build temporary maps
      const newProducts = new Map<string, OffProductSummary>();
      const newByBrand = new Map<string, string[]>();
      const newByCountry = new Map<string, string[]>();
      const newByCategory = new Map<string, string[]>();
      const newByGtinPrefix = new Map<string, string[]>();
      const newNameTokens = new Map<string, string[]>();

      // Stream and process the slice file
      let productCount = 0;

      await new Promise<void>((resolve, reject) => {
        const stream = createReadStream(slicePath)
          .pipe(createGunzip())
          .on('error', reject);

        const rl = createInterface({
          input: stream,
          crlfDelay: Infinity,
        });

        rl.on('line', (line) => {
          try {
            if (!line.trim()) return;

            const raw = JSON.parse(line);
            const product = this.buildOffProductSummary(raw);

            if (!product || !product.gtin) return;

            // Store product
            newProducts.set(product.gtin, product);
            productCount++;

            // Index by brands
            for (const brand of product.brands_tags) {
              const normalized = normalizeBrandStrict(brand);
              if (!newByBrand.has(normalized)) {
                newByBrand.set(normalized, []);
              }
              newByBrand.get(normalized)!.push(product.gtin);
            }

            // Index by countries
            for (const country of product.countries_tags) {
              if (!newByCountry.has(country)) {
                newByCountry.set(country, []);
              }
              newByCountry.get(country)!.push(product.gtin);
            }

            // Index by categories
            for (const category of product.categories_tags) {
              if (!newByCategory.has(category)) {
                newByCategory.set(category, []);
              }
              newByCategory.get(category)!.push(product.gtin);
            }

            // Index by GTIN prefix
            const prefix = getGtinPrefix(product.gtin);
            if (prefix) {
              if (!newByGtinPrefix.has(prefix)) {
                newByGtinPrefix.set(prefix, []);
              }
              newByGtinPrefix.get(prefix)!.push(product.gtin);
            }

            // Index by name tokens
            const tokens = new Set<string>();
            if (product.name_en) {
              this.tokenizeName(product.name_en, tokens);
            }
            if (product.name_ar) {
              this.tokenizeName(product.name_ar, tokens);
            }
            for (const token of tokens) {
              if (!newNameTokens.has(token)) {
                newNameTokens.set(token, []);
              }
              newNameTokens.get(token)!.push(product.gtin);
            }
          } catch (error) {
            this.logger.warn(`Failed to parse line: ${error.message}`);
          }
        });

        rl.on('close', resolve);
        rl.on('error', reject);
      });

      // Atomic swap
      this.products = newProducts;
      this.byBrand = newByBrand;
      this.byCountry = newByCountry;
      this.byCategory = newByCategory;
      this.byGtinPrefix = newByGtinPrefix;
      this.nameTokens = newNameTokens;
      this.indexBuiltAt = new Date();
      this.slicePath = slicePath;
      this.slicePoolHash = slicePoolHash;

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Index built successfully: ${productCount} products indexed in ${durationMs}ms`
      );

      return { totalProducts: productCount, durationMs };
    } finally {
      this.building = false;
    }
  }

  /**
   * Query the index with filters and pagination.
   * Ensures index is built before querying.
   */
  async query(filter: OffExplorerQueryDto): Promise<QueryResult> {
    // Lazy-initialize the index if not yet built
    await this.ensureIndexBuilt();

    // Normalize pagination
    const page = Math.max(1, filter.page || 1);
    const pageSize = Math.max(1, Math.min(200, filter.pageSize || 50));

    // Resolve candidate set
    let candidateGtins: Set<string>;

    if (this.isFilterActive(filter)) {
      candidateGtins = this.resolveCandidates(filter);
    } else {
      candidateGtins = new Set(this.products.keys());
    }

    // Apply scalar filters
    const filtered = Array.from(candidateGtins)
      .map((gtin) => this.products.get(gtin)!)
      .filter((product) => this.applyScalarFilters(product, filter));

    // Sort
    const sorted = this.sortProducts(filtered, filter.sort);

    // Compute facets on filtered set (before pagination)
    const facets = this.computeFacets(filtered);

    // Paginate
    const startIdx = (page - 1) * pageSize;
    const endIdx = startIdx + pageSize;
    const results = sorted.slice(startIdx, endIdx);

    return { results, total: filtered.length, page, pageSize, facets };
  }

  /**
   * Ensure the index is built before any read operation.
   * If the slice file doesn't exist, materialize it.
   * If the index hasn't been built, build it.
   * Reuses the building mutex to prevent concurrent rebuilds.
   */
  private async ensureIndexBuilt(): Promise<void> {
    if (this.indexBuiltAt !== null && this.products.size > 0) {
      // Index already built
      return;
    }

    // Wait for any in-flight rebuild to complete
    let retries = 0;
    const maxRetries = 300; // 30 seconds at 100ms intervals
    while (this.building && retries < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retries++;
    }

    // If index is still not built after waiting, trigger rebuild
    if (this.indexBuiltAt === null || this.products.size === 0) {
      await this.rebuildIndex();
    }
  }

  /**
   * Get the raw OFF product data for a specific GTIN.
   * Streams the slice file to find the product.
   */
  async getProductRaw(gtin: string): Promise<any | null> {
    // Ensure index is built (which also ensures slice file exists)
    // Ensure index is built (which also ensures slice file exists)
    await this.ensureIndexBuilt();

    const filter = getOffPoolFilter();
    const hash = getOffPoolHash(filter);
    const slicePath = `./uploads/off-slice/off_pool_${hash}.ndjson.gz`;

    return new Promise<any | null>((resolve, reject) => {
      const stream = createReadStream(slicePath)
        .pipe(createGunzip())
        .on('error', reject);

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on('line', (line) => {
        try {
          if (!line.trim()) return;

          const raw = JSON.parse(line);
          const code = String(raw.code || '').trim();

          if (code === gtin) {
            rl.close();
            resolve(raw);
          }
        } catch (error) {
          // Skip parsing errors
        }
      });

      rl.on('close', () => resolve(null));
      rl.on('error', reject);
    });
  }

  /**
   * Get statistics about the current index.
   */
  getStats(): StatsResult {
    return {
      totalProducts: this.products.size,
      indexBuiltAt: this.indexBuiltAt,
      slicePath: this.slicePath,
      slicePoolHash: this.slicePoolHash,
      byCountryCount: this.byCountry.size,
      byBrandCount: this.byBrand.size,
    };
  }

  /**
   * Comment 5.3: Expose read-only accessor for nameTokens index for use in GTIN backfill.
   * 
   * Returns inverted token index: token -> GTINs.
   * Used by CandidateShortlister to pre-filter candidates by name tokens.
   * 
   * Returns empty map if index not yet built.
   */
  getNameTokenIndex(): Map<string, string[]> {
    return new Map(this.nameTokens);
  }

  // --- Private helpers ---

  /**
   * Safely parse nutriscore_grade from OFF data.
   * Returns the grade only if it matches the allowed literal union.
   */
  private parseNutriscoreGrade(value: any): 'a' | 'b' | 'c' | 'd' | 'e' | null {
    if (!value) return null;
    const grade = String(value).toLowerCase();
    if (['a', 'b', 'c', 'd', 'e'].includes(grade)) {
      return grade as 'a' | 'b' | 'c' | 'd' | 'e';
    }
    return null;
  }

  /**
   * Safely parse nova_group from OFF data.
   * Returns the group only if it matches the allowed literal union.
   */
  private parseNovaGroup(value: any): 1 | 2 | 3 | 4 | null {
    if (!value) return null;
    const parsed = parseInt(String(value), 10);
    if ([1, 2, 3, 4].includes(parsed)) {
      return parsed as 1 | 2 | 3 | 4;
    }
    return null;
  }

  private isFilterActive(filter: OffExplorerQueryDto): boolean {
    return !!(
      (filter.brands && filter.brands.length > 0) ||
      (filter.countryTags && filter.countryTags.length > 0) ||
      (filter.categoryTags && filter.categoryTags.length > 0) ||
      filter.q ||
      filter.gtinPrefix ||
      filter.gtinExact
    );
  }

  private resolveCandidates(filter: OffExplorerQueryDto): Set<string> {
    const sets: Set<string>[] = [];

    // Brand candidates (union within dimension, collected as a set)
    if (filter.brands && filter.brands.length > 0) {
      const brandSet = new Set<string>();
      for (const brand of filter.brands) {
        const normalized = normalizeBrandStrict(brand);
        const gtins = this.byBrand.get(normalized);
        if (gtins) {
          gtins.forEach((g) => brandSet.add(g));
        }
      }
      // Always push, even if empty, to signal this filter was active
      sets.push(brandSet);
    }

    // Country candidates (union within dimension)
    if (filter.countryTags && filter.countryTags.length > 0) {
      const countrySet = new Set<string>();
      for (const country of filter.countryTags) {
        const gtins = this.byCountry.get(country);
        if (gtins) {
          gtins.forEach((g) => countrySet.add(g));
        }
      }
      // Always push, even if empty, to signal this filter was active
      sets.push(countrySet);
    }

    // Category candidates (union within dimension)
    if (filter.categoryTags && filter.categoryTags.length > 0) {
      const categorySet = new Set<string>();
      for (const category of filter.categoryTags) {
        const gtins = this.byCategory.get(category);
        if (gtins) {
          gtins.forEach((g) => categorySet.add(g));
        }
      }
      // Always push, even if empty, to signal this filter was active
      sets.push(categorySet);
    }

    // GTIN prefix candidate
    if (filter.gtinPrefix) {
      const gtins = this.byGtinPrefix.get(filter.gtinPrefix);
      if (gtins) {
        sets.push(new Set(gtins));
      } else {
        // No match for this prefix, return empty
        sets.push(new Set());
      }
    }

    // GTIN exact match
    if (filter.gtinExact) {
      if (this.products.has(filter.gtinExact)) {
        sets.push(new Set([filter.gtinExact]));
      } else {
        sets.push(new Set()); // Empty set, no match
      }
    }

    // Query string (AND semantics across tokens)
    if (filter.q) {
      const querySet = this.resolveQueryTokens(filter.q);
      // Always push the query set (it handles empty tokens internally)
      sets.push(querySet);
    }

    // Intersect all sets
    if (sets.length === 0) {
      return new Set(this.products.keys());
    }

    let result = sets[0];
    for (let i = 1; i < sets.length; i++) {
      result = this.intersectSets(result, sets[i]);
    }
    return result;
  }

  private resolveQueryTokens(q: string): Set<string> {
    const tokens = this.tokenizeQuery(q);
    if (tokens.length === 0) {
      // No valid tokens, return empty set to signal no match
      return new Set();
    }

    let result: Set<string> | null = null;
    for (const token of tokens) {
      const gtins = this.nameTokens.get(token);
      if (!gtins || gtins.length === 0) {
        // No products match this token
        return new Set();
      }
      const tokenSet = new Set(gtins);
      if (result === null) {
        result = tokenSet;
      } else {
        result = this.intersectSets(result, tokenSet);
      }
    }

    return result || new Set();
  }

  private intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
    const result = new Set<T>();
    for (const item of a) {
      if (b.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  private applyScalarFilters(product: OffProductSummary, filter: OffExplorerQueryDto): boolean {
    if (filter.hasNutrition !== undefined && product.has_nutrition !== filter.hasNutrition) {
      return false;
    }
    if (filter.hasImage !== undefined && (product.image_front_url !== null) !== filter.hasImage) {
      return false;
    }
    if (
      filter.hasIngredientsText !== undefined &&
      product.has_ingredients !== filter.hasIngredientsText
    ) {
      return false;
    }
    if (filter.minGrams !== undefined && (product.weight_grams === null || product.weight_grams < filter.minGrams)) {
      return false;
    }
    if (filter.maxGrams !== undefined && (product.weight_grams === null || product.weight_grams > filter.maxGrams)) {
      return false;
    }
    if (
      filter.nutriScoreGrades &&
      filter.nutriScoreGrades.length > 0 &&
      (!product.nutriscore_grade || !filter.nutriScoreGrades.includes(product.nutriscore_grade))
    ) {
      return false;
    }
    if (
      filter.novaGroups &&
      filter.novaGroups.length > 0 &&
      (!product.nova_group || !filter.novaGroups.includes(product.nova_group))
    ) {
      return false;
    }

    return true;
  }

  private sortProducts(
    products: OffProductSummary[],
    sortBy?: string
  ): OffProductSummary[] {
    const sorted = [...products];
    if (sortBy === 'gtin') {
      sorted.sort((a, b) => a.gtin.localeCompare(b.gtin));
    } else if (sortBy === 'name') {
      sorted.sort((a, b) => {
        const nameA = (a.name_en || a.name_ar || a.gtin).toLowerCase();
        const nameB = (b.name_en || b.name_ar || b.gtin).toLowerCase();
        return nameA.localeCompare(nameB);
      });
    }
    // 'recent' (default) maintains insertion order
    return sorted;
  }

  private computeFacets(products: OffProductSummary[]): {
    topBrands?: Facet[];
    topCountries?: Facet[];
    topCategories?: Facet[];
  } {
    const brandCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const categoryCounts = new Map<string, number>();

    for (const product of products) {
      for (const brand of product.brands_tags) {
        brandCounts.set(brand, (brandCounts.get(brand) || 0) + 1);
      }
      for (const country of product.countries_tags) {
        countryCounts.set(country, (countryCounts.get(country) || 0) + 1);
      }
      for (const category of product.categories_tags) {
        categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
      }
    }

    return {
      topBrands: this.topFacets(brandCounts, 20),
      topCountries: this.topFacets(countryCounts, 20),
      topCategories: this.topFacets(categoryCounts, 20),
    };
  }

  private topFacets(counts: Map<string, number>, limit: number): Facet[] {
    const facets: Facet[] = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return facets;
  }

  /**
   * Tokenize a name string using Unicode-aware word boundaries.
   * Handles both Arabic and Latin scripts correctly.
   */
  private tokenizeName(name: string, tokens: Set<string>): void {
    const parts = this.tokenizeUnicode(name);
    for (const part of parts) {
      if (part.length >= 2) {
        tokens.add(part);
      }
    }
  }

  /**
   * Tokenize a query string using Unicode-aware word boundaries.
   * Handles both Arabic and Latin scripts correctly.
   */
  private tokenizeQuery(q: string): string[] {
    const parts = this.tokenizeUnicode(q);
    return parts.filter((part) => part.length >= 2);
  }

  /**
   * Unicode-aware tokenization that preserves Arabic and Latin letters/digits.
   * Splits on non-letter/non-digit characters (including spaces, punctuation, etc.)
   */
  private tokenizeUnicode(text: string): string[] {
    // Match sequences of Unicode letter categories (L) or digit category (N)
    // This handles Arabic, Latin, and other scripts correctly
    const matches = text.match(/\p{L}+|\p{N}+/gu);
    if (!matches) return [];
    return matches.map((token) => token.toLowerCase());
  }

  private buildOffProductSummary(raw: any): OffProductSummary | null {
    const gtin = String(raw.code || '').trim();
    if (!gtin) {
      return null;
    }

    const nameEn = raw.product_name_en || raw.product_name || null;
    const nameAr = raw.product_name_ar || null;
    const brand = raw.brands || null;
    const brandsTags = (raw.brands_tags || []).map((t: any) => String(t)).filter((t: string) => t.length > 0);
    const countriesTags = (raw.countries_tags || [])
      .map((t: any) => String(t))
      .filter((t: string) => t.length > 0);
    const categoriesTags = (raw.categories_tags || [])
      .map((t: any) => String(t))
      .filter((t: string) => t.length > 0);
    const quantity = raw.quantity || null;
    const imageFrontUrl = raw.image_front_url || null;
    const hasNutrition = !!(raw.nutriments && Object.keys(raw.nutriments).length > 0);
    const hasIngredients = !!(raw.ingredients && raw.ingredients.length > 0);

    // Use dedicated parsers for constrained scalar fields
    const nutriscoreGrade = this.parseNutriscoreGrade(raw.nutriscore_grade);
    const novaGroup = this.parseNovaGroup(raw.nova_group);

    const weightGrams = normalizeWeightToGrams(quantity);

    return {
      gtin,
      name_en: nameEn ? String(nameEn).trim() || null : null,
      name_ar: nameAr ? String(nameAr).trim() || null : null,
      brand: brand ? String(brand).trim() || null : null,
      brands_tags: brandsTags,
      countries_tags: countriesTags,
      categories_tags: categoriesTags,
      quantity,
      image_front_url: imageFrontUrl,
      has_nutrition: hasNutrition,
      has_ingredients: hasIngredients,
      nutriscore_grade: nutriscoreGrade,
      nova_group: novaGroup,
      weight_grams: weightGrams,
    };
  }
}
