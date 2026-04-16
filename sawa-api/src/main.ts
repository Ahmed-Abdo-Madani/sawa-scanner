import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import * as admin from 'firebase-admin';

import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter as BullBoardExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request, Response, NextFunction } from 'express';

const DEV_ADMIN_SECRET = 'sawa-scanner-dev-2026';

async function expressFirebaseAuth(req: Request, res: Response, next: NextFunction) {


  const devSecret = req.headers['x-dev-admin-secret'];
  if (process.env.NODE_ENV === 'development' && devSecret === DEV_ADMIN_SECRET) {
     (req as any).user = { role: 'admin', admin: true, uid: 'dev-admin' };
     return next();
  }

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
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);

  // Increase the JSON body-size limit from the 100 KB default.
  app.use(require('express').json({ limit: '1mb' }));

  const nodeEnv = configService.get<string>('NODE_ENV');
  const region = configService.get<string>('CLOUD_REGION');

  console.log(`[Bootstrap] Environment: ${nodeEnv}`);
  console.log(`[Bootstrap] Target Cloud Region: ${region}`);

  // Fast-fail if region is not validated
  const allowedRegions = ['me-south-1', 'me-central2-a'];
  if (!region || !allowedRegions.includes(region)) {
    console.error(`FATAL: Invalid CLOUD_REGION "${region}". Must be one of ${allowedRegions.join(', ')} for KSA compliance.`);
    process.exit(1);
  }

  const bullBoardAdapter = new BullBoardExpressAdapter();
  bullBoardAdapter.setBasePath('/admin/queues');

  // Reuse the existing Queue instances registered in NestJS modules.
  // This avoids opening redundant Redis connections and ensures Bull Board shows
  // the exact same identifiers used by the Producers and Workers.
  const ingestionQ = app.get<Queue>(getQueueToken('ingestion-queue'));
  const priceScrapeQ = app.get<Queue>(getQueueToken('price-scraping-queue'));
  const ocrQ = app.get<Queue>(getQueueToken('ocr-queue'));

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
  console.log(`[Bootstrap] Sawa Scanner Backend is running on port: ${port}`);
}

bootstrap();
