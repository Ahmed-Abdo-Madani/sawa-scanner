import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OpenFoodFactsService, OffCanonical } from '../src/ingestion/open-food-facts.service';
import { Product } from '../src/entities/product.entity';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import { normalizeBrandStrict, normalizeBrandUsable, inferBrandAndWeightFromName, normalizeProductName, normalizeWeightToGrams } from '../src/utils/normalization';
import { diceCoefficient } from '../src/utils/string-similarity';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';

function extractSizeFromName(name: string): string | undefined {
  const match = name.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|oz)/i);
  return match ? match[0] : undefined;
}

function doSizesMatch(
  sizeA: string | undefined,
  sizeB: string | undefined,
  weightValA?: number | null,
  weightValB?: number | null,
): boolean {
  const gramsA = normalizeWeightToGrams(sizeA) || (weightValA ? weightValA : null);
  const gramsB = normalizeWeightToGrams(sizeB) || (weightValB ? weightValB : null);
  
  if (gramsA === null || gramsB === null) return true; // If one is unknown, we don't reject
  
  const max = Math.max(gramsA, gramsB);
  return Math.abs(gramsA - gramsB) <= max * 0.1; // 10% tolerance
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const offService = app.get(OpenFoodFactsService);

  const sliceDir = path.join(process.cwd(), 'uploads', 'off-slice');
  const files = fs.readdirSync(sliceDir).filter(f => f.endsWith('.ndjson.gz'));
  const largestFile = files.reduce((prev, current) => {
    const prevSize = fs.statSync(path.join(sliceDir, prev)).size;
    const currentSize = fs.statSync(path.join(sliceDir, current)).size;
    return prevSize > currentSize ? prev : current;
  });

  const slicePath = path.join(sliceDir, largestFile);
  console.log(`Using slice: ${largestFile}`);

  const offBrandIndex = new Map<string, OffCanonical[]>();
  const offBrandSlugs = new Set<string>();

  const fileStream = fs.createReadStream(slicePath);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line || line.trim().length === 0) continue;
    try {
      const rawProduct = JSON.parse(line);
      const canonical = offService.extractCanonical(rawProduct);
      if (!canonical) continue;

      const brandSlug = normalizeBrandStrict(canonical.brand);
      if (brandSlug) {
        offBrandSlugs.add(brandSlug);
        if (!offBrandIndex.has(brandSlug)) {
          offBrandIndex.set(brandSlug, []);
        }
        offBrandIndex.get(brandSlug)!.push(canonical);
      }
    } catch (err) {}
  }

  const dataSource = app.get<DataSource>(getDataSourceToken());
  const productRepo = dataSource.getRepository(Product);
  const hsProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    take: 50,
  });

  console.log(`\nAnalyzing ${hsProducts.length} products with normalized matching...`);

  let matchedCount = 0;

  for (const product of hsProducts) {
    let brandSlug: string | undefined = normalizeBrandUsable(product.brand);
    let inferredBrand = '';
    if (!brandSlug) {
      const nameForInference = product.name_en || product.name_ar || '';
      const inferenceResult = inferBrandAndWeightFromName(nameForInference, offBrandSlugs);
      brandSlug = inferenceResult.brandSlug;
      inferredBrand = inferenceResult.brand || '';
    }


    if (!brandSlug) continue;

    const hsSize = extractSizeFromName(product.name_en || product.name_ar || '');
    const pool = offBrandIndex.get(brandSlug) || [];
    if (pool.length === 0) continue;

    // Find best match using normalized names
    let bestScore = 0;
    let bestCand: OffCanonical | null = null;
    let matchMethod = '';

    const normHsEn = normalizeProductName(product.name_en || '');
    const normHsAr = normalizeProductName(product.name_ar || '');

    // Pass 1: Exact Normalized match
    for (const cand of pool) {
      const normCandEn = normalizeProductName(cand.name_en || '');
      const normCandAr = normalizeProductName(cand.name_ar || '');

      const enMatch = normHsEn && normCandEn && normHsEn === normCandEn;
      const arMatch = normHsAr && normCandAr && normHsAr === normCandAr;

      if (enMatch || arMatch) {
        const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
        if (doSizesMatch(hsSize, candSize, product.net_weight_value, null)) {
          bestCand = cand;
          bestScore = 1.0;
          matchMethod = 'Exact Normalized Name';
          break;
        }
      }
    }

    // Pass 2: Fuzzy Normalized match
    if (!bestCand) {
      for (const cand of pool) {
        const normCandEn = normalizeProductName(cand.name_en || '');
        const normCandAr = normalizeProductName(cand.name_ar || '');

        const simEn = normHsEn && normCandEn ? diceCoefficient(normHsEn, normCandEn) : 0;
        const simAr = normHsAr && normCandAr ? diceCoefficient(normHsAr, normCandAr) : 0;
        const score = Math.max(simEn, simAr);

        if (score >= 0.70 && score > bestScore) {
          const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (doSizesMatch(hsSize, candSize, product.net_weight_value, null)) {
            bestScore = score;
            bestCand = cand;
            matchMethod = `Fuzzy Normalized Name (Score: ${score.toFixed(3)})`;
          }
        }
      }
    }

    if (bestCand) {
      matchedCount++;
      console.log(`[MATCH #${matchedCount}] HS: "${product.name_en}"`);
      console.log(`    -> OFF: "${bestCand.name_en}"`);
      console.log(`    -> GTIN: ${bestCand.gtin} | Brand: ${brandSlug} | Method: ${matchMethod}`);
    }
  }

  console.log(`\nMatched ${matchedCount} / ${hsProducts.length} (${(matchedCount/hsProducts.length*100).toFixed(1)}%)`);

  await app.close();
}

bootstrap().catch(console.error);
