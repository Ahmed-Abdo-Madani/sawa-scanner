import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AdminProductsService } from '../products/admin-products.service';
import * as dotenv from 'dotenv';
dotenv.config();

async function run() {
  console.log('🚀 Bootstrapping NestJS application context...');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    console.log('🔍 Fetching AdminProductsService...');
    const service = app.get(AdminProductsService);
    
    console.log('⚡ Calling getFilterOptions()...');
    const result = await service.getFilterOptions();
    
    console.log('✅ Result of getFilterOptions():');
    console.log(JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('❌ Error executing script:', err);
  } finally {
    await app.close();
  }
}

run().catch(console.error);
