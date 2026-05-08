import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { getOffPoolFilter } from './constants/off-pool';
import {
  normalizeBrandStrict,
  normalizeProductName,
  normalizeWeightToGrams,
  normalizeGtin,
  getGtinPrefix,
  isPlaceholderBrand,
} from '../utils/normalization';
import { OffImportJobDto } from './dto/off-import-job.dto';

@Injectable()
export class OffImportService {
  private readonly logger = new Logger(OffImportService.name);

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
    private readonly dataSource: DataSource,
  ) {}

  async run(opts: OffImportJobDto = {}): Promise<any> {
    const { dryRun = false, maxProducts } = opts;
    const batchSize = opts.batchSize ?? Number.parseInt(process.env.OFF_IMPORT_BATCH_SIZE ?? '500', 10);

    await this.openFoodFactsDumpService.validateDumpExists();

    if (!dryRun) {
      this.logger.log('Truncating product-related tables (FK order)...');
      // Truncate in safe FK order
      await this.dataSource.query(`TRUNCATE TABLE product_merge_log CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE product_price CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE product_image CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE product_allergen CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE ingredient CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE nutrition_fact CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE product_report CASCADE`);
      await this.dataSource.query(`TRUNCATE TABLE product CASCADE`);
    } else {
      this.logger.log('[DRY RUN] Skipping table truncation.');
    }

    const filter = getOffPoolFilter();
    let imported = 0;
    let skipped = 0;
    let invalidGtin = 0;
    let batchProducts: any[] = [];
    let batchNutritions: any[] = [];
    let batchIngredients: any[] = [];
    let batchAllergens: any[] = [];

    const completenessBuckets = {
      '0.0-0.2': 0,
      '0.2-0.4': 0,
      '0.4-0.6': 0,
      '0.6-0.8': 0,
      '0.8-1.0': 0,
    };

    const startTime = Date.now();
    const startedAt = new Date().toISOString();

    for await (const raw of this.openFoodFactsDumpService.streamDumpProducts(filter)) {
      if (maxProducts && imported + skipped >= maxProducts) {
        break;
      }

      const rawCode = String(raw.code || '');
      const code = normalizeGtin(rawCode);
      if (!code) {
        invalidGtin++;
        continue;
      }

      const { mappedProduct, mappedNutrition, mappedIngredients, mappedAllergens } = this.mapOffProduct(raw, code);
      const score = this.computeCompletenessScore(mappedProduct, !!mappedNutrition, mappedIngredients.length);
      mappedProduct.data_completeness_score = score;

      if (score <= 0.2) completenessBuckets['0.0-0.2']++;
      else if (score <= 0.4) completenessBuckets['0.2-0.4']++;
      else if (score <= 0.6) completenessBuckets['0.4-0.6']++;
      else if (score <= 0.8) completenessBuckets['0.6-0.8']++;
      else completenessBuckets['0.8-1.0']++;

      batchProducts.push(mappedProduct);
      if (mappedNutrition) batchNutritions.push(mappedNutrition);
      batchIngredients.push(...mappedIngredients);
      batchAllergens.push(...mappedAllergens);

      if (batchProducts.length >= batchSize) {
        if (!dryRun) {
          const insertedIds = await this.bulkInsert(batchProducts, batchNutritions, batchIngredients, batchAllergens);
          imported += insertedIds.length;
          skipped += (batchProducts.length - insertedIds.length);
        } else {
          imported += batchProducts.length;
        }
        batchProducts = [];
        batchNutritions = [];
        batchIngredients = [];
        batchAllergens = [];

        if ((imported + skipped) % 5000 === 0) {
          this.logger.log(`Imported ${imported} products (${skipped} skipped due to conflict, ${invalidGtin} invalid GTINs)...`);
        }
      }
    }

    if (batchProducts.length > 0) {
      if (!dryRun) {
        const insertedIds = await this.bulkInsert(batchProducts, batchNutritions, batchIngredients, batchAllergens);
        imported += insertedIds.length;
        skipped += (batchProducts.length - insertedIds.length);
      } else {
        imported += batchProducts.length;
      }
    }

    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - startTime;

    const summary = {
      totalImported: imported,
      totalSkipped: skipped,
      totalInvalidGtin: invalidGtin,
      durationMs,
      completenessDistribution: completenessBuckets,
      startedAt,
      completedAt,
    };

    this.logger.log(`Import finished. Imported: ${imported}, Skipped: ${skipped}, Invalid GTINs: ${invalidGtin}`);

    this.writeSummaryReport(summary);

    return summary;
  }

  private mapOffProduct(raw: any, code: string) {
    const rawBrand = (raw.brands || '').split(',')[0].trim();
    const nameEn = raw.product_name_en || raw.product_name || '';
    const nameAr = raw.product_name_ar || '';
    
    let netWeightValue: number | null = null;
    let netUnit: string | null = null;
    if (raw.quantity) {
      netWeightValue = normalizeWeightToGrams(raw.quantity);
      if (netWeightValue !== null) {
        netUnit = 'g'; // Normalized to grams by normalizeWeightToGrams
      }
    }

    let nutriScoreGrade = null;
    if (typeof raw.nutriscore_grade === 'string' && /^[a-e]$/i.test(raw.nutriscore_grade)) {
      nutriScoreGrade = raw.nutriscore_grade.toLowerCase();
    }

    let novaGroup = null;
    if (typeof raw.nova_group === 'number' && raw.nova_group >= 1 && raw.nova_group <= 4) {
      novaGroup = raw.nova_group;
    }

    let category = null;
    if (raw.categories_tags && raw.categories_tags[0]) {
      category = raw.categories_tags[0].replace(/^en:/, '');
    }
    let subcategory = null;
    if (raw.categories_tags && raw.categories_tags[1]) {
      subcategory = raw.categories_tags[1].replace(/^en:/, '');
    }

    let allergenTags = [];
    if (Array.isArray(raw.allergens_tags)) {
      allergenTags = raw.allergens_tags.map((a: string) => a.replace(/^en:/, ''));
    }

    const mappedProduct: any = {
      gtin: code,
      name_en: nameEn,
      name_ar: nameAr,
      brand: rawBrand,
      brand_normalized: normalizeBrandStrict(rawBrand),
      name_normalized: normalizeProductName(nameEn),
      gtin_prefix: getGtinPrefix(code),
      net_weight_value: netWeightValue,
      net_unit: netUnit,
      category,
      subcategory,
      allergen_tags: allergenTags,
      image_front_url: raw.image_front_url || null,
      image_nutrition_url: raw.image_nutrition_url || null,
      nutri_score_grade: nutriScoreGrade,
      nova_group: novaGroup,
      off_categories_tags: Array.isArray(raw.categories_tags) ? raw.categories_tags : [],
      off_countries_tags: Array.isArray(raw.countries_tags) ? raw.countries_tags : [],
      data_source: 'off',
      nutrition_data_complete: false, // Updated below
    };

    const nutriments = raw.nutriments || {};
    const parsedNutritions = {
      energy_kcal: this.parseNum(nutriments['energy-kcal_100g']),
      fat_g: this.parseNum(nutriments['fat_100g']),
      saturated_fat_g: this.parseNum(nutriments['saturated-fat_100g']),
      carbs_g: this.parseNum(nutriments['carbohydrates_100g']),
      sugars_g: this.parseNum(nutriments['sugars_100g']),
      fiber_g: this.parseNum(nutriments['fiber_100g']),
      protein_g: this.parseNum(nutriments['proteins_100g']),
      sodium_mg: this.parseNum(nutriments['sodium_100g']),
    };

    let mappedNutrition: any = null;
    let nonNullNutritions = 0;
    for (const val of Object.values(parsedNutritions)) {
      if (val !== undefined) nonNullNutritions++;
    }

    if (nonNullNutritions > 0) {
      mappedNutrition = {
        product_gtin: code,
        serving_size_g: 100,
        ...parsedNutritions,
      };
      if (nonNullNutritions >= 3) {
        mappedProduct.nutrition_data_complete = true;
      }
    }

    const mappedIngredients: any[] = [];
    if (Array.isArray(raw.ingredients)) {
      for (const ing of raw.ingredients) {
        if (ing.text) {
          mappedIngredients.push({
            product_gtin: code,
            name_en: ing.text.trim(),
            name_ar: '',
          });
        }
      }
    } else if (raw.ingredients_text) {
      const parts = (raw.ingredients_text as string).split(/[,.]+/);
      for (const p of parts) {
        const tp = p.trim();
        if (tp) {
          mappedIngredients.push({ product_gtin: code, name_en: tp, name_ar: '' });
        }
      }
    }

    const mappedAllergens: any[] = [];
    for (const tag of allergenTags) {
      mappedAllergens.push({
        product_gtin: code,
        allergen_key: tag,
        source: 'openfoodfacts',
      });
    }

    return { mappedProduct, mappedNutrition, mappedIngredients, mappedAllergens };
  }

  private computeCompletenessScore(product: any, hasNutrition: boolean, ingredientCount: number): number {
    let score = 0;
    if (product.name_en && product.name_en.length > 2) score += 0.15;
    if (product.name_ar && product.name_ar.length > 2) score += 0.15;
    if (product.brand && !isPlaceholderBrand(product.brand)) score += 0.10;
    if (product.category) score += 0.05;
    if (product.image_front_url) score += 0.10;
    if (product.nutrition_data_complete) score += 0.20;
    if (ingredientCount >= 1) score += 0.10;
    if (product.allergen_tags && product.allergen_tags.length > 0) score += 0.05;
    if (product.net_weight_value > 0) score += 0.05;
    if (product.nutri_score_grade) score += 0.05;
    return score;
  }

  private async bulkInsert(products: any[], nutritions: any[], ingredients: any[], allergens: any[]): Promise<string[]> {
    const insertResult = await this.productRepo
      .createQueryBuilder()
      .insert()
      .into(Product)
      .values(products)
      .orIgnore()
      .execute();

    const identifiers = insertResult.identifiers || [];
    const insertedIds = identifiers.map((id) => id.id).filter(Boolean);
    
    // We can't rely on insertedIds if they were skipped, but we know the GTINs
    // To only insert children for inserted products, we could re-query, 
    // but orIgnore on children will handle it fine assuming child schemas also support orIgnore on unique constraints,
    // actually child schemas reference GTIN (which might be the PK for Product? No, Product PK is id, GTIN is unique).
    // Wait, the children reference Product by product_id usually! 
    // Let's check how the entities are linked. Usually NutritionFact uses product_id.
    // If I map `product_gtin` on the children, I need to resolve GTIN to Product ID.
    
    // Actually, let's query the product IDs for the GTINs in the batch
    const gtins = products.map(p => p.gtin);
    const dbProducts = await this.productRepo
      .createQueryBuilder('p')
      .select(['p.id', 'p.gtin'])
      .where('p.gtin IN (:...gtins)', { gtins })
      .getMany();
      
    const gtinToId = new Map(dbProducts.map(p => [p.gtin, p.id]));

    // Now populate product_id on children
    const validNutritions = nutritions.map(n => ({ ...n, product_id: gtinToId.get(n.product_gtin) })).filter(n => n.product_id);
    const validIngredients = ingredients.map(i => ({ ...i, product_id: gtinToId.get(i.product_gtin) })).filter(i => i.product_id);
    const validAllergens = allergens.map(a => ({ ...a, product_id: gtinToId.get(a.product_gtin) })).filter(a => a.product_id);

    if (validNutritions.length > 0) {
      await this.nutritionRepo.createQueryBuilder().insert().into(NutritionFact).values(validNutritions).orIgnore().execute();
    }
    if (validIngredients.length > 0) {
      await this.ingredientRepo.createQueryBuilder().insert().into(Ingredient).values(validIngredients).orIgnore().execute();
    }
    if (validAllergens.length > 0) {
      await this.allergenRepo.createQueryBuilder().insert().into(ProductAllergen).values(validAllergens).orIgnore().execute();
    }

    return dbProducts.map(p => p.id); // returning all valid IDs in this batch
  }

  private writeSummaryReport(summary: any) {
    const reportsDir = path.join(process.cwd(), 'uploads', 'off-import-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `summary-${timestamp}.json`);
    
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf-8');
    this.logger.log(`Summary report written to ${reportPath}`);
  }

  private parseNum(val: any): number | undefined {
    if (val === undefined || val === null) return undefined;
    const n = Number.parseFloat(val);
    if (Number.isNaN(n)) return undefined;
    return n;
  }
}
