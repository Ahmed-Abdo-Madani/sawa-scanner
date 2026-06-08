import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Store } from '../src/entities/store.entity';
import { ProductPrice } from '../src/entities/product-price.entity';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const storeRepo = dataSource.getRepository(Store);
  const priceRepo = dataSource.getRepository(ProductPrice);

  // 1. Total HS stores
  const totalStores = await storeRepo.count({
    where: { platform: 'hungerstation' },
  });

  // 2. Query stores details
  const allStores = await storeRepo.find({
    where: { platform: 'hungerstation' },
    relations: ['merchant'],
  });

  let storesWithPrices = 0;
  let storesWithoutPrices = 0;
  let totalHsPrices = 0;
  let hsPricesWithGtin = 0;

  for (const store of allStores) {
    const priceCount = await priceRepo.count({
      where: { store: { id: store.id } },
    });
    if (priceCount > 0) {
      storesWithPrices++;
      totalHsPrices += priceCount;
      
      const priceWithGtinCount = await priceRepo.count({
        where: {
          store: { id: store.id },
          product: { gtin: Not(IsNull()) }
        },
      });
      hsPricesWithGtin += priceWithGtinCount;
    } else {
      storesWithoutPrices++;
    }
  }

  console.log('=====================================');
  console.log('📊 HUNGERSTATION INGESTION STATUS');
  console.log('=====================================');
  console.log(`Total HungerStation Stores:        ${totalStores}`);
  console.log(`Stores with Scraped Prices (>0):   ${storesWithPrices}`);
  console.log(`Stores with Zero Prices (0):       ${storesWithoutPrices}`);
  console.log(`Total HungerStation Price Records:  ${totalHsPrices}`);
  console.log(`Prices Linked to a Valid GTIN:     ${hsPricesWithGtin} (${totalHsPrices > 0 ? ((hsPricesWithGtin / totalHsPrices) * 100).toFixed(2) : 0}%)`);
  console.log('=====================================');

  await app.close();
}

bootstrap().catch(console.error);
