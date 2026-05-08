import { Injectable, Logger } from '@nestjs/common';
import { VertexAI, SchemaType, Schema } from '@google-cloud/vertexai';
import { ConfigService } from '@nestjs/config';
import {
  LlmGtinMatchProvider,
  AiGtinMatchInput,
  AiGtinMatchResult,
  AiBrandAliasInput,
  AiBrandAliasResult,
  MAX_CANDIDATES_PER_CALL,
  MAX_BRAND_SLUGS_PER_CALL,
  validateVerdictAgainstCandidates,
  validateBrandAliasVerdict,
} from './llm-gtin-match-provider.interface';
import { GeminiQuotaExceededException } from '../../scan/exceptions/gemini-quota-exceeded.exception';
import { TransientProviderFailureException } from './transient-provider-failure.exception';

/**
 * @deprecated Planned migration from @google-cloud/vertexai to @google/genai (unified SDK).
 * This provider will be re-implemented using the newer @google/genai package already in dependencies.
 * 
 * TODO(migration):
 *   1. Re-implement pickBestMatch, resolveBrandAlias, and healthCheck using @google/genai's Vertex backend
 *   2. Remove @google-cloud/vertexai dependency once both consumers are migrated:
 *      - src/ingestion/ai-match/vertex-gemini-gtin-match.provider.ts (this file)
 *      - src/scan/llm/vertex-gemini.provider.ts (OCR scanning provider)
 * 
 * See IMPLEMENTATION_NOTES.md for migration details.
 */
@Injectable()
export class VertexGeminiGtinMatchProvider implements LlmGtinMatchProvider {
  private readonly logger = new Logger(VertexGeminiGtinMatchProvider.name);
  private vertexAi: VertexAI;
  private requestTimeoutMs: number;

  constructor(private configService: ConfigService) {
    const project =
      this.configService.get<string>('VERTEX_PROJECT_ID') ||
      this.configService.get<string>('FIREBASE_PROJECT_ID');
    const location =
      this.configService.get<string>('VERTEX_LOCATION') || 'me-central2';

    // Assumes GOOGLE_APPLICATION_CREDENTIALS is set in env
    this.vertexAi = new VertexAI({
      project: project as string,
      location: location,
    });
    // Comment 1: Parse request timeout from environment or use default (60s for pickBestMatch/resolveBrandAlias, 10s for healthCheck)
    this.requestTimeoutMs = parseInt(this.configService.get<string>('GTIN_AI_REQUEST_TIMEOUT_MS') ?? '60000', 10);
  }

  get name(): string {
    return 'VertexAIGeminiGtinMatch';
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

  /**
   * Recursively inspects error object and nested causes to classify authentication/configuration failures.
   * Treats the following as permanent errors (no transient retry):
   * - Status codes: 400, 401, 403, 404
   * - Auth-specific error messages: "invalid_grant", "Invalid JWT Signature", "Unable to authenticate"
   * - Any nested cause/stackTrace containing these patterns
   *
   * @param error - The error object to classify
   * @returns true if error is permanent (auth/config), false if transient (quota/rate-limit)
   */
  private isPermanentAuthError(error: any): boolean {
    if (!error) return false;

    // Check direct status codes
    const statusCode = error?.status || error?.code || error?.response?.status;
    if (statusCode === 400 || statusCode === 401 || statusCode === 403 || statusCode === 404) {
      return true;
    }

    // Check error message for auth-specific patterns
    const message = error?.message || '';
    const details = error?.details || '';
    const errorString = `${message} ${details}`.toLowerCase();

    if (
      errorString.includes('invalid_grant') ||
      errorString.includes('invalid jwt signature') ||
      errorString.includes('unable to authenticate') ||
      errorString.includes('permission denied') ||
      errorString.includes('unauthenticated')
    ) {
      return true;
    }

    // Recursively check nested cause
    if (error?.cause) {
      if (this.isPermanentAuthError(error.cause)) {
        return true;
      }
    }

    // Check stackTrace for auth patterns (if available)
    if (error?.stackTrace && typeof error.stackTrace === 'string') {
      const stackLower = error.stackTrace.toLowerCase();
      if (
        stackLower.includes('invalid_grant') ||
        stackLower.includes('invalid jwt signature') ||
        stackLower.includes('unable to authenticate')
      ) {
        return true;
      }
    }

    // Check response body for auth patterns (Google API errors)
    if (error?.response?.data) {
      const responseData = error.response.data;
      const responseString = JSON.stringify(responseData).toLowerCase();
      if (
        responseString.includes('invalid_grant') ||
        responseString.includes('invalid jwt signature') ||
        responseString.includes('unable to authenticate')
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Throws a sanitized provider configuration error.
   * Logs the full error internally but surfaces only a generic message to callers.
   *
   * @param originalError - The original error from Vertex AI
   * @param context - Context about the operation (e.g., 'GTIN matching', 'brand alias resolution')
   */
  private throwSanitizedConfigError(originalError: any, context: string): never {
    this.logger.error(
      `Vertex AI ${context} failed with permanent auth/config error. ` +
      `Check GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT_ID, and VERTEX_LOCATION configuration.`,
      originalError,
    );

    throw new Error(
      `Vertex AI provider configuration error (${context}). ` +
      `Verify GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT_ID, and VERTEX_LOCATION are correctly set.`,
    );
  }

  private buildResponseSchema(): Schema {
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
            'Human-readable explanation of the decision or failure reason.',
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

  private getPrompt(input: AiGtinMatchInput): string {
    const candidatesJson = input.candidates
      .slice(0, MAX_CANDIDATES_PER_CALL)
      .map((c, i) => ({
        index: i,
        gtin: c.gtin,
        brand: c.brand || '',
        name_en: c.name_en || '',
        name_ar: c.name_ar || '',
        weightRaw: c.weightRaw || '',
      }));

    return `You are an expert product matching specialist for the Saudi Arabian market.
Your task is to match a scanned product to the best candidate from a list of OpenFoodFacts records.

SCANNED PRODUCT:
${JSON.stringify(input.scan, null, 2)}

CANDIDATE MATCHES (up to ${MAX_CANDIDATES_PER_CALL}):
${JSON.stringify(candidatesJson, null, 2)}

MATCHING CRITERIA:
1. Name Matching: Consider name_en and name_ar equally. Transliterations count as matches. Partial matches are OK if the core product name is present.
2. Brand Matching: Must match or be a clear variant (e.g., "Brand" vs "Brand Co.").
3. Weight Tolerance: A match is acceptable when net_weight is within ±10% of the candidate's weight (i.e., absolute difference up to and including 10% is acceptable). For example:
   - 500g scan vs 510g candidate = ACCEPTABLE (2% difference)
   - 500g scan vs 450g candidate = ACCEPTABLE (10% difference, within tolerance)
   - 500g scan vs 400g candidate = NOT ACCEPTABLE (20% difference)
4. Hard Constraint: If no candidate is plausibly the same SKU (same product name, brand, weight), return matched_gtin: null.

RESPONSE SCHEMA:
Return a JSON object with:
- matched_gtin: The GTIN of the best candidate, or null if no acceptable match exists.
- confidence: A value between 0.0 and 1.0 (0.9+ = very high confidence, 0.7+ = good confidence, <0.5 = uncertain).
- rationale: A brief explanation of why this candidate was chosen or why no match was found (e.g., "weight_mismatch", "name_match_high_confidence", "no_candidates", "brand_mismatch").
- enrichment_hints: An optional object where each field (name_en, name_ar, brand) is true only if the candidate value is clearly higher quality than the scan value.

INSTRUCTIONS:
- If more than one candidate appears to match, pick the one with the highest overall confidence.
- Prefer candidates with complete (non-empty) name and brand fields.
- If the scan has a net_weight and at least one candidate's weightRaw is known, verify the weight is within tolerance before returning a match.
- Always return a valid JSON object; never return null or undefined for the top-level response.
`;
  }

  async pickBestMatch(
    input: AiGtinMatchInput,
    attempt: number = 1,
  ): Promise<AiGtinMatchResult> {
    const modelName =
      this.configService.get<string>('VERTEX_MODEL') ||
      this.configService.get<string>('GTIN_AI_MATCH_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';

    try {
      this.logger.log(
        `Calling Vertex AI Gemini API (${modelName}) for GTIN matching (Attempt ${attempt})...`,
      );

      const model = this.vertexAi.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.buildResponseSchema(),
          temperature: 0,
        },
      });

      // Comment 1: Wrap API call with bounded timeout to prevent hanging
      const result = await this.withTimeout(
        model.generateContent(this.getPrompt(input)),
        this.requestTimeoutMs,
        'pickBestMatch (Vertex AI)'
      );
      const responseText =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      const verdict = JSON.parse(responseText);
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
          `Vertex AI GTIN matching request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        throw new TransientProviderFailureException(
          `Vertex AI GTIN matching request timeout after ${this.requestTimeoutMs}ms`,
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
          `Vertex AI API returned 503 Service Unavailable (high-demand). Retrying after ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.pickBestMatch(input, attempt + 1);
      }

      // Classify error as permanent (auth/config) or transient (quota/rate-limit)
      if (this.isPermanentAuthError(error)) {
        this.throwSanitizedConfigError(error, 'GTIN matching');
      }

      // Check for quota/rate-limit errors (429 or RESOURCE_EXHAUSTED)
      const statusCode = error?.status || error?.code || error?.response?.status;
      if (
        statusCode === 429 ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('quota') ||
        error.details?.some((d: any) =>
          d['@type']?.includes('RESOURCE_EXHAUSTED'),
        )
      ) {
        this.logger.warn(
          `Vertex API quota exceeded or rate limited. Throwing GeminiQuotaExceededException for orchestrator failover...`,
        );
        throw new GeminiQuotaExceededException(
          'Vertex AI GTIN Match Quota Exceeded',
        );
      }

      // Transient error — retry with backoff
      if (attempt <= 2) {
        const jitter = Math.random() * 1000;
        const delayMs = Math.pow(2, attempt) * 1000 + jitter;
        this.logger.warn(
          `Vertex API transient error. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.pickBestMatch(input, attempt + 1);
      }

      // If all retries exhausted, throw transient provider failure instead of returning no-match
      // This allows the orchestrator to failover to the next provider (e.g., Google AI)
      if (is503Error || isHighDemandError) {
        this.logger.error(
          `Vertex AI GTIN matching exhausted retries for 503 Service Unavailable error after ${attempt} attempts.`,
          error,
        );
        throw new TransientProviderFailureException(
          `Vertex AI GTIN matching: 503 Service Unavailable exhausted after ${attempt} attempts`,
          this.name,
          error,
        );
      }

      this.logger.error('Vertex AI GTIN matching failed after retries:', error);
      throw error;
    }
  }

  private buildBrandAliasResponseSchema(): Schema {
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

  private getBrandAliasPrompt(input: AiBrandAliasInput): string {
    const slugsJson = input.knownOffBrandSlugs
      .slice(0, MAX_BRAND_SLUGS_PER_CALL)
      .join('\n  ');

    return `You are an expert brand name matching specialist for the Saudi Arabian market.
Your task is to match a scanned product's brand name to the most likely OpenFoodFacts brand slug.

SCANNED BRAND:
- Raw (as scanned): "${input.scanBrandRaw}"
- Normalized (Latin/ASCII): "${input.scanBrandNormalized}"

CANDIDATE BRAND SLUGS (up to ${MAX_BRAND_SLUGS_PER_CALL}):
  ${slugsJson}

MATCHING CRITERIA:
1. Prefer exact transliterations: if the raw scan brand is in Arabic or other script, match it against transliterations of the candidate slugs.
2. Accept normalized variant matches: the normalized form often surfaces valid transliterations (e.g., "Coca Cola" matches "coca-cola").
3. Confidence Threshold: Return slug=null if confidence is below 0.7 (better to skip than misalign brands).
4. Return rationale in all cases: cite the chosen slug or explain "no_confident_match" if uncertain.

RESPONSE SCHEMA:
Return a JSON object with:
- slug: The matched OFF brand slug (e.g., "coca-cola", "nestle", "almarai"), or null if no confident match.
- confidence: A value between 0.0 and 1.0 (0.9+ = very high, 0.7-0.9 = good, <0.7 = no match).
- rationale: Brief explanation (e.g., "exact_transliteration", "normalized_match", "no_confident_match").

INSTRUCTIONS:
- Always return a valid JSON object; never return null or undefined for the top-level response.
- If uncertain, prefer returning slug=null with rationale="no_confident_match" over guessing.
`;
  }

  async resolveBrandAlias(
    input: AiBrandAliasInput,
    attempt: number = 1,
  ): Promise<AiBrandAliasResult> {
    const modelName =
      this.configService.get<string>('VERTEX_MODEL') ||
      this.configService.get<string>('GTIN_AI_MATCH_MODEL') ||
      this.configService.get<string>('GEMINI_MODEL') ||
      'gemini-2.0-flash';

    try {
      this.logger.log(
        `Calling Vertex AI Gemini API (${modelName}) for brand alias resolution (Attempt ${attempt})...`,
      );

      const model = this.vertexAi.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: this.buildBrandAliasResponseSchema(),
          temperature: 0,
        },
      });

      // Comment 1: Wrap API call with bounded timeout to prevent hanging
      const result = await this.withTimeout(
        model.generateContent(this.getBrandAliasPrompt(input)),
        this.requestTimeoutMs,
        'resolveBrandAlias (Vertex AI)'
      );
      const responseText =
        result.response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

      const verdict = JSON.parse(responseText);
      return {
        verdict: validateBrandAliasVerdict(verdict, input.knownOffBrandSlugs),
        provider: this.name,
        model: modelName,
      };
    } catch (error: any) {
      // Comment 1: Convert timeout errors to transient provider failures
      if (error?.isTimeoutError) {
        this.logger.error(
          `Vertex AI brand alias resolution request timeout after ${this.requestTimeoutMs}ms (Attempt ${attempt}).`,
          error,
        );
        throw new TransientProviderFailureException(
          `Vertex AI brand alias resolution request timeout after ${this.requestTimeoutMs}ms`,
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
          `Vertex AI API returned 503 Service Unavailable (high-demand). Retrying after ${(delayMs / 1000).toFixed(1)}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.resolveBrandAlias(input, attempt + 1);
      }

      // Classify error as permanent (auth/config) or transient (quota/rate-limit)
      if (this.isPermanentAuthError(error)) {
        this.throwSanitizedConfigError(error, 'brand alias resolution');
      }

      // Check for quota/rate-limit errors (429 or RESOURCE_EXHAUSTED)
      const statusCode = error?.status || error?.code || error?.response?.status;
      if (
        statusCode === 429 ||
        error.message?.includes('RESOURCE_EXHAUSTED') ||
        error.message?.includes('quota') ||
        error.details?.some((d: any) =>
          d['@type']?.includes('RESOURCE_EXHAUSTED'),
        )
      ) {
        this.logger.warn(
          `Vertex API quota exceeded or rate limited. Throwing GeminiQuotaExceededException for orchestrator failover...`,
        );
        throw new GeminiQuotaExceededException(
          'Vertex AI Brand Alias Quota Exceeded',
        );
      }

      // Transient error — retry with backoff
      if (attempt <= 2) {
        const jitter = Math.random() * 1000;
        const delayMs = Math.pow(2, attempt) * 1000 + jitter;
        this.logger.warn(
          `Vertex API transient error. Cooling down for ${delayMs / 1000}s (Attempt ${attempt}/2)...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return this.resolveBrandAlias(input, attempt + 1);
      }

      // If all retries exhausted, throw transient provider failure instead of returning no-match
      // This allows the orchestrator to failover to the next provider (e.g., Google AI)
      if (is503Error || isHighDemandError) {
        this.logger.error(
          `Vertex AI brand alias resolution exhausted retries for 503 Service Unavailable error after ${attempt} attempts.`,
          error,
        );
        throw new TransientProviderFailureException(
          `Vertex AI brand alias resolution: 503 Service Unavailable exhausted after ${attempt} attempts`,
          this.name,
          error,
        );
      }

      this.logger.error('Vertex AI brand alias resolution failed after retries:', error);
      throw error;
    }
  }

  /**
   * Comment 3: Health-check method to verify Vertex credentials and model availability.
   * Returns true if Vertex is healthy and credentials are valid, false on permanent auth errors.
   * Never throws; logs errors instead.
   * Comment 1: Uses a shorter timeout (10s) for health checks to fail fast.
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.log('Running Vertex AI health check (credentials and model availability)...');
      
      // Get the configured model
      const model = this.configService.get<string>('GTIN_AI_MATCH_MODEL') || 
                    this.configService.get<string>('GEMINI_MODEL') ||
                    'gemini-2.0-flash';
      
      // Attempt a trivial API call to verify credentials
      // This tests authentication without consuming significant quota
      const generativeModel = this.vertexAi.getGenerativeModel({
        model: model,
      });

      // Comment 1: Wrap health check with shorter timeout (10s) to fail fast
      const result = await this.withTimeout(
        generativeModel.generateContent({
          contents: [{
            role: 'user',
            parts: [{
              text: 'Acknowledge that you are working. Reply with only: OK',
            }],
          }],
        }),
        10000, // 10s timeout for health checks
        'healthCheck (Vertex AI)'
      );

      if (result && result.response) {
        this.logger.log('Vertex AI health check passed: credentials and model are available.');
        return true;
      } else {
        this.logger.warn('Vertex AI health check failed: no response from model.');
        return false;
      }
    } catch (error) {
      // Check if it's a permanent auth error
      if (this.isPermanentAuthError(error)) {
        this.logger.warn(
          `Vertex AI health check failed with permanent auth/config error: ${error?.message || String(error)}. ` +
          `Check GOOGLE_APPLICATION_CREDENTIALS, VERTEX_PROJECT_ID, and VERTEX_LOCATION.`,
        );
      } else {
        this.logger.warn(
          `Vertex AI health check failed with transient error: ${error?.message || String(error)}. ` +
          `This may be a temporary quota, connectivity, or timeout issue.`,
        );
      }
      return false;
    }
  }
}

