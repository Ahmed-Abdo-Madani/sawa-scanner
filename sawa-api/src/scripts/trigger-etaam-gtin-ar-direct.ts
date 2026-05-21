import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { EtaamGtinArService } from '../ingestion/etaam-gtin-ar.service';
import * as dotenv from 'dotenv';

dotenv.config();

async function bootstrap() {
  console.log('🛒 Bootstrapping NestJS Application Context for Direct Trigger...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  
  try {
    const service = app.get(EtaamGtinArService);
    console.log('🚀 Triggering Etaam Express ARABIC GTIN Enrichment directly via service...');
    
    const limit = 1000;
    const merchantName = 'HungerStation';
    const threshold = 0.7;
    const dryRun = false;
    
    console.log(`Config: limit=${limit}, merchant=${merchantName}, threshold=${threshold}, dryRun=${dryRun}`);
    
    const { enqueued, skipped } = await service.enqueueMissingGtins(
      limit,
      merchantName,
      threshold,
      dryRun
    );
    
    console.log('✅ Etaam GTIN Arabic Enrichment job triggered successfully!');
    console.log(`🚀 Enqueued: ${enqueued} products (Arabic names)`);
    console.log(`⚠️  Skipped:  ${skipped} products`);
  } catch (error: any) {
    console.error('❌ Failed to trigger Etaam GTIN Arabic Enrichment:', error);
  } finally {
    await app.close();
    console.log('👋 Application context closed.');
  }
}

bootstrap();
