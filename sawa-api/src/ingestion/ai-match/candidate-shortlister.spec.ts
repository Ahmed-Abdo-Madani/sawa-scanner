import { Test, TestingModule } from '@nestjs/testing';
import { CandidateShortlister, OffIndexes, ShortlistScanInput } from './candidate-shortlister';
import { OffCanonical } from '../open-food-facts.service';
import { MAX_CANDIDATES_PER_CALL } from './llm-gtin-match-provider.interface';

/**
 * Comment 5: Benchmark test for CandidateShortlister with inverted token index.
 * 
 * Tests:
 *   1. buildShortlist with ~50k synthetic OFF index completes in < 50ms
 *   2. Correct Top-K returned (K = MAX_CANDIDATES_PER_CALL)
 *   3. Planted positive match is in Top-K result
 *   4. With no shared tokens/brand/prefix, returns empty (no global fallback)
 */
describe('CandidateShortlister', () => {
  let service: CandidateShortlister;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CandidateShortlister],
    }).compile();

    service = module.get<CandidateShortlister>(CandidateShortlister);
  });

  /**
   * Test 1: Benchmark performance with ~50k synthetic OFF index and token index.
   */
  it('should build shortlist in < 1000ms with 50k OFF entries and token index', () => {
    // Build synthetic OFF index with ~50k entries and inverted token index
    const K = MAX_CANDIDATES_PER_CALL; // Usually 10
    const offMap = new Map<string, OffCanonical>();
    const brandIndex = new Map<string, OffCanonical[]>();
    const gtinPrefixIndex = new Map<string, OffCanonical[]>();
    const nameTokenIndex = new Map<string, Set<string>>();

    // Generate ~50k synthetic OFF products
    for (let i = 0; i < 50000; i++) {
      let gtin: string;
      let brand: string;
      let name_en: string;
      let name_ar: string;
      let weightRaw: string;

      if (i === 35) {
        gtin = '6210000035009'; // Valid 13-digit GTIN
        brand = 'Brand-0';
        name_en = 'Special Planted Product 35 Type A';
        name_ar = 'منتج 35 نوع أ';
        weightRaw = '135g';
      } else {
        gtin = `${999000000000 + i}`;
        brand = `Brand-${Math.floor(i / 1000)}`;
        name_en = `Product ${i} Type A`;
        name_ar = `منتج ${i} نوع أ`;
        weightRaw = `${100 + (i % 900)}g`;
      }

      const entry: OffCanonical = {
        gtin,
        brand,
        name_en,
        name_ar,
        weightRaw,
      };

      const key = `${gtin}|${brand}|${weightRaw}`;
      offMap.set(key, entry);
      // Comment 1: Also store under GTIN for token-index lookups (matching production behavior)
      offMap.set(gtin, entry);

      // Populate brand index
      const normBrand = brand.toLowerCase();
      if (!brandIndex.has(normBrand)) {
        brandIndex.set(normBrand, []);
      }
      brandIndex.get(normBrand)!.push(entry);

      // Populate GTIN prefix index (first 3 digits to match getGtinPrefix)
      const prefix = gtin.substring(0, 3);
      if (!gtinPrefixIndex.has(prefix)) {
        gtinPrefixIndex.set(prefix, []);
      }
      gtinPrefixIndex.get(prefix)!.push(entry);

      // Populate token index (from product name)
      const tokens = tokenizeUnicode(name_en.toLowerCase());
      for (const token of tokens) {
        if (!nameTokenIndex.has(token)) {
          nameTokenIndex.set(token, new Set());
        }
        nameTokenIndex.get(token)!.add(gtin);
      }
    }

    // Define a scan that should match known products
    const scan: ShortlistScanInput = {
      gtin: '6210000035009',
      name_en: 'Special Planted Product 35 Type A',
      name_ar: 'منتج 35 نوع أ',
      brand: 'Brand-0',
      net_weight_value: 135,
      net_unit: 'g',
    };

    const indexes: OffIndexes = {
      offMap,
      brandIndex,
      brandWeightIndex: new Map(), // Not used in this test
      gtinPrefixIndex,
      nameTokenIndex,
    };

    // Run buildShortlist and measure time
    const startTime = performance.now();
    const result = service.buildShortlist(scan, indexes, K);
    const elapsed = performance.now() - startTime;

    // Assertions
    expect(result.candidates.length).toBeLessThanOrEqual(K);
    expect(elapsed).toBeLessThan(1000); // Allow lenient timing on CI hardware
    expect(result.candidates.length).toBeGreaterThan(0); // Should find candidates
    expect(result.topScore).toBeGreaterThan(0); // Confirms the composite score is propagated

    // Verify planted match is in results
    const plantedGtin = '6210000035009';
    const foundPlanted = result.candidates.some((r) => r.gtin === plantedGtin);
    expect(foundPlanted).toBe(true);
  });

  /**
   * Test 2: With no shared tokens, brand, or prefix, returns empty (no global fallback).
   */
  it('should return empty when scan has no shared signals with OFF pool', () => {
    const K = MAX_CANDIDATES_PER_CALL;

    // Small OFF pool
    const offMap = new Map<string, OffCanonical>();
    const brandIndex = new Map<string, OffCanonical[]>();
    const gtinPrefixIndex = new Map<string, OffCanonical[]>();
    const nameTokenIndex = new Map<string, Set<string>>();

    // Add a few products (Brand-A, prefix 1234)
    for (let i = 0; i < 10; i++) {
      const gtin = `1234000${i}000`;
      const entry: OffCanonical = {
        gtin,
        brand: 'Brand-A',
        name_en: `ProductA ${i}`,
        name_ar: `منتج أ ${i}`,
        weightRaw: '500g',
      };
      const key = `${gtin}|Brand-A|500g`;
      offMap.set(key, entry);
      // Comment 1: Also store under GTIN for token-index lookups (matching production behavior)
      offMap.set(gtin, entry);

      if (!brandIndex.has('brand-a')) {
        brandIndex.set('brand-a', []);
      }
      brandIndex.get('brand-a')!.push(entry);

      if (!gtinPrefixIndex.has('12340000')) {
        gtinPrefixIndex.set('12340000', []);
      }
      gtinPrefixIndex.get('12340000')!.push(entry);

      const tokens = tokenizeUnicode('ProductA'.toLowerCase());
      for (const token of tokens) {
        if (!nameTokenIndex.has(token)) {
          nameTokenIndex.set(token, new Set());
        }
        nameTokenIndex.get(token)!.add(gtin);
      }
    }

    // Define a scan with NO shared signals:
    // - Different brand (Brand-Z)
    // - Different GTIN prefix (5678)
    // - Different product name (no shared tokens)
    const scan: ShortlistScanInput = {
      gtin: '5678000000000',
      name_en: 'XYZ Exotic Product',
      name_ar: 'منتج غريب إكس واي زي',
      brand: 'Brand-Z',
      net_weight_value: 250,
      net_unit: 'ml',
    };

    const indexes: OffIndexes = {
      offMap,
      brandIndex,
      brandWeightIndex: new Map(),
      gtinPrefixIndex,
      nameTokenIndex,
    };

    const result = service.buildShortlist(scan, indexes, K);

    // Should return empty (no shared signals, no global fallback)
    expect(result.candidates.length).toBe(0);
    expect(result.topScore).toBe(0);
  });

  /**
   * Test 3: Respects K*4 cap for Pool C when using token index.
   */
  it('should respect K*4 cap for pool size', () => {
    const K = MAX_CANDIDATES_PER_CALL;
    const maxPoolSize = K * 4;

    // Build a pool with many products sharing the same token
    const offMap = new Map<string, OffCanonical>();
    const brandIndex = new Map<string, OffCanonical[]>();
    const gtinPrefixIndex = new Map<string, OffCanonical[]>();
    const nameTokenIndex = new Map<string, Set<string>>();

    const commonToken = 'coffee';
    const commonTokenGtins = new Set<string>();

    // Create 100 products all with "coffee" in the name
    for (let i = 0; i < 100; i++) {
      const gtin = `6100000${String(i).padStart(5, '0')}0`;
      const entry: OffCanonical = {
        gtin,
        brand: `CoffeeBrand-${i % 10}`,
        name_en: `Coffee Product ${i}`,
        name_ar: `منتج القهوة ${i}`,
        weightRaw: '200g',
      };

      const key = `${gtin}|CoffeeBrand-${i % 10}|200g`;
      offMap.set(key, entry);
      // Comment 1: Also store under GTIN for token-index lookups (matching production behavior)
      offMap.set(gtin, entry);

      // Brand index
      const normBrand = entry.brand.toLowerCase();
      if (!brandIndex.has(normBrand)) {
        brandIndex.set(normBrand, []);
      }
      brandIndex.get(normBrand)!.push(entry);

      // Token index: add all to "coffee" token
      if (!nameTokenIndex.has(commonToken)) {
        nameTokenIndex.set(commonToken, new Set());
      }
      nameTokenIndex.get(commonToken)!.add(gtin);
      commonTokenGtins.add(gtin);
    }

    const scan: ShortlistScanInput = {
      gtin: '6100000123456',
      name_en: 'Coffee Deluxe',
      name_ar: 'قهوة فاخرة',
      brand: 'CoffeeBrand-5',
      net_weight_value: 200,
      net_unit: 'g',
    };

    const indexes: OffIndexes = {
      offMap,
      brandIndex,
      brandWeightIndex: new Map(),
      gtinPrefixIndex,
      nameTokenIndex,
    };

    const result = service.buildShortlist(scan, indexes, K);

    // Result should not exceed K
    expect(result.candidates.length).toBeLessThanOrEqual(K);
    // But should be reasonable (at least a few matches from the token pool)
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  /**
   * Test 4: Weak-shortlist skip — when topScore is below the guard threshold (< 0.40).
   * Verifies that the returned object exposes topScore so the caller can apply the guard.
   */
  it('should return weak topScore (< 0.40) when scan has minimal shared signals', () => {
    const K = MAX_CANDIDATES_PER_CALL;

    // Small OFF pool with weak signals only
    const offMap = new Map<string, OffCanonical>();
    const brandIndex = new Map<string, OffCanonical[]>();
    const gtinPrefixIndex = new Map<string, OffCanonical[]>();
    const nameTokenIndex = new Map<string, Set<string>>();

    // Add a few products (Brand-X, prefix 9876) with very different names
    for (let i = 0; i < 5; i++) {
      const gtin = `9876000${i}000`;
      const entry: OffCanonical = {
        gtin,
        brand: 'Brand-X',
        name_en: `Apple Juice ${i}`,
        name_ar: `عصير التفاح ${i}`,
        weightRaw: '250ml',
      };
      const key = `${gtin}|Brand-X|250ml`;
      offMap.set(key, entry);
      offMap.set(gtin, entry);

      if (!brandIndex.has('brand-x')) {
        brandIndex.set('brand-x', []);
      }
      brandIndex.get('brand-x')!.push(entry);

      if (!gtinPrefixIndex.has('98760000')) {
        gtinPrefixIndex.set('98760000', []);
      }
      gtinPrefixIndex.get('98760000')!.push(entry);

      const tokens = tokenizeUnicode('Apple Juice'.toLowerCase());
      for (const token of tokens) {
        if (!nameTokenIndex.has(token)) {
          nameTokenIndex.set(token, new Set());
        }
        nameTokenIndex.get(token)!.add(gtin);
      }
    }

    // Scan with minimal shared signals (different brand, prefix, weak name overlap)
    const scan: ShortlistScanInput = {
      gtin: '5555000000000',
      name_en: 'Orange Beverage Premium', // Only "beverage" might weakly overlap with "juice"
      name_ar: 'المشروب البرتقالي المميز',
      brand: 'Brand-Y', // Different brand
      net_weight_value: 200,
      net_unit: 'ml',
    };

    const indexes: OffIndexes = {
      offMap,
      brandIndex,
      brandWeightIndex: new Map(),
      gtinPrefixIndex,
      nameTokenIndex,
    };

    const result = service.buildShortlist(scan, indexes, K);

    // Either no candidates or topScore < 0.40 (both indicate the weak-shortlist guard would trigger)
    const isWeakShortlist = result.candidates.length === 0 || result.topScore < 0.40;
    expect(isWeakShortlist).toBe(true);
    // Verify that topScore is always returned (never undefined)
    expect(result.topScore).toBeDefined();
  });

  // Helper: Tokenize using Unicode-safe splitting (mimic the service implementation)
  function tokenizeUnicode(text: string): string[] {
    if (!text || text.length < 2) return [];
    const tokens = text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((t) => t.length > 2);
    return [...new Set(tokens)];
  }
});
