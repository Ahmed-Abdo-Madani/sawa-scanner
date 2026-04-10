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
  ): Promise<Product> {
    // 1. CONFIDENCE LEVEL 1: GTIN MATCH
    if (gtin) {
      const existingByGtin = await this.productRepository.findOne({ where: { gtin } });
      if (existingByGtin) {
        this.logger.log(`High confidence match found by GTIN: ${gtin}`);
        return existingByGtin;
      }
    }

    // 2. CONFIDENCE LEVEL 2: NORMALIZED FUZZY MATCH
    const normalizedName = this.normalizeName(name);
    const nw = this.normalizeWeight(weight);

    // Find products by brand and weight to narrow down the search
    // We only match if the weight is similar to avoid merging different sizes (e.g. 330ml vs 1.5L)
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
        return product;
      }
    }

    // 3. NO MATCH: CREATE NEW
    this.logger.log(`No match found for ${name} (${weight}). Creating new product record.`);
    const newProduct = new Product();
    newProduct.gtin = gtin || `SCAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    newProduct.name_en = name;
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
      .replace(/exclusive|only at|special offer|new/gi, '') // Remove promotional suffixes
      .trim();
  }

  private normalizeWeight(weight: string): { value: number; unit: string } {
    const raw = weight.toLowerCase().trim();
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
