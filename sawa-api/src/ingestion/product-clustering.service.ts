import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { distance } from 'fastest-levenshtein';
import { v4 as uuid } from 'uuid';

@Injectable()
export class ProductClusteringService {
  private readonly logger = new Logger(ProductClusteringService.name);

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
  ): Promise<Product> {
    // 1. CONFIDENCE LEVEL 1: GTIN MATCH
    if (gtin) {
      const existingByGtin = await this.productRepository.findOne({ where: { gtin } });
      if (existingByGtin) {
        this.logger.log(`High confidence match found by GTIN: ${gtin}`);
        if(name_ar && !existingByGtin.name_ar) {
           existingByGtin.name_ar = name_ar;
           await this.productRepository.save(existingByGtin);
        }
        return existingByGtin;
      }
    }

    // NEW: MATCH QUALITY GUARD
    // Reject matching if name looks like a promo/offer or if brand+weight are too generic
    if (this.isOfferStyleName(name)) {
      this.logger.warn(`Rejecting product creation/match due to offer-style name: ${name}`);
      throw new Error(`Product name rejected as promotional: ${name}`);
    }

    const isGenericBrand = !brand || brand.toLowerCase() === 'generic' || brand.toLowerCase() === 'unnamed';
    const nw = this.normalizeWeight(weight);
    const hasUnknownWeight = nw.value === 0;

    // If it's a generic brand and has no clear weight, we refuse to fuzzy match
    // to prevent "Generic Chicken" merging with every other chicken product.
    if (isGenericBrand && hasUnknownWeight) {
      this.logger.debug(`Generic brand/weight detected for ${name}. Skipping fuzzy matching to prevent pollution.`);
    } else {
      // 2. CONFIDENCE LEVEL 2: NORMALIZED FUZZY MATCH
      const normalizedName = this.normalizeName(name);

      // Find products by brand and weight to narrow down the search
      const candidates = await this.productRepository.find({
        where: { 
          brand: brand || undefined,
          net_weight_value: nw.value > 0 ? nw.value : undefined,
          net_unit: nw.unit !== 'unknown' ? nw.unit : undefined
        },
      });

      for (const product of candidates) {
        const targetName = this.normalizeName(product.name_en || product.name_ar || '');
        // Check Levenshtein distance
        const dist = distance(normalizedName, targetName);
        const similarity = 1 - dist / Math.max(normalizedName.length, targetName.length);

        if (similarity > 0.85) {
          this.logger.log(`Medium confidence match found by fuzzy name and weight: ${name} ~ ${product.name_en} (${weight})`);
          if(name_ar && !product.name_ar) {
             product.name_ar = name_ar;
             await this.productRepository.save(product);
          }
          return product;
        }
      }
    }

    // 3. NO MATCH: CREATE NEW
    this.logger.log(`No match found for ${name} (${weight}). Creating new product record.`);
    const newProduct = new Product();
    newProduct.gtin = gtin || `SCAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    newProduct.name_en = name;
    if(name_ar) newProduct.name_ar = name_ar;
    newProduct.brand = brand;
    if (nw.value > 0) {
      newProduct.net_weight_value = nw.value;
      newProduct.net_unit = nw.unit;
    }
    
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
      /free/i,
      /bundle/i,
      /value pack/i,
      /special price/i,
      /discount/i,
      /^only .* for/i,
    ];
    return offerPatterns.some(pattern => pattern.test(lower));
  }

  private normalizeWeight(weightRaw: any): { value: number; unit: string } {
    if (!weightRaw) return { value: 0, unit: 'unknown' };
    let raw = "";
    if (typeof weightRaw === 'object') {
       raw = `${weightRaw.value || ''}${weightRaw.unit || ''}`.trim();
    } else {
       raw = String(weightRaw).toLowerCase().trim();
    }
    const match = raw.match(/(\d+\.?\d*)\s*(g|kg|l|ml|cc|cl)/);
    
    if (!match) return { value: 0, unit: 'unknown' };

    let value = parseFloat(match[1]);
    let unit = match[2];

    // Standardize units
    if (unit === 'kg') {
      value *= 1000;
      unit = 'g';
    } else if (unit === 'l') {
      value *= 1000;
      unit = 'ml';
    } else if (unit === 'cc' || unit === 'cl') {
      if (unit === 'cl') value *= 10;
      unit = 'ml';
    }

    return { value, unit };
  }
}
