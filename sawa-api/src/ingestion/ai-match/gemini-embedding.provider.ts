import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ConfigService } from '@nestjs/config';
import { TransientProviderFailureException } from './transient-provider-failure.exception';
import { EmbeddingProvider } from './embedding-provider.interface';

/**
 * Minimal type interfaces for Gemini SDK responses.
 * These avoid complex dependency on the full SDK types.
 */
interface EmbedResponse {
  embedding?: { values?: number[] };
}

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Provider for Google Gemini Embedding API (gemini-embedding-001).
 * Generates dense vector embeddings for semantic similarity-based candidate ranking.
 * Used in Pass G to compute O(N) cosine ANN lookup over OFF product index.
 */
@Injectable()
export class GeminiEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(GeminiEmbeddingProvider.name);
  private genAI: GoogleGenerativeAI;
  private requestTimeoutMs: number;
  private stats = {
    embedCalls: 0,
    embedTokensApprox: 0,
    embedErrors: 0,
    embedAvgLatencyMs: 0,
    totalLatencyMs: 0,
  };

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY') || '';
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.requestTimeoutMs = parseInt(
      this.configService.get<string>('GTIN_EMBEDDING_REQUEST_TIMEOUT_MS') ?? '20000',
      10,
    );
  }

  readonly name = 'GoogleAIGeminiEmbedding';

  /**
   * Gets the configured embedding model identifier from env.
   * Defaults to 'gemini-embedding-001' if not specified.
   */
  get modelId(): string {
    return this.configService.get<string>('GTIN_EMBEDDING_MODEL') ?? 'gemini-embedding-001';
  }

  /**
   * Gets the configured embedding vector dimension (after Matryoshka truncation).
   * gemini-embedding-001 outputs 3072-d vectors which we truncate to this dimension.
   */
  get dim(): number {
    return parseInt(this.configService.get<string>('GTIN_EMBEDDING_DIM') ?? '768', 10);
  }

  /**
   * Bounded timeout wrapper for preventing hanging API calls.
   */
  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => {
          const err = new Error(
            `${operationName} exceeded timeout of ${timeoutMs}ms`,
          );
          (err as any).isTimeoutError = true;
          reject(err);
        }, timeoutMs),
      ),
    ]);
  }

  /**
   * L2-normalize a vector to unit length.
   */
  private l2Normalize(vector: number[]): number[] {
    let sumSquares = 0;
    for (const v of vector) {
      sumSquares += v * v;
    }
    const norm = Math.sqrt(sumSquares);
    if (norm === 0) {
      return vector; // Return as-is if zero-vector
    }
    return vector.map((v) => v / norm);
  }

  /**
   * Truncate 3072-d vector to configured dimension and normalize.
   */
  private truncateAndNormalize(vector: number[]): Float32Array {
    const truncated = vector.slice(0, this.dim);
    const normalized = this.l2Normalize(truncated);
    return new Float32Array(normalized);
  }

  /**
   * Embeds a batch of documents (texts) for OFF product index building.
   * Uses RETRIEVAL_DOCUMENT task type for building the OFF index.
   * Paginates by GTIN_EMBEDDING_BATCH_SIZE, applies timeout, retries on 503/429, 
   * and L2-normalizes outputs after Matryoshka truncation.
   *
   * @param texts Array of text strings to embed
   * @returns Array of Float32Array vectors (normalized, truncated to dim)
   * @throws TransientProviderFailureException on permanent timeout or max retries exhausted
   */
  async embedDocuments(texts: string[]): Promise<Float32Array[]> {
    const batchSize = parseInt(
      this.configService.get<string>('GTIN_EMBEDDING_BATCH_SIZE') ?? '100',
      10,
    );
    const taskType = this.configService.get<string>(
      'GTIN_EMBEDDING_TASK_TYPE',
    ) || 'RETRIEVAL_DOCUMENT';
    const maxRetries = parseInt(
      this.configService.get<string>('GTIN_EMBEDDING_MAX_RETRIES') ?? '2',
      10,
    );

    const embeddings: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(texts.length / batchSize);
      let attempt = 0;

      while (attempt <= maxRetries) {
        const callStart = Date.now();
        try {
          this.logger.debug(
            `Embedding batch ${batchNum}/${totalBatches} (${batch.length} items) [attempt ${attempt + 1}]...`,
          );

          const model = this.genAI.getGenerativeModel({
            model: this.modelId,
          });

          const result: BatchEmbedResponse = await this.withTimeout(
            (model as any).batchEmbedContents({
              requests: batch.map((text) => ({
                model: `models/${this.modelId}`,
                content: { parts: [{ text }] },
                taskType: taskType,
              })),
            }),
            this.requestTimeoutMs,
            `embedDocuments (batch ${batchNum})`,
          );

          const elapsed = Date.now() - callStart;
          this.stats.embedCalls += 1;
          this.stats.totalLatencyMs += elapsed;
          this.stats.embedAvgLatencyMs = Math.round(
            this.stats.totalLatencyMs / this.stats.embedCalls,
          );

          // Extract embeddings and apply truncation + normalization
          if (result.embeddings && Array.isArray(result.embeddings)) {
            for (const embedding of result.embeddings) {
              if (embedding.values && Array.isArray(embedding.values)) {
                const truncated = this.truncateAndNormalize(embedding.values);
                embeddings.push(truncated);
              }
            }
          }

          // Success: break out of inner retry loop
          break;
        } catch (error: any) {
          this.stats.embedErrors += 1;

          // Handle timeout
          if (error?.isTimeoutError) {
            this.logger.error(`Embedding batch ${batchNum} request timed out after ${this.requestTimeoutMs}ms.`, error);
            throw new TransientProviderFailureException(
              `Embedding batch request timeout after ${this.requestTimeoutMs}ms`,
              this.name,
              error,
            );
          }

          // Check for transient errors (503 / 429)
          const is503 =
            error?.status === 503 ||
            error?.message?.includes('503') ||
            error?.message?.toLowerCase().includes('service unavailable');
          const is429 =
            error?.status === 429 ||
            error?.message?.includes('429') ||
            error?.message?.toLowerCase().includes('quota');

          if (is503 || is429) {
            if (attempt < maxRetries) {
              // Retry with exponential backoff + jitter
              attempt++;
              const baseDelay = Math.pow(2, attempt) * 1000;
              const jitter = Math.random() * 2000;
              const delayMs = baseDelay + jitter;

              this.logger.warn(
                `Embedding batch ${batchNum} received ${is503 ? '503' : '429'} (attempt ${attempt}). Retrying after ${(delayMs / 1000).toFixed(1)}s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
              continue;
            } else {
              // Retries exhausted
              this.logger.error(
                `Embedding batch ${batchNum} exhausted max retries (${maxRetries}) on ${is503 ? '503' : '429'}.`,
                error,
              );
              throw new TransientProviderFailureException(
                `Embedding batch failed after ${maxRetries} retries on ${is503 ? '503' : '429'}`,
                this.name,
                error,
              );
            }
          }

          // For any other error, throw immediately
          throw error;
        }
      }
    }

    return embeddings;
  }

  /**
   * Embeds a single query text using RETRIEVAL_QUERY task type.
   * Called once per residual row in Pass G.
   * Applies same timeout, retry, and normalization logic as embedDocuments.
   *
   * @param text Query text
   * @returns Normalized, truncated Float32Array vector
   * @throws TransientProviderFailureException on permanent timeout or max retries exhausted
   */
  async embedQuery(text: string): Promise<Float32Array> {
    const callStart = Date.now();
    let attempt = 1;

    while (attempt <= 2) {
      try {
        this.logger.debug(`Embedding query (attempt ${attempt})...`);

        const model = this.genAI.getGenerativeModel({
          model: this.modelId,
        });

        const result: EmbedResponse = await this.withTimeout(
          (model as any).embedContent({
            content: { parts: [{ text }] },
            taskType: 'RETRIEVAL_QUERY',
          }),
          this.requestTimeoutMs,
          `embedQuery (attempt ${attempt})`,
        );

        const elapsed = Date.now() - callStart;
        this.stats.embedCalls += 1;
        this.stats.totalLatencyMs += elapsed;
        this.stats.embedAvgLatencyMs = Math.round(
          this.stats.totalLatencyMs / this.stats.embedCalls,
        );

        if (result.embedding?.values && Array.isArray(result.embedding.values)) {
          return this.truncateAndNormalize(result.embedding.values);
        }

        throw new Error('No embedding values returned from API');
      } catch (error: any) {
        this.stats.embedErrors += 1;

        // Handle timeout
        if (error?.isTimeoutError) {
          this.logger.error(
            `Query embedding timed out after ${this.requestTimeoutMs}ms (attempt ${attempt}).`,
            error,
          );
          if (attempt < 2) {
            attempt++;
            continue;
          }
          throw new TransientProviderFailureException(
            `Query embedding timeout after ${this.requestTimeoutMs}ms`,
            this.name,
            error,
          );
        }

        // Bounded backoff for 503/429
        const is503 =
          error?.status === 503 ||
          error?.message?.includes('503') ||
          error?.message?.toLowerCase().includes('service unavailable');
        const is429 =
          error?.status === 429 ||
          error?.message?.includes('429') ||
          error?.message?.toLowerCase().includes('quota');

        if ((is503 || is429) && attempt < 2) {
          const baseDelay = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 2000;
          const delayMs = baseDelay + jitter;

          this.logger.warn(
            `Query embedding received ${is503 ? '503' : '429'} (attempt ${attempt}). Retrying after ${(delayMs / 1000).toFixed(1)}s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          attempt++;
          continue;
        }

        throw error;
      }
    }

    throw new Error('Query embedding failed after max retries');
  }

  /**
   * Health check: embeds the sentinel string 'OK' with 10s timeout.
   * Returns true if a non-empty vector is returned, false (never throws) otherwise.
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Running embedding provider health check...');
      const result = await this.withTimeout(
        this.embedQuery('OK'),
        10000,
        'healthCheck',
      );
      return result && result.length > 0;
    } catch (error: any) {
      this.logger.error('Embedding health check failed:', error?.message);
      return false;
    }
  }

  /**
   * Returns current runtime stats for embedding calls.
   */
  getStats() {
    return { ...this.stats };
  }
}
