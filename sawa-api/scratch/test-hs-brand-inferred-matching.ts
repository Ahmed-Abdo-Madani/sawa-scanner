import { AppDataSource } from '../src/data-source';
import { Product } from '../src/entities/product.entity';
import { IsNull, Not } from 'typeorm';
import { normalizeBrandUsable, inferBrandAndWeightFromName, normalizeProductName, normalizeWeightToGrams } from '../src/utils/normalization';
import { diceCoefficient } from '../src/utils/string-similarity';

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
  return Math.abs(gramsA - gramsB) <= max * 0.1;
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const productRepo = AppDataSource.getRepository(Product);

  // 1. Fetch HungerStation products without GTINs
  console.log('Fetching HungerStation products without GTINs...');
  const hsProducts = await productRepo.find({
    where: {
      gtin: IsNull(),
      hs_product_id: Not(IsNull()),
    },
    take: 10000, // Limit to 10k for speed
  });
  console.log(`Found ${hsProducts.length} unmatched HS products.`);

  // 2. Fetch donor products with GTINs
  console.log('Fetching donor products with GTINs...');
  const donorProducts = await productRepo.find({
    where: {
      gtin: Not(IsNull()),
    },
  });
  console.log(`Found ${donorProducts.length} donor products.`);

  // 3. Extract donor brand slugs
  const donorBrandSlugs = new Set<string>();
  const englishNameMap = new Map<string, Product[]>();
  const arabicNameMap = new Map<string, Product[]>();

  for (const p of donorProducts) {
    const brandSlug = normalizeBrandUsable(p.brand);
    if (brandSlug) {
      donorBrandSlugs.add(brandSlug);
    }
    
    // Index donor products by normalized name + brand slug
    if (p.name_en) {
      const normEn = `${normalizeProductName(p.name_en)}|${brandSlug}`;
      if (!englishNameMap.has(normEn)) englishNameMap.set(normEn, []);
      englishNameMap.get(normEn)!.push(p);
    }
    if (p.name_ar) {
      const normAr = `${normalizeProductName(p.name_ar)}|${brandSlug}`;
      if (!arabicNameMap.has(normAr)) arabicNameMap.set(normAr, []);
      arabicNameMap.get(normAr)!.push(p);
    }
  }
  console.log(`Extracted ${donorBrandSlugs.size} unique donor brand slugs.`);

  // 4. Try matching with inferred brand slug
  let matchCount = 0;
  let inferredBrandCount = 0;
  const matchDetails: Array<{ hsName: string; inferredBrand: string; matchedGtin: string; matchedName: string }> = [];

  for (const product of hsProducts) {
    let brandSlug = normalizeBrandUsable(product.brand);
    let inferredBrand: string | undefined;

    if (!brandSlug) {
      // Try to infer from name
      const nameForInference = product.name_en || product.name_ar || '';
      const inferenceResult = inferBrandAndWeightFromName(nameForInference, donorBrandSlugs);
      if (inferenceResult.brandSlug) {
        brandSlug = inferenceResult.brandSlug;
        inferredBrand = inferenceResult.brand;
        inferredBrandCount++;
      }
    }

    if (!brandSlug) continue; // Skip if no brand slug (inferred or explicit)

    const hsSize = extractSizeFromName(product.name_en || product.name_ar || '');
    let matchedProduct: Product | null = null;

    // Pass 1: Exact Name Match
    if (product.name_en) {
      const key = `${normalizeProductName(product.name_en)}|${brandSlug}`;
      const candidates = englishNameMap.get(key) || [];
      for (const cand of candidates) {
        const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
        if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
          matchedProduct = cand;
          break;
        }
      }
    }

    if (!matchedProduct && product.name_ar) {
      const key = `${normalizeProductName(product.name_ar)}|${brandSlug}`;
      const candidates = arabicNameMap.get(key) || [];
      for (const cand of candidates) {
        const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
        if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
          matchedProduct = cand;
          break;
        }
      }
    }

    // Pass 2: Fuzzy Name Match
    if (!matchedProduct) {
      // Find all donor products with same brand slug
      const brandCandidates = donorProducts.filter(p => normalizeBrandUsable(p.brand) === brandSlug);
      let bestScore = 0;
      let bestCand: Product | null = null;

      for (const cand of brandCandidates) {
        const simEn = product.name_en && cand.name_en ? diceCoefficient(product.name_en, cand.name_en) : 0;
        const simAr = product.name_ar && cand.name_ar ? diceCoefficient(product.name_ar, cand.name_ar) : 0;
        const score = Math.max(simEn, simAr);

        if (score >= 0.85 && score > bestScore) {
          const candSize = extractSizeFromName(cand.name_en || cand.name_ar || '');
          if (doSizesMatch(hsSize, candSize, product.net_weight_value, cand.net_weight_value)) {
            bestScore = score;
            bestCand = cand;
          }
        }
      }

      if (bestCand) {
        matchedProduct = bestCand;
      }
    }

    if (matchedProduct && matchedProduct.gtin) {
      matchCount++;
      if (matchCount <= 20) {
        matchDetails.push({
          hsName: product.name_en || product.name_ar || '',
          inferredBrand: inferredBrand || 'Explicit',
          matchedGtin: matchedProduct.gtin,
          matchedName: matchedProduct.name_en || matchedProduct.name_ar || '',
        });
      }
    }
  }

  console.log('\n--- MATCHING RESULTS ---');
  console.log(`Total scanned unmatched products : ${hsProducts.length}`);
  console.log(`Brands inferred from name        : ${inferredBrandCount}`);
  console.log(`Total successful matches found   : ${matchCount}`);
  console.log(`Match Rate                       : ${((matchCount / hsProducts.length) * 100).toFixed(2)}%`);

  console.log('\n--- Sample of 20 Matches ---');
  console.table(matchDetails);

  await AppDataSource.destroy();
}

main().catch(console.error);
