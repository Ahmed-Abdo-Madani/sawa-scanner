import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EtaamGtinScraper } from '../src/ingestion/scraper/etaam-gtin-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';

async function bootstrap() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    providers: [
      EtaamGtinScraper,
      {
        provide: RobotsTxtService,
        useValue: { isAllowed: async () => true },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'scraper') return { headless: true, executablePath: undefined, timeout: 30000 };
            return null;
          },
        },
      },
    ],
  }).compile();

  const scraper = moduleFixture.get<EtaamGtinScraper>(EtaamGtinScraper);
  const THRESHOLD = 0.8; // production threshold

  // 20 realistic product names typical in a Saudi grocery DB
  const testProducts = [
    'Al Rabie Chocolate Milk 185ml',
    'Almarai Full Fat Long Life Milk 1L',
    'Pepsi Cola Can 330ml',
    'Nido Fortified Full Cream Milk Powder 900g',
    'Lipton Yellow Label Tea Bags 100 Bags',
    'Pringles Original 165g',
    'Lay\'s Classic Potato Chips 170g',
    'Coca-Cola Can 330ml',
    'Almarai Fresh Orange Juice 1L',
    'Sunbulah Corn Oil 1.8L',
    'Nadec Full Fat Long Life Milk 1L',
    'Kitkat Chocolate Bar 4 Fingers 41.5g',
    'Activia Yogurt Strawberry 120g',
    'Nescafe Classic Instant Coffee 200g',
    'Heinz Tomato Ketchup 570g',
    'Maggi Chicken Noodles 77g',
    'Lux Body Wash Soft Rose 700ml',
    'Tide Automatic Powder Detergent 3kg',
    'Dove Moisturizing Body Wash 500ml',
    'Nestle Pure Life Water 1.5L',
  ];

  const results: {
    query: string;
    status: 'MATCH' | 'NO_MATCH' | 'GTIN_FOUND' | 'GTIN_MISSING';
    matchName?: string;
    similarity?: number;
    gtin?: string;
  }[] = [];

  try {
    await scraper.launch();
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  ETAAM GTIN SCRAPER — LARGE DRY RUN (threshold: ${THRESHOLD})`);
    console.log(`${'='.repeat(70)}\n`);

    for (let i = 0; i < testProducts.length; i++) {
      const name = testProducts[i];
      process.stdout.write(`[${i + 1}/${testProducts.length}] Searching: "${name}" ... `);

      const bestMatch = await scraper.searchAndGetBestMatch(name, THRESHOLD);

      if (!bestMatch) {
        console.log(`❌ No match`);
        results.push({ query: name, status: 'NO_MATCH' });
        continue;
      }

      process.stdout.write(`✅ "${bestMatch.name}" (sim=${bestMatch.similarity.toFixed(2)}) → `);

      const gtin = await scraper.scrapeGtinFromProductPage(bestMatch.url);

      if (gtin) {
        console.log(`GTIN: ${gtin}`);
        results.push({ query: name, status: 'GTIN_FOUND', matchName: bestMatch.name, similarity: bestMatch.similarity, gtin });
      } else {
        console.log(`⚠️  GTIN missing on product page`);
        results.push({ query: name, status: 'GTIN_MISSING', matchName: bestMatch.name, similarity: bestMatch.similarity });
      }
    }
  } catch (err) {
    console.error('\n[ERROR]', err);
  } finally {
    await scraper.close();
  }

  // --- Summary ---
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  SUMMARY`);
  console.log(`${'='.repeat(70)}`);
  const matched    = results.filter(r => r.status !== 'NO_MATCH').length;
  const gtinFound  = results.filter(r => r.status === 'GTIN_FOUND').length;
  const noMatch    = results.filter(r => r.status === 'NO_MATCH').length;
  const gtinMissing = results.filter(r => r.status === 'GTIN_MISSING').length;
  console.log(`  Total tested  : ${testProducts.length}`);
  console.log(`  Matched       : ${matched}  (${((matched / testProducts.length) * 100).toFixed(0)}%)`);
  console.log(`  GTINs found   : ${gtinFound}  (${((gtinFound / testProducts.length) * 100).toFixed(0)}%)`);
  console.log(`  No match      : ${noMatch}`);
  console.log(`  GTIN missing  : ${gtinMissing}`);
  console.log(`\n  ── Per-product detail ──`);
  for (const r of results) {
    if (r.status === 'GTIN_FOUND') {
      console.log(`  ✅  "${r.query}" → GTIN ${r.gtin} (sim=${r.similarity?.toFixed(2)}, matched="${r.matchName}")`);
    } else if (r.status === 'GTIN_MISSING') {
      console.log(`  ⚠️   "${r.query}" → matched "${r.matchName}" but no GTIN (sim=${r.similarity?.toFixed(2)})`);
    } else {
      console.log(`  ❌  "${r.query}" → no match`);
    }
  }
  console.log(`${'='.repeat(70)}\n`);
}

bootstrap();
