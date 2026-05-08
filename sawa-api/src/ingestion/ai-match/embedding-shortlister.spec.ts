import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingShortlister } from './embedding-shortlister';
import { EMBEDDING_PROVIDER_TOKEN, EmbeddingProvider } from './embedding-provider.interface';
import { OffCanonical } from '../open-food-facts.service';
import { OffIndexes, ShortlistScanInput } from './candidate-shortlister';

describe('EmbeddingShortlister', () => {
  let module: TestingModule;
  let shortlister: EmbeddingShortlister;
  let mockEmbeddingProvider: Partial<EmbeddingProvider>;

  beforeEach(async () => {
    // Mock embedding provider
    mockEmbeddingProvider = {
      embedQuery: jest.fn(async () => {
        // Return synthetic normalized vector for testing
        const vec = new Float32Array(768);
        for (let i = 0; i < 768; i++) {
          vec[i] = Math.random() * 0.1; // Small random values
        }
        // Normalize
        let norm = 0;
        for (let i = 0; i < 768; i++) {
          norm += vec[i] * vec[i];
        }
        norm = Math.sqrt(norm);
        for (let i = 0; i < 768; i++) {
          vec[i] /= norm;
        }
        return vec;
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        EmbeddingShortlister,
        {
          provide: EMBEDDING_PROVIDER_TOKEN,
          useValue: mockEmbeddingProvider,
        },
      ],
    }).compile();

    shortlister = module.get<EmbeddingShortlister>(EmbeddingShortlister);
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(shortlister).toBeDefined();
  });

  it('should build a shortlist with planted high-cosine candidate in top-K', async () => {
    // Create synthetic 1000-vector pool with one planted positive
    const dim = 768;
    const poolSize = 1000;
    const offVectors = new Map<string, Float32Array>();

    // Create a synthetic query vector
    const queryVec = new Float32Array(dim);
    for (let i = 0; i < dim; i++) {
      queryVec[i] = Math.random() * 0.1;
    }
    // Normalize query
    let norm = 0;
    for (let i = 0; i < dim; i++) {
      norm += queryVec[i] * queryVec[i];
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < dim; i++) {
      queryVec[i] /= norm;
    }

    // Create pool: random vectors except index 500 which is a copy of queryVec
    const offMap = new Map<string, OffCanonical>();
    for (let i = 0; i < poolSize; i++) {
      const gtin = `622000000${String(i).padStart(6, '0')}`;
      let vector: Float32Array;

      if (i === 500) {
        // Planted positive: copy of query vector
        vector = new Float32Array(queryVec);
      } else {
        // Random vector
        vector = new Float32Array(dim);
        for (let j = 0; j < dim; j++) {
          vector[j] = Math.random() * 0.1;
        }
        // Normalize
        let v_norm = 0;
        for (let j = 0; j < dim; j++) {
          v_norm += vector[j] * vector[j];
        }
        v_norm = Math.sqrt(v_norm);
        for (let j = 0; j < dim; j++) {
          vector[j] /= v_norm;
        }
      }

      offVectors.set(gtin, vector);
      offMap.set(gtin, {
        gtin,
        name_en: `Product ${i}`,
        name_ar: `منتج ${i}`,
        brand: 'TestBrand',
        net_weight_value: 100,
        net_weight_unit: 'g',
      } as OffCanonical);
    }

    // Set index
    shortlister.setIndex(offVectors);

    // Mock embedQuery to return our synthetic queryVec
    (mockEmbeddingProvider.embedQuery as jest.Mock).mockResolvedValue(queryVec);

    // Build indexes
    const indexes: OffIndexes = {
      offMap,
      brandIndex: new Map([['testbrand', Array.from(offMap.values())]]),
      brandWeightIndex: new Map(),
      gtinPrefixIndex: new Map(),
    };

    // Create scan input
    const scan: ShortlistScanInput = {
      gtin: '622000000000000',
      name_en: 'Test Product',
      name_ar: 'منتج اختبار',
      brand: 'TestBrand',
      net_weight_value: 100,
      net_unit: 'g',
    };

    // Measure wall-clock for top-K
    const start = Date.now();
    const result = await shortlister.buildShortlist(scan, indexes, 30);
    const elapsed = Date.now() - start;

    // Assertions
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.cosines.length).toBe(result.candidates.length);
    expect(result.topCosine).toBeGreaterThan(0.9); // Planted positive should have very high cosine
    expect(elapsed).toBeLessThan(50); // Should complete within 50ms
    
    // Check if planted positive is in top-K
    const topGtins = result.candidates.map((c) => c.gtin);
    const plantedGtin = `622000000000${String(500).padStart(3, '0')}`;
    expect(topGtins).toContain(plantedGtin);
  });

  it('should return empty result for empty input', async () => {
    const indexes: OffIndexes = {
      offMap: new Map(),
      brandIndex: new Map(),
      brandWeightIndex: new Map(),
      gtinPrefixIndex: new Map(),
    };

    shortlister.setIndex(new Map());

    const scan: ShortlistScanInput = {
      gtin: '0',
      name_en: '',
      name_ar: '',
      brand: '',
      net_weight_value: null,
      net_unit: null,
    };

    (mockEmbeddingProvider.embedQuery as jest.Mock).mockResolvedValue(
      new Float32Array(768),
    );

    const result = await shortlister.buildShortlist(scan, indexes, 30);

    expect(result.candidates.length).toBe(0);
    expect(result.cosines.length).toBe(0);
    expect(result.topCosine).toBe(0);
  });
});
