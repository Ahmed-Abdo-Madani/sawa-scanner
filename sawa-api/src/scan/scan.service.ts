import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { createHash } from 'crypto';
import { OcrService } from './ocr.service';
import { LlmStructuringService } from './llm-structuring.service';
import { LabelValidationService } from './label-validation.service';
import { SfdaMatcherService } from './sfda-matcher.service';
import { ScanLabelDto } from './dto/scan-label.dto';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { LabelCoreService } from './label-core.service';
import {
  diceCoefficient,
  doWeightsMatchStrictly,
} from '../utils/string-similarity';

@Injectable()
export class ScanService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly ocrService: OcrService,
    private readonly llmService: LlmStructuringService,
    private readonly validationService: LabelValidationService,
    private readonly sfdaMatcher: SfdaMatcherService,
    private readonly labelCoreService: LabelCoreService,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(NutritionFact)
    private readonly nutritionRepo: Repository<NutritionFact>,
    @InjectRepository(Ingredient)
    private readonly ingredientRepo: Repository<Ingredient>,
  ) {}

  async processLabelScan(dto: ScanLabelDto): Promise<any> {
    // 1-4. OCR Pipeline (Centralized)
    const structuredData = await this.labelCoreService.processImage(dto.image);

    // 5. SFDA Safety Matching
    const matchedIngredients = await this.sfdaMatcher.matchIngredients(
      structuredData.ingredients,
    );

    // 5. Build/Upsert Product
    return await this.dataSource.transaction(async (manager) => {
      let gtin = dto.gtin;

      if (!gtin) {
        // SEMANTIC LABEL LOOKUP: Match OCR text to scraped database candidates
        const hasBrandOrName =
          structuredData.brand ||
          structuredData.name_en ||
          structuredData.name_ar;

        if (hasBrandOrName) {
          const qb = manager.createQueryBuilder(Product, 'p');
          const conditions: string[] = [];
          const params: Record<string, any> = {};

          if (structuredData.brand && structuredData.brand.length > 2) {
            conditions.push('p.brand ILIKE :brand');
            params.brand = `%${structuredData.brand}%`;
          }
          if (structuredData.name_en && structuredData.name_en.length > 2) {
            conditions.push('p.name_en ILIKE :nameEn');
            const words = structuredData.name_en.split(' ');
            params.nameEn = `%${words[0]}%`;
          }
          if (structuredData.name_ar && structuredData.name_ar.length > 2) {
            conditions.push('p.name_ar ILIKE :nameAr');
            const words = structuredData.name_ar.split(' ');
            params.nameAr = `%${words[0]}%`;
          }

          if (conditions.length > 0) {
            qb.where(conditions.join(' OR '), params);
            qb.limit(100);

            const candidates = await qb.getMany();
            let bestMatch: Product | null = null;
            let bestScore = 0;

            const targetNameEn = structuredData.name_en || '';
            const targetNameAr = structuredData.name_ar || '';
            const targetBrand = structuredData.brand || '';

            for (const cand of candidates) {
              const scoreEn = diceCoefficient(targetNameEn, cand.name_en || '');
              const scoreAr = diceCoefficient(targetNameAr, cand.name_ar || '');
              const scoreBrand = diceCoefficient(targetBrand, cand.brand || '');

              const combinedScore =
                Math.max(scoreEn, scoreAr) * 0.7 + scoreBrand * 0.3;

              if (combinedScore > bestScore && combinedScore > 0.65) {
                // Strict weight validation requested by user
                if (
                  doWeightsMatchStrictly(
                    cand.net_weight_value,
                    cand.net_unit,
                    structuredData.net_weight ?? null,
                  )
                ) {
                  bestMatch = cand;
                  bestScore = combinedScore;
                }
              }
            }

            if (bestMatch) {
              gtin = bestMatch.gtin;
            }
          }
        }

        if (!gtin) {
          // Generate a deterministic identifier for products without GTIN based on unique properties
          const payload = `${structuredData.brand}-${structuredData.name_en}-${structuredData.net_weight}`;
          gtin = `SCAN-${createHash('md5')
            .update(payload)
            .digest('hex')
            .substring(0, 8)
            .toUpperCase()}`;
        }
      }

      // Upsert Product
      let product = await manager.findOne(Product, {
        where: { gtin },
        relations: ['nutritionFact', 'ingredients'],
      });

      if (product) {
        product.name_ar = structuredData.name_ar || product.name_ar;
        product.name_en = structuredData.name_en || product.name_en;
        product.brand = structuredData.brand || product.brand;
      } else {
        product = manager.create(Product, {
          gtin,
          name_ar: structuredData.name_ar,
          name_en: structuredData.name_en,
          brand: structuredData.brand,
          sfda_registration_status: 'unverified',
          halal_certified: null,
          nutri_score_grade: null,
          nova_group: null,
        });
      }
      await manager.save(product);

      // Upsert Nutrition Facts
      if (product.nutritionFact) {
        await manager.remove(product.nutritionFact);
      }
      const nutrition = manager.create(NutritionFact, {
        ...structuredData.nutrition,
        product,
      });
      await manager.save(nutrition);

      // Replace Ingredients
      if (product.ingredients?.length) {
        await manager.remove(product.ingredients);
      }
      const ingredients = matchedIngredients.map((ing) =>
        manager.create(Ingredient, {
          name_ar: ing.name_ar,
          name_en: ing.name_en,
          e_number: ing.e_number,
          sfda_status: ing.sfda_status,
          product,
        }),
      );
      await manager.save(ingredients);

      // Reload and return in the shape expected by the frontend
      const finalProduct = await manager.findOne(Product, {
        where: { id: product.id },
        relations: ['nutritionFact', 'ingredients', 'prices', 'images'],
      });

      if (!finalProduct) {
        throw new InternalServerErrorException(
          'Failed to reload product after save',
        );
      }

      return {
        id: finalProduct.id,
        gtin: finalProduct.gtin,
        name_ar: finalProduct.name_ar,
        name_en: finalProduct.name_en,
        brand: finalProduct.brand,
        sfda_registration_status: finalProduct.sfda_registration_status,
        halal_certified: finalProduct.halal_certified,
        nutri_score_grade: finalProduct.nutri_score_grade,
        nova_group: finalProduct.nova_group,
        nutrition: finalProduct.nutritionFact
          ? {
              energy_kcal: finalProduct.nutritionFact.energy_kcal,
              fat_g: finalProduct.nutritionFact.fat_g,
              saturated_fat_g: finalProduct.nutritionFact.saturated_fat_g,
              carbs_g: finalProduct.nutritionFact.carbs_g,
              sugars_g: finalProduct.nutritionFact.sugars_g,
              fiber_g: finalProduct.nutritionFact.fiber_g,
              protein_g: finalProduct.nutritionFact.protein_g,
              sodium_mg: finalProduct.nutritionFact.sodium_mg,
              serving_size_g: finalProduct.nutritionFact.serving_size_g,
            }
          : null,
        ingredients: finalProduct.ingredients.map((i) => ({
          name_ar: i.name_ar,
          name_en: i.name_en,
          e_number: i.e_number,
          sfda_status: i.sfda_status,
        })),
        prices: [],
        images: [],
      };
    });
  }
}
