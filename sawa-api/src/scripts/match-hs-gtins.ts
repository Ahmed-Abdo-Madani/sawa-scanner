import { AppDataSource } from '../data-source';
import { Product } from '../entities/product.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductMergeService } from '../products/product-merge.service';
import { ImageHashService } from '../ingestion/image-hash.service';
import { diceCoefficient } from '../utils/string-similarity';
import { IsNull, Not } from 'typeorm';
import {
  normalizeProductName,
  normalizeBrandUsable,
  normalizeWeightToGrams,
} from '../utils/normalization';

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 99999;
const dryRun = args.includes('--dry-run');
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
  
  // Accept within 10% tolerance (e.g., 330ml vs 350ml might be rounded/mismatched in name vs meta)
  const max = Math.max(gramsA, gramsB);
  return Math.abs(gramsA - gramsB) <= max * 0.1;
}

async function run() {
  console.log('============================================================');
  console.log('🤖 INITIALIZING LOCAL DATABASE HUNGERSTATION GTIN MATCHING');
  console.log('============================================================');
  console.log(`Dry Run    : ${dryRun}`);
  console.log(`Limit      : ${limit}`);
  console.log(`Threshold  : ${threshold}`);
  console.log('============================================================\n');

  // Initialize DB Connection
  await AppDataSource.initialize();
  console.log('✓ Database connection initialized.');

  const productRepo = AppDataSource.getRepository(Product);
  const imageRepo = AppDataSource.getRepository(ProductImage);
  const mergeService = new ProductMergeService(AppDataSource);
  const hashService = new ImageHashService();

  // 1. Fetch HungerStation products without GTINs
  console.log('🔍 Querying HungerStation products lacking GTINs...');
  const hsProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    relations: ['images'],
    take: limit,
  });

  console.log(`📊 Found ${hsProducts.length} HungerStation products without GTINs.`);
  if (hsProducts.length === 0) {
    console.log('✨ All HungerStation products have GTINs. Nothing to match!');
    await AppDataSource.destroy();
    return;
  }

  // 2. Fetch all products in the database that HAVE GTINs (donor pool)
  console.log('🔍 Querying donor products containing GTINs...');
  const donorProducts = await productRepo.find({
    where: {
      gtin: Not(IsNull()),
    },
    relations: ['images'],
  });
  console.log(`📊 Found ${donorProducts.length} donor products with GTINs.`);

  // 3. Index donor products for fast exact matching
  console.log('⚡ Indexing donor products...');
  const englishNameMap = new Map<string, Product[]>();
  const arabicNameMap = new Map<string, Product[]>();
  const donorImagesList: Array<{ hash: string; product: Product }> = [];

  for (const p of donorProducts) {
    const brandSlug = normalizeBrandUsable(p.brand);
    
    // Index by English Name + Brand
    if (p.name_en) {
      const normEn = `${normalizeProductName(p.name_en)}|${brandSlug}`;
      if (!englishNameMap.has(normEn)) englishNameMap.set(normEn, []);
      englishNameMap.get(normEn)!.push(p);
    }
    
    // Index by Arabic Name + Brand
    if (p.name_ar) {
      const normAr = `${normalizeProductName(p.name_ar)}|${brandSlug}`;
      if (!arabicNameMap.has(normAr)) arabicNameMap.set(normAr, []);
      arabicNameMap.get(normAr)!.push(p);
    }

    // Index by Image Hash
    if (p.images) {
      for (const img of p.images) {
        if (img.image_hash && img.image_hash !== 'FAILED') {
          donorImagesList.push({ hash: img.image_hash, product: p });
        }
      }
    }
  }

  console.log(`⚡ Indexed ${englishNameMap.size} English names, ${arabicNameMap.size} Arabic names, and ${donorImagesList.length} image hashes.\n`);

  let matchCount = 0;
  let exactMatchCount = 0;
  let visualMatchCount = 0;
  let fuzzyMatchCount = 0;

  // 4. Perform matching
  for (let i = 0; i < hsProducts.length; i++) {
    const product = hsProducts[i];
    const brandSlug = normalizeBrandUsable(product.brand);
    const hsSize = extractSizeFromName(product.name_en || product.name_ar || '');
    
    let matchedGtin: string | null = null;
    let matchedProduct: Product | null = null;
    let matchMethod = '';

    // --- Pass 1: Exact Normalized Name Matches ---
    // Try English Name
    if (product.name_en) {
      const key = `${normalizeProductName(product.name_en)}|${brandSlug}`;
      const candidates = englishNameMap.get(key) || [];
      for (const cand of candidates) {
        const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
        if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
          matchedProduct = cand;
          matchedGtin = cand.gtin;
          matchMethod = 'Exact Name Match (EN)';
          break;
        }
      }
    }

    // Try Arabic Name if no English match
    if (!matchedGtin && product.name_ar) {
      const key = `${normalizeProductName(product.name_ar)}|${brandSlug}`;
      const candidates = arabicNameMap.get(key) || [];
      for (const cand of candidates) {
        const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
        if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
          matchedProduct = cand;
          matchedGtin = cand.gtin;
          matchMethod = 'Exact Name Match (AR)';
          break;
        }
      }
    }

    if (matchedGtin) {
      exactMatchCount++;
    }

    // --- Pass 2: Perceptual Image Hash Match (dHash) ---
    if (!matchedGtin && product.images && product.images.length > 0) {
      const hsHashes = product.images
        .map((img) => img.image_hash)
        .filter((hash): hash is string => !!hash && hash !== 'FAILED');

      if (hsHashes.length > 0) {
        let bestDistance = 99;
        let bestCand: Product | null = null;

        for (const hsHash of hsHashes) {
          for (const donorImg of donorImagesList) {
            const candBrandSlug = normalizeBrandUsable(donorImg.product.brand);
            // Brand Guard: must have matching, non-empty brand slugs
            if (!brandSlug || !candBrandSlug || brandSlug !== candBrandSlug) continue;

            // Name similarity check to prevent matching completely different products under the same brand
            const simEn = product.name_en && donorImg.product.name_en ? diceCoefficient(product.name_en, donorImg.product.name_en) : 0;
            const simAr = product.name_ar && donorImg.product.name_ar ? diceCoefficient(product.name_ar, donorImg.product.name_ar) : 0;
            const nameScore = Math.max(simEn, simAr);
            if (nameScore < 0.4) continue;

            const distance = hashService.calculateHammingDistance(hsHash, donorImg.hash);
            if (distance <= 8 && distance < bestDistance) {
              const candSize = extractSizeFromName(donorImg.product.name_en || donorImg.product.name_ar || '');
              if (doSizesMatch(hsSize, candSize, product.net_weight_value, donorImg.product.net_weight_value)) {
                bestDistance = distance;
                bestCand = donorImg.product;
              }
            }
          }
        }

        if (bestCand) {
          matchedProduct = bestCand;
          matchedGtin = bestCand.gtin;
          matchMethod = `Visual Hash Match (dHash distance: ${bestDistance})`;
          visualMatchCount++;
        }
      }
    }

    // --- Pass 3: Fuzzy Name Matches ---
    if (!matchedGtin && brandSlug) {
      let bestScore = 0;
      let bestCand: Product | null = null;

      // Scan donor pool with the same brand slug
      const brandCandidates = donorProducts.filter(p => normalizeBrandUsable(p.brand) === brandSlug);

      for (const cand of brandCandidates) {
        const simEn = product.name_en && cand.name_en ? diceCoefficient(product.name_en, cand.name_en) : 0;
        const simAr = product.name_ar && cand.name_ar ? diceCoefficient(product.name_ar, cand.name_ar) : 0;
        const score = Math.max(simEn, simAr);

        if (score >= threshold && score > bestScore) {
          const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
            bestScore = score;
            bestCand = cand;
          }
        }
      }

      if (bestCand) {
        matchedProduct = bestCand;
        matchedGtin = bestCand.gtin;
        matchMethod = `Fuzzy Name Match (Score: ${bestScore.toFixed(3)})`;
        fuzzyMatchCount++;
      }
    }

    // --- Process the match ---
    if (matchedGtin && matchedProduct) {
      matchCount++;
      const hsName = product.name_en || product.name_ar || 'Unknown';
      const candName = matchedProduct.name_en || matchedProduct.name_ar || 'Unknown';
      console.log(`[${matchCount}] 🔗 Match Confirmed: "${hsName}"`);
      console.log(`    -> Matched to: "${candName}"`);
      console.log(`    -> GTIN: ${matchedGtin} | Method: ${matchMethod}`);

      if (!dryRun) {
        try {
          await mergeService.assignGtin(
            product.id,
            matchedGtin,
            'hs_local_gtin_matcher',
            `Local local database GTIN Match via ${matchMethod}`,
          );
          console.log(`    ✅ Assigned & Merged successfully.`);
        } catch (err: any) {
          console.error(`    ❌ Merge failed: ${err.message}`);
        }
      } else {
        console.log(`    [DRY RUN] Would assign GTIN ${matchedGtin}`);
      }
      console.log();
    }
  }

  console.log('============================================================');
  console.log('📊 EXECUTION SUMMARY');
  console.log('============================================================');
  console.log(`Total Scanned   : ${hsProducts.length}`);
  console.log(`Total Matched   : ${matchCount}`);
  console.log(`  - Exact Name  : ${exactMatchCount}`);
  console.log(`  - Visual Hash : ${visualMatchCount}`);
  console.log(`  - Fuzzy Name  : ${fuzzyMatchCount}`);
  console.log(`Total Unmatched : ${hsProducts.length - matchCount}`);
  console.log('============================================================\n');

  await AppDataSource.destroy();
  console.log('👋 Database connection closed.');
}

run().catch(async (error) => {
  console.error('❌ Script crashed:', error);
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
});
