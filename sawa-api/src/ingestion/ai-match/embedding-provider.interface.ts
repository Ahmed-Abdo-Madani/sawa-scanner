/**
 * Embedding provider interface for pluggable embedding backends.
 * Enables swapping between providers (Gemini, Ollama, etc.) via DI.
 */

export const EMBEDDING_PROVIDER_TOKEN = 'EMBEDDING_PROVIDER';

/**
 * Runtime statistics for embedding provider calls.
 * Tracks request counts, errors, and latency metrics across a session.
 * All numeric fields default to 0 when the provider does not track them.
 */
export interface EmbeddingProviderStats {
  /**
   * Number of successful embedding calls made by this provider.
   */
  embedCalls: number;

  /**
   * Approximate total tokens consumed (if provider supports token tracking; 0 if not).
   */
  embedTokensApprox: number;

  /**
   * Number of embedding calls that failed with an exception.
   */
  embedErrors: number;

  /**
   * Average latency per embedding call in milliseconds.
   * Recomputed as totalLatencyMs / embedCalls after each batch.
   */
  embedAvgLatencyMs: number;

  /**
   * Total cumulative latency across all calls in milliseconds.
   */
  totalLatencyMs: number;
}

/**
 * Public contract for embedding providers.
 * Implementations must support dense vector generation for semantic similarity matching.
 */
export interface EmbeddingProvider {
  /**
   * Human-readable provider name.
   */
  readonly name: string;

  /**
   * Model identifier (e.g., 'gemini-embedding-001', 'embeddinggemma').
   * Used for cache validation and logging.
   */
  readonly modelId: string;

  /**
   * Vector dimension (after truncation/normalization).
   * Used for index allocation and validation.
   */
  readonly dim: number;

  /**
   * Embed a batch of documents for OFF product index building.
   * @param texts Array of text strings to embed
   * @returns Array of L2-normalized Float32Array vectors, one per input text
   * @throws TransientProviderFailureException on permanent timeout or max retries exhausted
   */
  embedDocuments(texts: string[]): Promise<Float32Array[]>;

  /**
   * Embed a single query text for semantic ANN lookup.
   * @param text Query text string
   * @returns L2-normalized Float32Array vector
   * @throws TransientProviderFailureException on failure
   */
  embedQuery(text: string): Promise<Float32Array>;

  /**
   * Health check: verify provider availability and configuration.
   * @returns true if provider is healthy and ready; false if degraded
   * @throws Never; always returns false on any error
   */
  healthCheck(): Promise<boolean>;

  /**
   * Optional: Returns runtime statistics for this embedding provider session.
   * 
   * Callers **must not** assume this method is present. If absent, default all fields to 0.
   * 
   * Canonical implementation: `GeminiEmbeddingProvider` tracks stats across all embedding calls.
   * Implementations that do not track stats should omit this method; callers will handle gracefully.
   * 
   * @returns Shallow clone of the provider's current stats (EmbeddingProviderStats), or undefined if not tracked.
   */
  getStats?(): EmbeddingProviderStats;
}
