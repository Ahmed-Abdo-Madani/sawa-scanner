import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource, IsNull } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { gtinPrefix } from '../utils/normalization';

const restoreTargets = [
  { gtin: '5063305008213', hsProductId: '828665' },
  { gtin: '8720608631094', hsProductId: '1594935' },
  { gtin: '8720608631063', hsProductId: '828655' },
  { gtin: '6291003011849', hsProductId: '1443105' },
];

async function bootstrap() {
  console.log('🔄 Bootstrapping NestJS context for false mismatch restoration...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const dataSource = app.get(DataSource);
  const productRepo = dataSource.getRepository(Product);
  const priceRepo = dataSource.getRepository(ProductPrice);
  const imageRepo = dataSource.getRepository(ProductImage);

  try {
    await dataSource.transaction(async (manager) => {
      for (const target of restoreTargets) {
        console.log(`\nProcessing Restoration for GTIN: ${target.gtin} -> HS Product: ${target.hsProductId}`);

        // 1. Find original HungerStation product
        const origProduct = await manager.findOne(Product, {
          where: { hs_product_id: target.hsProductId },
        });

        if (!origProduct) {
          console.error(`❌ Original product with hs_product_id ${target.hsProductId} not found!`);
          continue;
        }

        // 2. Find newly created duplicate product
        const newProduct = await manager.findOne(Product, {
          where: { gtin: target.gtin, hs_product_id: IsNull() },
        });

        if (!newProduct) {
          console.warn(`⚠️ New product for GTIN ${target.gtin} not found. Linking original product directly...`);
          origProduct.gtin = target.gtin;
          await manager.save(origProduct);
          continue;
        }

        console.log(`Found original product ID: ${origProduct.id}`);
        console.log(`Found duplicate product ID: ${newProduct.id}`);

        // 3. Move prices from newProduct to origProduct
        const prices = await manager.find(ProductPrice, {
          where: { product_id: newProduct.id },
        });
        console.log(`Moving ${prices.length} prices to original product...`);
        for (const price of prices) {
          // Check if original product already has a price for this merchant to avoid duplicates
          const existingPrice = await manager.findOne(ProductPrice, {
            where: { product_id: origProduct.id, merchant_id: price.merchant_id },
          });

          if (existingPrice) {
            existingPrice.price_sar_incl_vat = price.price_sar_incl_vat;
            existingPrice.scraped_at = price.scraped_at;
            existingPrice.source_url = price.source_url;
            await manager.save(existingPrice);
            await manager.remove(price);
          } else {
            price.product = origProduct;
            await manager.save(price);
          }
        }

        // 4. Move images from newProduct to origProduct
        const images = await manager.find(ProductImage, {
          where: { product: { id: newProduct.id } },
        });
        console.log(`Moving ${images.length} images to original product...`);
        for (const img of images) {
          // Check if original product already has this image URL
          const existingImg = await manager.findOne(ProductImage, {
            where: { product: { id: origProduct.id }, url: img.url },
          });
          if (existingImg) {
            await manager.remove(img);
          } else {
            img.product = origProduct;
            await manager.save(img);
          }
        }

        // 5. Unlink GTIN from duplicate product first to prevent unique constraint violation
        newProduct.gtin = null;
        newProduct.gtin_prefix = null;
        await manager.save(newProduct);

        // 6. Restore GTIN on original product
        origProduct.gtin = target.gtin;
        origProduct.gtin_prefix = gtinPrefix(target.gtin);
        await manager.save(origProduct);

        // 7. Delete duplicate product
        await manager.remove(newProduct);
        console.log(`✅ Restoration complete for GTIN ${target.gtin}!`);
      }
    });

    console.log('\n🎉 All false mismatches restored successfully!');
  } catch (err) {
    console.error('❌ Error during restoration:', err);
  } finally {
    await app.close();
  }
}

bootstrap();
