import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import {
  LlmGtinMatchProvider,
  AiGtinMatchInput,
  AiGtinMatchVerdict,
  AiGtinMatchResult,
  AiBrandAliasInput,
  AiBrandAliasVerdict,
  AiBrandAliasResult,
  MAX_CANDIDATES_PER_CALL,
  MAX_BRAND_SLUGS_PER_CALL,
  validateVerdictAgainstCandidates,
  validateBrandAliasVerdict,
} from './llm-gtin-match-provider.interface';
import { GeminiQuotaExceededException } from '../../scan/exceptions/gemini-quota-exceeded.exception';
import { TransientProviderFailureException } from './transient-provider-failure.exception';
import { getPrompt, getBrandAliasPrompt } from './gtin-match-prompts';

@Injectable()
export class GoogleAiGeminiGtinMatchProvider implements LlmGtinMatchProvider {
  private readonly logger = new Logger(GoogleAiGeminiGtinMatchProvider.name);
  private genAI: GoogleGenerativeAI;
  private requestTimeoutMs: number;
  private preferFallbackUntil: number = 0;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    // Comment 1: Parse request timeout from environment or use default (30s for pickBestMatch/resolveBrandAlias, 10s for healthCheck)
    this.requestTimeoutMs = parseInt(this.configService.get<string>('GTIN_AI_REQUEST_TIMEOUT_MS') ?? '30000', 10);
  }

  get name(): string {
    return 'GoogleAIGeminiGtinMatch';
  }

  /**
   * Comment 1: Bounded timeout wrapper that enforces a maximum duration for async operations.
   * Rejects with a timeout error if the operation exceeds the timeout.
   * Used to prevent hanging Gemini API calls.
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => {
          const err = new Error(`${operationName} exceeded timeout of ${timeoutMs}ms`);
          (err as any).isTimeoutError = true;
          reject(err);
        }, timeoutMs)
      ),
    ]);
  }

  private buildResponseSchema(): any {
    return {
      type: SchemaType.OBJECT,
      properties: {
        matched_gtin: {
          type: SchemaType.STRING,
          nullable: true,
          description:
            'The GTIN of the best-matching candidate, or null if no match.',
        },
        confidence: {
          type: SchemaType.NUMBER,
          description: 'Confidence score from 0.0 to 1.0.',
        },
        rationale: {
          type: SchemaType.STRING,
          description:
            'A controlled-vocabulary token explaining the decision. Accept tokens: name_match_high_confidence, weight_mismatch_minor (≤ ±15%, allowed to match). Reject tokens (must set matched_gtin: null unless strict same-SKU signal present): weight_mismatch_major (> ±15%), package_mismatch_major, flavor_mismatch, variant_mismatch, form_mismatch, brand_mismatch, no_candidates, transient_provider_failure, all_providers_failed. Other explanatory tokens may follow the primary token.',
        },
        enrichment_hints: {
          type: SchemaType.OBJECT,
          nullable: true,
          properties: {
            name_en: {
              type: SchemaType.BOOLEAN,
              nullable: true,
              description:
                'true if candidate name_en is significantly better than scan name_en',
            },
            name_ar: {
              type: SchemaType.BOOLEAN,
              nullable: true,
              description:
                'true if candidate name_ar is significantly better than scan name_ar',
            },
            brand: {
              type: SchemaType.BOOLEAN,
              nullable: true,
              description:
                'true if candidate brand is significantly better than scan brand',
            },
          },
        },
      },
      required: ['matched_gtin', 'confidence', 'rationale'],
    };
  }

  async pickBestMatch(
    input: AiGtinMatchInput,
    attempt: number = 1,
    useFallbackModel = false,
  ): Promise<AiGtinMatchResult> {
    // Comment 4: Check for GTIN_AI_MATCH_FALLBACK_MODEL or GEMINI_FALLBACK_MODEL to enable fallback
    const primaryModelName = this.configService.get<string>('GTIN_AI_MATCH_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';
    const fallbackModelName = 
      this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ||
      this.configService.get<string>('GEMINI_FALLBACK_MODEL') ||
      'gemini-1.5-flash-8b';
    const hasConfiguredFallbackModel = 
      !!(this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ||
         this.configService.get<string>('GEMINI_FALLBACK_MODEL'));
    const modelName = useFallbackModel ? fallbackModelName : primaryModelName;
    const usedEnvVar = useFallbackModel 
      ? (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ? 'GTIN_AI_MATCH_FALLBACK_MODEL' : 'GEMINI_FALLBACK_MODEL')
      : 'GTIN_AI_MATCH_MODEL';

    // Check preferFallbackUntil soft-latency degrade window (only if fallback model is explicitly configured)
    if (Date.now() < this.preferFallbackUntil && !useFallbackModel && hasConfiguredFallbackModel) {
      return this.pickBestMatch(input, attempt, true);
    }

    try {
      this.logger.log(
        `Calling Google AI Gemini API (${modelName}, env: ${usedEnvVar}) for GTIN matching (Attempt ${attempt})...`,
      );

      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.buildResponseSchema(),
          temperature: 0,
        },
      });

      // Record latency for soft-latency degradation
      const callStart = Date.now();

      // Comment 1: Wrap API call with bounded timeout to prevent hanging
      const result = await this.withTimeout(
        model.generateContent(getPrompt(input)),
        this.requestTimeoutMs,
        'pickBestMatch (Google AI)'
      );
      
      // Check if call was slow and trigger soft-latency degrade (only if fallback model is explicitly configured)
      const elapsed = Date.now() - callStart;
      const latencyDegradeMs = parseInt(this.configService.get<string>('GTIN_AI_MATCH_LATENCY_DEGRADE_MS') ?? '15000', 10);
      if (elapsed >= latencyDegradeMs && !useFallbackModel && hasConfiguredFallbackModel) {
        this.logger.warn(
          `Primary model (${primaryModelName}) responded slowly (${elapsed}ms ≥ ${latencyDegradeMs}ms). Preferring fallback for next 60s.`
        );
        this.preferFallbackUntil = Date.now() + 60_000;
      }
      
      const responseText = result.response.text();
      const verdict = JSON.parse(responseText) as AiGtinMatchVerdict;
      const candidateGtins = input.candidates.map((c) => c.gtin);
      return {
        verdict: validateVerdictAgainstCandidates(verdict, candidateGtins),
        provider: this.name,
        model: modelName,
      };
    } catch (error: any) {
      // Comment 1: Convert timeout errors to transient provider failures
      if (error?.isTimeoutError) {
        this.logger.error(
          `Google AI GTIN matching request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        if (!useFallbackModel &&
          (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') || this.configService.get<string>('GEMINI_FALLBACK_MODEL'))
        ) {
          this.logger.warn(
            `GTIN matching primary model (${primaryModelName}) timed out. Falling back to fallback model (${fallbackModelName}).`,
          );
          return this.pickBestMatch(input, 1, true);
        }
        throw new TransientProviderFailureException(
          `Google AI GTIN matching request timeout after ${this.requestTimeoutMs}ms`,
          this.name,
          error,
        );
      }
      // Check for 503 Service Unavailable (high-demand/transient error)
      const is503Error = error?.status === 503 || error?.statusText === 'Service Unavailable';
      const isHighDemandError = error?.message?.includes('503') || 
        error?.message?.toLowerCase().includes('service unavailable') ||
        error?.message?.toLowerCase().includes('high demand');

      if ((is503Error || isHighDemandError) && attempt <= 2) {
        // Bounded exponential backoff with jitter for 503 errors
        const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        const jitter = Math.random() * 2000; // Up to 2s random jitter
        const delayMs = baseDelay + jitter;
        this.logger.warn(
          `Google AI API returned 503 Service Unavailable (high-demand). Retrying after ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.pickBestMatch(input, attempt + 1, useFallbackModel);
      }

      if (error.errorDetails) {
        // Check for QuotaFailure
        const hasDailyQuotaFailure = error.errorDetails.some((detail: any) => {
          if (detail['@type']?.includes('QuotaFailure') && detail.violations) {
            return detail.violations.some(
              (v: any) =>
                v.quotaId?.includes('PerDay') || v.subject?.includes('PerDay'),
            );
          }
          return false;
        });

        if (hasDailyQuotaFailure) {
          throw new GeminiQuotaExceededException(
            `Google AI ${useFallbackModel ? 'Fallback ' : ''}Gemini GTIN Match Daily Quota Exceeded`,
          );
        }

        // RetryInfo Delay Math
        const retryInfo = error.errorDetails.find((d: any) =>
          d['@type']?.includes('RetryInfo'),
        );
        if (retryInfo && retryInfo.retryDelay) {
          if (attempt <= 2) {
            const delaySec = parseFloat(retryInfo.retryDelay.replace('s', ''));
            // Capped to 15s wait
            const delayMs = Math.min(delaySec * 1000, 15000);
            this.logger.warn(
              `Gemini RetryInfo given. Waiting ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return this.pickBestMatch(input, attempt + 1, useFallbackModel);
          }
        }
      }

      if (
        error.message?.includes('429') ||
        error.message?.includes('exceeded') ||
        error.message?.includes('quota')
      ) {
        // Use exponential backoff + jitter for generic 429
        if (attempt <= 2) {
          const jitter = Math.random() * 1000;
          const delayMs = Math.pow(2, attempt) * 1000 + jitter;
          this.logger.warn(
            `Gemini API Rate Limit/Quota hit. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.pickBestMatch(input, attempt + 1, useFallbackModel);
        }
      }

      if (
        !useFallbackModel &&
        (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') || this.configService.get<string>('GEMINI_FALLBACK_MODEL'))
      ) {
        // Log detailed fallback warning with primary model error info (Comment 4)
        const errorStatus = error?.status || error?.statusText || 'unknown';
        this.logger.warn(
          `GTIN matching primary model (${primaryModelName}) failed: ` +
          `status=${errorStatus}, category=${this.categorizError(error)}. ` +
          `Falling back to fallback model (${fallbackModelName}).`,
        );
        return this.pickBestMatch(input, 1, true);
      }

      // If all retries exhausted, surface transient-provider-failure reason
      if (is503Error || isHighDemandError) {
        this.logger.error(
          `Google AI GTIN matching exhausted retries for 503 Service Unavailable error after ${attempt} attempts.`,
          error,
        );
        return {
          verdict: {
            matched_gtin: null,
            confidence: 0,
            rationale: 'transient_provider_failure',
          },
          provider: this.name,
          model: modelName,
        };
      }

      this.logger.error('Google AI Gemini GTIN matching failed:', error);
      throw error;
    }
  }

  /**
   * Categorize error type for logging without exposing sensitive details.
   */
  private categorizError(error: any): string {
    if (!error) return 'unknown';
    if (error.status === 503 || error.message?.includes('503')) return '503_service_unavailable';
    if (error.status === 429 || error.message?.includes('429')) return '429_rate_limit';
    if (error.message?.includes('quota') || error.message?.includes('exceeded')) return 'quota_exceeded';
    if (error.message?.includes('timeout')) return 'timeout';
    if (error.message?.includes('auth')) return 'auth_error';
    return 'other_error';
  }

  private buildBrandAliasResponseSchema(): any {
    return {
      type: SchemaType.OBJECT,
      properties: {
        slug: {
          type: SchemaType.STRING,
          nullable: true,
          description: 'The matched OFF brand slug, or null if no confident match.',
        },
        confidence: {
          type: SchemaType.NUMBER,
          description: 'Confidence score from 0.0 to 1.0.',
        },
        rationale: {
          type: SchemaType.STRING,
          description: 'Human-readable explanation of the decision or reason for no match.',
        },
      },
      required: ['slug', 'confidence', 'rationale'],
    };
  }

  async resolveBrandAlias(
    input: AiBrandAliasInput,
    attempt: number = 1,
    useFallbackModel = false,
  ): Promise<AiBrandAliasResult> {
    // Comment 4: Check for GTIN_AI_MATCH_FALLBACK_MODEL or GEMINI_FALLBACK_MODEL to enable fallback
    const primaryModelName = this.configService.get<string>('GTIN_AI_MATCH_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';
    const fallbackModelName = 
      this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ||
      this.configService.get<string>('GEMINI_FALLBACK_MODEL') ||
      'gemini-1.5-flash-8b';
    const hasConfiguredFallbackModel = 
      !!(this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ||
         this.configService.get<string>('GEMINI_FALLBACK_MODEL'));
    const modelName = useFallbackModel ? fallbackModelName : primaryModelName;
    const usedEnvVar = useFallbackModel 
      ? (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') ? 'GTIN_AI_MATCH_FALLBACK_MODEL' : 'GEMINI_FALLBACK_MODEL')
      : 'GTIN_AI_MATCH_MODEL';

    // Check preferFallbackUntil soft-latency degrade window (only if fallback model is explicitly configured)
    if (Date.now() < this.preferFallbackUntil && !useFallbackModel && hasConfiguredFallbackModel) {
      return this.resolveBrandAlias(input, attempt, true);
    }

    try {
      this.logger.log(
        `Calling Google AI Gemini API (${modelName}, env: ${usedEnvVar}) for brand alias resolution (Attempt ${attempt})...`,
      );

      const model = this.genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.buildBrandAliasResponseSchema(),
          temperature: 0,
        },
      });

      // Record latency for soft-latency degradation
      const callStart = Date.now();

      // Comment 1: Wrap API call with bounded timeout to prevent hanging
      const result = await this.withTimeout(
        model.generateContent(getBrandAliasPrompt(input)),
        this.requestTimeoutMs,
        'resolveBrandAlias (Google AI)'
      );
      
      // Check if call was slow and trigger soft-latency degrade (only if fallback model is explicitly configured)
      const elapsed = Date.now() - callStart;
      const latencyDegradeMs = parseInt(this.configService.get<string>('GTIN_AI_MATCH_LATENCY_DEGRADE_MS') ?? '15000', 10);
      if (elapsed >= latencyDegradeMs && !useFallbackModel && hasConfiguredFallbackModel) {
        this.logger.warn(
          `Primary model (${primaryModelName}) responded slowly (${elapsed}ms ≥ ${latencyDegradeMs}ms). Preferring fallback for next 60s.`
        );
        this.preferFallbackUntil = Date.now() + 60_000;
      }
      
      const responseText = result.response.text();
      const verdict = JSON.parse(responseText) as AiBrandAliasVerdict;
      return {
        verdict: validateBrandAliasVerdict(verdict, input.knownOffBrandSlugs),
        provider: this.name,
        model: modelName,
      };
    } catch (error: any) {
      // Comment 1: Convert timeout errors to transient provider failures
      if (error?.isTimeoutError) {
        this.logger.error(
          `Google AI brand alias resolution request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        if (!useFallbackModel &&
          (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') || this.configService.get<string>('GEMINI_FALLBACK_MODEL'))
        ) {
          this.logger.warn(
            `Brand alias resolution primary model (${primaryModelName}) timed out. Falling back to fallback model (${fallbackModelName}).`,
          );
          return this.resolveBrandAlias(input, 1, true);
        }
        throw new TransientProviderFailureException(
          `Google AI brand alias resolution request timeout after ${this.requestTimeoutMs}ms`,
          this.name,
          error,
        );
      }
      // Check for 503 Service Unavailable (high-demand/transient error)
      const is503Error = error?.status === 503 || error?.statusText === 'Service Unavailable';
      const isHighDemandError = error?.message?.includes('503') || 
        error?.message?.toLowerCase().includes('service unavailable') ||
        error?.message?.toLowerCase().includes('high demand');

      if ((is503Error || isHighDemandError) && attempt <= 2) {
        // Bounded exponential backoff with jitter for 503 errors
        const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s...
        const jitter = Math.random() * 2000; // Up to 2s random jitter
        const delayMs = baseDelay + jitter;
        this.logger.warn(
          `Google AI API returned 503 Service Unavailable (high-demand). Retrying after ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.resolveBrandAlias(input, attempt + 1, useFallbackModel);
      }

      if (error.errorDetails) {
        // Check for QuotaFailure
        const hasDailyQuotaFailure = error.errorDetails.some((detail: any) => {
          if (detail['@type']?.includes('QuotaFailure') && detail.violations) {
            return detail.violations.some(
              (v: any) =>
                v.quotaId?.includes('PerDay') || v.subject?.includes('PerDay'),
            );
          }
          return false;
        });

        if (hasDailyQuotaFailure) {
          throw new GeminiQuotaExceededException(
            `Google AI ${useFallbackModel ? 'Fallback ' : ''}Gemini Brand Alias Daily Quota Exceeded`,
          );
        }

        // RetryInfo Delay Math
        const retryInfo = error.errorDetails.find((d: any) =>
          d['@type']?.includes('RetryInfo'),
        );
        if (retryInfo && retryInfo.retryDelay) {
          if (attempt <= 2) {
            const delaySec = parseFloat(retryInfo.retryDelay.replace('s', ''));
            // Capped to 15s wait
            const delayMs = Math.min(delaySec * 1000, 15000);
            this.logger.warn(
              `Gemini RetryInfo given. Waiting ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return this.resolveBrandAlias(input, attempt + 1, useFallbackModel);
          }
        }
      }

      if (
        error.message?.includes('429') ||
        error.message?.includes('exceeded') ||
        error.message?.includes('quota')
      ) {
        // Use exponential backoff + jitter for generic 429
        if (attempt <= 2) {
          const jitter = Math.random() * 1000;
          const delayMs = Math.pow(2, attempt) * 1000 + jitter;
          this.logger.warn(
            `Gemini API Rate Limit/Quota hit. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return this.resolveBrandAlias(input, attempt + 1, useFallbackModel);
        }
      }

      if (
        !useFallbackModel &&
        (this.configService.get<string>('GTIN_AI_MATCH_FALLBACK_MODEL') || this.configService.get<string>('GEMINI_FALLBACK_MODEL'))
      ) {
        // Log detailed fallback warning with primary model error info (Comment 4)
        const errorStatus = error?.status || error?.statusText || 'unknown';
        this.logger.warn(
          `Brand alias resolution primary model (${primaryModelName}) failed: ` +
          `status=${errorStatus}, category=${this.categorizError(error)}. ` +
          `Falling back to fallback model (${fallbackModelName}).`,
        );
        return this.resolveBrandAlias(input, 1, true);
      }

      // If all retries exhausted, surface transient-provider-failure reason
      if (is503Error || isHighDemandError) {
        this.logger.error(
          `Google AI brand alias resolution exhausted retries for 503 Service Unavailable error after ${attempt} attempts.`,
          error,
        );
        return {
          verdict: {
            slug: null,
            confidence: 0,
            rationale: 'transient_provider_failure',
          },
          provider: this.name,
          model: modelName,
        };
      }

      this.logger.error('Google AI Gemini brand alias resolution failed:', error);
      throw error;
    }
  }

  /**
   * Comment 3: Health-check method to verify Google AI credentials and model availability.
   * Returns true if Google AI is healthy and credentials are valid, false on any error.
   * Never throws; logs errors instead.
   * Comment 1: Uses a shorter timeout (10s) for health checks to fail fast.
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.log('Running Google AI health check (credentials and model availability)...');
      
      // Get the configured primary model
      const model = this.configService.get<string>('GTIN_AI_MATCH_MODEL') ||
                    this.configService.get<string>('GEMINI_MODEL') ||
                    'gemini-1.5-flash';
      
      // Attempt a trivial API call to verify credentials and model availability
      // This tests authentication without consuming significant quota
      const generativeModel = this.genAI.getGenerativeModel({
        model: model,
      });

      // Comment 1: Wrap health check with shorter timeout (10s) to fail fast
      const result = await this.withTimeout(
        generativeModel.generateContent('Acknowledge that you are working. Reply with only: OK'),
        10000, // 10s timeout for health checks
        'healthCheck (Google AI)'
      );

      if (result && result.response) {
        this.logger.log('Google AI health check passed: credentials and model are available.');
        return true;
      } else {
        this.logger.warn('Google AI health check failed: no response from model.');
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google AI health check failed: ${message}`);
      return false;
    }
  }
}
