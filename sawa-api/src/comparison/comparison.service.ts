import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { NutritionService } from '../nutrition/nutrition.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SimilarProductSummary {
  gtin: string;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  image_front_url: string | null;
  nutri_score_grade: string | null;
  net_weight_value: number | null;
  net_unit: string | null;
  lowest_price: number | null;
}

export interface ComparisonResult {
  product_a: ProductComparisonCard;
  product_b: ProductComparisonCard;
  nutrition_deltas: NutritionDelta[];
  allergen_diff: AllergenDiff;
  recommendation: RecommendationResult;
}

export interface ProductComparisonCard {
  gtin: string;
  name_ar: string | null;
  name_en: string | null;
  brand: string | null;
  image_front_url: string | null;
  nutri_score_grade: string | null;
  lowest_price: number | null;
  net_weight_value: number | null;
  net_unit: string | null;
}

export interface NutritionDelta {
  field: string;
  label_en: string;
  label_ar: string;
  value_a: number | null;
  value_b: number | null;
  better: 'a' | 'b' | 'equal' | 'unknown';
}

export interface AllergenDiff {
  only_in_a: string[];
  only_in_b: string[];
  shared: string[];
}

export interface RecommendationResult {
  winner: 'a' | 'b' | 'tie';
  score_a: number;
  score_b: number;
  reason_en: string;
  reason_ar: string;
}

// ─── Nutrition field metadata ────────────────────────────────────────────────

const NUTRITION_FIELDS: {
  field: string;
  label_en: string;
  label_ar: string;
  lower_is_better: boolean;
}[] = [
  { field: 'energy_kcal',     label_en: 'Calories',       label_ar: 'السعرات',         lower_is_better: true },
  { field: 'fat_g',           label_en: 'Fat',            label_ar: 'الدهون',           lower_is_better: true },
  { field: 'saturated_fat_g', label_en: 'Saturated Fat',  label_ar: 'الدهون المشبعة',   lower_is_better: true },
  { field: 'carbs_g',         label_en: 'Carbohydrates',  label_ar: 'الكربوهيدرات',     lower_is_better: true },
  { field: 'sugars_g',        label_en: 'Sugars',         label_ar: 'السكريات',         lower_is_better: true },
  { field: 'fiber_g',         label_en: 'Fiber',          label_ar: 'الألياف',           lower_is_better: false },
  { field: 'protein_g',       label_en: 'Protein',        label_ar: 'البروتين',         lower_is_better: false },
  { field: 'sodium_mg',       label_en: 'Sodium',         label_ar: 'الصوديوم',         lower_is_better: true },
];

// ─── Weighted scoring constants ──────────────────────────────────────────────

const NUTRI_WEIGHT = 0.65; // nutritional quality is 65% of the recommendation
const PRICE_WEIGHT = 0.35; // price is 35%

@Injectable()
export class ComparisonService {
  private readonly logger = new Logger(ComparisonService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(NutritionFact)
    private readonly nutritionRepo: Repository<NutritionFact>,
    @InjectRepository(ProductPrice)
    private readonly priceRepo: Repository<ProductPrice>,
    @InjectRepository(ProductAllergen)
    private readonly allergenRepo: Repository<ProductAllergen>,
    private readonly nutritionService: NutritionService,
  ) {}

  // ─── Find Similar Products ───────────────────────────────────────────────

  async findSimilarProducts(
    gtin: string,
    limit: number = 10,
  ): Promise<SimilarProductSummary[]> {
    const source = await this.productRepo.findOne({
      where: { gtin },
      relations: ['nutritionFact'],
    });
    if (!source) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    const qb = this.productRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.nutritionFact', 'nf')
      .where('p.id != :id', { id: source.id });

    // Priority 1: same category + subcategory
    if (source.category) {
      qb.andWhere('p.category = :category', { category: source.category });
    }
    if (source.subcategory) {
      qb.andWhere('p.subcategory = :subcategory', {
        subcategory: source.subcategory,
      });
    }

    // Priority 2: similar weight (±30%)
    if (source.net_weight_value && source.net_weight_value > 0) {
      const low = source.net_weight_value * 0.7;
      const high = source.net_weight_value * 1.3;
      qb.andWhere(
        '(p.net_weight_value BETWEEN :low AND :high OR p.net_weight_value IS NULL)',
        { low, high },
      );
    }

    // Order by NutriScore (A=1 best), then name
    qb.orderBy(
      `CASE 
        WHEN p.nutri_score_grade = 'A' THEN 1 
        WHEN p.nutri_score_grade = 'B' THEN 2 
        WHEN p.nutri_score_grade = 'C' THEN 3 
        WHEN p.nutri_score_grade = 'D' THEN 4 
        WHEN p.nutri_score_grade = 'E' THEN 5 
        ELSE 6 
      END`,
      'ASC',
    ).addOrderBy('p.name_en', 'ASC');

    qb.limit(limit);

    const similar = await qb.getMany();

    // Enrich with lowest price
    const result: SimilarProductSummary[] = [];
    for (const p of similar) {
      const lowestPrice = await this.getLowestPrice(p.id);
      result.push({
        gtin: p.gtin,
        name_ar: p.name_ar,
        name_en: p.name_en,
        brand: p.brand,
        category: p.category,
        subcategory: p.subcategory,
        image_front_url: p.image_front_url,
        nutri_score_grade: p.nutri_score_grade,
        net_weight_value: p.net_weight_value,
        net_unit: p.net_unit,
        lowest_price: lowestPrice,
      });
    }

    return result;
  }

  // ─── Compare Two Products ────────────────────────────────────────────────

  async compareProducts(
    gtinA: string,
    gtinB: string,
  ): Promise<ComparisonResult> {
    const [prodA, prodB] = await Promise.all([
      this.loadProductWithRelations(gtinA),
      this.loadProductWithRelations(gtinB),
    ]);

    const [priceA, priceB] = await Promise.all([
      this.getLowestPrice(prodA.id),
      this.getLowestPrice(prodB.id),
    ]);

    const [allergensA, allergensB] = await Promise.all([
      this.allergenRepo.find({ where: { product_id: prodA.id } }),
      this.allergenRepo.find({ where: { product_id: prodB.id } }),
    ]);

    // Build comparison cards
    const cardA = this.buildCard(prodA, priceA);
    const cardB = this.buildCard(prodB, priceB);

    // Nutrition deltas
    const deltas = this.computeNutritionDeltas(
      prodA.nutritionFact,
      prodB.nutritionFact,
    );

    // Allergen diff
    const keysA = new Set(allergensA.map((a) => a.allergen_key));
    const keysB = new Set(allergensB.map((a) => a.allergen_key));
    const allergenDiff: AllergenDiff = {
      only_in_a: [...keysA].filter((k) => !keysB.has(k)),
      only_in_b: [...keysB].filter((k) => !keysA.has(k)),
      shared: [...keysA].filter((k) => keysB.has(k)),
    };

    // Recommendation
    const recommendation = this.computeRecommendation(
      prodA,
      prodB,
      priceA,
      priceB,
    );

    return {
      product_a: cardA,
      product_b: cardB,
      nutrition_deltas: deltas,
      allergen_diff: allergenDiff,
      recommendation,
    };
  }

  // ─── Recommendation (rule-based NutriScore + price) ──────────────────────

  private computeRecommendation(
    a: Product,
    b: Product,
    priceA: number | null,
    priceB: number | null,
  ): RecommendationResult {
    // NutriScore rank: A=1, B=2, C=3, D=4, E=5, null=3 (neutral)
    const nutriRank = (grade: string | null) => {
      const map: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };
      return grade ? (map[grade.toUpperCase()] ?? 3) : 3;
    };

    const nutriRankA = nutriRank(a.nutri_score_grade);
    const nutriRankB = nutriRank(b.nutri_score_grade);

    // Price rank: normalize to 0–1 (lower=better)
    let priceRankA = 0.5;
    let priceRankB = 0.5;
    if (priceA != null && priceB != null && (priceA + priceB) > 0) {
      const total = priceA + priceB;
      priceRankA = priceA / total; // lower fraction = better
      priceRankB = priceB / total;
    }

    // Combined score (lower = better)
    const scoreA =
      NUTRI_WEIGHT * (nutriRankA / 5) + PRICE_WEIGHT * priceRankA;
    const scoreB =
      NUTRI_WEIGHT * (nutriRankB / 5) + PRICE_WEIGHT * priceRankB;

    const roundedA = Math.round(scoreA * 100) / 100;
    const roundedB = Math.round(scoreB * 100) / 100;

    let winner: 'a' | 'b' | 'tie';
    let reasonEn: string;
    let reasonAr: string;

    if (Math.abs(roundedA - roundedB) < 0.02) {
      winner = 'tie';
      reasonEn = 'Both products are very similar in nutritional quality and price.';
      reasonAr = 'كلا المنتجين متقاربان جداً في القيمة الغذائية والسعر.';
    } else if (roundedA < roundedB) {
      winner = 'a';
      const nameA = a.name_en || a.name_ar || 'Product A';
      reasonEn = `${nameA} is recommended — it has a better nutritional profile${priceA != null && priceB != null && priceA <= priceB ? ' and a lower price' : ''}.`;
      reasonAr = `يُنصح بـ ${a.name_ar || a.name_en || 'المنتج الأول'} — يتميز بقيمة غذائية أفضل${priceA != null && priceB != null && priceA <= priceB ? ' وسعر أقل' : ''}.`;
    } else {
      winner = 'b';
      const nameB = b.name_en || b.name_ar || 'Product B';
      reasonEn = `${nameB} is recommended — it has a better nutritional profile${priceB != null && priceA != null && priceB <= priceA ? ' and a lower price' : ''}.`;
      reasonAr = `يُنصح بـ ${b.name_ar || b.name_en || 'المنتج الثاني'} — يتميز بقيمة غذائية أفضل${priceB != null && priceA != null && priceB <= priceA ? ' وسعر أقل' : ''}.`;
    }

    return {
      winner,
      score_a: roundedA,
      score_b: roundedB,
      reason_en: reasonEn,
      reason_ar: reasonAr,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async loadProductWithRelations(gtin: string): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { gtin },
      relations: ['nutritionFact'],
    });
    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }
    return product;
  }

  private async getLowestPrice(productId: string): Promise<number | null> {
    const result = await this.priceRepo
      .createQueryBuilder('pp')
      .select('MIN(pp.price_sar_incl_vat)', 'min_price')
      .where('pp.product_id = :id', { id: productId })
      .andWhere('pp.price_sar_incl_vat > 0')
      .getRawOne();
    return result?.min_price ?? null;
  }

  private buildCard(
    product: Product,
    lowestPrice: number | null,
  ): ProductComparisonCard {
    return {
      gtin: product.gtin,
      name_ar: product.name_ar,
      name_en: product.name_en,
      brand: product.brand,
      image_front_url: product.image_front_url,
      nutri_score_grade: product.nutri_score_grade,
      lowest_price: lowestPrice,
      net_weight_value: product.net_weight_value,
      net_unit: product.net_unit,
    };
  }

  private computeNutritionDeltas(
    nfA: NutritionFact | null | undefined,
    nfB: NutritionFact | null | undefined,
  ): NutritionDelta[] {
    return NUTRITION_FIELDS.map((f) => {
      const valA = nfA ? (nfA[f.field] as number | null) : null;
      const valB = nfB ? (nfB[f.field] as number | null) : null;

      let better: 'a' | 'b' | 'equal' | 'unknown' = 'unknown';
      if (valA != null && valB != null) {
        if (valA === valB) {
          better = 'equal';
        } else if (f.lower_is_better) {
          better = valA < valB ? 'a' : 'b';
        } else {
          better = valA > valB ? 'a' : 'b';
        }
      }

      return {
        field: f.field,
        label_en: f.label_en,
        label_ar: f.label_ar,
        value_a: valA,
        value_b: valB,
        better,
      };
    });
  }
}
