import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GtinMatchService } from './gtin-match.service';
import { VertexGeminiGtinMatchProvider } from './vertex-gemini-gtin-match.provider';
import { GoogleAiGeminiGtinMatchProvider } from './google-ai-gemini-gtin-match.provider';
import { Logger } from '@nestjs/common';

describe('GtinMatchService (Comment 1: Vertex Circuit Breaker)', () => {
  let service: GtinMatchService;
  let vertexProvider: VertexGeminiGtinMatchProvider;
  let googleAiProvider: GoogleAiGeminiGtinMatchProvider;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GtinMatchService,
        {
          provide: VertexGeminiGtinMatchProvider,
          useValue: {
            name: 'VertexAIGeminiGtinMatch',
            pickBestMatch: jest.fn(),
            resolveBrandAlias: jest.fn(),
            healthCheck: jest.fn(),
          },
        },
        {
          provide: GoogleAiGeminiGtinMatchProvider,
          useValue: {
            name: 'GoogleAIGeminiGtinMatch',
            pickBestMatch: jest.fn(),
            resolveBrandAlias: jest.fn(),
            healthCheck: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<GtinMatchService>(GtinMatchService);
    vertexProvider = module.get<VertexGeminiGtinMatchProvider>(
      VertexGeminiGtinMatchProvider,
    );
    googleAiProvider = module.get<GoogleAiGeminiGtinMatchProvider>(
      GoogleAiGeminiGtinMatchProvider,
    );
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('disableVertexForCurrentRun', () => {
    it('should set the circuit breaker flag', () => {
      // Call the method
      service.disableVertexForCurrentRun();

      // After disabling Vertex, pickBestMatch should skip Vertex and use Google AI directly
      const input = {
        scan: {
          id: 'test-scan-1',
          gtin: '1234567890123',
          name_en: 'Test Product',
          brand: 'Test Brand',
        },
        candidates: [
          {
            gtin: '9876543210987',
            name_en: 'Candidate 1',
            brand: 'Candidate Brand',
          },
        ],
      };

      (googleAiProvider.pickBestMatch as jest.Mock).mockResolvedValueOnce({
        verdict: {
          matched_gtin: '9876543210987',
          confidence: 0.9,
          rationale: 'name_match_high_confidence',
        },
        provider: 'GoogleAIGeminiGtinMatch',
        model: 'gemini-1.5-flash',
      });

      // When pickBestMatch is called, it should skip Vertex and use Google AI
      return service.pickBestMatch(input).then((result) => {
        // Verify that Vertex provider was not called
        expect(vertexProvider.pickBestMatch).not.toHaveBeenCalled();
        // Verify that Google AI provider was called
        expect(googleAiProvider.pickBestMatch).toHaveBeenCalledWith(input);
        // Verify the result is from Google AI
        expect(result.provider).toBe('GoogleAIGeminiGtinMatch');
        expect(result.verdict.matched_gtin).toBe('9876543210987');
      });
    });

    it('should skip Vertex on subsequent calls after being disabled', async () => {
      // Disable Vertex
      service.disableVertexForCurrentRun();

      const input = {
        scan: {
          id: 'test-scan-2',
          gtin: '1234567890124',
          name_en: 'Another Test Product',
          brand: 'Another Brand',
        },
        candidates: [
          {
            gtin: '9876543210988',
            name_en: 'Candidate 2',
            brand: 'Candidate Brand 2',
          },
        ],
      };

      (googleAiProvider.pickBestMatch as jest.Mock).mockResolvedValueOnce({
        verdict: {
          matched_gtin: null,
          confidence: 0,
          rationale: 'no_confident_match',
        },
        provider: 'GoogleAIGeminiGtinMatch',
        model: 'gemini-1.5-flash',
      });

      const result = await service.pickBestMatch(input);

      // Verify Vertex was still not called
      expect(vertexProvider.pickBestMatch).not.toHaveBeenCalled();
      // Verify Google AI was called again
      expect(googleAiProvider.pickBestMatch).toHaveBeenCalled();
    });
  });

  describe('healthCheckVertex', () => {
    it('should return true when Vertex health check succeeds', async () => {
      (vertexProvider.healthCheck as jest.Mock).mockResolvedValueOnce(true);

      const result = await service.healthCheckVertex();

      expect(result).toBe(true);
      expect(vertexProvider.healthCheck).toHaveBeenCalled();
    });

    it('should return false when Vertex health check fails', async () => {
      (vertexProvider.healthCheck as jest.Mock).mockResolvedValueOnce(false);

      const result = await service.healthCheckVertex();

      expect(result).toBe(false);
      expect(vertexProvider.healthCheck).toHaveBeenCalled();
    });

    it('should return false when Vertex health check throws an error', async () => {
      (vertexProvider.healthCheck as jest.Mock).mockRejectedValueOnce(
        new Error('Vertex connection failed'),
      );

      const result = await service.healthCheckVertex();

      expect(result).toBe(false);
    });

    it('should return true if health check method is not available', async () => {
      const serviceWithoutHealthCheck = new GtinMatchService(
        configService,
        { name: 'VertexAIGeminiGtinMatch' } as any,
        googleAiProvider,
      );

      const result = await serviceWithoutHealthCheck.healthCheckVertex();

      expect(result).toBe(true); // Assumes healthy if method not available
    });
  });

  describe('pickBestMatch with permanent auth error', () => {
    it('should disable Vertex on permanent auth error and fallback to Google AI', async () => {
      const input = {
        scan: {
          id: 'test-scan-3',
          gtin: '1234567890125',
          name_en: 'Test with Auth Error',
          brand: 'Test Brand 3',
        },
        candidates: [
          {
            gtin: '9876543210989',
            name_en: 'Candidate 3',
            brand: 'Candidate Brand 3',
          },
        ],
      };

      // Vertex provider throws auth error
      (vertexProvider.pickBestMatch as jest.Mock).mockRejectedValueOnce(
        new Error(
          'Vertex AI provider configuration error (GTIN matching). ' +
            'Verify GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT_ID, and VERTEX_LOCATION are correctly set.',
        ),
      );

      // Google AI provider returns success
      (googleAiProvider.pickBestMatch as jest.Mock).mockResolvedValueOnce({
        verdict: {
          matched_gtin: '9876543210989',
          confidence: 0.85,
          rationale: 'brand_and_name_match',
        },
        provider: 'GoogleAIGeminiGtinMatch',
        model: 'gemini-1.5-flash',
      });

      const result = await service.pickBestMatch(input);

      // Verify Vertex was tried first
      expect(vertexProvider.pickBestMatch).toHaveBeenCalledWith(input);
      // Verify Google AI was called as fallback
      expect(googleAiProvider.pickBestMatch).toHaveBeenCalledWith(input);
      // Verify the result is from Google AI
      expect(result.provider).toBe('GoogleAIGeminiGtinMatch');

      // On subsequent calls, Vertex should be skipped due to circuit breaker
      (vertexProvider.pickBestMatch as jest.Mock).mockClear();
      (googleAiProvider.pickBestMatch as jest.Mock).mockClear();
      (googleAiProvider.pickBestMatch as jest.Mock).mockResolvedValueOnce({
        verdict: {
          matched_gtin: null,
          confidence: 0,
          rationale: 'no_match',
        },
        provider: 'GoogleAIGeminiGtinMatch',
        model: 'gemini-1.5-flash',
      });

      await service.pickBestMatch(input);

      // Verify Vertex was NOT tried on subsequent call
      expect(vertexProvider.pickBestMatch).not.toHaveBeenCalled();
      // Verify Google AI was called
      expect(googleAiProvider.pickBestMatch).toHaveBeenCalled();
    });
  });

  describe('OllamaGtinMatchProvider throws TransientProviderFailureException', () => {
    let ollamaProvider: any;

    beforeEach(async () => {
      // Create a new test module with Ollama mode enabled
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GtinMatchService,
          {
            provide: VertexGeminiGtinMatchProvider,
            useValue: {
              name: 'VertexAIGeminiGtinMatch',
              pickBestMatch: jest.fn(),
              resolveBrandAlias: jest.fn(),
              healthCheck: jest.fn(),
            },
          },
          {
            provide: GoogleAiGeminiGtinMatchProvider,
            useValue: {
              name: 'GoogleAIGeminiGtinMatch',
              pickBestMatch: jest.fn(),
              resolveBrandAlias: jest.fn(),
              healthCheck: jest.fn(),
            },
          },
          {
            provide: 'OllamaGtinMatchProvider',
            useValue: {
              name: 'Ollama',
              pickBestMatch: jest.fn(),
              resolveBrandAlias: jest.fn(),
              healthCheck: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'GTIN_AI_PROVIDER') {
                  return 'ollama';
                }
                return undefined;
              }),
            },
          },
        ],
      }).compile();

      service = module.get<GtinMatchService>(GtinMatchService);
      ollamaProvider = module.get('OllamaGtinMatchProvider');
      configService = module.get<ConfigService>(ConfigService);
    });

    it('pickBestMatch should handle Ollama TransientProviderFailureException and return all_providers_failed', async () => {
      const { TransientProviderFailureException } = await import('./transient-provider-failure.exception');

      const input = {
        scan: {
          id: 'test-scan-ollama-1',
          gtin: '1234567890123',
          name_en: 'Test Product',
          brand: 'Test Brand',
        },
        candidates: [
          {
            gtin: '9876543210987',
            name_en: 'Candidate 1',
            brand: 'Candidate Brand',
          },
        ],
      };

      // Mock Ollama provider to throw TransientProviderFailureException
      (ollamaProvider.pickBestMatch as jest.Mock).mockRejectedValueOnce(
        new TransientProviderFailureException('timeout', 'Ollama'),
      );

      const result = await service.pickBestMatch(input);

      // Verify that the result has all_providers_failed rationale
      expect(result.verdict.rationale).toBe('all_providers_failed');
      expect(result.provider).toBe('internal');
      expect(result.model).toBe('no-op');
    });

    it('resolveBrandAlias should handle Ollama TransientProviderFailureException and return all_providers_failed', async () => {
      const { TransientProviderFailureException } = await import('./transient-provider-failure.exception');

      const knownOffBrandSlugs = ['brand-1', 'brand-2'];

      // Mock Ollama provider to throw TransientProviderFailureException
      (ollamaProvider.resolveBrandAlias as jest.Mock).mockRejectedValueOnce(
        new TransientProviderFailureException('timeout', 'Ollama'),
      );

      const result = await service.resolveBrandAlias('Test Brand', knownOffBrandSlugs);

      // Verify that the result has all_providers_failed rationale
      expect(result.verdict.rationale).toBe('all_providers_failed');
      expect(result.provider).toBe('internal');
      expect(result.model).toBe('no-op');
    });
  });
});
