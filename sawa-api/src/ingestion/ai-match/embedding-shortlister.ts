import { Injectable, Logger, Inject } from '@nestjs/common';
import { EMBEDDING_PROVIDER_TOKEN } from './embedding-provider.interface';
import type { EmbeddingProvider } from './embedding-provider.interface';
import { OffCanonical } from '../open-food-facts.service';
import { OffIndexes, ShortlistScanInput } from './candidate-shortlister';

/**
 * Result of a semantic embedding-based shortlist query.
 * Contains top-K candidates ranked by cosine similarity.
 */
export interface EmbeddingShortlistResult {
  candidates: OffCanonical[];
  cosines: number[]; // Cosine similarities aligned by index with candidates
  topCosine: number; // Highest cosine in the result
  queryEmbedTimeMs: number; // Wall-clock time for query embedding
  isDominantMatch?: boolean; // True if top cosine dominates the second best
}

/**
 * Semantic similarity-based shortlister using dense embeddings.
 * Performs O(N) linear scan over OFF product embeddings to find top-K
 * candidates by cosine similarity (vectors pre-normalized, so dot product = cosine).
 */
@Injectable()
export class EmbeddingShortlister {
  private readonly logger = new Logger(EmbeddingShortlister.name);
  private offVectors: Map<string, Float32Array> = new Map();
  private brandIndexByEmbedding: Map<string, string[]> = new Map(); // brand → GTINs (optional optimization)

  constructor(
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embeddingProvider: EmbeddingProvider,
  ) {}

  /**
   * Set the OFF product embedding index.
   * Called once per run after EmbeddingCache.load() or embedDocuments() completes.
   * Also optionally builds a brand index for restricted ANN when resolvedBrandSlug is provided.
   *
   * @param map Map of GTIN to normalized Float32Array embeddings
   */
  setIndex(map: Map<string, Float32Array>): void {
    this.offVectors = new Map(map);
    // Optional: build brand index for faster retrieval when brand is resolved
    // For now, we keep it simple and do full-scan; in future, build brandIndexByEmbedding
    this.logger.debug(`Embedding index set with ${map.size} vectors`);
  }

  /**
   * Builds a semantic shortlist of top-K candidates via cosine ANN over OFF embeddings.
   *
   * Process:
   * 1. Build canonical query string: `${name_en} | ${name_ar} | ${brand} | ${weightRaw}`
   * 2. Call embedQuery to get normalized query vector
   * 3. Linear scan over offVectors computing dot product (= cosine since normalized)
   * 4. Maintain min-heap of size K to track top-K matches
   * 5. Optional: pre-filter to brand if resolvedBrandSlug is provided
   * 6. Return sorted top-K with alignment to OffCanonical objects
   *
   * @param scan Scanned product input
   * @param indexes OFF product indexes (for offMap lookup)
   * @param K Maximum number of candidates to return
   * @param resolvedBrandSlug Optional brand slug to restrict ANN to that brand's bucket
   * @returns EmbeddingShortlistResult with top-K candidates and cosines
   */
  async buildShortlist(
    scan: ShortlistScanInput,
    indexes: OffIndexes,
    K: number = 30,
    resolvedBrandSlug?: string,
  ): Promise<EmbeddingShortlistResult> {
    const queryStart = Date.now();

    try {
      // 1. Build canonical query string
      const queryParts: string[] = [];
      if (scan.name_en?.trim()) queryParts.push(scan.name_en.trim());
      if (scan.name_ar?.trim()) queryParts.push(scan.name_ar.trim());
      if (scan.brand?.trim()) queryParts.push(scan.brand.trim());
      if (scan.net_weight_value && scan.net_unit?.trim()) {
        queryParts.push(`${scan.net_weight_value}${scan.net_unit}`);
      }
      const queryString = queryParts.join(' | ');

      // 2. Embed query
      const queryVector = await this.embeddingProvider.embedQuery(queryString);
      const queryEmbedTimeMs = Date.now() - queryStart;

      if (!queryVector || queryVector.length === 0) {
        this.logger.warn(`Empty query vector returned for: ${queryString}`);
        return {
          candidates: [],
          cosines: [],
          topCosine: 0,
          queryEmbedTimeMs,
        };
      }

      // 3. Build candidate pool (optionally restricted by brand)
      let candidateGtins: string[] = [];
      if (resolvedBrandSlug) {
        // Restrict to brand pool
        const brandMatches = indexes.brandIndex?.get(resolvedBrandSlug) ?? [];
        candidateGtins = brandMatches.map((c) => c.gtin);
        this.logger.debug(
          `Restricting ANN to ${candidateGtins.length} candidates in brand ${resolvedBrandSlug}`,
        );
      } else {
        // Full scan
        candidateGtins = Array.from(this.offVectors.keys());
      }

      // 4. Linear scan with min-heap of size K
      const heap: Array<{ gtin: string; cosine: number }> = [];
      let minCosineInHeap = Infinity;

      for (const gtin of candidateGtins) {
        const vector = this.offVectors.get(gtin);
        if (!vector) continue;

        // Compute dot product (cosine, since both pre-normalized)
        let cosine = 0;
        for (let i = 0; i < Math.min(queryVector.length, vector.length); i++) {
          cosine += queryVector[i] * vector[i];
        }

        // Add to heap if score is high enough or heap not full
        if (heap.length < K) {
          heap.push({ gtin, cosine });
          if (heap.length === K) {
            // Rebuild to find min efficiently
            minCosineInHeap = Math.min(...heap.map((h) => h.cosine));
          }
        } else if (cosine > minCosineInHeap) {
          // Replace min
          const minIdx = heap.findIndex((h) => h.cosine === minCosineInHeap);
          heap[minIdx] = { gtin, cosine };
          minCosineInHeap = Math.min(...heap.map((h) => h.cosine));
        }
      }

      // 5. Sort heap by descending cosine
      heap.sort((a, b) => b.cosine - a.cosine);

      // 6. Map GTINs to OffCanonical and align cosines
      const candidates: OffCanonical[] = [];
      const cosines: number[] = [];
      let topCosine = 0;
      let secondCosine = 0;

      for (let i = 0; i < heap.length; i++) {
        const { gtin, cosine } = heap[i];
        const offCanonical = indexes.offMap?.get(gtin);
        if (offCanonical) {
          candidates.push(offCanonical);
          cosines.push(cosine);
          if (i === 0) {
            topCosine = cosine;
          } else if (i === 1) {
            secondCosine = cosine;
          }
        }
      }

      // Dominant match heuristic: auto-apply when the top candidate clearly stands out.
      // - Single candidate in pool at cosine >= 0.75 is dominant by definition (no runner-up).
      // - Multiple candidates: top must be >= 0.75 with a gap of >= 0.05 over the runner-up.
      const isDominantMatch = topCosine >= 0.75 && (
        candidates.length === 1 || (topCosine - secondCosine) >= 0.05
      );

      this.logger.debug(
        `Built embedding shortlist: top ${candidates.length} candidates, topCosine=${topCosine.toFixed(4)}, queryEmbedTime=${queryEmbedTimeMs}ms`,
      );

      return { candidates, cosines, topCosine, queryEmbedTimeMs, isDominantMatch };
    } catch (error: any) {
      this.logger.error(`Failed to build embedding shortlist: ${error.message}`);
      throw error;
    }
  }
}
