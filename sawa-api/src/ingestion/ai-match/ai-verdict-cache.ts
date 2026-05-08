import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  AiGtinMatchVerdict,
  AiGtinMatchResult,
} from './llm-gtin-match-provider.interface';

/**
 * Directory and file constants for the AI verdict cache.
 */
const CACHE_DIR = path.join(process.cwd(), 'uploads', 'backfill-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'ai-verdicts.json');

/**
 * Cached AI verdict with metadata.
 */
export interface CachedVerdict extends AiGtinMatchVerdict {
  cached_at: string;
  model: string;
  provider: string;
}

/**
 * Optional filter criteria for AI verdict cache lookups.
 * When provided, entries are matched only if their provider and/or model
 * fields contain the specified substrings (case-insensitive).
 * When absent, all entries are accepted (no provider/model filtering).
 *
 * Mirrors `BrandAliasCacheFilterOpts` in `brand-alias-cache.ts`.
 */
export interface AiVerdictCacheFilterOpts {
  providerFilter?: string;  // case-insensitive substring match against entry.provider
  modelFilter?: string;     // case-insensitive substring match against entry.model
}

/**
 * AiVerdictCache — persistent JSON-on-disk cache for AI match verdicts.
 * Atomic flush with temp-file rename, in-memory state tracking, and
 * cache hit/miss counters for observability.
 */
@Injectable()
export class AiVerdictCache implements OnModuleInit {
  private readonly logger = new Logger(AiVerdictCache.name);

  private store: Map<string, CachedVerdict> = new Map();
  private dirty: boolean = false;
  private flushing: Promise<void> | null = null;
  private flushVersion: number = 0; // Tracks write generation for race detection
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private crossProviderCacheHits: number = 0;

  /**
   * Compute a content hash key for a given AI match input.
   * Hashes the canonical string representation of the input to produce a stable key.
   * Content-only hash enables cross-scan cache reuse for identical brand/name/weight/GTIN tuples.
   *
   * @param input - The AI match input to hash
   * @returns SHA-1 hex digest suitable for use as a cache key
   */
  static computeKey(input: {
    brand: string;
    name: string;
    weight: string;
    candidateGtins: string[];
  }): string {
    const canonical = `${input.brand}|${input.name}|${input.weight}|${[...input.candidateGtins]
      .sort()
      .join(',')}`;
    return crypto.createHash('sha1').update(canonical).digest('hex');
  }

  /**
   * NestJS lifecycle hook: initialize the cache from disk.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(CACHE_DIR, { recursive: true });

      // Try to load existing cache file
      try {
        const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent) as Record<string, CachedVerdict>;
        this.store = new Map(Object.entries(parsed));
        this.logger.log(`Loaded ${this.store.size} verdicts from cache`);
      } catch (err) {
        // File doesn't exist or is corrupt
        if (err instanceof SyntaxError) {
          this.logger.warn(
            `Cache file corrupt, renaming to .bak and starting fresh`,
          );
          try {
            await fs.rename(CACHE_FILE, `${CACHE_FILE}.bak`);
          } catch {
            // Ignore rename errors
          }
        }
        this.store = new Map();
      }
    } catch (err) {
      this.logger.error(`Failed to initialize cache: ${err}`);
      this.store = new Map();
    }
  }

  /**
   * Retrieve a cached verdict by key, optionally filtering by provider/model.
   *
   * Returns undefined (cache miss) if:
   *   - No entry exists for the key.
   *   - The cached verdict is a transient failure (allows retries).
   *   - The entry exists but does not match the provider/model filter
   *     (cross-provider rejection — `crossProviderCacheHits` is incremented
   *     so operators can detect contamination during diagnostic Ollama runs).
   *
   * @param key - The cache key (SHA-1 hash from `computeKey`)
   * @param opts - Optional filter criteria; when provided, entries whose
   *   provider/model do not contain the specified substrings (case-insensitive)
   *   are treated as misses with a separate `crossProviderCacheHits` counter.
   */
  get(key: string, opts?: AiVerdictCacheFilterOpts): CachedVerdict | undefined {
    const verdict = this.store.get(key);
    
    // Invalidate transient failures (don't return them as cache hits)
    if (verdict && (verdict.rationale === 'transient_provider_failure' || verdict.rationale === 'all_providers_failed')) {
      this.logger.debug(`Ignoring cached transient failure for key ${key.substring(0, 8)}... (rationale: ${verdict.rationale})`);
      this.cacheMisses++;
      return undefined;
    }

    // Apply provider/model filter when isolation is enabled
    if (verdict && opts) {
      if (opts.providerFilter) {
        if (!verdict.provider.toLowerCase().includes(opts.providerFilter.toLowerCase())) {
          this.cacheMisses++;
          this.crossProviderCacheHits++;
          return undefined;
        }
      }
      if (opts.modelFilter) {
        if (!verdict.model.toLowerCase().includes(opts.modelFilter.toLowerCase())) {
          this.cacheMisses++;
          this.crossProviderCacheHits++;
          return undefined;
        }
      }
    }
    
    if (verdict) {
      this.cacheHits++;
    } else {
      this.cacheMisses++;
    }
    return verdict;
  }

  /**
   * Cache a verdict with provider metadata extracted from the result.
   * Automatically extracts provider and model from the result.
   */
  set(key: string, result: AiGtinMatchResult): void {
    const cached: CachedVerdict = {
      ...result.verdict,
      cached_at: new Date().toISOString(),
      model: result.model,
      provider: result.provider,
    };
    this.store.set(key, cached);
    this.dirty = true;
    this.flushVersion++; // Bump version on every write to detect mid-flush updates
  }

  /**
   * Flush the cache to disk atomically.
   * Re-entrant: returns existing flush promise if already flushing.
   */
  async flush(): Promise<void> {
    // If already flushing, return the in-flight promise
    if (this.flushing) {
      return this.flushing;
    }

    // Skip if nothing changed
    if (!this.dirty) {
      return;
    }

    // Begin flush
    this.flushing = this.flushInternal();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  /**
   * Internal flush implementation with version-aware dirty tracking.
   */
  private async flushInternal(): Promise<void> {
    // Capture version before serialization; if it increments during flush,
    // we need to preserve dirty and chain another flush.
    const versionAtStart = this.flushVersion;
    const tmpFile = `${CACHE_FILE}.tmp.${process.pid}.${Date.now()}`;
    try {
      // Serialize store to JSON
      const data = Object.fromEntries(this.store);
      const json = JSON.stringify(data, null, 2);

      // Write to temp file
      await fs.writeFile(tmpFile, json, 'utf-8');

      // Atomic rename
      await fs.rename(tmpFile, CACHE_FILE);

      // Only clear dirty if no new writes arrived during serialization
      if (this.flushVersion === versionAtStart) {
        this.dirty = false;
      } else {
        // New writes arrived: keep dirty and chain another flush
        this.logger.debug(
          `New writes detected during flush (v${versionAtStart} -> v${this.flushVersion}); chaining another flush`,
        );
        // Schedule the next flush immediately by releasing and re-entering
        this.flushing = null;
        // Recursively trigger flush to persist the newly added data
        void this.flush();
      }

      this.logger.debug(`Flushed ${this.store.size} verdicts to cache`);
    } catch (err) {
      this.logger.error(`Failed to flush cache: ${err}`);
      // Try to clean up temp file
      try {
        await fs.unlink(tmpFile);
      } catch {
        // Ignore cleanup errors
      }
      throw err;
    }
  }

  /**
   * Get the current size of the cache.
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Get cache hit count.
   */
  getHits(): number {
    return this.cacheHits;
  }

  /**
   * Get cache miss count.
   */
  getMisses(): number {
    return this.cacheMisses;
  }

  /**
   * Get cross-provider cache hit count.
   * Incremented when an entry exists but was rejected by provider/model filter.
   * Useful for detecting cross-provider contamination during diagnostic Ollama runs.
   */
  getCrossProviderHits(): number {
    return this.crossProviderCacheHits;
  }

  /**
   * Clear the cache and mark dirty.
   * Called by Phase 3 when rebuildAiCache flag is true.
   */
  clear(): void {
    this.store.clear();
    this.dirty = true;
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.crossProviderCacheHits = 0;
    this.logger.log('Cache cleared');
  }
}
