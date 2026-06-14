import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull, Not, In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductMergeService } from './product-merge.service';
import { ImageHashService } from '../ingestion/image-hash.service';
import { diceCoefficient } from '../utils/string-similarity';
import {
  normalizeProductName,
  normalizeBrandUsable,
  normalizeWeightToGrams,
} from '../utils/normalization';

export interface MatchingStatus {
  isRunning: boolean;
  status: 'idle' | 'running' | 'completed' | 'failed';
  scanned: number;
  matched: number;
  exact: number;
  visual: number;
  fuzzy: number;
  total: number;
  startTime?: Date;
  endTime?: Date;
  error?: string;
  dryRun?: boolean;
}

@Injectable()
export class LocalMatcherService {
  private readonly logger = new Logger(LocalMatcherService.name);
  
  private statusState: MatchingStatus = {
    isRunning: false,
    status: 'idle',
    scanned: 0,
    matched: 0,
    exact: 0,
    visual: 0,
    fuzzy: 0,
    total: 0,
  };

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly imageRepo: Repository<ProductImage>,
    private readonly mergeService: ProductMergeService,
    private readonly hashService: ImageHashService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  getStatus(): MatchingStatus {
    return { ...this.statusState };
  }

  async triggerMatching(options: {
    limit?: number;
    threshold?: number;
    dryRun?: boolean;
  }): Promise<MatchingStatus> {
    if (this.statusState.isRunning) {
      throw new ConflictException('A local GTIN matching job is already in progress');
    }

    const limit = options.limit ?? 99999;
    const threshold = options.threshold ?? 0.85;
    const dryRun = options.dryRun ?? false;

    // Reset status state
    this.statusState = {
      isRunning: true,
      status: 'running',
      scanned: 0,
      matched: 0,
      exact: 0,
      visual: 0,
      fuzzy: 0,
      total: 0,
      startTime: new Date(),
      dryRun,
    };

    // Run in the background
    this.runMatchingBackground(limit, threshold, dryRun).catch((err) => {
      this.logger.error(`Error in background local matcher: ${err.message}`, err.stack);
      this.statusState.isRunning = false;
      this.statusState.status = 'failed';
      this.statusState.error = err.message;
      this.statusState.endTime = new Date();
    });

    return this.getStatus();
  }

  private extractSizeFromName(name: string): string | undefined {
    const match = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|oz)/i);
    return match ? match[0] : undefined;
  }

  private doSizesMatch(
    sizeA: string | undefined,
    sizeB: string | undefined,
    weightValA?: number | null,
    weightValB?: number | null,
  ): boolean {
    const gramsA = normalizeWeightToGrams(sizeA) || (weightValA ? weightValA : null);
    const gramsB = normalizeWeightToGrams(sizeB) || (weightValB ? weightValB : null);
    
    if (gramsA === null || gramsB === null) return true; // If one is unknown, we don't reject
    
    // Accept within 10% tolerance
    const max = Math.max(gramsA, gramsB);
    return Math.abs(gramsA - gramsB) <= max * 0.1;
  }

  private async loadImagesForProducts(products: Product[]) {
    const chunkSize = 1000;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      const chunkIds = chunk.map((p) => p.id);
      const images = await this.imageRepo.find({
        where: { product_id: In(chunkIds) },
      });
      
      const imageMap = new Map<string, ProductImage[]>();
      for (const img of images) {
        if (!imageMap.has(img.product_id)) {
          imageMap.set(img.product_id, []);
        }
        imageMap.get(img.product_id)!.push(img);
      }
      
      for (const p of chunk) {
        p.images = imageMap.get(p.id) || [];
      }
    }
  }

  private async runMatchingBackground(
    limit: number,
    threshold: number,
    dryRun: boolean,
  ): Promise<void> {
    this.logger.log(`Starting local matching background task. limit=${limit}, threshold=${threshold}, dryRun=${dryRun}`);

    // 1. Fetch HungerStation products without GTINs
    const hsProducts = await this.productRepo.find({
      where: {
        gtin: IsNull(),
        hs_product_id: Not(IsNull()),
      },
      take: limit,
    });

    this.statusState.total = hsProducts.length;
    this.logger.log(`Local Matcher: Found ${hsProducts.length} HungerStation products without GTINs.`);

    if (hsProducts.length === 0) {
      this.statusState.isRunning = false;
      this.statusState.status = 'completed';
      this.statusState.endTime = new Date();
      return;
    }

    // Load images for HS products
    await this.loadImagesForProducts(hsProducts);

    // 2. Fetch all donor products containing GTINs
    const donorProducts = await this.productRepo.find({
      where: {
        gtin: Not(IsNull()),
      },
    });
    this.logger.log(`Local Matcher: Found ${donorProducts.length} donor products with GTINs.`);
    await this.loadImagesForProducts(donorProducts);

    // 3. Index donor products
    const englishNameMap = new Map<string, Product[]>();
    const arabicNameMap = new Map<string, Product[]>();
    const donorImagesList: Array<{ hash: string; product: Product }> = [];

    for (const p of donorProducts) {
      const brandSlug = normalizeBrandUsable(p.brand);
      
      if (p.name_en) {
        const normEn = normalizeProductName(p.name_en);
        const keyWithBrand = `${normEn}|${brandSlug}`;
        if (!englishNameMap.has(keyWithBrand)) englishNameMap.set(keyWithBrand, []);
        englishNameMap.get(keyWithBrand)!.push(p);

        if (!englishNameMap.has(normEn)) englishNameMap.set(normEn, []);
        englishNameMap.get(normEn)!.push(p);
      }
      
      if (p.name_ar) {
        const normAr = normalizeProductName(p.name_ar);
        const keyWithBrand = `${normAr}|${brandSlug}`;
        if (!arabicNameMap.has(keyWithBrand)) arabicNameMap.set(keyWithBrand, []);
        arabicNameMap.get(keyWithBrand)!.push(p);

        if (!arabicNameMap.has(normAr)) arabicNameMap.set(normAr, []);
        arabicNameMap.get(normAr)!.push(p);
      }

      if (p.images) {
        for (const img of p.images) {
          if (img.image_hash && img.image_hash !== 'FAILED') {
            donorImagesList.push({ hash: img.image_hash, product: p });
          }
        }
      }
    }

    // 4. Perform matching
    for (let i = 0; i < hsProducts.length; i++) {
      const product = hsProducts[i];
      const brandSlug = normalizeBrandUsable(product.brand);
      const hsSize = this.extractSizeFromName(product.name_en || product.name_ar || '');
      
      let matchedGtin: string | null = null;
      let matchedProduct: Product | null = null;
      let matchMethod = '';

      // --- Pass 1: Exact Normalized Name Matches ---
      if (product.name_en) {
        const normEn = normalizeProductName(product.name_en);
        const key = brandSlug ? `${normEn}|${brandSlug}` : normEn;
        const candidates = englishNameMap.get(key) || [];
        for (const cand of candidates) {
          const candSize = this.extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (this.doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
            matchedProduct = cand;
            matchedGtin = cand.gtin;
            matchMethod = 'Exact Name Match (EN)';
            break;
          }
        }
      }

      if (!matchedGtin && product.name_ar) {
        const normAr = normalizeProductName(product.name_ar);
        const key = brandSlug ? `${normAr}|${brandSlug}` : normAr;
        const candidates = arabicNameMap.get(key) || [];
        for (const cand of candidates) {
          const candSize = this.extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (this.doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
            matchedProduct = cand;
            matchedGtin = cand.gtin;
            matchMethod = 'Exact Name Match (AR)';
            break;
          }
        }
      }

      if (matchedGtin) {
        this.statusState.exact++;
      }

      // --- Pass 2: Perceptual Image Hash Match (dHash) ---
      if (!matchedGtin && product.images && product.images.length > 0) {
        const hsHashes = product.images
          .map((img) => img.image_hash)
          .filter((hash): hash is string => !!hash && hash !== 'FAILED');

        if (hsHashes.length > 0) {
          let bestDistance = 99;
          let bestCand: Product | null = null;

          for (const hsHash of hsHashes) {
            for (const donorImg of donorImagesList) {
              const candBrandSlug = normalizeBrandUsable(donorImg.product.brand);
              
              if (brandSlug && candBrandSlug && brandSlug !== candBrandSlug) continue;
              if (!brandSlug && candBrandSlug) {
                const hsNameLower = (product.name_en || product.name_ar || '').toLowerCase();
                const candBrandNameLower = (donorImg.product.brand || '').toLowerCase();
                if (!hsNameLower.includes(candBrandNameLower)) continue;
              }

              const simEn = product.name_en && donorImg.product.name_en ? diceCoefficient(product.name_en, donorImg.product.name_en) : 0;
              const simAr = product.name_ar && donorImg.product.name_ar ? diceCoefficient(product.name_ar, donorImg.product.name_ar) : 0;
              const nameScore = Math.max(simEn, simAr);
              if (nameScore < 0.4) continue;

              const distance = this.hashService.calculateHammingDistance(hsHash, donorImg.hash);
              if (distance <= 8 && distance < bestDistance) {
                const candSize = this.extractSizeFromName(donorImg.product.name_en || donorImg.product.name_ar || '');
                if (this.doSizesMatch(hsSize, candSize, product.net_weight_value, donorImg.product.net_weight_value)) {
                  bestDistance = distance;
                  bestCand = donorImg.product;
                }
              }
            }
          }

          if (bestCand) {
            matchedProduct = bestCand;
            matchedGtin = bestCand.gtin;
            matchMethod = `Visual Hash Match (dHash distance: ${bestDistance})`;
            this.statusState.visual++;
          }
        }
      }

      // --- Pass 3: Fuzzy Name Matches ---
      if (!matchedGtin) {
        let bestScore = 0;
        let bestCand: Product | null = null;

        const brandCandidates = donorProducts.filter(p => {
          const candBrandSlug = normalizeBrandUsable(p.brand);
          if (brandSlug) {
            return candBrandSlug === brandSlug;
          } else if (candBrandSlug) {
            const hsNameLower = (product.name_en || product.name_ar || '').toLowerCase();
            const candBrandNameLower = (p.brand || '').toLowerCase();
            return hsNameLower.includes(candBrandNameLower);
          }
          return true;
        });

        for (const cand of brandCandidates) {
          const simEn = product.name_en && cand.name_en ? diceCoefficient(product.name_en, cand.name_en) : 0;
          const simAr = product.name_ar && cand.name_ar ? diceCoefficient(product.name_ar, cand.name_ar) : 0;
          const score = Math.max(simEn, simAr);

          if (score >= threshold && score > bestScore) {
            const candSize = this.extractSizeFromName(cand.name_en || cand.name_ar || '');
            if (this.doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
              bestScore = score;
              bestCand = cand;
            }
          }
        }

        if (bestCand) {
          matchedProduct = bestCand;
          matchedGtin = bestCand.gtin;
          matchMethod = `Fuzzy Name Match (Score: ${bestScore.toFixed(3)})`;
          this.statusState.fuzzy++;
        }
      }

      // --- Process the match ---
      if (matchedGtin && matchedProduct) {
        this.statusState.matched++;
        
        if (!dryRun) {
          try {
            await this.mergeService.assignGtin(
              product.id,
              matchedGtin,
              'hs_local_gtin_matcher',
              `Local database GTIN Match via ${matchMethod}`,
            );
          } catch (err: any) {
            this.logger.error(`Merge failed for product ${product.id} during local matching: ${err.message}`);
          }
        }
      }

      this.statusState.scanned++;
    }

    this.statusState.isRunning = false;
    this.statusState.status = 'completed';
    this.statusState.endTime = new Date();
    this.logger.log(`Local matching completed. Scanned: ${this.statusState.scanned}, Matched: ${this.statusState.matched}`);
  }
}
