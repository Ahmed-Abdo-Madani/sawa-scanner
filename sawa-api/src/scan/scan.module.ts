import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { OcrService } from './ocr.service';
import { LlmStructuringService } from './llm-structuring.service';
import { LabelValidationService } from './label-validation.service';
import { SfdaMatcherService } from './sfda-matcher.service';
import { LabelCoreService } from './label-core.service';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { SfdaProhibitedIngredient } from '../entities/sfda-prohibited-ingredient.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      SfdaProhibitedIngredient,
    ]),
    BullModule.registerQueue({
      name: 'ocr-queue',
    }),
  ],
  controllers: [ScanController],
  providers: [
    ScanService,
    OcrService,
    LlmStructuringService,
    LabelValidationService,
    SfdaMatcherService,
    LabelCoreService,
  ],
  exports: [
    OcrService,
    LlmStructuringService,
    LabelValidationService,
    SfdaMatcherService,
    LabelCoreService,
  ],
})
export class ScanModule {}
