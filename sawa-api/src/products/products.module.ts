import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductReport } from '../entities/product-report.entity';

import { ProductImage } from '../entities/product-image.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { Merchant } from '../entities/merchant.entity';
import { ProductMergeLog } from '../entities/product-merge-log.entity';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { ProductMergeService } from './product-merge.service';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      ProductPrice,
      ProductReport,
      ProductImage,
      ProductAllergen,
      Merchant,
      ProductMergeLog,
    ]),
    forwardRef(() => IngestionModule),
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [ProductsService, AdminProductsService, ProductMergeService],
  exports: [ProductsService, AdminProductsService, ProductMergeService],
})
export class ProductsModule {}

