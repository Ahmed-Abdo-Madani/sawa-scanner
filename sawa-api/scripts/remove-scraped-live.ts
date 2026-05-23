import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Product } from '../src/entities/product.entity';
import { Repository } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const productRepo = app.get<Repository<Product>>(getRepositoryToken(Product));

  console.log('Finding scraped_live products...');
  const products = await productRepo.find({
    where: { data_source: 'scraped_live' },
  });

  console.log(`Found ${products.length} products to delete.`);

  if (products.length > 0) {
    await productRepo.remove(products);
    console.log('Successfully deleted all scraped_live products.');
  } else {
    console.log('No scraped_live products found.');
  }

  await app.close();
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
