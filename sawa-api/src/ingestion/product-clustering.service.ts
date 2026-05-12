import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { distance } from 'fastest-levenshtein';
import { normalizeWeight } from '../utils/string-similarity';
import { normalizeBrandStrict, normalizeProductName, gtinPrefix, isPlaceholderBrand, inferBrandAndWeightFromName } from '../utils/normalization';
import { GLOBAL_BRANDS_FOR_POOL } from './constants/global-brands';

@Injectable()
export class ProductClusteringService {
  private readonly logger = new Logger(ProductClusteringService.name);
  private knownBrandSlugs: Set<string> | null = null;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findOrCreateProduct(
    gtin: string | null,
    brand: string,
    name: string,
    weight: string,
    name_ar?: string,
  ): Promise<Product | null> {
    // 1. CONFIDENCE LEVEL 1: GTIN MATCH
    if (gtin) {
      const existingByGtin = await this.productRepository.findOne({
        where: { gtin },
      });
      if (existingByGtin) {
        this.logger.log(`High confidence match found by GTIN: ${gtin}`);
        if (name_ar && !existingByGtin.name_ar) {
          existingByGtin.name_ar = name_ar;
        }
        // Wire normalized fields
        existingByGtin.brand_normalized = normalizeBrandStrict(existingByGtin.brand ?? '');
        existingByGtin.name_normalized = normalizeProductName(existingByGtin.name_en ?? existingByGtin.name_ar ?? '');
        existingByGtin.gtin_prefix = gtinPrefix(existingByGtin.gtin || '');
        await this.productRepository.save(existingByGtin);
        return existingByGtin;
      }
    }

    // NEW: MATCH QUALITY GUARD
    // Reject matching if name looks like a promo/offer or if brand+weight are too generic
    if (this.isOfferStyleName(name)) {
      this.logger.warn(
        `Rejecting product creation/match due to offer-style name: ${name}`,
      );
      return null;
    }

    const isGenericBrand = isPlaceholderBrand(brand);
    const nw = this.normalizeWeight(weight);
    const hasUnknownWeight = nw.value === 0;

    // Skip fuzzy matching for weak identifiers:
    // 1) generic brand + unknown weight (existing guard), or
    // 2) missing GTIN + generic brand (cross-chain collapse risk).
    if ((isGenericBrand && hasUnknownWeight) || (!gtin && isGenericBrand)) {
      this.logger.debug(
        `Weak identity detected for ${name}. Skipping fuzzy matching to prevent pollution.`,
      );
    } else {
      // 2. CONFIDENCE LEVEL 2: NORMALIZED FUZZY MATCH
      const normalizedName = this.normalizeName(name);

      const normalizedBrand = (brand || '').trim();
      if (!gtin && !normalizedBrand) {
        this.logger.debug(
          `Missing GTIN and non-empty brand for ${name}. Skipping fuzzy matching.`,
        );
      } else {
        // Find products by brand and weight to narrow down the search.
        // When GTIN is missing, require explicit brand match.
        const where = {
          brand: !gtin ? normalizedBrand : normalizedBrand || undefined,
          net_weight_value: nw.value > 0 ? nw.value : undefined,
          net_unit: nw.unit !== 'unknown' ? nw.unit : undefined,
        };
        const candidates = await this.productRepository.find({ where });

        for (const product of candidates) {
          const targetName = this.normalizeName(
            product.name_en || product.name_ar || '',
          );
          // Check Levenshtein distance
          const dist = distance(normalizedName, targetName);
          const similarity =
            1 - dist / Math.max(normalizedName.length, targetName.length);

          if (similarity > 0.85) {
            this.logger.log(
              `Medium confidence match found by fuzzy name and weight: ${name} ~ ${product.name_en} (${weight})`,
            );
            if (name_ar && !product.name_ar) {
              product.name_ar = name_ar;
            }
            // Wire normalized fields
            product.brand_normalized = normalizeBrandStrict(product.brand ?? '');
            product.name_normalized = normalizeProductName(product.name_en ?? product.name_ar ?? '');
            product.gtin_prefix = gtinPrefix(product.gtin || '');
            await this.productRepository.save(product);
            return product;
          }
        }
      }
    }

    // 3. NO MATCH: CREATE NEW
    this.logger.log(
      `No match found for ${name} (${weight}). Creating new product record.`,
    );
    const newProduct = new Product();
    newProduct.gtin =
      gtin || `SCAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    newProduct.name_en = name;
    if (name_ar) newProduct.name_ar = name_ar;
    
    // Comment 2: Infer brand and weight from name when brand is placeholder
    let resolvedBrand = brand;
    let resolvedWeight = weight;
    if (isPlaceholderBrand(brand) && name) {
      // Build known-brand slug source: use GLOBAL_BRANDS_FOR_POOL as primary
      await this.ensureKnownBrandSlugsLoaded();
      const slugSource = Array.from(this.knownBrandSlugs || new Set<string>());
      
      const inference = inferBrandAndWeightFromName(name, slugSource);
      if (inference.brand) {
        resolvedBrand = inference.brand;
      }
      if (inference.weightRaw && !weight) {
        resolvedWeight = inference.weightRaw;
      }
    }
    
    newProduct.brand = resolvedBrand;
    
    // Parse weight with resolved value
    const nwFinal = this.normalizeWeight(resolvedWeight);
    if (nwFinal.value > 0) {
      newProduct.net_weight_value = nwFinal.value;
      newProduct.net_unit = nwFinal.unit;
    }

    // Wire normalized fields
    newProduct.brand_normalized = normalizeBrandStrict(resolvedBrand ?? '');
    newProduct.name_normalized = normalizeProductName(name ?? name_ar ?? '');
    newProduct.gtin_prefix = gtinPrefix(newProduct.gtin || '');

    return this.productRepository.save(newProduct);
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/gi, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/exclusive|only at|special offer|new|limited edition/gi, '') // Remove promotional suffixes
      .trim();
  }

  private isOfferStyleName(name: string): boolean {
    const lower = name.toLowerCase();
    const offerPatterns = [
      /buy \d+ get \d+/i,
      /save \d+%/i,
      /offer/i,
      /promo/i,
      /\bget \d+ free\b/i,
      /\bfree gift\b/i,
      /bundle/i,
      /value pack/i,
      /special price/i,
      /discount/i,
      /^only .* for/i,
      /pack/i,
    ];
    return offerPatterns.some((pattern) => pattern.test(lower));
  }

  private normalizeWeight(weightRaw: any): {
    value: number;
    unit: 'g' | 'ml' | 'unknown';
  } {
    return normalizeWeight(weightRaw);
  }

  /**
   * Ensure knownBrandSlugs is loaded with GLOBAL_BRANDS_FOR_POOL mapped through normalizeBrandStrict.
   * Call this once on service init or lazily before inference to populate the cache.
   */
  private async ensureKnownBrandSlugsLoaded(): Promise<void> {
    if (this.knownBrandSlugs === null) {
      // Initialize with GLOBAL_BRANDS_FOR_POOL as primary source
      this.knownBrandSlugs = new Set(GLOBAL_BRANDS_FOR_POOL.map(normalizeBrandStrict));
      
      // Optionally union with repository-derived brands (avoid re-querying per call)
      try {
        const dbBrands = await this.productRepository
          .createQueryBuilder('p')
          .select('DISTINCT p.brand_normalized', 'slug')
          .where("p.brand_normalized IS NOT NULL AND p.brand_normalized <> ''")
          .getRawMany();
        
        for (const row of dbBrands) {
          if (row.slug) {
            this.knownBrandSlugs.add(row.slug);
          }
        }
      } catch (err) {
        this.logger.warn('Failed to load repository brands for inference, using GLOBAL_BRANDS_FOR_POOL only', err);
      }
    }
  }
}
