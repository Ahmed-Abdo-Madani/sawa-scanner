import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Product } from '../src/entities/product.entity';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const productRepo = dataSource.getRepository(Product);

  const totalUnmatched = await productRepo.count({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
  });

  const totalWithBrand = await productRepo.count({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
      brand: Not(IsNull()),
    },
  });

  const sampleProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    take: 20,
  });

  console.log('=====================================');
  console.log(`Total Unmatched HS Products : ${totalUnmatched}`);
  console.log(`Unmatched with explicit brand: ${totalWithBrand}`);
  console.log('=====================================');
  console.log('Sample Unmatched Products:');
  for (const p of sampleProducts) {
    console.log(`- ID: ${p.id} | Name: "${p.name_en}" / "${p.name_ar}" | Brand: "${p.brand}"`);
  }
  console.log('=====================================');

  await app.close();
}

bootstrap().catch(console.error);
