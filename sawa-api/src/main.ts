import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as admin from 'firebase-admin';

import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { Queue } from 'bullmq';
import { Request, Response, NextFunction } from 'express';

async function expressFirebaseAuth(req: Request, res: Response, next: NextFunction) {
  const [type, token] = req.headers.authorization?.split(' ') ?? [];
  if (type !== 'Bearer' || !token) {
    return res.status(401).json({ statusCode: 401, message: 'Unauthorized' });
  }

  try {
    if (!admin.apps.length) {
      return res.status(401).json({ statusCode: 401, message: 'Firebase Admin not initialized' });
    }
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // Admin check: ensure the trusted 'admin' claim is present
    if (decodedToken.role !== 'admin' && decodedToken.admin !== true) {
      return res.status(403).json({ statusCode: 403, message: 'Forbidden: Admin access required' });
    }

    (req as any).user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).json({ statusCode: 401, message: 'Invalid or expired token' });
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  const nodeEnv = configService.get<string>('NODE_ENV');
  const region = configService.get<string>('CLOUD_REGION');

  console.log(`[Bootstrap] Environment: ${nodeEnv}`);
  console.log(`[Bootstrap] Target Cloud Region: ${region}`);

  // Fast-fail if region is not validated (double check in case validator was bypassed)
  const allowedRegions = ['me-south-1', 'me-central2-a'];
  if (!region || !allowedRegions.includes(region)) {
    console.error(`FATAL: Invalid CLOUD_REGION "${region}". Must be one of ${allowedRegions.join(', ')} for KSA compliance.`);
    process.exit(1);
  }

  const bullBoardAdapter = new BullBoardExpressAdapter();
  bullBoardAdapter.setBasePath('/admin/queues');

  const redisOptions = {
    host: configService.get('REDIS_HOST') || 'localhost',
    port: parseInt(configService.get('REDIS_PORT') || '6379', 10),
  };

  const ingestionQ = new Queue('ingestion-queue', { connection: redisOptions });
  const priceScrapeQ = new Queue('price-scrape-queue', { connection: redisOptions });
  const ocrQ = new Queue('ocr-queue', { connection: redisOptions });

  createBullBoard({
    queues: [
      new BullMQAdapter(ingestionQ),
      new BullMQAdapter(priceScrapeQ),
      new BullMQAdapter(ocrQ),
    ],
    serverAdapter: bullBoardAdapter,
  });

  app.use('/admin/queues', expressFirebaseAuth, bullBoardAdapter.getRouter());

  const port = configService.get('PORT') || 3000;
  await app.listen(port);
}
bootstrap();
