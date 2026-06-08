import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OpenFoodFactsService, OffCanonical } from '../src/ingestion/open-food-facts.service';
import { Product } from '../src/entities/product.entity';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Not } from 'typeorm';
import { normalizeBrandStrict, normalizeBrandUsable, inferBrandAndWeightFromName } from '../src/utils/normalization';
import { diceCoefficient } from '../src/utils/string-similarity';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';

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
    take: 10,
  });

  console.log(`\nAnalyzing ${hsProducts.length} products...`);

  for (const product of hsProducts) {
    let brandSlug: string | undefined = normalizeBrandUsable(product.brand);
    if (!brandSlug) {
      const nameForInference = product.name_en || product.name_ar || '';
      const inferenceResult = inferBrandAndWeightFromName(nameForInference, offBrandSlugs);
      brandSlug = inferenceResult.brandSlug;
    }


    console.log(`\nProduct: "${product.name_en}" (BrandSlug: ${brandSlug})`);
    if (!brandSlug) {
      console.log('  -> No brand slug inferred.');
      continue;
    }

    const pool = offBrandIndex.get(brandSlug) || [];
    console.log(`  -> Brand pool size: ${pool.length}`);
    if (pool.length === 0) continue;

    // Print top 5 candidates by Dice Coefficient
    const candidates = pool.map(cand => {
      const sim = product.name_en && cand.name_en ? diceCoefficient(product.name_en, cand.name_en) : 0;
      return { cand, sim };
    });

    candidates.sort((a, b) => b.sim - a.sim);

    console.log('  -> Top 5 candidates:');
    candidates.slice(0, 5).forEach(c => {
      console.log(`     - [Score: ${c.sim.toFixed(3)}] Name: "${c.cand.name_en}" | GTIN: ${c.cand.gtin}`);
    });
  }

  await app.close();
}

bootstrap().catch(console.error);
