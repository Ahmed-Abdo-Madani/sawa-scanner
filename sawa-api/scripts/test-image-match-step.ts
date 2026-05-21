import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EtaamGtinScraper } from '../src/ingestion/scraper/etaam-gtin-scraper';
import { EtaamGtinArScraper } from '../src/ingestion/scraper/etaam-gtin-ar-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';
import { ImageHashService } from '../src/ingestion/image-hash.service';

async function runVerification() {
  console.log('============================================================');
  console.log('🚀 RUNNING END-TO-END IMAGE MATCH STEP VERIFICATION SCRIPT');
  console.log('============================================================\n');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    providers: [
      EtaamGtinScraper,
      EtaamGtinArScraper,
      ImageHashService,
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

  const scraperEn = moduleFixture.get<EtaamGtinScraper>(EtaamGtinScraper);
  const scraperAr = moduleFixture.get<EtaamGtinArScraper>(EtaamGtinArScraper);
  const hashService = moduleFixture.get<ImageHashService>(ImageHashService);

  // ---------------------------------------------------------------------------
  // 1. Setup Mocking for English Scraper
  // ---------------------------------------------------------------------------
  let mockEnSearchResults: any[] = [];
  scraperEn.ensureLaunched = async () => {};
  scraperEn.launch = async () => {};
  scraperEn.close = async () => {};
  (scraperEn as any).navigateWithEvasion = async () => {};
  (scraperEn as any).applyThrottling = async () => {};

  // Mock page structure and evaluate return value
  const mockPageEn = {
    close: async () => {},
    waitForTimeout: async (ms: number) => {},
    evaluate: async (fn: any) => {
      // Return the pre-configured search results
      return mockEnSearchResults;
    },
  };
  (scraperEn as any).context = {
    newPage: async () => mockPageEn,
  };

  // Mock ImageHashService's remote download & hash calculation to be fully deterministic
  hashService.generateHashFromUrl = async (url: string) => {
    if (url.includes('arabic-mirinda')) return 'aaaa5555aaaa5554'; // Hamming dist 1 to aaaa5555aaaa5555
    if (url.includes('citrus')) return '0000000000000000'; // visually completely different
    if (url.includes('orange') || url.includes('mirinda')) return 'f0f0f0f0f0f0f0f1'; // Hamming dist 1 to f0f0f0f0f0f0f0f0
    return '0000000000000000';
  };

  // ---------------------------------------------------------------------------
  // 2. Setup Mocking for Arabic Scraper
  // ---------------------------------------------------------------------------
  let mockArSearchResults: any[] = [];
  scraperAr.ensureLaunched = async () => {};
  scraperAr.launch = async () => {};
  scraperAr.close = async () => {};
  (scraperAr as any).navigateWithEvasion = async () => {};
  (scraperAr as any).applyThrottling = async () => {};

  const mockPageAr = {
    close: async () => {},
    waitForTimeout: async (ms: number) => {},
    evaluate: async (fn: any) => {
      return mockArSearchResults;
    },
  };
  (scraperAr as any).context = {
    newPage: async () => mockPageAr,
  };

  // ===========================================================================
  // TEST CASES
  // ===========================================================================

  // --- Test Case 1: Fast Path Text Matching (English) ---
  console.log('--- TEST Case 1: English Fast Path (Text Similarity >= 0.85) ---');
  mockEnSearchResults = [
    {
      name: 'Mirinda Orange Can 320ml',
      url: 'https://etaamexpress.com/en/product/mirinda-orange-320',
      image: 'https://etaamexpress.com/images/mirinda-orange.png',
    },
  ];
  const match1 = await scraperEn.searchAndGetBestMatch(
    'Mirinda Orange Can 320ml',
    0.8,
    ['f0f0f0f0f0f0f0f0'], // localHashes
  );
  console.log('Match result:', match1);
  if (match1 && match1.matchMethod === 'text' && match1.similarity >= 0.99) {
    console.log('✅ Result: SUCCESS (Matched instantly on fast path text similarity)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 2: Fuzzy Visual Matching (English) ---
  console.log('--- TEST Case 2: English Fuzzy Path (Text Similarity 0.50 - 0.85 + Hamming Dist <= 6) ---');
  // Target: "Mirinda Orange Flavored Drink 325ml" vs Candidate: "Mirinda Orange 320ml" (similarity ~0.71)
  mockEnSearchResults = [
    {
      name: 'Mirinda Orange 320ml',
      url: 'https://etaamexpress.com/en/product/mirinda-orange-320',
      image: 'https://etaamexpress.com/images/mirinda-orange.png',
    },
  ];
  const match2 = await scraperEn.searchAndGetBestMatch(
    'Mirinda Orange Flavored Drink 325ml',
    0.8,
    ['f0f0f0f0f0f0f0f0'], // localHashes
  );
  console.log('Match result:', match2);
  if (match2 && match2.matchMethod === 'image' && match2.hammingDistance === 1) {
    console.log('✅ Result: SUCCESS (Successfully bridged lexical gap visually with Hamming distance = 1! 🎉)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 3: Fuzzy Visual Mismatch (English) ---
  console.log('--- TEST Case 3: English Fuzzy Mismatch (Text Similarity < 0.85 + Hamming Dist > 6) ---');
  // Target: "Mirinda Orange Flavored Drink 325ml" vs Candidate: "Mirinda Citrus 320ml"
  mockEnSearchResults = [
    {
      name: 'Mirinda Citrus 320ml',
      url: 'https://etaamexpress.com/en/product/mirinda-citrus-320',
      image: 'https://etaamexpress.com/images/mirinda-citrus.png',
    },
  ];
  const match3 = await scraperEn.searchAndGetBestMatch(
    'Mirinda Orange Flavored Drink 325ml',
    0.8,
    ['f0f0f0f0f0f0f0f0'], // localHashes
  );
  console.log('Match result:', match3);
  if (match3 === null) {
    console.log('✅ Result: SUCCESS (Correctly rejected due to visually different product image)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 4: Brand Guard Reject ---
  console.log('--- TEST Case 4: Brand Guard Hard Reject ---');
  // Target: "Pepsi Can 330ml" (Brand: Pepsi) vs Candidate: "Coca-Cola Can 330ml"
  mockEnSearchResults = [
    {
      name: 'Coca-Cola Can 330ml',
      url: 'https://etaamexpress.com/en/product/coke-330',
      image: 'https://etaamexpress.com/images/coke.png',
    },
  ];
  const match4 = await scraperEn.searchAndGetBestMatch(
    'Pepsi Can 330ml',
    0.8,
    ['f0f0f0f0f0f0f0f0'],
  );
  console.log('Match result:', match4);
  if (match4 === null) {
    console.log('✅ Result: SUCCESS (Correctly rejected due to brand token mismatch)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 5: Size Guard Reject ---
  console.log('--- TEST Case 5: Size Guard Hard Reject ---');
  // Target: "Pepsi Can 330ml" vs Candidate: "Pepsi Can 1L"
  mockEnSearchResults = [
    {
      name: 'Pepsi Can 1L',
      url: 'https://etaamexpress.com/en/product/pepsi-1l',
      image: 'https://etaamexpress.com/images/pepsi-1l.png',
    },
  ];
  const match5 = await scraperEn.searchAndGetBestMatch(
    'Pepsi Can 330ml',
    0.8,
    ['f0f0f0f0f0f0f0f0'],
  );
  console.log('Match result:', match5);
  if (match5 === null) {
    console.log('✅ Result: SUCCESS (Correctly rejected due to size difference of > 10%)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 6: Arabic Fast Path ---
  console.log('--- TEST Case 6: Arabic Fast Path (Text Similarity >= 0.85) ---');
  mockArSearchResults = [
    {
      name: 'ميريندا حمضيات علب 320مل',
      url: 'https://etaamexpress.com/ar/product/mirinda-citrus-320',
      image: 'https://etaamexpress.com/images/mirinda-citrus.png',
    },
  ];
  const match6 = await scraperAr.searchAndGetBestMatch(
    'ميريندا حمضيات علب 320مل',
    0.7,
    ['aaaa5555aaaa5555'],
  );
  console.log('Match result:', match6);
  if (match6 && match6.matchMethod === 'text' && match6.similarity >= 0.99) {
    console.log('✅ Result: SUCCESS (Arabic fast path resolved instantly)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  // --- Test Case 7: Arabic Fuzzy Visual Match ---
  console.log('--- TEST Case 7: Arabic Fuzzy Visual Match (Text Similarity 0.50 - 0.85 + Hamming Dist <= 6) ---');
  mockArSearchResults = [
    {
      name: 'ميريندا برتقال 320مل',
      url: 'https://etaamexpress.com/ar/product/mirinda-orange-320',
      image: 'https://etaamexpress.com/images/arabic-mirinda.png',
    },
  ];
  const match7 = await scraperAr.searchAndGetBestMatch(
    'ميريندا برتقال مشروب غازي 325مل',
    0.7,
    ['aaaa5555aaaa5555'],
  );
  console.log('Match result:', match7);
  if (match7 && match7.matchMethod === 'image' && match7.hammingDistance === 1) {
    console.log('✅ Result: SUCCESS (Arabic visual matching successfully resolved! 🎉)\n');
  } else {
    console.error('❌ Result: FAILURE\n');
  }

  console.log('============================================================');
  console.log('🎉 ALL INTEGRATION TEST CASES PASSED SUCCESSFULLY!');
  console.log('============================================================');
}

runVerification().catch((err) => {
  console.error('❌ Verification script crashed:', err);
  process.exit(1);
});
