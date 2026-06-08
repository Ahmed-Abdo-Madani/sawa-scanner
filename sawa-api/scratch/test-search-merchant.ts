import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductsService } from '../src/products/products.service';
import { ProductsController } from '../src/products/products.controller';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(ProductsController);
  const service = app.get(ProductsService);

  try {
    console.log('Searching for "Potatoes 1Kg"...');
    const results = await controller.searchProducts('Potatoes 1Kg');
    console.log('Results (raw JSON):');
    results.forEach(res => {
      console.log(`Product: "${res.name_en}"`);
      res.prices.forEach((p: any) => {
        console.log(`- Price: ${p.price_sar_incl_vat} | Merchant: EN="${p.merchant.name_en}" / AR="${p.merchant.name_ar}" | District: ${p.district_name} | Store ID: ${p.store_id}`);
      });
    });
  } catch (err) {
    console.error(err);
  } finally {
    await app.close();
  }
}

run();
