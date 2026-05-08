import axios, { AxiosInstance } from 'axios';
import { Logger } from '@nestjs/common';
import { TransientProviderFailureException } from './transient-provider-failure.exception';

/**
 * Thin axios wrapper around the Ollama HTTP API.
 * Used by `OllamaGtinMatchProvider` (Phase 2) and `OllamaEmbeddingProvider` (Phase 3).
 * Logger is injected by the consumer so log lines appear under the consumer's NestJS context.
 */
export class OllamaClient {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(
    baseUrl: string,
    private defaultTimeoutMs: number,
    private maxRetries: number,
    private logger: Logger,
  ) {
    // Strip trailing slash
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.client = axios.create({
      baseURL: this.baseUrl,
    });
  }

  /**
   * POST /api/chat — generate text with a model
   * @returns { content: string } extracted from response.data.message.content
   */
  async chat(opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    format?: 'json' | 'object' | Record<string, any>;
    options?: Record<string, any>;
    keepAlive?: string;
    timeoutMs?: number;
    onPhaseTransition?: (phase: 'queued' | 'active') => void;
  }): Promise<{ content: string }> {
    return this.withRetry(
      async () => {
        const body = {
          model: opts.model,
          messages: opts.messages,
          stream: false,
          format: opts.format,
          options: {
            temperature: 0,
            ...(opts.options || {}),
          },
          keep_alive: opts.keepAlive,
        };

        const response = await this.withTimeout(
          (signal: AbortSignal) => {
            const promise = this.client.post('/api/chat', body, { signal });
            promise.then(() => {
              if (opts.onPhaseTransition) opts.onPhaseTransition('active');
            }).catch(() => {}); // handled by outer try/catch
            return promise;
          },
          opts.timeoutMs ?? this.defaultTimeoutMs,
          'chat',
          'cold_load',
          opts.onPhaseTransition
        );

        if (!response.data.done || !response.data.message?.content) {
          throw new Error(
            `Ollama /api/chat returned incomplete payload: done=${response.data.done}, content_empty=${!response.data.message?.content}`,
          );
        }

        return { content: response.data.message.content };
      },
      'chat',
    );
  }

  /**
   * POST /api/embed — generate embeddings for input
   * @returns number[][] array of embeddings
   */
  async embed(opts: {
    model: string;
    input: string | string[];
    keepAlive?: string;
    timeoutMs?: number;
    onPhaseTransition?: (phase: 'queued' | 'active') => void;
  }): Promise<number[][]> {
    return this.withRetry(
      async () => {
        const body = {
          model: opts.model,
          input: opts.input,
          keep_alive: opts.keepAlive,
        };

        const response = await this.withTimeout(
          (signal: AbortSignal) => {
            const promise = this.client.post('/api/embed', body, { signal });
            promise.then(() => {
              if (opts.onPhaseTransition) opts.onPhaseTransition('active');
            }).catch(() => {}); // handled by outer try/catch
            return promise;
          },
          opts.timeoutMs ?? this.defaultTimeoutMs,
          'embed',
          'cold_load',
          opts.onPhaseTransition
        );

        const embeddings = response.data.embeddings;
        if (!Array.isArray(embeddings) || !Array.isArray(embeddings[0])) {
          throw new Error('Ollama /api/embed returned malformed payload');
        }

        return embeddings;
      },
      'embed',
    );
  }

  /**
   * GET /api/tags — list available models
   * @returns string[] array of model names
   */
  async listTags(): Promise<string[]> {
    // listTags uses the same cancellation wrapper for consistency; timeout defaults to defaultTimeoutMs
    try {
      const response = await this.withTimeout(
        (signal: AbortSignal) => this.client.get('/api/tags', { signal }),
        this.defaultTimeoutMs,
        'listTags',
      );
      return response.data.models.map((m: any) => m.name);
    } catch (error: any) {
      this.logger.error(
        `Ollama /api/tags failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Wrap a promise-factory with AbortController-based timeout cancellation.
   * Creates the promise after setting up the AbortController signal so axios
   * receives the signal and can abort the in-flight request (not just the promise).
   * Detects axios CanceledError and converts to a typed timeout error.
   */
  private async withTimeout<T>(
    factory: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    operationName: string,
    phaseHint?: 'cold_load' | 'queued' | 'active',
    onPhaseTransition?: (phase: 'queued' | 'active') => void,
  ): Promise<T> {
    const controller = new AbortController();
    let timerHandle: NodeJS.Timeout | undefined;
    let currentPhase: 'cold_load' | 'queued' | 'active' = phaseHint ?? 'cold_load';

    try {
      // Arm the timeout to abort the controller after timeoutMs
      timerHandle = setTimeout(() => {
        const err = new Error(
          `Ollama ${operationName} exceeded timeout of ${timeoutMs}ms (phase=${currentPhase})`,
        );
        (err as any).isTimeoutError = true;
        (err as any).timeoutPhase = currentPhase;
        controller.abort(err);
      }, timeoutMs);

      // Call factory to create the promise, passing the abort signal in config
      const promise = factory(controller.signal);
      promise.then(() => {
        currentPhase = 'active';
      }).catch(() => {});
      return await promise;
    } catch (error: any) {
      // Detect axios CanceledError (axios v1.x uses 'CanceledError' name)
      if (
        axios.isCancel(error) ||
        error?.name === 'CanceledError' ||
        error?.name === 'AbortError'
      ) {
        // Re-throw the pre-constructed timeout error so withRetry sees isTimeoutError=true
        const reason = controller.signal.reason;
        if (reason && (reason as any).isTimeoutError) {
          (reason as any).timeoutPhase = currentPhase;
          throw reason;
        }
        // Fallback: construct a timeout error if abort reason is missing
        const err = new Error(
          `Ollama ${operationName} exceeded timeout of ${timeoutMs}ms (phase=${currentPhase})`,
        );
        (err as any).isTimeoutError = true;
        (err as any).timeoutPhase = currentPhase;
        throw err;
      }
      // Re-throw other errors as-is
      throw error;
    } finally {
      // Clear the timer to prevent leaks on success
      if (timerHandle) {
        clearTimeout(timerHandle);
      }
    }
  }

  /**
   * Retry logic with exponential backoff + jitter
   * Classifies errors and retries transient failures; rethrows permanent errors
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Don't retry timeout errors; rethrow as-is
        if (error?.isTimeoutError) {
          throw error;
        }

        // Classify connection errors
        const code = error?.code;
        if (
          code === 'ECONNREFUSED' ||
          code === 'ETIMEDOUT' ||
          code === 'ECONNRESET' ||
          code === 'EAI_AGAIN'
        ) {
          if (attempt === 0 && code === 'ECONNREFUSED') {
            this.logger.error(
              `Ollama daemon unreachable at ${this.baseUrl} — is 'ollama serve' running?`,
            );
          }

          if (attempt < this.maxRetries) {
            const backoffMs =
              Math.pow(2, attempt) * 500 + Math.random() * 250;
            this.logger.warn(
              `Ollama ${operationName} failed (${code}), retrying in ${backoffMs.toFixed(0)}ms (attempt ${attempt + 1}/${this.maxRetries})${error?.timeoutPhase ? ` (phase=${error.timeoutPhase})` : ''}`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw new TransientProviderFailureException(
            `Ollama ${operationName} failed after ${this.maxRetries + 1} attempts: ${code}`,
            'Ollama',
            error,
          );
        }

        // Classify HTTP errors
        const status = error?.response?.status;
        if (status && status >= 500) {
          if (attempt < this.maxRetries) {
            const backoffMs =
              Math.pow(2, attempt) * 500 + Math.random() * 250;
            this.logger.warn(
              `Ollama ${operationName} returned HTTP ${status}, retrying in ${backoffMs.toFixed(0)}ms (attempt ${attempt + 1}/${this.maxRetries})${error?.timeoutPhase ? ` (phase=${error.timeoutPhase})` : ''}`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
            continue;
          }

          throw new TransientProviderFailureException(
            `Ollama ${operationName} returned HTTP ${status} after ${this.maxRetries + 1} attempts`,
            'Ollama',
            error,
          );
        }

        // Don't retry 4xx errors (programmer error)
        if (status && status >= 400 && status < 500) {
          throw error;
        }

        // Rethrow parse/contract errors (not retryable)
        throw error;
      }
    }

    throw lastError;
  }
}
