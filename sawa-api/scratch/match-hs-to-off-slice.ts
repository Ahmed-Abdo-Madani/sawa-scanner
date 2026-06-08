import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ProductMergeService } from '../src/products/product-merge.service';
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

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 1000; // Default limit to 1000 for safety
const commit = args.includes('--commit');
const thresholdArg = args.find((a) => a.startsWith('--threshold='));
const threshold = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 0.85;

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

function hasMutuallyExclusiveConflict(nameA: string, nameB: string): boolean {
  const normA = nameA.toLowerCase().replace(/-/g, ' ');
  const normB = nameB.toLowerCase().replace(/-/g, ' ');

  const conflicts = [
    ['salted', 'unsalted'],
    ['sweetened', 'unsweetened'],
    ['zero', 'original'],
    ['diet', 'original'],
    ['light', 'dark'],
    ['milk', 'dark'],
    ['white', 'dark'],
    ['mix', 'chips'],
    ['cookies', 'chips'],
    ['low fat', 'full fat'],
    ['low fat', 'full cream'],
    ['skimmed', 'whole'],
    ['skimmed', 'full fat'],
    ['skimmed', 'full cream'],
    ['low fat', 'whole'],
    ['light', 'full fat'],
    ['light', 'full cream'],
    ['light', 'whole'],
    ['fat free', 'full fat'],
    ['fat free', 'full cream'],
    ['fat free', 'whole'],
    ['ranch', 'french'],
    ['ranch', 'italian'],
    ['ranch', 'caesar'],
    ['ranch', 'thousand island'],
    ['french', 'italian'],
    ['french', 'caesar'],
    ['french', 'thousand island'],
    ['italian', 'caesar'],
    ['italian', 'thousand island'],
    ['caesar', 'thousand island'],
    ['strawberry', 'banana'],
    ['strawberry', 'chocolate'],
    ['banana', 'chocolate'],
    ['vanilla', 'chocolate'],
    ['vanilla', 'strawberry'],
    ['vanilla', 'banana'],
    ['orange', 'apple'],
    ['orange', 'lemon'],
    ['apple', 'grape'],
    ['mango', 'peach'],
    ['garlic', 'chili'],
    ['garlic', 'spicy'],
    ['garlic', 'original'],
  ];

  for (const [word1, word2] of conflicts) {
    const hasWord1A = new RegExp(`\\b${word1}\\b`).test(normA);
    const hasWord2A = new RegExp(`\\b${word2}\\b`).test(normA);
    const hasWord1B = new RegExp(`\\b${word1}\\b`).test(normB);
    const hasWord2B = new RegExp(`\\b${word2}\\b`).test(normB);

    if ((hasWord1A && hasWord2B) || (hasWord2A && hasWord1B)) {
      return true;
    }
  }
  
  // Chocolate flavor asymmetry guard
  const hasWhiteA = normA.includes('white');
  const hasWhiteB = normB.includes('white');
  const hasDarkA = normA.includes('dark');
  const hasDarkB = normB.includes('dark');
  const hasChocA = normA.includes('chocolate') || normA.includes('choc');
  const hasChocB = normB.includes('chocolate') || normB.includes('choc');
  if (hasChocA && hasChocB && (hasWhiteA !== hasWhiteB || hasDarkA !== hasDarkB)) {
    return true;
  }

  return false;
}

async function bootstrap() {
  console.log('============================================================');
  console.log('🤖 INITIALIZING HUNGERSTATION TO OPENFOODFACTS MATCHING');
  console.log('============================================================');
  console.log(`Mode       : ${commit ? 'COMMIT (Database changes will be saved)' : 'DRY RUN (No database changes)'}`);
  console.log(`Limit      : ${limit}`);
  console.log(`Threshold  : ${threshold}`);
  console.log('============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const mergeService = app.get(ProductMergeService);
  const offService = app.get(OpenFoodFactsService);

  // 1. Locate the OFF slice file (largest file in uploads/off-slice/)
  const sliceDir = path.join(process.cwd(), 'uploads', 'off-slice');
  if (!fs.existsSync(sliceDir)) {
    console.error(`Error: Slice directory not found at ${sliceDir}`);
    await app.close();
    return;
  }

  const files = fs.readdirSync(sliceDir).filter(f => f.endsWith('.ndjson.gz'));
  if (files.length === 0) {
    console.error('Error: No ndjson.gz slice files found in uploads/off-slice/');
    await app.close();
    return;
  }

  // Find the largest file (usually contains the GCC/Saudi Arabia pool)
  const largestFile = files.reduce((prev, current) => {
    const prevSize = fs.statSync(path.join(sliceDir, prev)).size;
    const currentSize = fs.statSync(path.join(sliceDir, current)).size;
    return prevSize > currentSize ? prev : current;
  });

  const slicePath = path.join(sliceDir, largestFile);
  console.log(`📂 Using OFF Slice File: ${largestFile} (${(fs.statSync(slicePath).size / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Index OFF products from the slice file
  console.log('⚡ Loading and indexing OFF slice products...');
  const offBrandIndex = new Map<string, OffCanonical[]>();
  const offBrandSlugs = new Set<string>();
  const offGtinMap = new Map<string, OffCanonical>();

  const fileStream = fs.createReadStream(slicePath);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({
    input: fileStream.pipe(gunzip),
    crlfDelay: Infinity,
  });

  let loadedCount = 0;
  for await (const line of rl) {
    if (!line || line.trim().length === 0) continue;
    try {
      const rawProduct = JSON.parse(line);
      const canonical = offService.extractCanonical(rawProduct);
      if (!canonical) continue;

      offGtinMap.set(canonical.gtin, canonical);
      const brandSlug = normalizeBrandStrict(canonical.brand);
      if (brandSlug) {
        offBrandSlugs.add(brandSlug);
        if (!offBrandIndex.has(brandSlug)) {
          offBrandIndex.set(brandSlug, []);
        }
        offBrandIndex.get(brandSlug)!.push(canonical);
      }
      loadedCount++;
    } catch (err) {
      // Ignore parsing errors
    }
  }

  console.log(`✓ Loaded ${loadedCount} canonical products from OFF slice.`);
  console.log(`✓ Extracted ${offBrandSlugs.size} unique brand slugs.\n`);

  // 3. Query HungerStation products without GTINs
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const productRepo = dataSource.getRepository(Product);
  
  console.log('🔍 Querying HungerStation products lacking GTINs...');
  const hsProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    take: limit,
  });

  console.log(`📊 Found ${hsProducts.length} HungerStation products without GTINs to process.`);
  if (hsProducts.length === 0) {
    console.log('✨ All HungerStation products have GTINs. Nothing to match!');
    await app.close();
    return;
  }

  let matchCount = 0;
  let inferredBrandCount = 0;
  let exactMatchCount = 0;
  let fuzzyMatchCount = 0;

  console.log('\n🚀 Starting matching process...\n');

  // 4. Perform matching against indexed OFF products
  for (let i = 0; i < hsProducts.length; i++) {
    const product = hsProducts[i];
    let brandSlug = normalizeBrandUsable(product.brand);
    let inferredBrand: string | undefined;

    // Brand inference heuristic if brand is null/generic
    if (!brandSlug) {
      const nameForInference = product.name_en || product.name_ar || '';
      const inferenceResult = inferBrandAndWeightFromName(nameForInference, offBrandSlugs);
      if (inferenceResult.brandSlug) {
        brandSlug = inferenceResult.brandSlug;
        inferredBrand = inferenceResult.brand;
        inferredBrandCount++;
      }
    }

    if (!brandSlug) continue; // Skip if no brand slug (inferred or explicit)

    const hsSize = extractSizeFromName(product.name_en || product.name_ar || '');
    const brandPool = offBrandIndex.get(brandSlug) || [];

    let matchedProduct: OffCanonical | null = null;
    let matchMethod = '';
    let matchScore = 0;

    // Pass 1: Exact Normalized Name Match in the brand pool
    const normHsNameEn = normalizeProductName(product.name_en || '');
    const normHsNameAr = normalizeProductName(product.name_ar || '');

    for (const cand of brandPool) {
      const normCandEn = normalizeProductName(cand.name_en || '');
      const normCandAr = normalizeProductName(cand.name_ar || '');
      
      const enMatch = product.name_en && cand.name_en && normHsNameEn === normCandEn;
      const arMatch = product.name_ar && cand.name_ar && normHsNameAr === normCandAr;

      if (enMatch || arMatch) {
        if (!hasMutuallyExclusiveConflict(product.name_en || product.name_ar || '', cand.name_en || cand.name_ar || '')) {
          const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (doSizesMatch(hsSize, candSize, product.net_weight_value, null)) {
            matchedProduct = cand;
            matchMethod = 'Exact Name Match';
            exactMatchCount++;
            break;
          }
        }
      }
    }

    // Pass 2: Fuzzy Name Match within the brand pool using normalized names
    if (!matchedProduct) {
      let bestScore = 0;
      let bestCand: OffCanonical | null = null;

      for (const cand of brandPool) {
        const normCandEn = normalizeProductName(cand.name_en || '');
        const normCandAr = normalizeProductName(cand.name_ar || '');

        const simEn = normHsNameEn && normCandEn ? diceCoefficient(normHsNameEn, normCandEn) : 0;
        const simAr = normHsNameAr && normCandAr ? diceCoefficient(normHsNameAr, normCandAr) : 0;
        const score = Math.max(simEn, simAr);

        if (score >= threshold && score > bestScore) {
          if (!hasMutuallyExclusiveConflict(product.name_en || product.name_ar || '', cand.name_en || cand.name_ar || '')) {
            const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
            if (doSizesMatch(hsSize, candSize, product.net_weight_value, null)) {
              bestScore = score;
              bestCand = cand;
            }
          }
        }
      }

      if (bestCand) {
        matchedProduct = bestCand;
        matchMethod = `Fuzzy Normalized Name Match (Score: ${bestScore.toFixed(3)})`;
        matchScore = bestScore;
        fuzzyMatchCount++;
      }
    }

    // Process confirmed match
    if (matchedProduct) {
      matchCount++;
      const hsName = product.name_en || product.name_ar || 'Unknown';
      const candName = matchedProduct.name_en || matchedProduct.name_ar || 'Unknown';
      
      console.log(`[${matchCount}] 🔗 Match Confirmed: "${hsName}"`);
      console.log(`    -> Brand slug     : ${brandSlug}${inferredBrand ? ` (Inferred: "${inferredBrand}")` : ''}`);
      console.log(`    -> Matched to     : "${candName}"`);
      console.log(`    -> Matched GTIN   : ${matchedProduct.gtin} | Method: ${matchMethod}`);

      if (commit) {
        try {
          await mergeService.assignGtin(
            product.id,
            matchedProduct.gtin,
            'hs_off_gtin_matcher',
            `OFF Slice Match via ${matchMethod} (Brand: ${brandSlug})`,
          );
          console.log(`    ✅ Assigned & Merged successfully.`);
        } catch (err: any) {
          console.error(`    ❌ Merge failed: ${err.message}`);
        }
      } else {
        console.log(`    [DRY RUN] Would assign GTIN ${matchedProduct.gtin}`);
      }
      console.log();
    }
  }

  console.log('============================================================');
  console.log('📊 EXECUTION SUMMARY');
  console.log('============================================================');
  console.log(`Total Processed  : ${hsProducts.length}`);
  console.log(`Brands Inferred  : ${inferredBrandCount}`);
  console.log(`Total Matched    : ${matchCount}`);
  console.log(`  - Exact Name   : ${exactMatchCount}`);
  console.log(`  - Fuzzy Name   : ${fuzzyMatchCount}`);
  console.log(`Total Unmatched  : ${hsProducts.length - matchCount}`);
  console.log(`Match Rate       : ${((matchCount / hsProducts.length) * 100).toFixed(1)}%`);
  console.log('============================================================\n');

  await app.close();
  console.log('👋 Process finished.');
}

bootstrap().catch(async (error) => {
  console.error('❌ Script crashed:', error);
});
