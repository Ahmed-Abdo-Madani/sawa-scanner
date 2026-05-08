import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmGtinMatchProvider,
  AiGtinMatchInput,
  AiGtinMatchResult,
  AiBrandAliasInput,
  AiBrandAliasResult,
} from './llm-gtin-match-provider.interface';
import { VertexGeminiGtinMatchProvider } from './vertex-gemini-gtin-match.provider';
import { OllamaGtinMatchProvider } from './ollama-gtin-match.provider';
import { GoogleAiGeminiGtinMatchProvider } from './google-ai-gemini-gtin-match.provider';
import { GeminiQuotaExceededException } from '../../scan/exceptions/gemini-quota-exceeded.exception';
import { TransientProviderFailureException } from './transient-provider-failure.exception';
import { normalizeBrandStrict } from '../../utils/normalization';

/**
 * GTIN entity matching orchestrator.
 * Attempts Vertex first (if GTIN_AI_ENABLE_VERTEX=true), falls back to Google AI on quota exhaustion or permanent auth failures.
 * If Vertex is disabled (GTIN_AI_ENABLE_VERTEX=false or unset), uses Google AI directly.
 * Implements a run-scoped circuit breaker: after first permanent auth/config error on Vertex, disables it
 * for the remainder of the service instance and sends subsequent calls directly to Google AI.
 * Always returns a verdict object; never throws.
 */
@Injectable()
export class GtinMatchService {
  private readonly logger = new Logger(GtinMatchService.name);
  private providers: LlmGtinMatchProvider[] = [];
  private vertexDisabledDueToAuthError = false; // Circuit breaker flag

  constructor(
    private configService: ConfigService,
    private vertexProvider: VertexGeminiGtinMatchProvider,
    private ollamaProvider: OllamaGtinMatchProvider,
    private googleAiProvider: GoogleAiGeminiGtinMatchProvider,
  ) {
    // Determine AI provider mode from GTIN_AI_PROVIDER env var
    const aiProvider = this.configService.get<string>('GTIN_AI_PROVIDER') ?? 'google';

    if (aiProvider === 'ollama') {
      // Ollama-only mode
      this.logger.log('GTIN AI provider mode: ollama');
      this.providers.push(this.ollamaProvider);
    } else {
      // Google AI mode (with optional Vertex)
      this.logger.log('GTIN AI provider mode: google');
      const vertexEnabled = this.configService.get<string>('GTIN_AI_ENABLE_VERTEX') === 'true';

      if (vertexEnabled) {
        this.providers.push(this.vertexProvider);
      }
      this.providers.push(this.googleAiProvider); // Always include Google AI as primary (if Vertex disabled) or fallback
    }
  }

  /**
   * Pick the best GTIN match for a scanned product.
   * - Returns immediately with no_candidates verdict if input.candidates is empty.
   * - Tries each provider in order (Vertex, then Google AI).
   * - On permanent auth/config error (from Vertex), disables Vertex for circuit breaker and tries Google AI.
   * - On GeminiQuotaExceededException, logs a warning and tries the next provider.
   * - On any other error, logs a warning and tries the next provider.
   * - If all providers fail, returns a default result with matched_gtin: null and rationale: 'all_providers_failed'.
   * - Never throws; always returns a result object with verdict, provider, and model metadata.
   * - Preserves the actual model used by each provider (Comment 2).
   */
  async pickBestMatch(input: AiGtinMatchInput): Promise<AiGtinMatchResult> {
    // Short-circuit: no candidates means nothing to match.
    if (input.candidates.length === 0) {
      this.logger.log(
        `GTIN matching for scan ${input.scan.id}: no candidates provided.`,
      );
      return {
        verdict: {
          matched_gtin: null,
          confidence: 0,
          rationale: 'no_candidates',
        },
        provider: 'internal',
        model: 'no-op',
      };
    }

    let lastError: any = null;

    for (const provider of this.providers) {
      // Skip Vertex if circuit breaker is active (permanent auth error detected)
      if (this.vertexDisabledDueToAuthError && provider.name.includes('Vertex')) {
        this.logger.log(
          `Skipping Vertex provider (circuit breaker active due to auth error). Using fallback provider.`,
        );
        continue;
      }

      this.logger.log(
        `Attempting GTIN matching for scan ${input.scan.id} with provider: ${provider.name}`,
      );
      try {
        // Providers now return Result objects with actual model metadata (Comment 2)
        const result = await provider.pickBestMatch(input);
        
        // Only log as "succeeded" for genuine matches or stable no-matches
        if (result.verdict.rationale !== 'transient_provider_failure' && result.verdict.rationale !== 'all_providers_failed') {
          this.logger.log(
            `GTIN matching succeeded with ${result.provider} (model: ${result.model}): ${result.verdict.matched_gtin || 'no_match'}`,
          );
        } else {
          this.logger.warn(
            `GTIN matching returned failure rationale from ${result.provider}: ${result.verdict.rationale}`,
          );
        }
        // Preserve the actual model used by the provider
        return result;
      } catch (error) {
        lastError = error;

        // Check for permanent auth/config error (from Vertex provider)
        if (provider.name.includes('Vertex') && error?.message?.includes('Vertex AI provider configuration error')) {
          this.logger.error(
            `Permanent auth/config error detected from Vertex. Disabling Vertex (circuit breaker active). Falling back to Google AI.`,
            error,
          );
          this.vertexDisabledDueToAuthError = true;
          continue; // try next provider
        }

        // Check for transient provider failure (503 exhaustion, etc.)
        if (error instanceof TransientProviderFailureException) {
          this.logger.warn(
            `Provider ${provider.name} failed with transient error: ${error.message}. Trying next provider...`,
            error,
          );
          continue; // try next provider
        }

        if (error instanceof GeminiQuotaExceededException) {
          this.logger.warn(
            `Provider ${provider.name} failed with Quota Exceeded. Trying next provider...`,
          );
          continue; // try next provider
        }

        // On any other error, also continue to the next provider for robustness.
        this.logger.warn(
          `Provider ${provider.name} failed with error: ${error.message}. Trying next provider...`,
        );
        continue;
      }
    }

    // All providers exhausted; return a failure result instead of throwing.
    this.logger.error(
      `All GTIN matching providers failed for scan ${input.scan.id}. Returning default failure result.`,
      lastError,
    );
    return {
      verdict: {
        matched_gtin: null,
        confidence: 0,
        rationale: 'all_providers_failed',
      },
      provider: 'internal',
      model: 'no-op',
    };
  }

  /**
   * Resolve brand aliases: match a scan's raw brand to an OFF brand slug.
   * - Tries each provider in order (Vertex, then Google AI).
   * - On permanent auth/config error (from Vertex), disables Vertex for circuit breaker and tries Google AI.
   * - On GeminiQuotaExceededException, logs a warning and tries the next provider.
   * - On any other error, logs a warning and tries the next provider.
   * - If all providers fail, returns a default result with slug: null.
   * - Never throws; always returns a result object with verdict, provider, and model metadata.
   * - Preserves the actual model used by each provider (Comment 2).
   *
   * @param scanBrand - The raw brand string from the scan
   * @param knownOffBrandSlugs - List of eligible OFF brand slugs to match against
   * @returns A result with verdict containing slug (or null), confidence, explanation, plus provider and model metadata
   */
  async resolveBrandAlias(
    scanBrand: string,
    knownOffBrandSlugs: string[],
  ): Promise<AiBrandAliasResult> {
    // Short-circuit: empty brand or no eligible slugs
    if (!scanBrand || !scanBrand.trim() || knownOffBrandSlugs.length === 0) {
      this.logger.log(
        `Brand alias resolution for "${scanBrand}": no brand pool eligible (empty brand or no slugs).`,
      );
      return {
        verdict: {
          slug: null,
          confidence: 0,
          rationale: 'no_brand_pool_eligible',
        },
        provider: 'internal',
        model: 'no-op',
      };
    }

    const input: AiBrandAliasInput = {
      scanBrandRaw: scanBrand,
      scanBrandNormalized: normalizeBrandStrict(scanBrand),
      knownOffBrandSlugs,
    };

    let lastError: any = null;

    for (const provider of this.providers) {
      // Skip Vertex if circuit breaker is active (permanent auth error detected)
      if (this.vertexDisabledDueToAuthError && provider.name.includes('Vertex')) {
        this.logger.log(
          `Skipping Vertex provider (circuit breaker active due to auth error). Using fallback provider.`,
        );
        continue;
      }

      this.logger.log(
        `Attempting brand alias resolution for "${scanBrand}" with provider: ${provider.name}`,
      );
      try {
        // Providers now return Result objects with actual model metadata (Comment 2)
        const result = await provider.resolveBrandAlias(input);
        
        // Only log as "succeeded" for genuine matches or stable no-matches
        if (result.verdict.rationale !== 'transient_provider_failure' && result.verdict.rationale !== 'all_providers_failed') {
          this.logger.log(
            `Brand alias resolution succeeded with ${result.provider} (model: ${result.model}): ${result.verdict.slug || 'no_match'}`,
          );
        } else {
          this.logger.warn(
            `Brand alias resolution returned failure rationale from ${result.provider}: ${result.verdict.rationale}`,
          );
        }
        // Preserve the actual model used by the provider
        return result;
      } catch (error) {
        lastError = error;

        // Check for permanent auth/config error (from Vertex provider)
        if (provider.name.includes('Vertex') && error?.message?.includes('Vertex AI provider configuration error')) {
          this.logger.error(
            `Permanent auth/config error detected from Vertex. Disabling Vertex (circuit breaker active). Falling back to Google AI.`,
            error,
          );
          this.vertexDisabledDueToAuthError = true;
          continue; // try next provider
        }

        // Check for transient provider failure (503 exhaustion, etc.)
        if (error instanceof TransientProviderFailureException) {
          this.logger.warn(
            `Provider ${provider.name} failed with transient error: ${error.message}. Trying next provider...`,
            error,
          );
          continue; // try next provider
        }

        if (error instanceof GeminiQuotaExceededException) {
          this.logger.warn(
            `Provider ${provider.name} failed with Quota Exceeded. Trying next provider...`,
          );
          continue; // try next provider
        }

        // On any other error, also continue to the next provider for robustness.
        this.logger.warn(
          `Provider ${provider.name} failed with error: ${error.message}. Trying next provider...`,
        );
        continue;
      }
    }

    // All providers exhausted; return a failure result instead of throwing.
    this.logger.error(
      `All brand alias resolution providers failed for "${scanBrand}". Returning default failure result.`,
      lastError,
    );
    return {
      verdict: {
        slug: null,
        confidence: 0,
        rationale: 'all_providers_failed',
      },
      provider: 'internal',
      model: 'no-op',
    };
  }

  /**
   * Comment 1: Explicitly disable Vertex for the rest of the current run.
   * Used by gtin-backfill.service when preflight health check fails to ensure
   * all subsequent GTIN matches and brand alias resolutions use Google AI directly.
   */
  disableVertexForCurrentRun(): void {
    this.logger.warn('Disabling Vertex AI for the remainder of this backfill run.');
    this.vertexDisabledDueToAuthError = true;
  }

  /**
   * Comment 1: Health-check method to verify Vertex credentials and model availability before Pass F starts.
   * Returns true if Vertex is healthy and ready, false if preflight fails.
   * Never throws; logs warnings instead.
   */
  async healthCheckVertex(): Promise<boolean> {
    try {
      // Delegate to Vertex provider for actual health check
      if (this.vertexProvider && typeof this.vertexProvider.healthCheck === 'function') {
        const isHealthy = await this.vertexProvider.healthCheck();
        if (isHealthy) {
          this.logger.log('Vertex AI health check passed.');
          return true;
        } else {
          this.logger.warn('Vertex AI health check failed: provider returned unhealthy status.');
          return false;
        }
      } else {
        // If health check method not implemented, assume Vertex is available
        this.logger.debug('Vertex provider health check method not available; assuming healthy.');
        return true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Vertex AI health check threw error: ${message}`);
      return false;
    }
  }

  /**
   * Comment 1: Health-check method to verify Google AI credentials and model availability before Pass F starts.
   * Returns true if Google AI is healthy and ready, false if preflight fails.
   * Never throws; logs warnings instead.
   */
  async healthCheckGoogleAi(): Promise<boolean> {
    try {
      // Delegate to Google AI provider for actual health check
      if (this.googleAiProvider && typeof this.googleAiProvider.healthCheck === 'function') {
        const isHealthy = await this.googleAiProvider.healthCheck();
        if (isHealthy) {
          this.logger.log('Google AI health check passed.');
          return true;
        } else {
          this.logger.warn('Google AI health check failed: provider returned unhealthy status.');
          return false;
        }
      } else {
        // If health check method not implemented, assume Google AI is available
        this.logger.debug('Google AI provider health check method not available; assuming healthy.');
        return true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Google AI health check threw error: ${message}`);
      return false;
    }
  }

  /**
   * Comment 1: Health-check method to verify Ollama daemon and model availability before Pass F starts.
   * Returns true if Ollama is healthy and ready, false if preflight fails.
   * Never throws; logs warnings instead.
   */
  async healthCheckOllama(): Promise<{ healthy: boolean; probeLatencyMs: number; probeTimedOut: boolean; timeoutMs: number }> {
    try {
      // Delegate to Ollama provider for actual health check
      if (this.ollamaProvider && typeof this.ollamaProvider.preflightHealthCheck === 'function') {
        const result = await this.ollamaProvider.preflightHealthCheck();
        if (result.healthy) {
          this.logger.log(`Ollama health check passed (latency: ${result.probeLatencyMs}ms).`);
          return result;
        } else {
          this.logger.warn(`Ollama health check failed (timeout: ${result.probeTimedOut}, latency: ${result.probeLatencyMs}ms).`);
          return result;
        }
      } else {
        // If health check method not implemented, assume Ollama is available
        this.logger.debug('Ollama provider health check method not available; assuming healthy.');
        return { healthy: true, probeLatencyMs: 0, probeTimedOut: false, timeoutMs: 0 };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ollama preflight health check encountered an error: ${message}`);
      return { healthy: false, probeLatencyMs: 0, probeTimedOut: false, timeoutMs: 0 };
    }
  }
}

