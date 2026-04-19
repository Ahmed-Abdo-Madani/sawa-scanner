import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { getAllergenByKey, SFDA_ALLERGENS } from '../ingestion/constants/sfda-allergens';

// ─── NutriScore Thresholds (SFDA NPM / Ofcom-based, for solid foods) ─────────

interface NutriScoreThresholds {
  energy: number[];
  sugars: number[];
  saturatedFat: number[];
  sodium: number[];
  fiber: number[];
  protein: number[];
}

const SOLID_THRESHOLDS: NutriScoreThresholds = {
  energy:       [335, 670, 1005, 1340, 1675, 2010, 2345, 2680, 3015, 3350],
  sugars:       [4.5, 9,   13.5, 18,   22.5, 27,   31,   36,   40,   45],
  saturatedFat: [1,   2,   3,    4,    5,    6,    7,    8,    9,    10],
  sodium:       [90,  180, 270,  360,  450,  540,  630,  720,  810,  900],
  fiber:        [0.9, 1.9, 2.8,  3.7,  4.7],
  protein:      [1.6, 3.2, 4.8,  6.4,  8.0],
};

// ─── Traffic Light Thresholds (per 100g, UK FSA-style) ──────────────────────

interface TrafficThresholds {
  low: number;
  high: number;
}

const TRAFFIC_LIGHT: Record<string, TrafficThresholds> = {
  fat_g:           { low: 3,    high: 17.5 },
  saturated_fat_g: { low: 1.5,  high: 5 },
  sugars_g:        { low: 5,    high: 22.5 },
  sodium_mg:       { low: 300,  high: 600 },  // per 100g in mg
};

// ─── Types ──────────────────────────────────────────────────────────────────

export interface HealthSummary {
  fat:          { value: number | null; level: 'low' | 'medium' | 'high' };
  saturatedFat: { value: number | null; level: 'low' | 'medium' | 'high' };
  sugars:       { value: number | null; level: 'low' | 'medium' | 'high' };
  sodium:       { value: number | null; level: 'low' | 'medium' | 'high' };
}

export interface HarmfulSubstanceWarning {
  ingredient_name_ar: string;
  ingredient_name_en: string;
  e_number: string | null;
  sfda_status: string;
  restriction_note: string | null;
}

export interface AllergenWarning {
  allergen_key: string;
  name_ar: string;
  name_en: string;
  source: string;
}

export interface NutritionAnalysis {
  nutri_score_grade: string | null;
  nutri_score_numeric: number | null;
  nova_group: number | null;
  health_summary: HealthSummary | null;
  harmful_substances: HarmfulSubstanceWarning[];
  allergen_warnings: AllergenWarning[];
  nutrition_data_complete: boolean;
  nutrition: {
    energy_kcal: number | null;
    fat_g: number | null;
    saturated_fat_g: number | null;
    carbs_g: number | null;
    sugars_g: number | null;
    fiber_g: number | null;
    protein_g: number | null;
    sodium_mg: number | null;
    serving_size_g: number | null;
  } | null;
}

@Injectable()
export class NutritionService {
  private readonly logger = new Logger(NutritionService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(NutritionFact)
    private readonly nutritionRepo: Repository<NutritionFact>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
    @InjectRepository(ProductAllergen)
    private readonly allergenRepo: Repository<ProductAllergen>,
  ) {}

  // ─── NutriScore Computation (A–E) ────────────────────────────────────────

  computeNutriScore(nf: NutritionFact): { grade: string; score: number } {
    // Negative points (0–10 each, total 0–40)
    const negEnergy = this.scoreAgainst(nf.energy_kcal ?? 0, SOLID_THRESHOLDS.energy);
    const negSugars = this.scoreAgainst(nf.sugars_g ?? 0, SOLID_THRESHOLDS.sugars);
    const negSatFat = this.scoreAgainst(nf.saturated_fat_g ?? 0, SOLID_THRESHOLDS.saturatedFat);
    const negSodium = this.scoreAgainst(nf.sodium_mg ?? 0, SOLID_THRESHOLDS.sodium);
    const negativeTotal = negEnergy + negSugars + negSatFat + negSodium;

    // Positive points (0–5 each, total 0–15)
    const posFiber = this.scoreAgainst(nf.fiber_g ?? 0, SOLID_THRESHOLDS.fiber);
    const posProtein = this.scoreAgainst(nf.protein_g ?? 0, SOLID_THRESHOLDS.protein);
    // fruits/veg % not available from our data, assume 0
    const positiveTotal = posFiber + posProtein;

    // If negative ≥ 11 and fiber < 5, protein doesnt count
    let finalPositive = positiveTotal;
    if (negativeTotal >= 11 && posFiber < 5) {
      finalPositive = posFiber; // only fiber counts
    }

    const score = negativeTotal - finalPositive;

    let grade: string;
    if (score <= -1) grade = 'A';
    else if (score <= 2) grade = 'B';
    else if (score <= 10) grade = 'C';
    else if (score <= 18) grade = 'D';
    else grade = 'E';

    return { grade, score };
  }

  private scoreAgainst(value: number, thresholds: number[]): number {
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (value > thresholds[i]) return i + 1;
    }
    return 0;
  }

  // ─── Traffic Light Health Summary ────────────────────────────────────────

  getHealthSummary(nf: NutritionFact): HealthSummary {
    return {
      fat: this.classifyLevel(nf.fat_g, TRAFFIC_LIGHT.fat_g),
      saturatedFat: this.classifyLevel(nf.saturated_fat_g, TRAFFIC_LIGHT.saturated_fat_g),
      sugars: this.classifyLevel(nf.sugars_g, TRAFFIC_LIGHT.sugars_g),
      sodium: this.classifyLevel(nf.sodium_mg, TRAFFIC_LIGHT.sodium_mg),
    };
  }

  private classifyLevel(
    value: number | null | undefined,
    thresholds: TrafficThresholds,
  ): { value: number | null; level: 'low' | 'medium' | 'high' } {
    if (value == null) return { value: null, level: 'medium' };
    if (value <= thresholds.low) return { value, level: 'low' };
    if (value >= thresholds.high) return { value, level: 'high' };
    return { value, level: 'medium' };
  }

  // ─── Harmful Substances Check ────────────────────────────────────────────

  async checkHarmfulSubstances(productId: string): Promise<HarmfulSubstanceWarning[]> {
    const ingredients = await this.ingredientRepo.find({
      where: { product: { id: productId } },
    });

    return ingredients
      .filter(
        (ing) =>
          ing.sfda_status &&
          ing.sfda_status !== 'allowed' &&
          ing.sfda_status !== 'safe',
      )
      .map((ing) => ({
        ingredient_name_ar: ing.name_ar,
        ingredient_name_en: ing.name_en,
        e_number: ing.e_number,
        sfda_status: ing.sfda_status,
        restriction_note: ing.restriction_note,
      }));
  }

  // ─── Allergen Warnings ───────────────────────────────────────────────────

  async checkAllergenWarnings(
    productId: string,
    userAllergens?: string[],
  ): Promise<AllergenWarning[]> {
    const allergens = await this.allergenRepo.find({
      where: { product_id: productId },
    });

    // If user has specified personal allergens, only warn on those
    if (userAllergens && userAllergens.length > 0) {
      const userSet = new Set(userAllergens.map((a) => a.toLowerCase()));
      return allergens
        .filter((a) => userSet.has(a.allergen_key))
        .map((a) => ({
          allergen_key: a.allergen_key,
          name_ar: a.name_ar,
          name_en: a.name_en,
          source: a.source,
        }));
    }

    // Otherwise return all detected allergens
    return allergens.map((a) => ({
      allergen_key: a.allergen_key,
      name_ar: a.name_ar,
      name_en: a.name_en,
      source: a.source,
    }));
  }

  // ─── Full Nutrition Analysis ─────────────────────────────────────────────

  async getFullAnalysis(
    gtin: string,
    userAllergens?: string[],
  ): Promise<NutritionAnalysis> {
    const product = await this.productRepo.findOne({
      where: { gtin },
      relations: ['nutritionFact', 'ingredients', 'allergens'],
    });

    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    const nf = product.nutritionFact;
    let nutriScoreResult: { grade: string; score: number } | null = null;
    let healthSummary: HealthSummary | null = null;

    if (nf) {
      nutriScoreResult = this.computeNutriScore(nf);
      healthSummary = this.getHealthSummary(nf);

      // Persist computed NutriScore if not already set
      if (!product.nutri_score_grade && nutriScoreResult) {
        product.nutri_score_grade = nutriScoreResult.grade;
        product.sfda_npm_score = nutriScoreResult.score;
        await this.productRepo.save(product);
      }
    }

    const harmful = await this.checkHarmfulSubstances(product.id);
    const allergenWarnings = await this.checkAllergenWarnings(
      product.id,
      userAllergens,
    );

    return {
      nutri_score_grade: nutriScoreResult?.grade ?? product.nutri_score_grade ?? null,
      nutri_score_numeric: nutriScoreResult?.score ?? product.sfda_npm_score ?? null,
      nova_group: product.nova_group,
      health_summary: healthSummary,
      harmful_substances: harmful,
      allergen_warnings: allergenWarnings,
      nutrition_data_complete: product.nutrition_data_complete ?? false,
      nutrition: nf
        ? {
            energy_kcal: nf.energy_kcal,
            fat_g: nf.fat_g,
            saturated_fat_g: nf.saturated_fat_g,
            carbs_g: nf.carbs_g,
            sugars_g: nf.sugars_g,
            fiber_g: nf.fiber_g,
            protein_g: nf.protein_g,
            sodium_mg: nf.sodium_mg,
            serving_size_g: nf.serving_size_g,
          }
        : null,
    };
  }
}
