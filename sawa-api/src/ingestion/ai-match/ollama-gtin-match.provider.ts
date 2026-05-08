import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmGtinMatchProvider,
  AiGtinMatchInput,
  AiGtinMatchResult,
  AiBrandAliasInput,
  AiBrandAliasResult,
  validateVerdictAgainstCandidates,
  validateBrandAliasVerdict,
} from './llm-gtin-match-provider.interface';
import { getPrompt, getBrandAliasPrompt, gtinMatchJsonSchema, brandAliasJsonSchema } from './gtin-match-prompts';
import { OllamaClient } from './ollama-client';
import { TransientProviderFailureException } from './transient-provider-failure.exception';

@Injectable()
export class OllamaGtinMatchProvider implements LlmGtinMatchProvider {
  private readonly logger = new Logger(OllamaGtinMatchProvider.name);
  private client: OllamaClient;
  private baseUrl: string;
  private primaryModel: string;
  private fallbackModel: string | undefined;
  private keepAlive: string;
  private requestTimeoutMs: number;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    this.requestTimeoutMs = parseInt(this.configService.get<string>('OLLAMA_REQUEST_TIMEOUT_MS') ?? '60000', 10);
    const maxRetries = parseInt(this.configService.get<string>('OLLAMA_MAX_RETRIES') ?? '2', 10);

    this.primaryModel = this.configService.get<string>('OLLAMA_GTIN_MATCH_MODEL') ?? 'gemma3:4b';
    this.fallbackModel =
      this.configService.get<string>('OLLAMA_GTIN_MATCH_FALLBACK_MODEL') || undefined;
    this.keepAlive = this.configService.get<string>('OLLAMA_KEEP_ALIVE') ?? '5m';

    this.client = new OllamaClient(this.baseUrl, this.requestTimeoutMs, maxRetries, this.logger);
  }

  get name(): string {
    return 'Ollama';
  }

  async pickBestMatch(
    input: AiGtinMatchInput,
    attempt: number = 1,
    useFallbackModel: boolean = false,
  ): Promise<AiGtinMatchResult> {
    const modelName = useFallbackModel && this.fallbackModel ? this.fallbackModel : this.primaryModel;

    // Cap the candidates sent to the LLM to 10
    const originalCandidates = input.candidates;
    if (input.candidates.length > 10) {
      input.candidates = input.candidates.slice(0, 10);
    }

    try {
      this.logger.log(
        `Calling Ollama (model=${modelName}) for GTIN matching (Attempt ${attempt})...`,
      );

      const response = await this.client.chat({
        model: modelName,
        messages: [{ role: 'user', content: getPrompt(input) }],
        format: gtinMatchJsonSchema(),
        options: { temperature: 0 },
        keepAlive: this.keepAlive,
      });

      let verdict: any;
      try {
        verdict = JSON.parse(response.content);
      } catch (parseError) {
        this.logger.error(
          `Failed to parse Ollama GTIN match response as JSON. Content preview: ${response.content.substring(0, 200)}`,
          parseError,
        );
        return {
          verdict: {
            matched_gtin: null,
            confidence: 0,
            rationale: 'all_providers_failed',
          },
          provider: this.name,
          model: modelName,
        };
      }

      // We still validate against the original candidates to ensure we don't drop correct ones if returned
      const validatedVerdict = validateVerdictAgainstCandidates(
        verdict,
        originalCandidates.map((c) => c.gtin),
      );

      return {
        verdict: validatedVerdict,
        provider: this.name,
        model: modelName,
      };
    } catch (error: any) {
      if (error?.isTimeoutError === true) {
        this.logger.error(
          `Ollama GTIN matching request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        if (!useFallbackModel && this.fallbackModel) {
          this.logger.warn(
            `Primary model ${this.primaryModel} timed out. Falling back to ${this.fallbackModel}.`,
          );
          return this.pickBestMatch({ ...input, candidates: originalCandidates }, 1, true);
        }
        throw new TransientProviderFailureException('timeout', this.name);
      }

      if (error instanceof TransientProviderFailureException) {
        this.logger.error(
          `Ollama GTIN matching failed with transient error: ${error.message}`,
          error,
        );
        if (!useFallbackModel && this.fallbackModel) {
          this.logger.warn(
            `Primary model ${this.primaryModel} failed transiently. Falling back to ${this.fallbackModel}.`,
          );
          return this.pickBestMatch({ ...input, candidates: originalCandidates }, 1, true);
        }
        throw error;
      }

      this.logger.error(`Ollama GTIN matching failed: ${error?.message}`, error);

      return {
        verdict: {
          matched_gtin: null,
          confidence: 0,
          rationale: 'all_providers_failed',
        },
        provider: this.name,
        model: modelName,
      };
    }
  }

  async resolveBrandAlias(
    input: AiBrandAliasInput,
    attempt: number = 1,
    useFallbackModel: boolean = false,
  ): Promise<AiBrandAliasResult> {
    const modelName = useFallbackModel && this.fallbackModel ? this.fallbackModel : this.primaryModel;

    try {
      this.logger.log(
        `Calling Ollama (model=${modelName}) for brand alias resolution (Attempt ${attempt})...`,
      );

      const response = await this.client.chat({
        model: modelName,
        messages: [{ role: 'user', content: getBrandAliasPrompt(input) }],
        format: brandAliasJsonSchema(),
        options: { temperature: 0 },
        keepAlive: this.keepAlive,
      });

      let verdict: any;
      try {
        verdict = JSON.parse(response.content);
      } catch (parseError) {
        this.logger.error(
          `Failed to parse Ollama brand alias response as JSON. Content preview: ${response.content.substring(0, 200)}`,
          parseError,
        );
        return {
          verdict: {
            slug: null,
            confidence: 0,
            rationale: 'all_providers_failed',
          },
          provider: this.name,
          model: modelName,
        };
      }

      const validatedVerdict = validateBrandAliasVerdict(
        verdict,
        input.knownOffBrandSlugs,
      );

      return {
        verdict: validatedVerdict,
        provider: this.name,
        model: modelName,
      };
    } catch (error: any) {
      if (error?.isTimeoutError === true) {
        this.logger.error(
          `Ollama brand alias resolution request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        if (!useFallbackModel && this.fallbackModel) {
          this.logger.warn(
            `Primary model ${this.primaryModel} timed out. Falling back to ${this.fallbackModel}.`,
          );
          return this.resolveBrandAlias(input, 1, true);
        }
        throw new TransientProviderFailureException('timeout', this.name);
      }

      if (error instanceof TransientProviderFailureException) {
        this.logger.error(
          `Ollama brand alias resolution failed with transient error: ${error.message}`,
          error,
        );
        if (!useFallbackModel && this.fallbackModel) {
          this.logger.warn(
            `Primary model ${this.primaryModel} failed transiently. Falling back to ${this.fallbackModel}.`,
          );
          return this.resolveBrandAlias(input, 1, true);
        }
        throw error;
      }

      this.logger.error(`Ollama brand alias resolution failed: ${error?.message}`, error);

      return {
        verdict: {
          slug: null,
          confidence: 0,
          rationale: 'all_providers_failed',
        },
        provider: this.name,
        model: modelName,
      };
    }
  }

  async preflightHealthCheck(): Promise<{
    healthy: boolean;
    probeLatencyMs: number;
    probeTimedOut: boolean;
    timeoutMs: number;
  }> {
    try {
      let tags: string[];
      try {
        tags = await this.client.listTags();
      } catch (error: any) {
        this.logger.warn(`Ollama daemon unreachable at ${this.baseUrl} — is 'ollama serve' running?`);
        return { healthy: false, probeLatencyMs: 0, probeTimedOut: false, timeoutMs: 0 };
      }

      const expectedModel = this.primaryModel;
      const normalizedTags = tags.map((tag) => tag.replace(/:latest$/, ''));
      const normalizedExpected = expectedModel.replace(/:latest$/, '');

      if (!normalizedTags.includes(normalizedExpected)) {
        this.logger.warn(`Model ${this.primaryModel} not pulled. Run: ollama pull ${this.primaryModel}`);
        return { healthy: false, probeLatencyMs: 0, probeTimedOut: false, timeoutMs: 0 };
      }

      const startTime = Date.now();
      const preflightTimeoutMs = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT_MS ?? '120000', 10);

      try {
        const prompt = `Match GTIN 0000000000000. Name: "Test Product". Brand: "Test Brand".
Candidates:
[1] 0000000000000 "Test Product" (Test Brand)
[2] 1111111111111 "Other Product" (Other Brand)`;

        await this.client.chat({
          model: this.primaryModel,
          messages: [{ role: 'user', content: prompt }],
          format: gtinMatchJsonSchema(),
          options: { temperature: 0 },
          keepAlive: this.keepAlive,
          timeoutMs: preflightTimeoutMs,
        });

        const latency = Date.now() - startTime;
        this.logger.log(`Ollama health check passed. Probe latency: ${latency}ms`);
        return {
          healthy: true,
          probeLatencyMs: latency,
          probeTimedOut: false,
          timeoutMs: preflightTimeoutMs,
        };
      } catch (probeError: any) {
        const latency = Date.now() - startTime;
        const isTimeout = probeError?.isTimeoutError === true;
        this.logger.warn(`Ollama health check probe failed after ${latency}ms: ${probeError?.message}`);
        return {
          healthy: false,
          probeLatencyMs: latency,
          probeTimedOut: isTimeout,
          timeoutMs: preflightTimeoutMs,
        };
      }
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ollama health check threw error: ${message}`);
      return { healthy: false, probeLatencyMs: 0, probeTimedOut: false, timeoutMs: 0 };
    }
  }
}
