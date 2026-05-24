import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource, Not, IsNull } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { Merchant } from '../entities/merchant.entity';
import { diceCoefficient } from '../utils/string-similarity';
import { ShonaksaGtinArScraper } from '../ingestion/scraper/shonaksa-gtin-ar-scraper';
import { YasminGtinArScraper } from '../ingestion/scraper/yasmin-gtin-ar-scraper';
import { MrLogmanGtinArScraper } from '../ingestion/scraper/mrlogman-gtin-ar-scraper';
import { EtaamGtinArScraper } from '../ingestion/scraper/etaam-gtin-ar-scraper';
import { ParkCenterGtinArScraper } from '../ingestion/scraper/parkcenter-gtin-ar-scraper';
import { MenhalGtinArScraper } from '../ingestion/scraper/menhal-gtin-ar-scraper';
import { HsdShGtinArScraper } from '../ingestion/scraper/hsd-sh-gtin-ar-scraper';
import { NwshaGtinArScraper } from '../ingestion/scraper/nwsha-gtin-ar-scraper';
import { AlaqialMarketsGtinArScraper } from '../ingestion/scraper/alaqialmarkets-gtin-ar-scraper';
import { ShamlGtinArScraper } from '../ingestion/scraper/shaml-gtin-ar-scraper';
import { AliaqtisadiaGtinArScraper } from '../ingestion/scraper/aliaqtisadia-gtin-ar-scraper';
import { Mo3enGtinArScraper } from '../ingestion/scraper/mo3en-gtin-ar-scraper';
import { Mo0o0natGtinArScraper } from '../ingestion/scraper/mo0o0nat-gtin-ar-scraper';
import { NarjsGtinArScraper } from '../ingestion/scraper/narjs-gtin-ar-scraper';
import { TalbatukGtinArScraper } from '../ingestion/scraper/talbatuk-gtin-ar-scraper';
import { DukanExpressGtinArScraper } from '../ingestion/scraper/dukanexpress-gtin-ar-scraper';
import { EanaabGtinArScraper } from '../ingestion/scraper/eanaab-gtin-ar-scraper';
import { AtayibGtinArScraper } from '../ingestion/scraper/atayib-gtin-ar-scraper';
import { MubarkiyahGtinArScraper } from '../ingestion/scraper/mubarkiyah-gtin-ar-scraper';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// Active stores configuration (excluding waw.sa)
const storeConfigs = [
  { url: 'https://store.shonaksa.com', nameEn: 'Shonaksa', nameAr: 'شوناكسا' },
  { url: 'https://yasminstore.com', nameEn: 'Yasmin Store', nameAr: 'متجر ياسمين' },
  { url: 'https://mrlogman.com', nameEn: 'Mr Logman', nameAr: 'مستر لوقمان' },
  { url: 'https://etaamexpress.com', nameEn: 'Etaam Express', nameAr: 'إطعام إكسبريس' },
  { url: 'https://parkcentersa.com', nameEn: 'Park Center', nameAr: 'بارك سنتر' },
  { url: 'https://menhal.sa', nameEn: 'Menhal', nameAr: 'منهل' },
  { url: 'https://hsd-sh.com', nameEn: 'Hsd-Sh', nameAr: 'حصاد نجد' },
  { url: 'https://nwsha.com', nameEn: 'Nwsha', nameAr: 'نوشا' },
  { url: 'https://alaqialmarkets.net', nameEn: 'Alaqial Markets', nameAr: 'أسواق العقيل' },
  { url: 'https://shaml.sa', nameEn: 'Shaml', nameAr: 'نجمة الشمال' },
  { url: 'https://aliaqtisadia.sa', nameEn: 'Aliaqtisadia', nameAr: 'صالة تبوك الاقتصادية' },
  { url: 'https://mo3en.com', nameEn: 'Mo3en', nameAr: 'معينكم' },
  { url: 'https://mo0o0nat.com', nameEn: 'Mo0o0nat', nameAr: 'مونة سكر' },
  { url: 'https://narjs.store', nameEn: 'Narjs Store', nameAr: 'متجر نرجس' },
  { url: 'https://talbatuk.com', nameEn: 'Talbatuk', nameAr: 'طلباتك' },
  { url: 'https://dukanexpress.com', nameEn: 'Dukan Express', nameAr: 'الدكان المريح' },
  { url: 'https://eanaab.com', nameEn: 'Eanaab', nameAr: 'متجر عناب' },
  { url: 'https://www.atayib.com', nameEn: 'Atayib', nameAr: 'أطايب' },
  { url: 'https://mubarkiyah.com', nameEn: 'Mubarkiyah', nameAr: 'المباركية' },
];

function getScraperForStore(url: string, app: any) {
  if (url.includes('store.shonaksa.com')) return app.get(ShonaksaGtinArScraper);
  if (url.includes('yasminstore.com')) return app.get(YasminGtinArScraper);
  if (url.includes('mrlogman.com')) return app.get(MrLogmanGtinArScraper);
  if (url.includes('etaamexpress.com')) return app.get(EtaamGtinArScraper);
  if (url.includes('parkcentersa.com')) return app.get(ParkCenterGtinArScraper);
  if (url.includes('menhal.sa')) return app.get(MenhalGtinArScraper);
  if (url.includes('hsd-sh.com')) return app.get(HsdShGtinArScraper);
  if (url.includes('nwsha.com')) return app.get(NwshaGtinArScraper);
  if (url.includes('alaqialmarkets.net')) return app.get(AlaqialMarketsGtinArScraper);
  if (url.includes('shaml.sa')) return app.get(ShamlGtinArScraper);
  if (url.includes('aliaqtisadia.sa')) return app.get(AliaqtisadiaGtinArScraper);
  if (url.includes('mo3en.com')) return app.get(Mo3enGtinArScraper);
  if (url.includes('mo0o0nat.com')) return app.get(Mo0o0natGtinArScraper);
  if (url.includes('narjs.store')) return app.get(NarjsGtinArScraper);
  if (url.includes('talbatuk.com')) return app.get(TalbatukGtinArScraper);
  if (url.includes('dukanexpress.com')) return app.get(DukanExpressGtinArScraper);
  if (url.includes('eanaab.com')) return app.get(EanaabGtinArScraper);
  if (url.includes('atayib.com')) return app.get(AtayibGtinArScraper);
  if (url.includes('mubarkiyah.com')) return app.get(MubarkiyahGtinArScraper);
  throw new Error(`Unknown scraper for store URL: ${url}`);
}

function compareGtins(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const cleanA = a.replace(/\D/g, '').replace(/^0+/, '');
  const cleanB = b.replace(/\D/g, '').replace(/^0+/, '');
  return cleanA === cleanB && cleanA.length > 0;
}

async function bootstrap() {
  console.log('🤖 Bootstrapping NestJS Application context for GTIN Verification and Seeding...');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const dataSource = app.get(DataSource);
  const productRepo = dataSource.getRepository(Product);
  const priceRepo = dataSource.getRepository(ProductPrice);
  const imageRepo = dataSource.getRepository(ProductImage);
  const merchantRepo = dataSource.getRepository(Merchant);

  // Parse script parameters
  const args = process.argv.slice(2);
  
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 10;

  const offsetArg = args.find(a => a.startsWith('--offset='));
  const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;

  const dryRun = args.includes('--dry-run');

  console.log(`\n📋 Configurations: limit=${limit}, offset=${offset}, dryRun=${dryRun}`);

  try {
    // Query products that have a GTIN and represent a HungerStation product
    console.log('🔍 Fetching matching HungerStation products with assigned GTINs from DB...');
    const products = await productRepo.find({
      where: {
        gtin: Not(IsNull()),
        hs_product_id: Not(IsNull()),
      },
      order: { created_at: 'DESC' },
      skip: offset,
      take: limit,
    });

    console.log(`📈 Found ${products.length} products to verify in this batch.\n`);

    const report: any[] = [];
    let correctCount = 0;
    let wrongCount = 0;
    let unknownCount = 0;

    for (let index = 0; index < products.length; index++) {
      const product = products[index];
      const gtin = product.gtin!;
      const hsName = product.name_ar || product.name_en || '';
      console.log(`--------------------------------------------------------------------------------`);
      console.log(`[${index + 1}/${products.length}] Verifying GTIN: ${gtin}`);
      console.log(`   HungerStation Name: "${hsName}"`);

      // Search all stores in parallel using raw GTIN
      const successfulMatches: any[] = [];
      const promises = storeConfigs.map(async (store) => {
        try {
          const scraper = getScraperForStore(store.url, app);
          await scraper.ensureLaunched();

          const candidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
          if (candidates && candidates.length > 0 && candidates.length < 25) {
            // Check top candidates
            const candidatesToCheck = candidates.slice(0, 10);
            for (const cand of candidatesToCheck) {
              try {
                const details = await scraper.scrapeProductDetails(cand.url);
                if (details && details.price !== null && compareGtins(details.gtin, gtin)) {
                  return { store, details, matchUrl: cand.url };
                }
              } catch (err: any) {
                // Ignore silent details scrape errors
              }
            }
          }
          return null;
        } catch (e: any) {
          return null;
        }
      });

      const results = await Promise.allSettled(promises);
      const matches = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      console.log(`   E-Commerce Stores Matched: ${matches.length}`);

      if (matches.length === 0) {
        console.log(`   ⚠️ No e-commerce stores carry this GTIN. Verification skipped.`);
        unknownCount++;
        report.push({
          gtin,
          hsProductId: product.hs_product_id,
          hsName,
          status: 'SKIPPED_NO_ECOMMERCE_MATCHES',
          ecoStoresCount: 0,
        });
        continue;
      }

      // Compute Dice similarity score between HungerStation product name (Arabic or English) and e-commerce matched name
      let maxSimilarity = 0;
      let bestEcoName = '';
      let bestMatch: any = null;

      for (const match of matches) {
        const simAr = product.name_ar ? diceCoefficient(product.name_ar, match.details.name) : 0;
        const simEn = product.name_en ? diceCoefficient(product.name_en, match.details.name) : 0;
        const sim = Math.max(simAr, simEn);
        if (sim > maxSimilarity) {
          maxSimilarity = sim;
          bestEcoName = match.details.name;
          bestMatch = match;
        }
      }

      console.log(`   Best E-Commerce Name: "${bestEcoName}"`);
      console.log(`   Dice Lexical Similarity: ${maxSimilarity.toFixed(4)}`);

      // Determine verification status (using threshold of 0.45)
      const isCorrect = maxSimilarity >= 0.45;

      if (isCorrect) {
        console.log(`   ✅ Correct Match confirmed! Saving prices under existing product...`);
        correctCount++;

        if (!dryRun) {
          await dataSource.transaction(async (manager) => {
            for (const match of matches) {
              let merchant = await manager.findOne(Merchant, {
                where: { name_en: match.store.nameEn },
              });

              if (!merchant) {
                merchant = manager.create(Merchant, {
                  name_en: match.store.nameEn,
                  name_ar: match.store.nameAr,
                  base_url: match.store.url,
                  data_source_type: 'scraped_live',
                });
                merchant = await manager.save(merchant);
              }

              // Check if price already exists for this merchant/product
              const existingPrice = await manager.findOne(ProductPrice, {
                where: {
                  product_id: product.id,
                  merchant_id: merchant.id,
                },
              });

              if (!existingPrice) {
                const price = manager.create(ProductPrice, {
                  price_sar_incl_vat: match.details.price,
                  currency: 'SAR',
                  in_stock: true,
                  source_url: match.matchUrl,
                  scraped_at: new Date(),
                  merchant: merchant,
                  product: product,
                });
                await manager.save(price);
              } else {
                existingPrice.price_sar_incl_vat = match.details.price;
                existingPrice.scraped_at = new Date();
                existingPrice.source_url = match.matchUrl;
                await manager.save(existingPrice);
              }
            }
          });
          console.log(`   Prices successfully saved to database for product ${product.id}`);
        } else {
          console.log(`   [DRY RUN] Would save ${matches.length} e-commerce prices to existing product row.`);
        }

        report.push({
          gtin,
          hsProductId: product.hs_product_id,
          hsName,
          ecoName: bestEcoName,
          similarity: maxSimilarity,
          status: 'CORRECT',
          ecoStoresCount: matches.length,
        });

      } else {
        console.log(`   ❌ WRONG MATCH detected! Unlinking GTIN from HungerStation product...`);
        wrongCount++;

        if (!dryRun) {
          await dataSource.transaction(async (manager) => {
            // 1. Unlink GTIN from the wrong HungerStation product
            product.gtin = null;
            product.gtin_prefix = null;
            await manager.save(product);

            // 2. Create a new Product entity with the correct GTIN & e-commerce details
            const newProduct = manager.create(Product, {
              gtin,
              name_ar: bestMatch.details.name,
              name_en: bestMatch.details.name,
              image_front_url: bestMatch.details.image || undefined,
              data_source: 'scraped_live',
              data_completeness_score: 0.1,
            });
            const savedProduct = await manager.save(newProduct);

            // 3. Save images
            if (bestMatch.details.image) {
              const pImage = manager.create(ProductImage, {
                url: bestMatch.details.image,
                source: 'scraped_live',
                product: savedProduct,
              });
              await manager.save(pImage);
            }

            // 4. Save all e-commerce prices under this new product
            for (const match of matches) {
              let merchant = await manager.findOne(Merchant, {
                where: { name_en: match.store.nameEn },
              });

              if (!merchant) {
                merchant = manager.create(Merchant, {
                  name_en: match.store.nameEn,
                  name_ar: match.store.nameAr,
                  base_url: match.store.url,
                  data_source_type: 'scraped_live',
                });
                merchant = await manager.save(merchant);
              }

              const price = manager.create(ProductPrice, {
                price_sar_incl_vat: match.details.price,
                currency: 'SAR',
                in_stock: true,
                source_url: match.matchUrl,
                scraped_at: new Date(),
                merchant: merchant,
                product: savedProduct,
              });
              await manager.save(price);
            }
          });
          console.log(`   Successfully unlinked GTIN and seeded correct new Product entry!`);
        } else {
          console.log(`   [DRY RUN] Would unlink GTIN from HungerStation product, create new Product row, and seed ${matches.length} e-commerce prices.`);
        }

        report.push({
          gtin,
          hsProductId: product.hs_product_id,
          hsName,
          ecoName: bestEcoName,
          similarity: maxSimilarity,
          status: 'MISMATCH_AUTO_HEALED',
          ecoStoresCount: matches.length,
        });
      }
    }

    // Write report file
    const reportPath = path.join(process.cwd(), 'gtin-verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`\n================================================================================`);
    console.log(`📊 EXECUTION SUMMARY`);
    console.log(`   Total Verified: ${products.length}`);
    console.log(`   ✅ Correct Matches (Aggregated): ${correctCount}`);
    console.log(`   ❌ Wrong Matches (Auto-Healed):  ${wrongCount}`);
    console.log(`   ⚠️  No E-Commerce Match (Skipped):  ${unknownCount}`);
    console.log(`📄 Detailed report written to: ${reportPath}`);
    console.log(`================================================================================\n`);

  } catch (error: any) {
    console.error('❌ Error during GTIN verification script run:', error);
  } finally {
    await app.close();
    console.log('👋 Application context closed.');
  }
}

bootstrap();
