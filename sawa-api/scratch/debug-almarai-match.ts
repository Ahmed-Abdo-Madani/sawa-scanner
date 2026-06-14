import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Product } from '../src/entities/product.entity';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OpenFoodFactsService } from '../src/ingestion/open-food-facts.service';
import { normalizeBrandStrict, normalizeBrandUsable, inferBrandAndWeightFromName, normalizeProductName, normalizeWeightToGrams } from '../src/utils/normalization';
import { diceCoefficient } from '../src/utils/string-similarity';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const offService = app.get(OpenFoodFactsService);
  const dataSource = app.get<DataSource>(getDataSourceToken());
  const productRepo = dataSource.getRepository(Product);

  // Load the OFF slice
  const sliceDir = path.join(process.cwd(), 'uploads', 'off-slice');
  const files = fs.readdirSync(sliceDir).filter(f => f.endsWith('.ndjson.gz'));
  const largestFile = files.reduce((prev, current) => {
    const prevSize = fs.statSync(path.join(sliceDir, prev)).size;
    const currentSize = fs.statSync(path.join(sliceDir, current)).size;
    return prevSize > currentSize ? prev : current;
  });
  const slicePath = path.join(sliceDir, largestFile);

  console.log(`Loading OFF slice...`);
  const offBrandSlugs = new Set<string>();
  const offBrandIndex = new Map<string, any[]>();
  let hasGtin = false;
  let gtinData: any = null;

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

      if (canonical.gtin === '6281007070775') {
        hasGtin = true;
        gtinData = canonical;
      }

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

  console.log(`OFF slice loaded.`);
  console.log(`Contains GTIN 6281007070775? ${hasGtin}`);
  if (hasGtin) {
    console.log(`OFF GTIN data:`, gtinData);
  }

  // Check how brand inference behaves
  const testName = "Almarai Mixed Fruit Juice No Added Sugar 1.4L";
  const inference = inferBrandAndWeightFromName(testName, offBrandSlugs);
  console.log(`Inference result for "${testName}":`, inference);

  // Now query our local products with name like 'Almarai Mixed Fruit Juice No Added Sugar 1.4L'
  const dbProducts = await productRepo.find({
    where: {
      name_en: "Almarai Mixed Fruit Juice No Added Sugar 1.4L"
    }
  });

  console.log(`\nLocal DB matches with exact name: ${dbProducts.length}`);
  for (const p of dbProducts) {
    console.log(`ID: ${p.id}, GTIN: ${p.gtin}, HS ID: ${p.hs_product_id}, Brand: ${p.brand}`);
    
    // Simulate matching this product against the OFF slice
    let brandSlug = normalizeBrandUsable(p.brand);
    if (!brandSlug) {
      const result = inferBrandAndWeightFromName(p.name_en || '', offBrandSlugs);
      brandSlug = result.brandSlug || '';
    }

    console.log(`  - Brand Slug: "${brandSlug}"`);
    if (brandSlug) {
      const pool = offBrandIndex.get(brandSlug) || [];
      console.log(`  - Candidates in brand pool "${brandSlug}": ${pool.length}`);
      
      const normHsName = normalizeProductName(p.name_en || '');
      let exactMatches = 0;
      let fuzzyMatches = 0;

      for (const cand of pool) {
        const normCand = normalizeProductName(cand.name_en || '');
        if (normHsName === normCand) {
          exactMatches++;
          console.log(`    * Exact Match with candidate GTIN ${cand.gtin} ("${cand.name_en}")`);
        } else {
          // Check fuzzy
          const score = diceCoefficient(normHsName, normCand);
          if (score >= 0.8) {
            fuzzyMatches++;
            console.log(`    * Fuzzy Match (Score ${score.toFixed(3)}) with candidate GTIN ${cand.gtin} ("${cand.name_en}")`);
          }
        }
      }
      console.log(`  - Exact matches in pool: ${exactMatches}, Fuzzy matches (>=0.8): ${fuzzyMatches}`);
    }
    console.log('--------------------------------------------------');
  }

  await app.close();
}

main().catch(err => console.error(err));
