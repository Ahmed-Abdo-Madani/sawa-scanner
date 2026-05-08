import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { EmbeddingCache } from './ai-match/embedding-cache';
import { EmbeddingShortlister } from './ai-match/embedding-shortlister';
import { EMBEDDING_PROVIDER_TOKEN } from './ai-match/embedding-provider.interface';
import type { EmbeddingProvider } from './ai-match/embedding-provider.interface';
import { OffEnrichmentJobDto } from './dto/off-enrichment-job.dto';
import { computeCompletenessScore } from './off-completeness.util';
import {
  normalizeBrandStrict,
  normalizeProductName,
  normalizeWeightToGrams,
  normalizeGtin,
  getGtinPrefix,
} from '../utils/normalization';

// ── Types ────────────────────────────────────────────────────────────────────

interface RawOffProduct {
  code: string;
  product_name?: string;
  product_name_en?: string;
  product_name_ar?: string;
  brands?: string;
  quantity?: string;
  categories_tags?: string[];
  countries_tags?: string[];
  nutriments?: Record<string, any>;
  ingredients?: Array<{ text?: string }>;
  ingredients_text?: string;
  allergens_tags?: string[];
  image_front_url?: string;
  image_nutrition_url?: string;
  nutriscore_grade?: string;
  nova_group?: number;
}

interface FieldBorrowResult {
  borrowed: string[];
  skipped: string[];
}

interface EnrichmentResult {
  gtin: string;
  donorGtin: string | null;
  donorCosine: number;
  borrowed: string[];
  newScore: number;
}

export interface EnrichmentSummary {
  productsProcessed: number;
  fieldsBorrowed: Record<string, number>;
  averageDonorCosine: number;
  unenrichableCount: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OffEnrichmentService {
  private readonly logger = new Logger(OffEnrichmentService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(NutritionFact)
    private readonly nutritionRepo: Repository<NutritionFact>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(ProductAllergen)
    private readonly allergenRepo: Repository<ProductAllergen>,
    private readonly openFoodFactsDumpService: OpenFoodFactsDumpService,
    private readonly embeddingCache: EmbeddingCache,
    private readonly embeddingShortlister: EmbeddingShortlister,
    @Inject(EMBEDDING_PROVIDER_TOKEN)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly dataSource: DataSource,
  ) {}

  // ── Public entry point ───────────────────────────────────────────────────

  async run(opts: OffEnrichmentJobDto = {}): Promise<EnrichmentSummary> {
    const {
      dryRun = false,
      maxProducts,
      completenessThreshold = 0.7,
      rebuildDonorCache = false,
    } = opts;

    const startedAt = new Date().toISOString();
    const startTime = Date.now();

    // 1. Query incomplete products
    const findOpts: any = {
      where: { data_completeness_score: LessThan(completenessThreshold) },
      order: { data_completeness_score: 'ASC' as const },
    };
    if (maxProducts) findOpts.take = maxProducts;

    const incompleteProducts = await this.productRepo.find(findOpts);
    this.logger.log(
      `Found ${incompleteProducts.length} incomplete products (threshold < ${completenessThreshold})`,
    );

    if (incompleteProducts.length === 0) {
      const summary = this.buildEmptySummary(startedAt, startTime);
      this.writeSummaryReport(summary);
      return summary;
    }

    // 2. Build donor corpus from full OFF dump
    this.openFoodFactsDumpService.validateDumpExists();

    const poolHash = 'enrichment-full-dump';
    const model = this.embeddingProvider.modelId;
    const dim = this.embeddingProvider.dim;

    if (rebuildDonorCache) {
      await this.embeddingCache.clear();
      this.logger.log('Cleared donor embedding cache (rebuildDonorCache=true)');
    }

    // Try loading from cache
    let donorVectors = await this.embeddingCache.load({ poolHash, model, dim });

    // Build in-memory donor map and indexes
    const donorMap = new Map<string, RawOffProduct>();
    const brandIndex = new Map<string, string[]>();
    const prefixIndex = new Map<string, string[]>();
    const categoryIndex = new Map<string, string[]>();

    this.logger.log('Streaming full OFF dump to build donor corpus...');
    let dumpCount = 0;
    for await (const raw of this.openFoodFactsDumpService.streamDumpProducts(
      {} as any,
    )) {
      const code = normalizeGtin(String(raw.code || ''));
      if (!code) continue;

      donorMap.set(code, raw);

      // Build secondary indexes
      const rawBrand = (raw.brands || '').split(',')[0].trim();
      const brandNorm = normalizeBrandStrict(rawBrand);
      if (brandNorm) {
        if (!brandIndex.has(brandNorm)) brandIndex.set(brandNorm, []);
        brandIndex.get(brandNorm)!.push(code);
      }

      const prefix = getGtinPrefix(code);
      if (prefix) {
        if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, []);
        prefixIndex.get(prefix)!.push(code);
      }

      if (Array.isArray(raw.categories_tags) && raw.categories_tags[0]) {
        const cat0 = raw.categories_tags[0];
        if (!categoryIndex.has(cat0)) categoryIndex.set(cat0, []);
        categoryIndex.get(cat0)!.push(code);
      }

      dumpCount++;
      if (dumpCount % 500000 === 0) {
        this.logger.log(`Indexed ${dumpCount} OFF products...`);
      }
    }
    this.logger.log(`Donor corpus built: ${donorMap.size} products indexed.`);

    // 3. Build embeddings if cache miss
    if (!donorVectors) {
      this.logger.log(
        `Embedding cache miss. Building embeddings for ${donorMap.size} donors...`,
      );
      donorVectors = await this.buildDonorEmbeddings(donorMap);
      await this.embeddingCache.save(donorVectors, {
        poolHash,
        model,
        dim,
        builtAt: new Date().toISOString(),
      });
      this.logger.log('Donor embeddings cached.');
    }

    // 4. Set embedding index
    this.embeddingShortlister.setIndex(donorVectors);

    // 5. Enrich each incomplete product
    const fieldsBorrowed: Record<string, number> = {
      name_ar: 0,
      nutrition: 0,
      ingredients: 0,
      allergens: 0,
      image_front_url: 0,
      nutri_score_grade: 0,
      nova_group: 0,
    };
    let unenrichableCount = 0;
    let totalCosine = 0;
    let cosineCount = 0;

    for (let i = 0; i < incompleteProducts.length; i++) {
      const product = incompleteProducts[i];
      try {
        const result = await this.enrichOneProduct(
          product,
          donorMap,
          donorVectors,
          { brandIndex, prefixIndex, categoryIndex },
          dryRun,
        );

        if (!result.donorGtin) {
          unenrichableCount++;
        } else {
          totalCosine += result.donorCosine;
          cosineCount++;
          for (const field of result.borrowed) {
            if (fieldsBorrowed[field] !== undefined) fieldsBorrowed[field]++;
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to enrich product ${product.gtin}: ${err.message}`,
        );
        unenrichableCount++;
      }

      if ((i + 1) % 500 === 0) {
        this.logger.log(
          `Enrichment progress: ${i + 1}/${incompleteProducts.length}`,
        );
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const summary: EnrichmentSummary = {
      productsProcessed: incompleteProducts.length,
      fieldsBorrowed,
      averageDonorCosine: cosineCount > 0 ? totalCosine / cosineCount : 0,
      unenrichableCount,
      durationMs,
      startedAt,
      completedAt,
    };

    this.writeSummaryReport(summary);
    this.logger.log(
      `Enrichment complete. Processed: ${summary.productsProcessed}, Unenrichable: ${unenrichableCount}, Duration: ${(durationMs / 1000).toFixed(1)}s`,
    );

    return summary;
  }

  // ── Per-product enrichment ───────────────────────────────────────────────

  private async enrichOneProduct(
    product: Product,
    donorMap: Map<string, RawOffProduct>,
    donorVectors: Map<string, Float32Array>,
    indexes: {
      brandIndex: Map<string, string[]>;
      prefixIndex: Map<string, string[]>;
      categoryIndex: Map<string, string[]>;
    },
    dryRun: boolean,
  ): Promise<EnrichmentResult> {
    // Stage 1: Deterministic pre-filter
    const candidateGtins = new Set<string>();
    const brandNorm = normalizeBrandStrict(product.brand || '');

    if (brandNorm && indexes.brandIndex.has(brandNorm)) {
      for (const g of indexes.brandIndex.get(brandNorm)!) candidateGtins.add(g);
    }

    const prefix = getGtinPrefix(product.gtin);
    if (prefix && indexes.prefixIndex.has(prefix)) {
      for (const g of indexes.prefixIndex.get(prefix)!) candidateGtins.add(g);
    }

    if (
      Array.isArray(product.off_categories_tags) &&
      product.off_categories_tags[0]
    ) {
      const cat0 = product.off_categories_tags[0];
      if (indexes.categoryIndex.has(cat0)) {
        for (const g of indexes.categoryIndex.get(cat0)!) candidateGtins.add(g);
      }
    }

    if (candidateGtins.size === 0) {
      return {
        gtin: product.gtin,
        donorGtin: null,
        donorCosine: 0,
        borrowed: [],
        newScore: product.data_completeness_score,
      };
    }

    // Stage 2: Embedding ranking — build restricted vector index
    const restrictedVectors = new Map<string, Float32Array>();
    for (const g of candidateGtins) {
      const v = donorVectors.get(g);
      if (v) restrictedVectors.set(g, v);
    }

    // Build offMap for shortlister
    const offMap = new Map<string, any>();
    for (const g of candidateGtins) {
      const raw = donorMap.get(g);
      if (raw) {
        offMap.set(g, {
          gtin: g,
          name_en: raw.product_name_en || raw.product_name || '',
          name_ar: raw.product_name_ar || '',
          brand: (raw.brands || '').split(',')[0].trim(),
          weightRaw: raw.quantity || '',
        });
      }
    }

    // Temporarily set restricted index
    this.embeddingShortlister.setIndex(restrictedVectors);

    const scan = {
      gtin: product.gtin,
      name_en: product.name_en || '',
      name_ar: product.name_ar || '',
      brand: product.brand || '',
      net_weight_value: product.net_weight_value ?? null,
      net_unit: product.net_unit ?? null,
    };

    const shortlist = await this.embeddingShortlister.buildShortlist(
      scan,
      { offMap, brandIndex: new Map(), brandWeightIndex: new Map(), gtinPrefixIndex: new Map() },
      5,
    );

    if (shortlist.candidates.length === 0 || shortlist.topCosine < 0.85) {
      return {
        gtin: product.gtin,
        donorGtin: null,
        donorCosine: shortlist.topCosine,
        borrowed: [],
        newScore: product.data_completeness_score,
      };
    }

    // Pick top candidate
    const topCandidate = shortlist.candidates[0];
    const topCosine = shortlist.cosines[0];
    const donor = donorMap.get(topCandidate.gtin);

    if (!donor) {
      return {
        gtin: product.gtin,
        donorGtin: null,
        donorCosine: 0,
        borrowed: [],
        newScore: product.data_completeness_score,
      };
    }

    // Apply field borrowing
    const { borrowed } = this.applyFieldBorrowing(product, donor, topCosine);

    if (borrowed.length > 0 && !dryRun) {
      // Recompute completeness
      const existingNutrition = await this.nutritionRepo.findOne({
        where: { product: { id: product.id } },
      });
      const existingIngredients = await this.ingredientRepo.count({
        where: { product: { id: product.id } },
      });

      const newScore = computeCompletenessScore(
        product,
        !!existingNutrition || product.nutrition_data_complete,
        existingIngredients,
      );

      product.data_completeness_score = newScore;
      product.data_source = 'ml_enriched';

      await this.productRepo.save(product);

      // Insert child entities if borrowed
      if (borrowed.includes('nutrition')) {
        await this.insertDonorNutrition(product, donor);
      }
      if (borrowed.includes('ingredients')) {
        await this.insertDonorIngredients(product, donor);
      }
      if (borrowed.includes('allergens')) {
        await this.insertDonorAllergens(product, donor);
      }

      return {
        gtin: product.gtin,
        donorGtin: topCandidate.gtin,
        donorCosine: topCosine,
        borrowed,
        newScore,
      };
    }

    return {
      gtin: product.gtin,
      donorGtin: topCandidate.gtin,
      donorCosine: topCosine,
      borrowed,
      newScore: product.data_completeness_score,
    };
  }

  // ── Field borrowing rules ────────────────────────────────────────────────

  private applyFieldBorrowing(
    product: Product,
    donor: RawOffProduct,
    cosine: number,
  ): FieldBorrowResult {
    const borrowed: string[] = [];
    const skipped: string[] = [];

    const donorBrand = normalizeBrandStrict(
      (donor.brands || '').split(',')[0].trim(),
    );
    const productBrand = normalizeBrandStrict(product.brand || '');
    const sameBrand = donorBrand && productBrand && donorBrand === productBrand;

    const donorWeight = normalizeWeightToGrams(donor.quantity || '');
    const productWeight = product.net_weight_value
      ? normalizeWeightToGrams(`${product.net_weight_value}${product.net_unit || 'g'}`)
      : null;
    const sameWeight =
      donorWeight !== null &&
      productWeight !== null &&
      Math.abs(donorWeight - productWeight) / Math.max(donorWeight, productWeight) <= 0.2;

    // name_ar: cosine >= 0.90, donor name_ar non-empty
    const donorNameAr = donor.product_name_ar || '';
    if (
      cosine >= 0.90 &&
      donorNameAr.length > 0 &&
      (!product.name_ar || product.name_ar.length <= 2)
    ) {
      product.name_ar = donorNameAr;
      borrowed.push('name_ar');
    } else {
      skipped.push('name_ar');
    }

    // nutrition: cosine >= 0.85, same brand AND weight ±20%
    if (
      cosine >= 0.85 &&
      sameBrand &&
      sameWeight &&
      !product.nutrition_data_complete
    ) {
      borrowed.push('nutrition');
    } else {
      skipped.push('nutrition');
    }

    // ingredients: cosine >= 0.85, same brand
    if (cosine >= 0.85 && sameBrand) {
      borrowed.push('ingredients');
    } else {
      skipped.push('ingredients');
    }

    // allergens: cosine >= 0.85, same brand
    if (
      cosine >= 0.85 &&
      sameBrand &&
      (!product.allergen_tags || product.allergen_tags.length === 0)
    ) {
      if (Array.isArray(donor.allergens_tags) && donor.allergens_tags.length > 0) {
        product.allergen_tags = donor.allergens_tags.map((a) =>
          a.replace(/^en:/, ''),
        );
        borrowed.push('allergens');
      } else {
        skipped.push('allergens');
      }
    } else {
      skipped.push('allergens');
    }

    // image_front_url: cosine >= 0.88
    if (
      cosine >= 0.88 &&
      !product.image_front_url &&
      donor.image_front_url
    ) {
      product.image_front_url = donor.image_front_url;
      borrowed.push('image_front_url');
    } else {
      skipped.push('image_front_url');
    }

    // nutri_score_grade: cosine >= 0.85, same brand AND same weight
    if (
      cosine >= 0.85 &&
      sameBrand &&
      sameWeight &&
      !product.nutri_score_grade
    ) {
      const grade = donor.nutriscore_grade;
      if (typeof grade === 'string' && /^[a-e]$/i.test(grade)) {
        product.nutri_score_grade = grade.toLowerCase();
        borrowed.push('nutri_score_grade');
      } else {
        skipped.push('nutri_score_grade');
      }
    } else {
      skipped.push('nutri_score_grade');
    }

    // nova_group: cosine >= 0.85, same brand AND same weight
    if (
      cosine >= 0.85 &&
      sameBrand &&
      sameWeight &&
      product.nova_group === null
    ) {
      if (
        typeof donor.nova_group === 'number' &&
        donor.nova_group >= 1 &&
        donor.nova_group <= 4
      ) {
        product.nova_group = donor.nova_group;
        borrowed.push('nova_group');
      } else {
        skipped.push('nova_group');
      }
    } else {
      skipped.push('nova_group');
    }

    return { borrowed, skipped };
  }

  // ── Child entity insertion ───────────────────────────────────────────────

  private async insertDonorNutrition(
    product: Product,
    donor: RawOffProduct,
  ): Promise<void> {
    const nutriments = donor.nutriments || {};
    const parsedNutritions: Record<string, number | undefined> = {
      energy_kcal: this.parseNum(nutriments['energy-kcal_100g']),
      fat_g: this.parseNum(nutriments['fat_100g']),
      saturated_fat_g: this.parseNum(nutriments['saturated-fat_100g']),
      carbs_g: this.parseNum(nutriments['carbohydrates_100g']),
      sugars_g: this.parseNum(nutriments['sugars_100g']),
      fiber_g: this.parseNum(nutriments['fiber_100g']),
      protein_g: this.parseNum(nutriments['proteins_100g']),
      sodium_mg: this.parseNum(nutriments['sodium_100g']),
    };

    const nonNull = Object.values(parsedNutritions).filter(
      (v) => v !== undefined,
    ).length;
    if (nonNull === 0) return;

    try {
      await this.nutritionRepo
        .createQueryBuilder()
        .insert()
        .into(NutritionFact)
        .values({
          product: { id: product.id } as any,
          serving_size_g: 100,
          ...parsedNutritions,
        })
        .orIgnore()
        .execute();

      if (nonNull >= 3) {
        product.nutrition_data_complete = true;
      }
    } catch (err: any) {
      this.logger.warn(
        `Failed to insert donor nutrition for ${product.gtin}: ${err.message}`,
      );
    }
  }

  private async insertDonorIngredients(
    product: Product,
    donor: RawOffProduct,
  ): Promise<void> {
    const ingredients: Array<{ product: any; name_en: string; name_ar: string }> = [];

    if (Array.isArray(donor.ingredients)) {
      for (const ing of donor.ingredients) {
        if (ing.text) {
          ingredients.push({
            product: { id: product.id },
            name_en: ing.text.trim(),
            name_ar: '',
          });
        }
      }
    } else if (donor.ingredients_text) {
      const parts = donor.ingredients_text.split(/[,.]+/);
      for (const p of parts) {
        const tp = p.trim();
        if (tp) {
          ingredients.push({
            product: { id: product.id },
            name_en: tp,
            name_ar: '',
          });
        }
      }
    }

    if (ingredients.length === 0) return;

    try {
      await this.ingredientRepo
        .createQueryBuilder()
        .insert()
        .into(Ingredient)
        .values(ingredients)
        .orIgnore()
        .execute();
    } catch (err: any) {
      this.logger.warn(
        `Failed to insert donor ingredients for ${product.gtin}: ${err.message}`,
      );
    }
  }

  private async insertDonorAllergens(
    product: Product,
    donor: RawOffProduct,
  ): Promise<void> {
    if (!Array.isArray(donor.allergens_tags) || donor.allergens_tags.length === 0) return;

    const allergens = donor.allergens_tags.map((tag) => ({
      product: { id: product.id },
      allergen_key: tag.replace(/^en:/, ''),
      source: 'ml_enriched',
    }));

    try {
      await this.allergenRepo
        .createQueryBuilder()
        .insert()
        .into(ProductAllergen)
        .values(allergens)
        .orIgnore()
        .execute();
    } catch (err: any) {
      this.logger.warn(
        `Failed to insert donor allergens for ${product.gtin}: ${err.message}`,
      );
    }
  }

  // ── Embedding helpers ────────────────────────────────────────────────────

  private async buildDonorEmbeddings(
    donorMap: Map<string, RawOffProduct>,
  ): Promise<Map<string, Float32Array>> {
    const gtins: string[] = [];
    const texts: string[] = [];

    for (const [gtin, raw] of donorMap.entries()) {
      gtins.push(gtin);
      const parts: string[] = [];
      const nameEn = raw.product_name_en || raw.product_name || '';
      const nameAr = raw.product_name_ar || '';
      const brand = (raw.brands || '').split(',')[0].trim();
      if (nameEn) parts.push(nameEn);
      if (nameAr) parts.push(nameAr);
      if (brand) parts.push(brand);
      if (raw.quantity) parts.push(raw.quantity);
      texts.push(parts.join(' | '));
    }

    const BATCH_SIZE = 100;
    const result = new Map<string, Float32Array>();

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batchTexts = texts.slice(i, i + BATCH_SIZE);
      const batchGtins = gtins.slice(i, i + BATCH_SIZE);
      const vectors = await this.embeddingProvider.embedDocuments(batchTexts);

      for (let j = 0; j < vectors.length; j++) {
        result.set(batchGtins[j], vectors[j]);
      }

      if ((i + BATCH_SIZE) % 10000 < BATCH_SIZE) {
        this.logger.log(
          `Embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} donor texts...`,
        );
      }
    }

    return result;
  }

  // ── Reporting ────────────────────────────────────────────────────────────

  private writeSummaryReport(summary: EnrichmentSummary): void {
    const reportsDir = path.join(
      process.cwd(),
      'uploads',
      'off-enrichment-reports',
    );
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `summary-${timestamp}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf-8');
    this.logger.log(`Summary report written to ${reportPath}`);
  }

  private buildEmptySummary(
    startedAt: string,
    startTime: number,
  ): EnrichmentSummary {
    return {
      productsProcessed: 0,
      fieldsBorrowed: {
        name_ar: 0,
        nutrition: 0,
        ingredients: 0,
        allergens: 0,
        image_front_url: 0,
        nutri_score_grade: 0,
        nova_group: 0,
      },
      averageDonorCosine: 0,
      unenrichableCount: 0,
      durationMs: Date.now() - startTime,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  private parseNum(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    const n = Number.parseFloat(val);
    if (Number.isNaN(n)) return undefined;
    return n;
  }
}
