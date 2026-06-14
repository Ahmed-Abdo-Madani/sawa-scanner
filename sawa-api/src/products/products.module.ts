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
import { LocalMatcherService } from './local-matcher.service';
import { SchedulerService } from './scheduler.service';
import { IngestionModule } from '../ingestion/ingestion.module';

import { PricesModule } from '../prices/prices.module';

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
    PricesModule,
  ],
  controllers: [ProductsController, AdminProductsController],
  providers: [
    ProductsService, 
    AdminProductsService, 
    ProductMergeService,
    LocalMatcherService,
    SchedulerService
  ],
  exports: [
    ProductsService, 
    AdminProductsService, 
    ProductMergeService,
    LocalMatcherService,
    SchedulerService
  ],
})
export class ProductsModule {}

