import { Injectable, Logger } from '@nestjs/common';
import {
  normalizeProductName,
  normalizeBrandStrict,
  normalizeGtin,
  getGtinPrefix,
  isPlaceholderBrand,
  normalizeBrandUsable,
} from '../../utils/normalization';
import {
  diceCoefficient,
  normalizeWeightToGrams,
} from '../../utils/string-similarity';
import { OffCanonical } from '../open-food-facts.service';
import { MAX_CANDIDATES_PER_CALL } from './llm-gtin-match-provider.interface';

/**
 * Type representing the result of buildShortlist.
 */
export interface ShortlistResult {
  candidates: OffCanonical[];
  topScore: number;
}

/**
 * Type representing the indexes built by GtinBackfillService.
 */
export interface OffIndexes {
  offMap: Map<string, OffCanonical>;
  brandIndex: Map<string, OffCanonical[]>;
  brandWeightIndex: Map<string, OffCanonical[]>;
  gtinPrefixIndex: Map<string, OffCanonical[]>;
  // Comment 5: New inverted indexes for efficient candidate shortlisting
  nameTokenIndex?: Map<string, Set<string>>; // token → set of GTINs
  weightBandIndex?: Map<string, Set<string>>; // weight band (e.g., "100-150g") → set of GTINs
}

/**
 * Type representing a scanned product row.
 */
export interface ShortlistScanInput {
  gtin: string;
  name_en: string;
  name_ar: string;
  brand: string;
  net_weight_value: number | null;
  net_unit: string | null;
}

/**
 * CandidateShortlister — deterministic top-K builder for AI match candidates.
 * Feeds scanned product metadata against indexed OFF products and returns
 * the highest-scoring candidates based on composite scoring of name, brand, and weight.
 */
@Injectable()
export class CandidateShortlister {
  private readonly logger = new Logger(CandidateShortlister.name);

  /**
   * Helper: Get the best available OFF product name (name_en or name_ar, whichever is better).
   * Returns a single normalized name string for consistent scoring.
   */
  private getOffProductName(entry: OffCanonical): string {
    const nameEn = normalizeProductName(entry.name_en);
    const nameAr = normalizeProductName(entry.name_ar);

    // Prefer the longer normalized name; if equal, prefer English
    if (nameAr.length > nameEn.length) {
      return nameAr;
    }
    return nameEn;
  }

  /**
   * Comment 5: Tokenize product name using Unicode-safe splitting.
   * Extracts space and special-character-separated tokens.
   */
  private tokenizeUnicode(text: string): string[] {
    if (!text || text.length < 2) return [];
    // Split on whitespace and punctuation, keep tokens > 2 chars
    const tokens = text
      .toLowerCase()
      .split(/[\s\p{P}]+/u) // Split on whitespace and punctuation (Unicode-aware)
      .filter((t) => t.length > 2); // Drop short tokens
    return [...new Set(tokens)]; // Dedupe
  }

  /**
   * Comment 5: Bucketize weight into bands for efficient indexing.
   * Returns a string like "100-150g" or "unknown" if weight cannot be parsed.
   */
  private bucketizeWeight(weight: string | number, unit?: string): string {
    const grams = normalizeWeightToGrams(`${weight}${unit || ''}`);
    if (grams === null) return 'unknown';

    // Bucketization logic (matching gtin-backfill.service.ts):
    //   < 200g: 25g bands
    //   < 1000g (1kg): 50g bands
    //   >= 1000g: 100g bands
    let bandSize: number;
    if (grams < 200) {
      bandSize = 25;
    } else if (grams < 1000) {
      bandSize = 50;
    } else {
      bandSize = 100;
    }

    const bandMin = Math.floor(grams / bandSize) * bandSize;
    const bandMax = bandMin + bandSize;
    return `${bandMin}-${bandMax}g`;
  }

  /**
   * Builds a shortlist of top-K candidates from the OFF indexes.
   *
   * @param scan - Scanned product data
   * @param indexes - Pre-built OFF product indexes
   * @param K - Maximum candidates to return (default: MAX_CANDIDATES_PER_CALL)
   * @param resolvedBrandSlug - Optional pre-resolved brand slug (from brand alias resolution)
   * @returns ShortlistResult with candidates array and topScore
   */
  buildShortlist(
    scan: ShortlistScanInput,
    indexes: OffIndexes,
    K: number = MAX_CANDIDATES_PER_CALL,
    resolvedBrandSlug?: string,
  ): ShortlistResult {
    // Normalize scan inputs once for reuse
    const normalizedScanName = normalizeProductName(
      scan.name_en || scan.name_ar || '',
    );
    // Use resolved brand slug if provided; otherwise use usable normalization (treats placeholders as '')
    const normalizedBrand = resolvedBrandSlug || normalizeBrandUsable(scan.brand || '');

    // Skip-empty rule: if both name and brand are unusable, return empty
    if (normalizedScanName.length < 2 && normalizedBrand.length === 0) {
      return { candidates: [], topScore: 0 };
    }

    // Collect candidates from three pools
    const poolA = new Map<string, OffCanonical>();
    const poolB = new Map<string, OffCanonical>();
    const poolC = new Map<string, OffCanonical>();

    // Pool (a): Brand pool — only when brand is usable
    if (normalizedBrand.length > 0) {
      const brandMatches = indexes.brandIndex.get(normalizedBrand) ?? [];
      brandMatches.forEach((entry) => {
        poolA.set(entry.gtin, entry);
      });
    }

    // Pool (b): GS1 prefix pool
    const normalizedGtin = normalizeGtin(scan.gtin);
    if (normalizedGtin) {
      const prefix = getGtinPrefix(normalizedGtin);
      if (prefix) {
        const prefixMatches = indexes.gtinPrefixIndex.get(prefix) ?? [];
        prefixMatches.forEach((entry) => {
          poolB.set(entry.gtin, entry);
        });
      }
    }

    // Pool (c): Comment 5 - Use token index if available; fallback to global Dice scan
    const diceCap = K * 4;
    const tokenHotlistGtins = new Set<string>();

    if (indexes.nameTokenIndex) {
      // Comment 5: Tokenize scan name and collect GTINs from token index
      const scanNameFull = normalizedScanName || '';
      const tokens = this.tokenizeUnicode(scanNameFull);
      
      // Union all GTINs from matching tokens (capped at K*8)
      for (const token of tokens) {
        const tokenGtins = indexes.nameTokenIndex.get(token) ?? new Set();
        for (const gtin of tokenGtins) {
          if (tokenHotlistGtins.size < K * 8) {
            tokenHotlistGtins.add(gtin);
          }
        }
      }

      // Further restrict by GTIN prefix, brand, and weight band
      for (const gtin of tokenHotlistGtins) {
        const entry = indexes.offMap.get(gtin);
        if (!entry) continue;

        // Check prefix match if scan has GTIN
        let passesPrefix = true;
        if (normalizedGtin) {
          const entryPrefix = getGtinPrefix(entry.gtin);
          passesPrefix = !entryPrefix || getGtinPrefix(normalizedGtin) === entryPrefix;
        }

        // Check brand match - treat placeholder/missing brands as unconstrained
        const entryBrand = normalizeBrandStrict(entry.brand);
        const entryBrandIsPlaceholder = isPlaceholderBrand(entry.brand);
        const passesBrand = normalizedBrand.length === 0 || 
          entryBrand.length === 0 || 
          entryBrandIsPlaceholder ||
          normalizedBrand === entryBrand;

        // Check weight band match if available
        let passesWeight = true;
        if (indexes.weightBandIndex && scan.net_weight_value !== null) {
          const scanWeightStr = this.bucketizeWeight(
            scan.net_weight_value,
            scan.net_unit || '',
          );
          const entryWeightStr = this.bucketizeWeight(
            entry.weightRaw || '',
          );
          passesWeight = scanWeightStr === entryWeightStr;
        }

        if (passesPrefix && passesBrand && passesWeight) {
          poolC.set(gtin, entry);
        }
      }
    } else {
      // Comment 5: Fallback to global Dice scan (original logic)
      const globalHotlist: Array<{ entry: OffCanonical; score: number }> = [];

      indexes.offMap.forEach((entry) => {
        const offName = this.getOffProductName(entry);
        const nameDice = diceCoefficient(normalizedScanName, offName);
        if (nameDice >= 0.25) {
          globalHotlist.push({ entry, score: nameDice });
        }
      });

      // Keep top K*4 by Dice score
      globalHotlist.sort((a, b) => b.score - a.score);
      globalHotlist.slice(0, diceCap).forEach(({ entry }) => {
        poolC.set(entry.gtin, entry);
      });
    }

    // Dedupe pools into a single map keyed by GTIN
    const merged = new Map<string, OffCanonical>();
    poolA.forEach((entry, gtin) => merged.set(gtin, entry)); // Brand wins on ties
    poolB.forEach((entry, gtin) => {
      if (!merged.has(gtin)) merged.set(gtin, entry);
    });
    poolC.forEach((entry, gtin) => {
      if (!merged.has(gtin)) merged.set(gtin, entry);
    });

    // Compute composite score for each survivor
    const scanGrams = normalizeWeightToGrams(
      `${scan.net_weight_value ?? ''}${scan.net_unit ?? ''}`,
    );
    const scoreWithMetadata: Array<{
      entry: OffCanonical;
      composite: number;
    }> = [];

    merged.forEach((entry) => {
      // Name similarity - using best available OFF name
      const offName = this.getOffProductName(entry);
      const nameDice = diceCoefficient(normalizedScanName, offName);

      // Brand similarity
      const entryNormalizedBrand = normalizeBrandStrict(entry.brand);
      const brandDice =
        normalizedBrand.length > 0 && entryNormalizedBrand.length > 0
          ? diceCoefficient(normalizedBrand, entryNormalizedBrand)
          : 0;

      // Weight affinity
      const entryGrams = normalizeWeightToGrams(entry.weightRaw);
      let weightAffinity = 0.5; // Neutral default
      if (
        scanGrams !== null &&
        entryGrams !== null &&
        scanGrams > 0 &&
        entryGrams > 0
      ) {
        const maxGrams = Math.max(scanGrams, entryGrams);
        const diff = Math.abs(scanGrams - entryGrams);
        weightAffinity = 1 - Math.min(1, diff / maxGrams);
      } else if (scanGrams !== null || entryGrams !== null) {
        // One is null and the other isn't: keep neutral 0.5
        weightAffinity = 0.5;
      } else {
        // Both null: neutral
        weightAffinity = 0.5;
      }

      // Composite score
      const composite = 0.5 * nameDice + 0.3 * brandDice + 0.2 * weightAffinity;

      scoreWithMetadata.push({ entry, composite });
    });

    // Sort by composite score descending
    scoreWithMetadata.sort((a, b) => b.composite - a.composite);

    // Return top K
    const result = scoreWithMetadata.slice(0, K).map((x) => x.entry);

    // Compute topScore once, unconditionally
    const topScore = scoreWithMetadata[0]?.composite ?? 0;

    if (result.length > 0) {
      this.logger.debug(
        `Shortlist: ${result.length} candidates, top score=${topScore.toFixed(3)}`,
      );
    }

    return { candidates: result, topScore };
  }
}
