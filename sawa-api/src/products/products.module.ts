import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductReport } from '../entities/product-report.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      ProductPrice,
      ProductReport,
    ]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
