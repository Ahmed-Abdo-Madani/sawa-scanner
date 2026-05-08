import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingProvider, EmbeddingProviderStats } from './embedding-provider.interface';
import { OllamaClient } from './ollama-client';
import { TransientProviderFailureException } from './transient-provider-failure.exception';

/**
 * Ollama embedding provider.
 * Mirrors the public surface of GeminiEmbeddingProvider but delegates HTTP I/O
 * to OllamaClient. Supports pluggable embedding models (default: embeddinggemma).
 */
@Injectable()
export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OllamaEmbeddingProvider.name);
  private client: OllamaClient;
  private baseUrl: string;
  private requestTimeoutMs: number;
  private maxRetries: number;
  private keepAlive: string | undefined;
  private stats: EmbeddingProviderStats = {
    embedCalls: 0,
    embedTokensApprox: 0,
    embedErrors: 0,
    embedAvgLatencyMs: 0,
    totalLatencyMs: 0,
  };

  constructor(private configService: ConfigService) {
    // Read environment configuration with sensible defaults
    this.baseUrl = this.configService.get<string>('OLLAMA_BASE_URL') ?? 'http://localhost:11434';
    this.requestTimeoutMs = parseInt(
      this.configService.get<string>('GTIN_EMBEDDING_REQUEST_TIMEOUT_MS') ?? '20000',
      10,
    );
    this.maxRetries = parseInt(
      this.configService.get<string>('OLLAMA_MAX_RETRIES') ?? '2',
      10,
    );
    this.keepAlive = this.configService.get<string>('OLLAMA_KEEP_ALIVE') ?? '5m';

    // Construct the Ollama client
    this.client = new OllamaClient(this.baseUrl, this.requestTimeoutMs, this.maxRetries, this.logger);
  }

  /**
   * Provider name.
   */
  readonly name = 'OllamaEmbedding';

  /**
   * Gets the configured embedding model identifier from env.
   * Defaults to 'embeddinggemma' if not specified.
   */
  get modelId(): string {
    return this.configService.get<string>('OLLAMA_EMBEDDING_MODEL') ?? 'embeddinggemma';
  }

  /**
   * Gets the configured embedding vector dimension.
   * Defaults to 768 (standard for embeddinggemma).
   */
  get dim(): number {
    return parseInt(this.configService.get<string>('GTIN_EMBEDDING_DIM') ?? '768', 10);
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
   * Truncate vector to configured dimension and normalize.
   */
  private truncateAndNormalize(vector: number[]): Float32Array {
    const truncated = vector.slice(0, this.dim);
    const normalized = this.l2Normalize(truncated);
    return new Float32Array(normalized);
  }

  /**
   * Embeds a batch of documents for OFF product index building.
   * Paginates by GTIN_EMBEDDING_BATCH_SIZE and L2-normalizes outputs after truncation.
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

    const embeddings: Float32Array[] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(texts.length / batchSize);

      try {
        this.logger.debug(
          `Embedding batch ${batchNum}/${totalBatches} (${batch.length} items) with model ${this.modelId}...`,
        );

        const callStart = Date.now();
        const response = await this.client.embed({
          model: this.modelId,
          input: batch,
          keepAlive: this.keepAlive,
          timeoutMs: this.requestTimeoutMs,
        });

        // Extract embeddings and apply truncation + normalization
        if (Array.isArray(response)) {
          for (const embedding of response) {
            if (Array.isArray(embedding)) {
              const truncated = this.truncateAndNormalize(embedding);
              embeddings.push(truncated);
            }
          }
          
          // Record stats on successful batch
          this.stats.embedCalls++;
          const callDurationMs = Date.now() - callStart;
          this.stats.totalLatencyMs += callDurationMs;
          this.stats.embedAvgLatencyMs = Math.round(this.stats.totalLatencyMs / this.stats.embedCalls);
        }
      } catch (error) {
        // Increment error count before re-throwing
        this.stats.embedErrors++;
        
        // Let TransientProviderFailureException from OllamaClient bubble up
        // GtinBackfillService catches and increments embeddingErrors
        if (error instanceof TransientProviderFailureException) {
          throw error;
        }

        // Wrap other errors as transient
        this.logger.error(`Embedding batch ${batchNum} failed: ${error}`, error);
        throw new TransientProviderFailureException(
          `Embedding batch ${batchNum} failed`,
          this.name,
          error as any,
        );
      }
    }

    return embeddings;
  }

  /**
   * Embeds a single query text for semantic ANN lookup.
   * Called once per residual row in Pass G.
   *
   * @param text Query text
   * @returns Normalized, truncated Float32Array vector
   * @throws TransientProviderFailureException on failure
   */
  async embedQuery(text: string): Promise<Float32Array> {
    try {
      this.logger.debug(`Embedding query with model ${this.modelId}...`);

      const callStart = Date.now();
      const response = await this.client.embed({
        model: this.modelId,
        input: [text],
        keepAlive: this.keepAlive,
        timeoutMs: this.requestTimeoutMs,
      });

      if (Array.isArray(response) && Array.isArray(response[0])) {
        // Record stats on successful query
        this.stats.embedCalls++;
        const callDurationMs = Date.now() - callStart;
        this.stats.totalLatencyMs += callDurationMs;
        this.stats.embedAvgLatencyMs = Math.round(this.stats.totalLatencyMs / this.stats.embedCalls);
        
        return this.truncateAndNormalize(response[0]);
      }

      throw new Error('Ollama embed returned malformed response for query');
    } catch (error) {
      // Increment error count before re-throwing
      this.stats.embedErrors++;
      
      if (error instanceof TransientProviderFailureException) {
        throw error;
      }

      this.logger.error(`Embedding query failed: ${error}`, error);
      throw new TransientProviderFailureException(
        'Embedding query failed',
        this.name,
        error as any,
      );
    }
  }

  /**
   * Health check: verify Ollama daemon availability and model readiness.
   * Never throws; always returns a boolean.
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Step 1: Verify daemon reachability
      let tags: string[];
      try {
        tags = await this.client.listTags();
      } catch (error) {
        this.logger.warn(
          `Ollama daemon unreachable at ${this.baseUrl} — is 'ollama serve' running?`,
        );
        return false;
      }

      // Step 2: Verify embedding model is pulled
      const expectedModel = this.modelId;
      const normalizedTags = tags.map((tag) => tag.replace(/:latest$/, ''));
      const normalizedExpected = expectedModel.replace(/:latest$/, '');

      if (!normalizedTags.includes(normalizedExpected)) {
        this.logger.warn(
          `Model ${this.modelId} not pulled. Run: ollama pull ${this.modelId}`,
        );
        return false;
      }

      // Step 3: Run a probe embedding with timeout
      try {
        const probeResponse = await Promise.race([
          this.client.embed({
            model: this.modelId,
            input: ['OK'],
            keepAlive: this.keepAlive,
            timeoutMs: 10000,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Embedding probe timeout')), 10000),
          ),
        ]);

        if (Array.isArray(probeResponse) && Array.isArray(probeResponse[0]) && probeResponse[0].length > 0) {
          this.logger.log('Ollama embedding health check passed.');
          return true;
        }

        this.logger.warn('Ollama embedding probe returned empty vector.');
        return false;
      } catch (probeError) {
        this.logger.warn(
          `Ollama embedding probe failed: ${(probeError as any)?.message}`,
        );
        return false;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Ollama embedding health check threw error: ${message}`);
      return false;
    }
  }

  /**
   * Returns runtime statistics for this embedding provider session.
   * @returns Shallow clone of the provider's current stats
   */
  getStats(): EmbeddingProviderStats {
    return { ...this.stats };
  }
}
