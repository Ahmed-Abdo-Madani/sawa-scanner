import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComparisonService } from './comparison.service';
import { ComparisonController } from './comparison.controller';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { NutritionModule } from '../nutrition/nutrition.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      ProductPrice,
      ProductAllergen,
    ]),
    NutritionModule,
  ],
  controllers: [ComparisonController],
  providers: [ComparisonService],
  exports: [ComparisonService],
})
export class ComparisonModule {}
