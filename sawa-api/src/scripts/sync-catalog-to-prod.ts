import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { Merchant } from '../entities/merchant.entity';
import { Store } from '../entities/store.entity';
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductAlternativeName } from '../entities/product-alternative-name.entity';
import { ProductPrice } from '../entities/product-price.entity';

dotenv.config();

const CHUNK_SIZE = 500;

async function sync() {
  const isFullSync = process.argv.includes('--full');
  console.log(`🚀 Starting Database Catalog Synchronization`);
  console.log(`Mode: ${isFullSync ? 'FULL SYNC (all catalog data)' : 'INCREMENTAL SYNC (updates only)'}`);

  // 1. Initialize Local Database Source
  console.log('🔌 Connecting to Local Database...');
  const localDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [
      Merchant, Store, Product, NutritionFact,
      Ingredient, ProductAllergen, ProductImage,
      ProductAlternativeName, ProductPrice
    ],
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await localDataSource.initialize();
  console.log('✅ Connected to Local Database.');

  // 2. Initialize Production Database Source
  console.log('🔌 Connecting to Production Database (Neon)...');
  const prodDataSource = new DataSource({
    type: 'postgres',
    host: process.env.PROD_DATABASE_HOST,
    port: parseInt(process.env.PROD_DATABASE_PORT || '5432'),
    username: process.env.PROD_DATABASE_USERNAME,
    password: process.env.PROD_DATABASE_PASSWORD,
    database: process.env.PROD_DATABASE_NAME,
    entities: [
      Merchant, Store, Product, NutritionFact,
      Ingredient, ProductAllergen, ProductImage,
      ProductAlternativeName, ProductPrice
    ],
    ssl: process.env.PROD_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await prodDataSource.initialize();
  console.log('✅ Connected to Production Database.');

  const startTime = Date.now();

  try {
    // --- STEP 1: Sync Merchants ---
    console.log('\n--- Syncing Merchants ---');
    const localMerchants = await localDataSource.getRepository(Merchant).find();
    console.log(`Found ${localMerchants.length} merchants locally.`);
    if (localMerchants.length > 0) {
      await prodDataSource.getRepository(Merchant).upsert(localMerchants, ['id']);
      console.log(`✅ Synced ${localMerchants.length} merchants to production.`);
    }

    // --- STEP 2: Sync Stores ---
    console.log('\n--- Syncing Stores ---');
    let lastStoreSeenAt: Date | null = null;
    if (!isFullSync) {
      const maxStore = await prodDataSource.getRepository(Store)
        .createQueryBuilder('store')
        .select('MAX(store.last_seen_at)', 'max')
        .getRawOne();
      if (maxStore?.max) {
        lastStoreSeenAt = new Date(maxStore.max);
        console.log(`Latest store update in Production: ${lastStoreSeenAt.toISOString()}`);
      }
    }

    const storeQuery = localDataSource.getRepository(Store).createQueryBuilder('store');
    if (lastStoreSeenAt) {
      storeQuery.where('store.last_seen_at >= :lastStoreSeenAt', { lastStoreSeenAt });
    }
    const localStores = await storeQuery.getMany();
    console.log(`Found ${localStores.length} stores to sync.`);
    if (localStores.length > 0) {
      for (let i = 0; i < localStores.length; i += CHUNK_SIZE) {
        const chunk = localStores.slice(i, i + CHUNK_SIZE);
        await prodDataSource.getRepository(Store).upsert(chunk, ['id']);
      }
      console.log(`✅ Synced ${localStores.length} stores to production.`);
    }

    // --- STEP 3: Sync Products ---
    console.log('\n--- Syncing Products ---');
    let lastProductUpdatedAt: Date | null = null;
    if (!isFullSync) {
      const maxProduct = await prodDataSource.getRepository(Product)
        .createQueryBuilder('product')
        .select('MAX(product.updated_at)', 'max')
        .getRawOne();
      if (maxProduct?.max) {
        lastProductUpdatedAt = new Date(maxProduct.max);
        console.log(`Latest product update in Production: ${lastProductUpdatedAt.toISOString()}`);
      }
    }

    const productQuery = localDataSource.getRepository(Product).createQueryBuilder('product');
    if (lastProductUpdatedAt) {
      // Offset by 1 minute to prevent boundary issues
      const safetyTime = new Date(lastProductUpdatedAt.getTime() - 60 * 1000);
      productQuery.where('product.updated_at >= :safetyTime', { safetyTime });
    }
    const localProducts = await productQuery.getMany();
    console.log(`Found ${localProducts.length} products to sync.`);

    const syncedProductIds = localProducts.map(p => p.id);

    if (localProducts.length > 0) {
      for (let i = 0; i < localProducts.length; i += CHUNK_SIZE) {
        const chunk = localProducts.slice(i, i + CHUNK_SIZE);
        await prodDataSource.getRepository(Product).upsert(chunk, ['id']);
      }
      console.log(`✅ Synced ${localProducts.length} products to production.`);
    }

    // --- STEP 4: Sync Product Relations (NutritionFact, Ingredient, Allergens, Images, AlternativeNames, Prices) ---
    if (syncedProductIds.length > 0) {
      console.log(`\n--- Syncing relations for ${syncedProductIds.length} updated products ---`);

      // 4.1 Sync Nutrition Facts
      console.log('Syncing NutritionFacts...');
      const nutritionFacts = await localDataSource.getRepository(NutritionFact)
        .createQueryBuilder('nf')
        .where('nf.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (nutritionFacts.length > 0) {
        for (let i = 0; i < nutritionFacts.length; i += CHUNK_SIZE) {
          const chunk = nutritionFacts.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(NutritionFact).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${nutritionFacts.length} nutrition facts.`);
      }

      // 4.2 Sync Ingredients
      console.log('Syncing Ingredients...');
      const ingredients = await localDataSource.getRepository(Ingredient)
        .createQueryBuilder('ing')
        .where('ing.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (ingredients.length > 0) {
        for (let i = 0; i < ingredients.length; i += CHUNK_SIZE) {
          const chunk = ingredients.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(Ingredient).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${ingredients.length} ingredients.`);
      }

      // 4.3 Sync Allergens
      console.log('Syncing Allergens...');
      const allergens = await localDataSource.getRepository(ProductAllergen)
        .createQueryBuilder('alg')
        .where('alg.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (allergens.length > 0) {
        for (let i = 0; i < allergens.length; i += CHUNK_SIZE) {
          const chunk = allergens.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(ProductAllergen).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${allergens.length} product allergens.`);
      }

      // 4.4 Sync Images
      console.log('Syncing Images...');
      const images = await localDataSource.getRepository(ProductImage)
        .createQueryBuilder('img')
        .where('img.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (images.length > 0) {
        for (let i = 0; i < images.length; i += CHUNK_SIZE) {
          const chunk = images.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(ProductImage).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${images.length} product images.`);
      }

      // 4.5 Sync Alternative Names
      console.log('Syncing Alternative Names...');
      const altNames = await localDataSource.getRepository(ProductAlternativeName)
        .createQueryBuilder('alt')
        .where('alt.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (altNames.length > 0) {
        for (let i = 0; i < altNames.length; i += CHUNK_SIZE) {
          const chunk = altNames.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(ProductAlternativeName).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${altNames.length} alternative names.`);
      }

      // 4.6 Sync Product Prices
      console.log('Syncing Prices...');
      const prices = await localDataSource.getRepository(ProductPrice)
        .createQueryBuilder('pr')
        .where('pr.product_id IN (:...syncedProductIds)', { syncedProductIds })
        .getMany();
      if (prices.length > 0) {
        for (let i = 0; i < prices.length; i += CHUNK_SIZE) {
          const chunk = prices.slice(i, i + CHUNK_SIZE);
          await prodDataSource.getRepository(ProductPrice).upsert(chunk, ['id']);
        }
        console.log(`✅ Synced ${prices.length} product prices.`);
      }
    } else {
      console.log('\nNo products updated; skipping product relations sync.');
    }

    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n🎉 DB Catalog Sync successfully finished in ${elapsedSeconds} seconds!`);
  } catch (error) {
    console.error('\n❌ DB Catalog Sync failed:', error);
  } finally {
    await localDataSource.destroy();
    await prodDataSource.destroy();
    console.log('🔌 Connections closed.');
  }
}

sync().catch(console.error);
