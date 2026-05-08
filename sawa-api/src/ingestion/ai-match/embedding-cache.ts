import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Metadata structure for embedding cache file.
 * Tracks the pool hash to invalidate cache when OFF pool definition changes.
 */
interface EmbeddingCacheMeta {
  poolHash: string;
  model: string;
  dim: number;
  count: number;
  gtins: string[];
  builtAt: string;
}

/**
 * Persistent cache for OFF product embeddings to amortise one-time index cost.
 * Stores dense vectors in binary format (.bin) and metadata in JSON (.meta.json).
 */
@Injectable()
export class EmbeddingCache implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingCache.name);
  private readonly CACHE_DIR = 'uploads/backfill-cache';
  private readonly BIN_FILE = 'off-embeddings.bin';
  private readonly META_FILE = 'off-embeddings.meta.json';

  onModuleInit() {
    // Ensure cache directory exists
    try {
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });
      this.logger.debug(`Embedding cache directory ensured: ${this.CACHE_DIR}`);
    } catch (error: any) {
      this.logger.warn(`Failed to create cache directory: ${error.message}`);
    }
  }

  /**
   * Loads embeddings from persistent cache if available and hash/model/dim match.
   * Returns null if cache is missing, invalidated (hash mismatch), or config mismatch.
   *
   * @param opts Options: poolHash, model, dim
   * @returns Map of GTIN to Float32Array, or null if cache not available
   */
  async load(opts: {
    poolHash: string;
    model: string;
    dim: number;
  }): Promise<Map<string, Float32Array> | null> {
    try {
      const binPath = path.join(this.CACHE_DIR, this.BIN_FILE);
      const metaPath = path.join(this.CACHE_DIR, this.META_FILE);

      // Check if files exist
      if (!fs.existsSync(binPath) || !fs.existsSync(metaPath)) {
        this.logger.debug('Embedding cache files not found; will rebuild.');
        return null;
      }

      // Load and parse metadata
      const metaContent = await fs.promises.readFile(metaPath, 'utf-8');
      const meta: EmbeddingCacheMeta = JSON.parse(metaContent);

      // Validate hash, model, dim
      if (
        meta.poolHash !== opts.poolHash ||
        meta.model !== opts.model ||
        meta.dim !== opts.dim
      ) {
        this.logger.warn(
          `Embedding cache invalidated: poolHash=${meta.poolHash !== opts.poolHash}, model=${meta.model !== opts.model}, dim=${meta.dim !== opts.dim}. Rebuilding.`,
        );
        return null;
      }

      // Load binary embedding data
      const binContent = await fs.promises.readFile(binPath);
      const buffer = new Float32Array(binContent.buffer);

      // Validate binary length and count consistency
      const expectedByteLength = meta.count * opts.dim * 4; // Float32 = 4 bytes per element
      if (binContent.length !== expectedByteLength) {
        this.logger.warn(
          `Embedding cache corrupted: expected binary length ${expectedByteLength}, got ${binContent.length}. Rebuilding.`,
        );
        return null;
      }

      if (!meta.count || !Array.isArray(meta.gtins) || meta.gtins.length !== meta.count) {
        this.logger.warn(
          `Embedding cache corrupted: count=${meta.count}, gtins.length=${meta.gtins?.length}. Rebuilding.`,
        );
        return null;
      }

      // Reconstruct map from GTINs and buffer
      const result = new Map<string, Float32Array>();
      for (let i = 0; i < meta.gtins.length; i++) {
        const gtin = meta.gtins[i];
        const start = i * opts.dim;
        const end = start + opts.dim;
        const vector = new Float32Array(buffer.slice(start, end));
        result.set(gtin, vector);
      }

      this.logger.log(
        `Loaded ${result.size} embeddings from persistent cache (${(binContent.length / 1024 / 1024).toFixed(1)} MB)`,
      );
      return result;
    } catch (error: any) {
      this.logger.warn(
        `Failed to load embedding cache: ${error.message}. Will rebuild.`,
      );
      return null;
    }
  }

  /**
   * Persists embeddings to cache (binary + metadata).
   * Uses atomic temp-file rename to ensure data integrity.
   *
   * @param map Map of GTIN to Float32Array
   * @param meta Metadata with poolHash, model, dim, builtAt
   */
  async save(
    map: Map<string, Float32Array>,
    meta: Omit<EmbeddingCacheMeta, 'count' | 'gtins'> & {
      count?: number;
      gtins?: string[];
    },
  ): Promise<void> {
    try {
      const binPath = path.join(this.CACHE_DIR, this.BIN_FILE);
      const metaPath = path.join(this.CACHE_DIR, this.META_FILE);
      const binTempPath = `${binPath}.tmp`;
      const metaTempPath = `${metaPath}.tmp`;

      // Ensure directory exists
      fs.mkdirSync(this.CACHE_DIR, { recursive: true });

      // Build binary buffer: concatenate all vectors
      const dim = meta.dim || 768;
      const totalFloats = map.size * dim;
      const buffer = new Float32Array(totalFloats);
      const gtins: string[] = [];

      let offset = 0;
      for (const [gtin, vector] of map.entries()) {
        gtins.push(gtin);
        buffer.set(vector, offset);
        offset += dim;
      }

      // Write binary temp file
      await fs.promises.writeFile(binTempPath, Buffer.from(buffer.buffer));

      // Write metadata temp file
      const fullMeta: EmbeddingCacheMeta = {
        poolHash: meta.poolHash,
        model: meta.model,
        dim: meta.dim || 768,
        count: map.size,
        gtins,
        builtAt: meta.builtAt || new Date().toISOString(),
      };
      await fs.promises.writeFile(
        metaTempPath,
        JSON.stringify(fullMeta, null, 2),
      );

      // Atomic rename
      fs.renameSync(binTempPath, binPath);
      fs.renameSync(metaTempPath, metaPath);

      this.logger.log(
        `Saved ${map.size} embeddings to persistent cache (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to save embedding cache: ${error.message}`);
      throw error;
    }
  }

  /**
   * Clears both cache files (binary and metadata).
   * Used when --rebuild-embedding-cache is passed or pool changes.
   */
  async clear(): Promise<void> {
    try {
      const binPath = path.join(this.CACHE_DIR, this.BIN_FILE);
      const metaPath = path.join(this.CACHE_DIR, this.META_FILE);

      if (fs.existsSync(binPath)) {
        fs.unlinkSync(binPath);
        this.logger.log('Cleared embedding binary cache');
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
        this.logger.log('Cleared embedding metadata cache');
      }
    } catch (error: any) {
      this.logger.warn(`Failed to clear embedding cache: ${error.message}`);
    }
  }

  /**
   * Returns current cache size (number of stored embeddings).
   */
  size(): number {
    try {
      const metaPath = path.join(this.CACHE_DIR, this.META_FILE);
      if (!fs.existsSync(metaPath)) {
        return 0;
      }
      const metaContent = fs.readFileSync(metaPath, 'utf-8');
      const meta: EmbeddingCacheMeta = JSON.parse(metaContent);
      return meta.count;
    } catch {
      return 0;
    }
  }
}
