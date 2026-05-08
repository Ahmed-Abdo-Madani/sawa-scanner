import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Directory and file constants for the brand alias cache.
 */
const CACHE_DIR = path.join(process.cwd(), 'uploads', 'backfill-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'brand-aliases.json');
const CACHE_FILE_APPROVED = path.join(CACHE_DIR, 'brand-aliases-approved.json');

/**
 * Comment 4: Extended cached brand alias entry with approval metadata.
 */
export interface CachedBrandAlias {
  slug: string | null;
  confidence: number;
  rationale: string;
  provider: string;
  model: string;
  resolved_at: string;
  approved?: boolean; // true = trusted/approved, false/undefined = provisional
  pool_size?: number; // Number of products in the pool used for this resolution
  reviewer?: string; // Optional reviewer name for approved entries
}

/**
 * Optional filter criteria for brand alias cache lookups.
 * When provided, entries are matched only if their provider and/or model
 * fields contain the specified substrings (case-insensitive).
 * When absent, all entries are accepted (no provider/model filtering).
 */
interface BrandAliasCacheFilterOpts {
  providerFilter?: string;  // case-insensitive substring match against entry.provider
  modelFilter?: string;     // case-insensitive substring match against entry.model
}

/**
 * Comment 4: BrandAliasCache — persistent JSON-on-disk cache for brand alias resolutions.
 * Splits storage into two files:
 *   - brand-aliases.json (provisional, raw model suggestions)
 *   - brand-aliases-approved.json (trusted, reviewed entries)
 * 
 * Atomic flush with temp-file rename, in-memory state tracking.
 * Enforces strict acceptance gates on new entries.
 */
@Injectable()
export class BrandAliasCache implements OnModuleInit {
  private readonly logger = new Logger(BrandAliasCache.name);

  private store: Map<string, CachedBrandAlias> = new Map(); // All entries (approved + provisional)
  private approvedStore: Map<string, CachedBrandAlias> = new Map(); // Approved-only subset
  private dirty: boolean = false;
  private dirtyApproved: boolean = false;
  private flushing: Promise<void> | null = null;
  private flushVersion: number = 0; // Tracks write generation for race detection

  /**
   * NestJS lifecycle hook: initialize the cache from disk.
   */
  async onModuleInit(): Promise<void> {
    try {
      // Ensure cache directory exists
      await fs.mkdir(CACHE_DIR, { recursive: true });

      // Load approved entries (trusted)
      try {
        const fileContent = await fs.readFile(CACHE_FILE_APPROVED, 'utf-8');
        const parsed = JSON.parse(fileContent) as Record<string, CachedBrandAlias>;
        for (const [key, entry] of Object.entries(parsed)) {
          entry.approved = true;
          this.approvedStore.set(key, entry);
          this.store.set(key, entry);
        }
        this.logger.log(`Loaded ${this.approvedStore.size} approved brand aliases from cache`);
      } catch (err) {
        // File doesn't exist or is corrupt; start fresh
        if (err instanceof SyntaxError) {
          this.logger.warn(`Approved cache file corrupt, starting fresh`);
        }
      }

      // Load provisional entries (raw suggestions)
      try {
        const fileContent = await fs.readFile(CACHE_FILE, 'utf-8');
        const parsed = JSON.parse(fileContent) as Record<string, CachedBrandAlias>;
        for (const [key, entry] of Object.entries(parsed)) {
          if (!this.store.has(key)) {
            entry.approved = false;
            this.store.set(key, entry);
          }
        }
        const provisionalCount = this.store.size - this.approvedStore.size;
        this.logger.log(`Loaded ${provisionalCount} provisional brand aliases from cache`);
      } catch (err) {
        // File doesn't exist or is corrupt; start fresh
        if (err instanceof SyntaxError) {
          this.logger.warn(`Provisional cache file corrupt, renaming to .bak and starting fresh`);
          try {
            await fs.rename(CACHE_FILE, `${CACHE_FILE}.bak`);
          } catch {
            // Ignore rename errors
          }
        }
      }
    } catch (err) {
      this.logger.error(`Failed to initialize cache: ${err}`);
    }
  }

  /**
   * Comment 4: Retrieve a cached brand alias (approved entries preferred, provisional as fallback).
   * Returns undefined if only transient failures are cached.
   */
  get(rawBrand: string): CachedBrandAlias | undefined {
    // Prefer approved entry
    const approved = this.approvedStore.get(rawBrand);
    if (approved) return approved;

    const entry = this.store.get(rawBrand);
    
    // Invalidate transient failures (don't return them as cache hits)
    if (entry && (entry.rationale === 'transient_provider_failure' || entry.rationale === 'all_providers_failed')) {
      this.logger.debug(`Ignoring cached transient failure for brand "${rawBrand}" (rationale: ${entry.rationale})`);
      return undefined;
    }
    
    return entry;
  }

  /**
   * Comment 4: Retrieve only approved entries (trusted overrides).
   * 
   * Optional filters:
   *   - providerFilter: if provided, entry must have provider containing this substring (case-insensitive).
   *   - modelFilter: if provided, entry must have model containing this substring (case-insensitive).
   * 
   * Returns undefined if no entry exists, or if entry exists but does not match the filter.
   * (The latter case signals a cross-provider cache hit when isolation is enabled.)
   */
  getApproved(rawBrand: string, opts?: BrandAliasCacheFilterOpts): CachedBrandAlias | undefined {
    const entry = this.approvedStore.get(rawBrand);
    if (!entry) return undefined;

    // Apply filters if provided
    if (opts?.providerFilter) {
      if (!entry.provider.toLowerCase().includes(opts.providerFilter.toLowerCase())) {
        return undefined;
      }
    }
    if (opts?.modelFilter) {
      if (!entry.model.toLowerCase().includes(opts.modelFilter.toLowerCase())) {
        return undefined;
      }
    }

    return entry;
  }

  /**
   * Comment 4: Retrieve only provisional entries (untrusted suggestions).
   * 
   * Optional filters (same as getApproved):
   *   - providerFilter: if provided, entry must have provider containing this substring (case-insensitive).
   *   - modelFilter: if provided, entry must have model containing this substring (case-insensitive).
   * 
   * Returns undefined if no provisional entry exists, or if entry exists but does not match the filter.
   */
  getProvisional(rawBrand: string, opts?: BrandAliasCacheFilterOpts): CachedBrandAlias | undefined {
    const entry = this.store.get(rawBrand);
    if (entry && entry.approved === false) {
      // Apply filters if provided
      if (opts?.providerFilter) {
        if (!entry.provider.toLowerCase().includes(opts.providerFilter.toLowerCase())) {
          return undefined;
        }
      }
      if (opts?.modelFilter) {
        if (!entry.model.toLowerCase().includes(opts.modelFilter.toLowerCase())) {
          return undefined;
        }
      }

      return entry;
    }
    return undefined;
  }

  /**
   * Comment 4: Cache a brand alias resolution (provisional).
   * Enforces strict acceptance gates:
   *   - slug !== null
   *   - confidence >= 0.85 (raised from 0.7)
   *   - pool_size >= 3
   *   - rationale NOT in {transient_provider_failure, all_providers_failed, no_confident_match}
   * 
   * Returns true if the entry was accepted, false if rejected.
   */
  set(rawBrand: string, entry: CachedBrandAlias): boolean {
    // Comment 4: Strict acceptance gates
    if (entry.slug === null) {
      this.logger.debug(`Rejecting brand alias for "${rawBrand}": slug is null`);
      return false;
    }

    if (entry.confidence < 0.85) {
      this.logger.debug(`Rejecting brand alias for "${rawBrand}": confidence ${entry.confidence} < 0.85`);
      return false;
    }

    const poolSize = entry.pool_size || 0;
    if (poolSize < 3) {
      this.logger.debug(`Rejecting brand alias for "${rawBrand}": pool_size ${poolSize} < 3`);
      return false;
    }

    const rejectedRationales = ['transient_provider_failure', 'all_providers_failed', 'no_confident_match'];
    if (rejectedRationales.includes(entry.rationale)) {
      this.logger.debug(`Rejecting brand alias for "${rawBrand}": rationale "${entry.rationale}" is rejected`);
      return false;
    }

    // Entry accepted; store as provisional
    entry.approved = false;
    this.store.set(rawBrand, entry);
    this.dirty = true;
    return true;
  }

  /**
   * Comment 4: Mark an entry as approved (trusted for use in override maps).
   */
  setApproved(rawBrand: string, entry: CachedBrandAlias): void {
    entry.approved = true;
    this.store.set(rawBrand, entry);
    this.approvedStore.set(rawBrand, entry);
    this.dirtyApproved = true;
    this.dirty = true;
  }

  /**
   * Comment 4: Return all approved entries, optionally filtered by provider/model.
   * 
   * When no filter is provided, returns all approved entries.
   * When providerFilter or modelFilter is provided, returns only entries
   * where the field contains the substring (case-insensitive).
   */
  getStableEntries(opts?: BrandAliasCacheFilterOpts): Map<string, CachedBrandAlias> {
    if (!opts?.providerFilter && !opts?.modelFilter) {
      // No filter: return all approved entries
      return new Map(this.approvedStore);
    }

    // Apply filter
    const filtered = new Map<string, CachedBrandAlias>();
    for (const [key, entry] of this.approvedStore.entries()) {
      let matches = true;

      if (opts.providerFilter) {
        if (!entry.provider.toLowerCase().includes(opts.providerFilter.toLowerCase())) {
          matches = false;
        }
      }

      if (opts.modelFilter && matches) {
        if (!entry.model.toLowerCase().includes(opts.modelFilter.toLowerCase())) {
          matches = false;
        }
      }

      if (matches) {
        filtered.set(key, entry);
      }
    }

    return filtered;
  }

  /**
   * Comment 4: Return all provisional entries (for diagnostics).
   */
  getProvisionalEntries(): Map<string, CachedBrandAlias> {
    const provisional = new Map<string, CachedBrandAlias>();
    for (const [key, entry] of this.store.entries()) {
      if (entry.approved === false) {
        provisional.set(key, entry);
      }
    }
    return provisional;
  }

  /**
   * Flush both provisional and approved caches to disk atomically.
   * Uses temp-file rename pattern for race-safety.
   * Re-entrant: multiple concurrent calls will serialize.
   */
  async flush(): Promise<void> {
    // If already flushing, wait for it to complete
    if (this.flushing) {
      return this.flushing;
    }

    if (!this.dirty && !this.dirtyApproved) {
      // Nothing to write
      return;
    }

    this.flushing = this.doFlush();
    try {
      await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private async doFlush(): Promise<void> {
    try {
      this.flushVersion++;
      const version = this.flushVersion;

      // Comment 4: Write provisional entries to brand-aliases.json
      if (this.dirty) {
        const provisionalMap = new Map<string, CachedBrandAlias>();
        for (const [key, entry] of this.store.entries()) {
          if (entry.approved !== true) {
            provisionalMap.set(key, entry);
          }
        }

        const provisionalPayload = JSON.stringify(
          Object.fromEntries(provisionalMap),
          null,
          2,
        );

        const tempFile = `${CACHE_FILE}.tmp-${version}`;
        await fs.writeFile(tempFile, provisionalPayload, 'utf-8');
        await fs.rename(tempFile, CACHE_FILE);
        this.dirty = false;

        this.logger.debug(
          `Flushed ${provisionalMap.size} provisional brand aliases to cache`,
        );
      }

      // Comment 4: Write approved entries to brand-aliases-approved.json
      if (this.dirtyApproved) {
        const approvedPayload = JSON.stringify(
          Object.fromEntries(this.approvedStore),
          null,
          2,
        );

        const tempFile = `${CACHE_FILE_APPROVED}.tmp-${version}`;
        await fs.writeFile(tempFile, approvedPayload, 'utf-8');
        await fs.rename(tempFile, CACHE_FILE_APPROVED);
        this.dirtyApproved = false;

        this.logger.debug(
          `Flushed ${this.approvedStore.size} approved brand aliases to cache`,
        );
      }
    } catch (err) {
      this.logger.error(`Failed to flush cache: ${err}`);
      // Mark dirty so we retry on next flush
      this.dirty = true;
      this.dirtyApproved = true;
      throw err;
    }
  }

  /**
   * Clear provisional cache entries only (keep approved aliases intact).
   * Approved entries are preserved for use in override maps.
   * Used when `rebuildBrandAliasCache=true` to clear provisional suggestions before fresh matching.
   */
  clear(): void {
    // Keep approved entries, remove provisional
    const newStore = new Map<string, CachedBrandAlias>();
    for (const [key, entry] of this.store.entries()) {
      if (entry.approved === true) {
        newStore.set(key, entry);
      }
    }
    this.store = newStore;
    this.dirty = true;
  }

  /**
   * Returns the number of cached entries (approved + provisional).
   */
  size(): number {
    return this.store.size;
  }

  /**
   * Returns an iterator over approved entries only.
   */
  entries(): IterableIterator<[string, CachedBrandAlias]> {
    return this.approvedStore.entries();
  }
}
