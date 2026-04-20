import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Product } from './entities/product.entity';
import { NutritionFact } from './entities/nutrition-fact.entity';
import { Ingredient } from './entities/ingredient.entity';
import { ProductPrice } from './entities/product-price.entity';
import { Merchant } from './entities/merchant.entity';
import { ProductImage } from './entities/product-image.entity';
import { SfdaProhibitedIngredient } from './entities/sfda-prohibited-ingredient.entity';
import { ProductReport } from './entities/product-report.entity';
import { Store } from './entities/store.entity';
import { ProductAllergen } from './entities/product-allergen.entity';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'postgres',
  password: process.env.DATABASE_PASSWORD || 'postgres',
  database: process.env.DATABASE_NAME || 'sawa',
  synchronize: false,
  logging: true,
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: [
    Product,
    NutritionFact,
    Ingredient,
    ProductPrice,
    Merchant,
    ProductImage,
    SfdaProhibitedIngredient,
    ProductReport,
    Store,
    ProductAllergen,
  ],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  subscribers: [],
});
