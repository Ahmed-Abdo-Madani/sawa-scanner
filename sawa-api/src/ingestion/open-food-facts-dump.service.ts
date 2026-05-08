import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as readline from 'readline';
import { normalizeGtin, getGtinPrefix } from '../utils/normalization';

export interface DumpStreamFilter {
  countryTags?: string[];      // replaces single countryTag
  gtinPrefixes?: string[];     // new: GS1 prefix list
  brandSlugs?: string[];       // unchanged
  requireAny?: boolean;        // default true
}

@Injectable()
export class OpenFoodFactsDumpService {
  private readonly logger = new Logger(OpenFoodFactsDumpService.name);

  /**
   * Get the local dump file path from environment or default.
   * Default: ./uploads/openfoodfacts-products.jsonl.gz
   */
  getLocalDumpPath(): string {
    return process.env.OFF_DUMP_PATH || './uploads/openfoodfacts-products.jsonl.gz';
  }

  /**
   * Validate that the dump file exists.
   * Throws if missing.
   */
  validateDumpExists(): void {
    const dumpPath = this.getLocalDumpPath();
    if (!fs.existsSync(dumpPath)) {
      throw new Error(
        `OFF dump file not found at ${dumpPath}. ` +
        `Please download from https://static.openfoodfacts.org/data/openfoodfacts-products.jsonl.gz ` +
        `and place it at the configured location or set OFF_DUMP_PATH.`
      );
    }
  }

  /**
   * Async generator that streams OFF products from the local JSONL gzip dump.
   * Filters by country tags, GTIN prefixes, and/or brand slugs.
   * 
   * Usage:
   *   for await (const product of this.streamDumpProducts({ 
   *     countryTags: ['saudi-arabia'], 
   *     gtinPrefixes: ['628', '629'],
   *     brandSlugs: ['coca-cola', 'pepsi'],
   *     requireAny: true
   *   })) {
   *     // process product
   *   }
   */
  async *streamDumpProducts(
    filter: DumpStreamFilter
  ): AsyncGenerator<any> {
    const dumpPath = this.getLocalDumpPath();
    this.validateDumpExists();

    const stream = fs.createReadStream(dumpPath);
    const gunzip = zlib.createGunzip();
    const rl = readline.createInterface({
      input: stream.pipe(gunzip),
      crlfDelay: Infinity,
    });

    let lineCount = 0;
    let skippedCount = 0;
    let yielded = 0;

    try {
      for await (const line of rl) {
        lineCount++;

        // Skip empty lines
        if (!line || line.trim().length === 0) {
          skippedCount++;
          continue;
        }

        let product: any;
        try {
          product = JSON.parse(line);
        } catch (err) {
          this.logger.debug(
            `Skipped line ${lineCount}: JSON parse error — ${err.message}`
          );
          skippedCount++;
          continue;
        }

        // Apply filters
        const countryMatch = this.matchesCountryFilter(product, filter.countryTags);
        const brandMatch = this.matchesBrandFilter(product, filter.brandSlugs);
        const prefixMatch = this.matchesGtinPrefixFilter(product, filter.gtinPrefixes);

        // Accept based on requireAny flag (default true = union semantics)
        const requireAny = filter.requireAny !== false;
        const accept = requireAny
          ? (countryMatch || brandMatch || prefixMatch)
          : (countryMatch && brandMatch && prefixMatch);

        if (accept) {
          yield product;
          yielded++;

          // Log progress every 50k rows
          if (yielded % 50000 === 0) {
            this.logger.log(
              `Streamed ${yielded} OFF products from dump (scanned ${lineCount} lines)...`
            );
          }
        }
      }
    } finally {
      rl.close();
      stream.destroy();
      gunzip.destroy();
    }

    this.logger.log(
      `Dump stream complete: yielded=${yielded}, skipped=${skippedCount}, total_scanned=${lineCount}`
    );
  }

  /**
   * Check if a product matches the country filter.
   */
  private matchesCountryFilter(product: any, countryTags?: string[]): boolean {
    if (!countryTags || countryTags.length === 0) return false;

    const countries = product.countries_tags;
    if (!Array.isArray(countries)) return false;

    return countryTags.some((tag) => {
      const fullTag = `en:${tag}`;
      return countries.includes(fullTag);
    });
  }

  /**
   * Check if a product matches the GTIN prefix filter.
   */
  private matchesGtinPrefixFilter(product: any, prefixes?: string[]): boolean {
    if (!prefixes || prefixes.length === 0) return false;

    const code = String(product.code || '');
    const gtin = normalizeGtin(code);
    if (!gtin) return false;

    const prefix = getGtinPrefix(gtin);
    if (!prefix) return false;

    return prefixes.includes(prefix);
  }

  /**
   * Check if a product matches the brand filter.
   */
  private matchesBrandFilter(product: any, brandSlugs?: string[]): boolean {
    if (!brandSlugs || brandSlugs.length === 0) return false;

    const brands = product.brands_tags;
    if (!Array.isArray(brands)) return false;

    return brands.some((tag: string) => brandSlugs.includes(tag));
  }

  /**
   * Materialize a filtered slice of the OFF dump as NDJSON.gz file.
   * Streams products matching the filter, writing each as JSON + newline,
   * compressed with gzip. Honors backpressure and ensures file is fully flushed
   * before returning.
   *
   * @param filter - DumpStreamFilter to apply
   * @param outPath - Output file path (e.g., uploads/off-slice/off_pool_<hash>.ndjson.gz)
   * @returns Promise with { written: number; durationMs: number }
   */
  async materializeSlice(
    filter: DumpStreamFilter,
    outPath: string,
  ): Promise<{ written: number; durationMs: number }> {
    const startTime = Date.now();
    let written = 0;

    // Ensure output directory exists
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    // Create gzip write stream
    const fileStream = fs.createWriteStream(outPath);
    const gzipStream = zlib.createGzip();
    gzipStream.pipe(fileStream);

    try {
      // Stream products and write them as NDJSON
      for await (const product of this.streamDumpProducts(filter)) {
        const line = JSON.stringify(product) + '\n';
        
        // Honor backpressure: check return value and wait for drain if buffer is full
        const canContinue = gzipStream.write(line);
        if (!canContinue) {
          // Buffer is full; wait for drain event before continuing
          await new Promise<void>((resolve, reject) => {
            gzipStream.once('drain', () => resolve());
            gzipStream.once('error', (err) => reject(err));
          });
        }

        written++;

        // Log progress every 50k written lines
        if (written % 50000 === 0) {
          this.logger.log(`Materialized ${written} products to slice...`);
        }
      }

      // End the gzip stream and wait for both gzip and file streams to finish
      await new Promise<void>((resolve, reject) => {
        gzipStream.end(() => {
          // gzipStream finished, now wait for fileStream to finish
          fileStream.on('finish', () => resolve());
          fileStream.on('error', (err) => reject(err));
          // If fileStream is already closed, resolve immediately
          if (fileStream.writableEnded) {
            resolve();
          }
        });
        gzipStream.on('error', (err) => reject(err));
        fileStream.on('error', (err) => reject(err));
      });

      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Slice materialized: ${written} products written to ${outPath} in ${(durationMs / 1000).toFixed(2)}s`,
      );

      return { written, durationMs };
    } catch (err) {
      // Clean up on error
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }
      throw err;
    }
  }
}

