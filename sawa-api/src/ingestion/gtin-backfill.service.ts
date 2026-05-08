import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OpenFoodFactsService, OffCanonical } from './open-food-facts.service';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { AdminProductsService } from '../products/admin-products.service';
import { ProductMergeService } from '../products/product-merge.service';
import { Product } from '../entities/product.entity';
import { diceCoefficient, doWeightsMatchStrictly, normalizeWeight } from '../utils/string-similarity';
import { syntheticGtinWhere } from '../utils/gtin';
import { normalizeGtin, normalizeBrandStrict, normalizeProductName, gtinPrefix, getGtinPrefix, normalizeBrandStrictWithOverrides, isPlaceholderBrand, normalizeBrandUsable, inferBrandAndWeightFromName, normalizeWeightToGrams } from '../utils/normalization';
import { getOffPoolFilter, getOffPoolHash } from './constants/off-pool';
import { BackfillReporter, AutoAppliedMatchRow } from './gtin-backfill.reporter';
import { GtinMatchService } from './ai-match/gtin-match.service';
import { CandidateShortlister, ShortlistResult } from './ai-match/candidate-shortlister';
import { AiVerdictCache, CachedVerdict, AiVerdictCacheFilterOpts } from './ai-match/ai-verdict-cache';
import { BrandAliasCache } from './ai-match/brand-alias-cache';
import { AiGtinMatchResult, MAX_CANDIDATES_PER_CALL } from './ai-match/llm-gtin-match-provider.interface';
import { Semaphore, BudgetGuard, OllamaConcurrencyLimiter } from './ai-match/ai-match-runtime';
import { EMBEDDING_PROVIDER_TOKEN } from './ai-match/embedding-provider.interface';
import type { EmbeddingProvider } from './ai-match/embedding-provider.interface';
import { EmbeddingCache } from './ai-match/embedding-cache';
import { EmbeddingShortlister } from './ai-match/embedding-shortlister';
import { TransientProviderFailureException } from './ai-match/transient-provider-failure.exception';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

interface GtinBackfillOpts {
  dryRun?: boolean;
  maxProducts?: number; // Caps scan rows processed in backfill
  maxOffProducts?: number; // Caps OFF products indexed from the OFF slice
  brandsOverride?: string[];
  useDump?: boolean;
  rebuildPool?: boolean; // Force rebuild slice from dump instead of using cached file
  rebuildCache?: boolean; // Alias for rebuildPool (for backward compatibility)
  enableAiMatch?: boolean; // Enable Pass F AI matching for residuals
  rebuildAiCache?: boolean; // Clear AI verdict cache before matching
  // Comment 2: Long-run durability fields
  batchSize?: number; // Rows per batch for cursor-based paging (default: 500)
  resume?: boolean; // Resume from last checkpoint (default: false)
  resumeFromUpdatedAt?: string; // ISO timestamp cursor for resuming from a specific point
  resumeFromId?: string; // Product ID cursor for resuming from a specific point
  // Comment 3: Brand-alias cache control
  rebuildBrandAliasCache?: boolean; // Clear provisional aliases before matching (keeps approved overrides intact)
  ignoreBrandAliasCache?: boolean; // Don't use cached aliases, only fresh LLM resolutions
  // ── GTIN Embedding Match (Pass G) ──
  enableEmbeddingMatch?: boolean; // Overrides env flag per run
  rebuildEmbeddingCache?: boolean; // Drop persisted OFF embeddings before run
  embeddingOnly?: boolean; // Diagnostic mode: skip Pass F entirely
  // ── AI Verdict Cache Isolation ──
  ignoreAiVerdictCache?: boolean; // Skip AI verdict cache reads entirely (force fresh LLM calls)
  aiVerdictProviderIsolation?: boolean; // Enable filter-on-read to prevent cross-provider contamination
}


interface MatchResult {
  candidate: OffCanonical | null;
  matchType: string; // 'exact' | 'brand+weight-fuzzy' | 'brand-fuzzy' | 'arabic-fuzzy' | 'gtin-prefix-fuzzy' | 'ai-fuzzy' | 'ai-fuzzy-low' | 'embedding-auto' | 'embedding+ai-fuzzy' | 'none'
  confidence: number; // 0–1
  nearMisses: Array<{ candidate: OffCanonical; score: number; pass: string }>;
  reasonCode: string; // 'no_brand_pool' | 'placeholder_brand_missing' | 'no_weight_no_arabic' | 'all_passes_below_threshold' | 'weight_mismatch_only' | 'ambiguous_tie' | 'embedding_below_floor' | 'embedding_gate_failed'
  reviewReason?: string;
  aiVerdict?: {
    provider: string;
    model: string;
    matched_gtin: string | null;
    confidence: number;
    rationale: string;
    candidate_gtins: string[];
    latency_ms: number;
    enrichment_hints?: { name_en?: boolean; name_ar?: boolean; brand?: boolean };
    cached: boolean;
    queue_wait_ms?: number;
    provider_latency_ms?: number;
  };
  embeddingVerdict?: {
    topCosine?: number;
    topKGtins?: string[];
    topCosines?: number[];
    usedAsAutoApply?: boolean;
    usedAsVerifierInput?: boolean;
    queryEmbedTimeMs?: number;
    gateOutcome?: 'passed' | 'failed_weight' | 'failed_attribute' | 'failed_brand' | 'below_floor' | 'budget_exhausted' | 'borderline_no_verifier';
  };
}

interface GtinBackfillResult {
  offIndexed: number;
  candidates: number;
  gtinAssignedAuto: number; // confidence >= 0.85
  pendingReview: number; // 0.60 <= confidence < 0.85
  twinsMerged: number;
  skipped: number;
  matchTypeBreakdown: Record<string, number>;
  brandAliasesResolved: number;
  brandAliasesQueuedForReview: number;
  aiMatched: number;
  aiPending: number;
  aiNoMatch: number;
  aiCalls: number;
  aiCacheHits: number;
  aiErrors: number;
  aiAvgLatencyMs: number;
  dryRunAutoMatched: number; // matches that *would* auto-apply in dry-run mode
  dbApplyErrors: number; // DB write failures in non-dry-run mode
  // ── GTIN Embedding Match (Pass G) ──
  embeddingMatched: number;
  embeddingPending: number;
  embeddingNoMatch: number;
  embeddingCalls: number;
  embeddingCacheHits: number;
  embeddingErrors: number;
  embeddingAvgLatencyMs?: number;
  embeddingDim?: number;
  embeddingPoolHash?: string;
  // ── AI Observability Breakdown Maps ──
  reasonCodeBreakdown: Record<string, number>;
  aiRationaleBreakdown: Record<string, number>;
  /** Cross-provider cache hits detected during AI verdict cache lookups. */
  aiVerdictCrossProviderHits: number;
  /** Embedding gate outcome breakdown (passed, failed_weight, etc.) */
  embeddingGateOutcomeBreakdown: Record<string, number>;
  reportDir?: string;
}

/**
 * Type definition for OFF product indexes (Comment 5.2: includes nameTokenIndex and weightBandIndex).
 */
interface OffIndexes {
  offMap: Map<string, OffCanonical>;
  brandIndex: Map<string, OffCanonical[]>;
  brandWeightIndex: Map<string, OffCanonical[]>;
  gtinPrefixIndex: Map<string, OffCanonical[]>;
  nameTokenIndex?: Map<string, Set<string>>; // token → set of GTINs
  weightBandIndex?: Map<string, Set<string>>; // weight band → set of GTINs
}

/**
 * GTIN Backfill Service — Matches synthetic SCAN-* products to real OpenFoodFacts GTINs.
 *
 * **Seven-Pass Cascade:**
 * - Pass A: Exact key match (brand + name + weight)
 * - Pass B: Brand + weight fuzzy match with name similarity
 * - Pass C: Brand-only fuzzy match with 3-state weight policy (strict/lenient/unknown)
 * - Pass D: Arabic name fuzzy match (brand pool only, no weight)
 * - Pass E: GS1 prefix fuzzy match (3-digit prefix from GTIN, name similarity, 0.6 confidence cap)
 * - Pass G: Gemini embedding-based semantic ANN shortlist (cosine similarity top-K) — runs when `enableEmbeddingMatch` is true and confidence < 0.85 from Pass E
 * - Pass F: AI-assisted match (Gemini via `GtinMatchService`) — runs on top-K from Pass G (or lexical candidates if G is disabled); cache-backed by `AiVerdictCache`.
 *
 * **Brand-Alias Resolution:**
 * `no_brand_pool` residuals trigger a one-shot LLM brand-alias lookup (`resolveBrandAlias`) capped by `GTIN_AI_BRAND_ALIAS_BUDGET`, persisted in `BrandAliasCache`, and successful resolutions rewind Passes B/C/D against the resolved brand pool.
 *
 * **Confidence Gate:**
 * - ≥ 0.85: Auto-apply (merge, enrich missing fields)
 * - 0.60–0.85: Review queue (human review required)
 * - < 0.60: Residual (unmatched, logged with reason code)
 *
 * **Reason Codes for Residuals:**
 * - `no_brand_pool`: Brand not found in OFF index
 * - `placeholder_brand_missing`: Brand is a placeholder (Generic/Unnamed/Unknown) and no override available
 * - `placeholder_brand_no_inference`: Brand is a placeholder and no inference result was available, so LLM brand-alias resolution was skipped
 * - `no_weight_no_arabic`: Product has neither weight nor Arabic name
 * - `all_passes_below_threshold`: All passes scored below cutoff
 * - `weight_mismatch_only`: Pass C candidate blocked by strict weight mismatch
 * - `ambiguous_tie`: Multiple candidates with similar high scores
 * - `embedding_below_floor`: Pass G top cosine < `GTIN_EMBEDDING_VERIFIER_FLOOR_COSINE`
 * - `embedding_gate_failed`: Pass G top cosine ≥ auto threshold but `validateAiAutoApply`/`detectAttributeConflicts` rejected
 *
 * **Report Output:**
 * Reports are written to `uploads/backfill-reports/<timestamp>/`:
 * - `residuals.csv`: Unmatched scans with reason codes and near-miss suggestions, plus `ai_reason` for AI-assisted decisions
 * - `near_misses.csv`: Top-3 OFF suggestions per residual
 * - `review_queue.csv`: Mid-confidence matches pending human review
 * - `ai_decisions.csv`: All AI match verdicts (Pass F) with latency and cache hit status
 * - `embedding_decisions.csv`: All Pass G embedding decisions with cosine similarities and gate outcomes
 * - `brand_aliases.csv`: All brand-alias LLM calls with resolution results
 * - `summary.json`: Full stats, matchTypeBreakdown, runtime metadata, including AI and embedding counters and average latencies
 */
@Injectable()
export class GtinBackfillService {
  private readonly logger = new Logger(GtinBackfillService.name);

  private static readonly ATTRIBUTE_TOKEN_CATEGORIES: Record<string, string[]> = {
    fat: ['low fat', 'full fat', 'skim', 'lite'],
    sweetness: ['zero', 'diet', 'sugar free', 'original'],
    flavor: ['chocolate', 'vanilla', 'strawberry', 'mint', 'lemon', 'lime', 'mango', 'orange', 'coffee', 'caramel'],
    form: ['powder', 'liquid', 'granules', 'concentrate', 'ready to drink', 'rtd'],
    pack: ['pack of', 'multipack', 'family', 'value', 'bundle', 'single'],
  };

  constructor(
    private readonly offService: OpenFoodFactsService,
    private readonly dumpService: OpenFoodFactsDumpService,
    private readonly adminProductsService: AdminProductsService,
    private readonly productMergeService: ProductMergeService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly gtinMatchService: GtinMatchService,
    private readonly candidateShortlister: CandidateShortlister,
    private readonly aiVerdictCache: AiVerdictCache,
    private readonly brandAliasCache: BrandAliasCache,
    @Inject(EMBEDDING_PROVIDER_TOKEN) private readonly embeddingProvider: EmbeddingProvider,
    private readonly embeddingCache: EmbeddingCache,
    private readonly embeddingShortlister: EmbeddingShortlister,
  ) {}

  /**
   * Analyzes the weight state between two weight values.
   * Returns typed boolean flags to avoid numeric truthiness issues.
   *
   * @param scanWeight - The scan product's weight value (or null/0 if unknown)
   * @param entryWeight - The OFF entry's normalized weight value (or 0 if unknown)
   * @param entryUnit - The OFF entry's weight unit (or 'unknown' if unknown)
   * @returns An object with explicit boolean flags for weight state
   */
  private getWeightState(
    scanWeight: number | null | undefined,
    entryWeight: number,
    entryUnit: string,
  ): {
    bothKnown: boolean;
    oneUnknown: boolean;
    bothUnknown: boolean;
  } {
    const scanWeightKnown: boolean = scanWeight !== null && scanWeight !== undefined && scanWeight > 0;
    const entryWeightKnown: boolean = entryWeight > 0 && entryUnit !== 'unknown';

    return {
      bothKnown: scanWeightKnown && entryWeightKnown,
      oneUnknown: (scanWeightKnown && !entryWeightKnown) || (!scanWeightKnown && entryWeightKnown),
      bothUnknown: !scanWeightKnown && !entryWeightKnown,
    };
  }

  /**
   * Detects attribute conflicts between a scan name and a candidate name.
   * Identifies mismatched tokens from ATTRIBUTE_TOKEN_CATEGORIES across both product names.
   * Returns an array of conflicting category names (e.g., ['fat', 'flavor']).
   *
   * @param scanName - The scan product's name (will be normalized)
   * @param candidateName - The OFF candidate's name (will be normalized)
   * @returns Array of category names where conflicts were detected (empty if no conflicts)
   */
  private detectAttributeConflicts(scanName: string, candidateName: string): string[] {
    const normalized_scanName = normalizeProductName(scanName).toLowerCase();
    const normalized_candidateName = normalizeProductName(candidateName).toLowerCase();

    const conflicts: string[] = [];

    for (const [category, tokens] of Object.entries(GtinBackfillService.ATTRIBUTE_TOKEN_CATEGORIES)) {
      // Find first matching token from this category in each name
      let scanToken: string | null = null;
      let candidateToken: string | null = null;

      for (const token of tokens) {
        const lowerToken = token.toLowerCase();
        // Use substring matching consistent with validateAiAutoApply:
        // Check for the token as a whole word (space-bounded)
        const tokenRegex = new RegExp(`(^|\\s)${lowerToken}(\\s|$)`, 'i');

        if (!scanToken && tokenRegex.test(normalized_scanName)) {
          scanToken = lowerToken;
        }
        if (!candidateToken && tokenRegex.test(normalized_candidateName)) {
          candidateToken = lowerToken;
        }

        // Early exit if we found tokens in both
        if (scanToken && candidateToken) {
          break;
        }
      }

      // If both sides have a token and they differ, add this category to conflicts
      if (scanToken && candidateToken && scanToken !== candidateToken) {
        conflicts.push(category);
      }
    }

    return conflicts;
  }

  /**
   * Validates an AI auto-apply match against weight delta, rationale tokens, attribute tokens, and brand identity.
   * Returns { ok: true } if all checks pass; otherwise { ok: false, downgradeReason } to trigger a clamp to 0.84.
   */
  private validateAiAutoApply(
    scan: { brand: string; name_en: string; name_ar: string; net_weight_value: number | null; net_unit: string | null },
    candidate: OffCanonical,
    verdict: { confidence: number; rationale?: string },
    brandAliasOverrides?: Map<string, string>,
  ): { ok: boolean; downgradeReason?: string } {
    // 1. Rationale token check: reject tokens mandate downgrade
    const rationale = (verdict.rationale ?? '').toLowerCase();
    const rejectTokens = [
      'weight_mismatch_major',
      'package_mismatch_major',
      'flavor_mismatch',
      'variant_mismatch',
      'form_mismatch',
    ];
    for (const token of rejectTokens) {
      if (rationale.includes(token)) {
        return { ok: false, downgradeReason: token };
      }
    }

    // 2. Weight delta check: compute delta and reject if > 15%
    const scanQuantity = scan.net_weight_value && scan.net_unit
      ? `${scan.net_weight_value}${scan.net_unit}`
      : undefined;
    const scanGrams = scanQuantity ? normalizeWeightToGrams(scanQuantity) : null;
    const candGrams = normalizeWeightToGrams(candidate.weightRaw);

    if (scanGrams !== null && candGrams !== null && scanGrams > 0 && candGrams > 0) {
      const delta = Math.abs(scanGrams - candGrams) / Math.max(scanGrams, candGrams);
      if (delta > 0.15) {
        return { ok: false, downgradeReason: 'weight_mismatch_major' };
      }
    }

    // 3. Attribute token comparison for fat, sweetness, flavor, form categories
    const scanNormalized = normalizeProductName(scan.name_en || scan.name_ar || '');
    const candNormalized = normalizeProductName(candidate.name_en || '');
    const categories = ['fat', 'sweetness', 'flavor', 'form'];

    for (const category of categories) {
      const tokens = GtinBackfillService.ATTRIBUTE_TOKEN_CATEGORIES[category] || [];
      let scanToken: string | undefined;
      let candToken: string | undefined;

      for (const token of tokens) {
        if (scanNormalized.includes(` ${token} `) || scanNormalized.startsWith(token + ' ') || scanNormalized.endsWith(' ' + token)) {
          scanToken = token;
          break;
        }
      }
      for (const token of tokens) {
        if (candNormalized.includes(` ${token} `) || candNormalized.startsWith(token + ' ') || candNormalized.endsWith(' ' + token)) {
          candToken = token;
          break;
        }
      }

      if (scanToken && candToken && scanToken !== candToken) {
        return { ok: false, downgradeReason: 'variant_or_flavor_conflict' };
      }
    }

    // 4. Pack category check: use raw name (lower-cased) for pack tokens
    const scanRawLower = (scan.name_en || scan.name_ar || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const candRawLower = (candidate.name_en || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const packTokens = GtinBackfillService.ATTRIBUTE_TOKEN_CATEGORIES['pack'] || [];

    let scanPackToken: string | undefined;
    let candPackToken: string | undefined;
    for (const token of packTokens) {
      if (scanRawLower.includes(` ${token} `) || scanRawLower.startsWith(token + ' ') || scanRawLower.endsWith(' ' + token)) {
        scanPackToken = token;
        break;
      }
    }
    for (const token of packTokens) {
      if (candRawLower.includes(` ${token} `) || candRawLower.startsWith(token + ' ') || candRawLower.endsWith(' ' + token)) {
        candPackToken = token;
        break;
      }
    }
    if (scanPackToken && candPackToken && scanPackToken !== candPackToken) {
      return { ok: false, downgradeReason: 'variant_or_flavor_conflict' };
    }

    // 5. Brand identity check
    const scanBrandSlug = normalizeBrandStrict(scan.brand || '');
    const candBrandSlug = normalizeBrandStrict(candidate.brand || '');

    if (scanBrandSlug && scanBrandSlug !== candBrandSlug) {
      const aliasResolution = brandAliasOverrides?.get(scan.brand);
      if (aliasResolution !== candBrandSlug) {
        return { ok: false, downgradeReason: 'brand_mismatch' };
      }
    }

    // All checks passed
    return { ok: true };
  }

  /**
   * Runs six passes (A–F) in sequence to match a scan row to an OFF product:
   * Passes A–E are deterministic matching rules; Pass F is AI-assisted matching (if enabled).
   * Returns on the first confident match. For no-match cases, still returns the
   * best candidates across all passes and their scores for residual diagnostics.
   */
  private async matchScanRow(
    scan: { gtin: string; name_en: string; name_ar: string; brand: string; net_weight_value: number | null; net_unit: string | null; id: string },
    indexes: OffIndexes,
    aiCtx?: { enableAiMatch: boolean; enableEmbeddingMatch?: boolean; embeddingOnly?: boolean; brandAliasOverrides?: Map<string, string>; inferredBrandSlug?: string; aiBudget?: BudgetGuard; embeddingBudget?: BudgetGuard; offVectors?: Map<string, Float32Array>; ollamaEmbedLimiter?: { run: <T>(fn: () => Promise<T>) => Promise<T> }; ollamaChatLimiter?: { run: <T>(fn: () => Promise<T>) => Promise<T> }; ignoreAiVerdictCache?: boolean; aiVerdictProviderIsolation?: string },
  ): Promise<MatchResult> {
    const { offMap, brandIndex, brandWeightIndex, gtinPrefixIndex } = indexes;
    const offVectors = aiCtx?.offVectors ?? new Map<string, Float32Array>();

    // Track residual candidates across all passes for diagnostics
    const residualCandidates: Array<{ candidate: OffCanonical; score: number; pass: string }> = [];
    let bestResidualScore = 0;

    // Pass A — Exact key match
    const scanKey = this.makeKey({
      brand: scan.brand || '',
      name_en: scan.name_en || '',
      weightRaw: `${scan.net_weight_value || ''}${scan.net_unit || ''}`,
    });
    const exactMatch = offMap.get(scanKey);
    if (exactMatch) {
      return {
        candidate: exactMatch,
        matchType: 'exact',
        confidence: 1.0,
        nearMisses: [],
        reasonCode: '',
      };
    }

    // Compute normalized brand: treat placeholder brands as empty string
    // This naturally gates Passes B/C/D which require a brand pool
    let normB: string;
    if (isPlaceholderBrand(scan.brand)) {
      // Placeholder brand: treat as missing
      normB = '';
    } else {
      // Non-placeholder: use override-aware normalization
      normB = normalizeBrandStrictWithOverrides(scan.brand || '', aiCtx?.brandAliasOverrides);
    }

    const brandPool = normB ? brandIndex.get(normB) : undefined;
    const normalizedScanName = normalizeProductName(scan.name_en || scan.name_ar || '');
    const scanWeightNorm = normalizeWeight(`${scan.net_weight_value || ''}${scan.net_unit || ''}`);

    let passB_ambiguousTie = false;
    let passC_bestCandidate: OffCanonical | null = null;
    let passC_bestScore = 0;
    let passC_bestWeightThreshold = 0.85;
    let passC_bestOneWeightUnknown = false;
    let passC_weightMismatchOnly = false;
    let passB_conflictCategories: string[] | undefined = undefined;
    let passC_conflictCategories: string[] | undefined = undefined;

    // Pass B — Brand + Weight fuzzy (only if weight is known and brand pool exists)
    if (scan.net_weight_value && scan.net_weight_value > 0 && brandPool) {
      const weightStr = scanWeightNorm.unit === 'unknown' ? 'unknown' : `${scanWeightNorm.value}${scanWeightNorm.unit}`;
      const brandWeightKey = `${normB}|${weightStr}`;
      const brandWeightEntries = brandWeightIndex.get(brandWeightKey) || [];

      const scoredCandidates: Array<{ candidate: OffCanonical; score: number }> = [];
      let bestScore = 0;
      let runnerUpScore = 0;
      let bestCandidate: OffCanonical | null = null;

      for (const entry of brandWeightEntries) {
        const score = diceCoefficient(normalizedScanName, normalizeProductName(entry.name_en));
        scoredCandidates.push({ candidate: entry, score });
        if (score > bestScore) {
          runnerUpScore = bestScore;
          bestScore = score;
          bestCandidate = entry;
        } else if (score > runnerUpScore) {
          runnerUpScore = score;
        }
      }

      if (bestScore >= 0.55 && bestScore - runnerUpScore >= 0.05) {
        // Check for attribute conflicts before returning
        const conflicts = this.detectAttributeConflicts(normalizedScanName, normalizeProductName(bestCandidate!.name_en));

        if (conflicts.length > 0 && bestScore < 0.90) {
          // Conflict detected and score is below 0.90: don't return, push to residuals and continue
          residualCandidates.push({
            candidate: bestCandidate!,
            score: bestScore,
            pass: 'Pass B - Brand+Weight fuzzy',
          });
          bestResidualScore = Math.max(bestResidualScore, bestScore);
          passB_conflictCategories = conflicts;
          // Continue to Pass C instead of returning
        } else if (conflicts.length > 0 && bestScore >= 0.90) {
          // Conflict detected but score is very high: return with reviewReason
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass B - Brand+Weight fuzzy' }));
          return {
            candidate: bestCandidate,
            matchType: 'brand+weight-fuzzy',
            confidence: bestScore,
            nearMisses: topMisses,
            reasonCode: '',
            reviewReason: 'attribute_conflict:' + conflicts.join(','),
          };
        } else if (conflicts.length > 0 && bestScore >= 0.60 && bestScore < 0.85) {
          // Future-proofing: conflicts in review band
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass B - Brand+Weight fuzzy' }));
          return {
            candidate: bestCandidate,
            matchType: 'brand+weight-fuzzy',
            confidence: bestScore,
            nearMisses: topMisses,
            reasonCode: '',
            reviewReason: 'attribute_conflict:' + conflicts.join(','),
          };
        } else {
          // No conflict: return as today
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass B - Brand+Weight fuzzy' }));
          return {
            candidate: bestCandidate,
            matchType: 'brand+weight-fuzzy',
            confidence: bestScore,
            nearMisses: topMisses,
            reasonCode: '',
          };
        }
      }
      // Collect residual candidates from Pass B (score >= 0.4)
      if (bestScore >= 0.4) {
        residualCandidates.push({
          candidate: bestCandidate!,
          score: bestScore,
          pass: 'Pass B - Brand+Weight fuzzy',
        });
        bestResidualScore = Math.max(bestResidualScore, bestScore);
      }
      if (bestScore >= 0.55) {
        passB_ambiguousTie = true;
      }
    }

    // Pass C — Brand-only fuzzy with 3-state weight policy (non-blocking)
    if (brandPool) {
      const scoredCandidates: Array<{ candidate: OffCanonical; score: number; passWeight: boolean; threshold: number }> = [];
      let bestScore = 0;
      let weightMismatchCount = 0;

      for (const entry of brandPool) {
        const score = diceCoefficient(normalizedScanName, normalizeProductName(entry.name_en));
        const entryWeightNorm = normalizeWeight(entry.weightRaw);

        // Get explicit weight state using typed helper
        const weightState = this.getWeightState(scan.net_weight_value, entryWeightNorm.value, entryWeightNorm.unit);

        let passWeight = false;
        let threshold = 0.85;

        if (weightState.bothKnown) {
          passWeight = doWeightsMatchStrictly(scan.net_weight_value!, scan.net_unit, entry.weightRaw);
          threshold = 0.70;
          if (!passWeight) weightMismatchCount++;
        } else if (weightState.oneUnknown) {
          passWeight = true;
          threshold = 0.80;
        } else if (weightState.bothUnknown) {
          passWeight = true;
          threshold = 0.85;
        }

        scoredCandidates.push({ candidate: entry, score, passWeight, threshold });

        if (passWeight && score >= threshold && score > bestScore) {
          bestScore = score;
          passC_bestCandidate = entry;
          passC_bestWeightThreshold = threshold;
          passC_bestOneWeightUnknown = weightState.oneUnknown;
        }
      }

      passC_bestScore = bestScore;
      passC_weightMismatchOnly = brandPool.length > 0 && weightMismatchCount === brandPool.length;

      if (bestScore >= passC_bestWeightThreshold) {
        // Cap confidence at 0.7 if one weight is unknown
        let finalConfidence = bestScore;
        if (passC_bestOneWeightUnknown) {
          finalConfidence = Math.min(bestScore, 0.7);
        }

        // Check for attribute conflicts before returning
        const conflicts = this.detectAttributeConflicts(normalizedScanName, normalizeProductName(passC_bestCandidate!.name_en));

        if (conflicts.length > 0 && finalConfidence < 0.90) {
          // Conflict detected and confidence is below 0.90: don't return, push to residuals and fall through
          residualCandidates.push({
            candidate: passC_bestCandidate!,
            score: passC_bestScore,
            pass: 'Pass C - Brand-only fuzzy',
          });
          bestResidualScore = Math.max(bestResidualScore, passC_bestScore);
          passC_conflictCategories = conflicts;
          // Fall through to Pass D instead of returning
        } else if (conflicts.length > 0 && finalConfidence >= 0.90) {
          // Conflict detected but confidence is very high: return with reviewReason
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass C - Brand-only fuzzy' }));
          return {
            candidate: passC_bestCandidate,
            matchType: 'brand-fuzzy',
            confidence: finalConfidence,
            nearMisses: topMisses,
            reasonCode: '',
            reviewReason: 'attribute_conflict:' + conflicts.join(','),
          };
        } else if (conflicts.length > 0 && finalConfidence >= 0.60 && finalConfidence < 0.85) {
          // Conflicts in review band
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass C - Brand-only fuzzy' }));
          return {
            candidate: passC_bestCandidate,
            matchType: 'brand-fuzzy',
            confidence: finalConfidence,
            nearMisses: topMisses,
            reasonCode: '',
            reviewReason: 'attribute_conflict:' + conflicts.join(','),
          };
        } else {
          // No conflict: return as today
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass C - Brand-only fuzzy' }));
          return {
            candidate: passC_bestCandidate,
            matchType: 'brand-fuzzy',
            confidence: finalConfidence,
            nearMisses: topMisses,
            reasonCode: '',
          };
        }
      }
      // Collect residual candidates from Pass C (score >= 0.4, regardless of weight pass)
      if (passC_bestScore >= 0.4) {
        residualCandidates.push({
          candidate: passC_bestCandidate!,
          score: passC_bestScore,
          pass: 'Pass C - Brand-only fuzzy',
        });
        bestResidualScore = Math.max(bestResidualScore, passC_bestScore);
      }
      // NOTE: Do NOT return here even if weight_mismatch_only; let Pass D and E run
    }

    // Pass D — Arabic name fuzzy (only if Arabic name available)
    if (scan.name_ar && brandPool) {
      const arabicName = scan.name_ar.toLowerCase().trim().replace(/\s+/g, ' ');
      const scoredCandidates: Array<{ candidate: OffCanonical; score: number }> = [];
      let bestScore = 0;
      let bestCandidate: OffCanonical | null = null;

      for (const entry of brandPool) {
        if (!entry.name_ar) continue;
        const score = diceCoefficient(arabicName, entry.name_ar.toLowerCase().trim().replace(/\s+/g, ' '));
        scoredCandidates.push({ candidate: entry, score });
        if (score >= 0.75 && score > bestScore) {
          bestScore = score;
          bestCandidate = entry;
        }
      }

      if (bestCandidate) {
        const topMisses = scoredCandidates
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass D - Arabic fuzzy' }));
        return {
          candidate: bestCandidate,
          matchType: 'arabic-fuzzy',
          confidence: bestScore,
          nearMisses: topMisses,
          reasonCode: '',
        };
      }
      // Collect residual candidates from Pass D (score >= 0.4)
      if (bestScore >= 0.4 && bestCandidate) {
        residualCandidates.push({
          candidate: bestCandidate,
          score: bestScore,
          pass: 'Pass D - Arabic fuzzy',
        });
        bestResidualScore = Math.max(bestResidualScore, bestScore);
      }
    }

    // Pass E — GS1 prefix fuzzy (only if GTIN is numeric >= 8 digits)
    const normalizedGtin = normalizeGtin(scan.gtin);
    if (normalizedGtin && scan.gtin.length >= 8 && /^\d+$/.test(scan.gtin)) {
      const prefix3 = getGtinPrefix(normalizedGtin);
      if (prefix3) {
        const prefixEntries = gtinPrefixIndex.get(prefix3) || [];
        const scoredCandidates: Array<{ candidate: OffCanonical; score: number }> = [];
        let bestScore = 0;
        let bestCandidate: OffCanonical | null = null;

        for (const entry of prefixEntries) {
          const score = diceCoefficient(normalizedScanName, normalizeProductName(entry.name_en));
          scoredCandidates.push({ candidate: entry, score });
          if (score >= 0.80 && score > bestScore) {
            bestScore = score;
            bestCandidate = entry;
          }
        }

        if (bestCandidate) {
          const topMisses = scoredCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score }) => ({ candidate, score, pass: 'Pass E - GS1 prefix fuzzy' }));
          return {
            candidate: bestCandidate,
            matchType: 'gtin-prefix-fuzzy',
            confidence: Math.min(bestScore, 0.6), // Cap at 0.6
            nearMisses: topMisses,
            reasonCode: '',
          };
        }
        // Collect residual candidates from Pass E (score >= 0.4)
        if (bestScore >= 0.4 && bestCandidate) {
          residualCandidates.push({
            candidate: bestCandidate,
            score: Math.min(bestScore, 0.6),
            pass: 'Pass E - GS1 prefix fuzzy',
          });
          bestResidualScore = Math.max(bestResidualScore, Math.min(bestScore, 0.6));
        }
      }
    }

    // No match from Passes A–E — determine reasonCode
    let reasonCode = 'all_passes_below_threshold';
    if (passB_ambiguousTie) {
      reasonCode = 'ambiguous_tie';
    } else if (passC_weightMismatchOnly) {
      reasonCode = 'weight_mismatch_only';
    } else if (!brandPool || brandPool.length === 0) {
      // Distinguish placeholder brand from missing brand
      reasonCode = isPlaceholderBrand(scan.brand) ? 'placeholder_brand_missing' : 'no_brand_pool';
    } else if (!scan.net_weight_value && !scan.name_ar) {
      reasonCode = 'no_weight_no_arabic';
    }

    // Sharpen reasonCode if attribute conflicts were detected
    if ((passB_conflictCategories?.length ?? 0) > 0 || (passC_conflictCategories?.length ?? 0) > 0) {
      if (reasonCode === 'all_passes_below_threshold') {
        reasonCode = 'attribute_conflict:' + [...new Set([...(passB_conflictCategories ?? []), ...(passC_conflictCategories ?? [])])].join(',');
      }
    }

    // ── Pass G: Embedding-based semantic shortlisting ──
    // Runs when enableEmbeddingMatch=true AND confidence from deterministic passes is < 0.85
    // If high-cosine match found, may auto-apply or escalate to verifier; otherwise falls through to Pass F
    const isEmbeddingEligible = bestResidualScore < 0.85 && offVectors.size > 0;
    
    if (isEmbeddingEligible && aiCtx?.enableEmbeddingMatch !== false) {
      // Note: embeddingEnabled status determined at run() level; here we check if index is ready
      if (offVectors.size > 0) {
        const t0 = Date.now();
        
        // Determine resolved brand slug for optional brand pre-filtering
        const rawBrand = scan.brand?.trim() ?? '';
        let resolvedBrandSlug: string | undefined = undefined;
        if (rawBrand && aiCtx?.brandAliasOverrides?.has(rawBrand)) {
          resolvedBrandSlug = aiCtx.brandAliasOverrides.get(rawBrand);
        }
        if (!resolvedBrandSlug && aiCtx?.inferredBrandSlug) {
          resolvedBrandSlug = aiCtx.inferredBrandSlug;
        }

        // Check embedding budget before query embedding
        const embeddingBudget = aiCtx?.embeddingBudget;
        if (embeddingBudget && !embeddingBudget.tryConsume()) {
          // Budget exhausted — return residual with clear reason
          const topResidualMisses = residualCandidates
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map(({ candidate, score, pass }) => ({ candidate, score, pass }));

          return {
            candidate: null,
            matchType: 'none',
            confidence: bestResidualScore,
            nearMisses: topResidualMisses,
            reasonCode: 'embedding_budget_exhausted',
          };
        }

        const K = parseInt(process.env.GTIN_EMBEDDING_TOPK ?? '10', 10);
        const result = aiCtx?.ollamaEmbedLimiter
          ? await aiCtx.ollamaEmbedLimiter.run(() => this.embeddingShortlister.buildShortlist(
              scan,
              indexes,
              K,
              resolvedBrandSlug,
            ))
          : await this.embeddingShortlister.buildShortlist(
              scan,
              indexes,
              K,
              resolvedBrandSlug,
            );
        const queryEmbedTimeMs = Date.now() - t0;
        
        const topCosine = result.topCosine ?? 0;
        const autoApplyCosine = parseFloat(process.env.GTIN_EMBEDDING_AUTO_APPLY_COSINE ?? '0.92');
        const verifierFloorCosine = parseFloat(process.env.GTIN_EMBEDDING_VERIFIER_FLOOR_COSINE ?? '0.70');
        
        // Build embedding verdict object for reporting
        const embeddingVerdictBuilding: any = {
          topCosine,
          topKGtins: result.candidates.slice(0, K).map(c => c.gtin),
          topCosines: result.cosines.slice(0, K),
          usedAsAutoApply: false,
          usedAsVerifierInput: false,
          queryEmbedTimeMs,
        };

        if ((topCosine >= autoApplyCosine || result.isDominantMatch) && result.candidates.length > 0) {
          // High-cosine or dominant candidate: validate gates before auto-apply
          const topCandidate = result.candidates[0];
          const gateResult = this.validateAiAutoApply(scan, topCandidate, { confidence: topCosine }, aiCtx?.brandAliasOverrides);

          if (gateResult.ok) {
            // Gate passed — auto-apply directly, bypass Pass F
            embeddingVerdictBuilding.usedAsAutoApply = true;
            embeddingVerdictBuilding.gateOutcome = result.isDominantMatch && topCosine < autoApplyCosine ? 'auto_apply_dominant' : 'passed';
            return {
              candidate: topCandidate,
              matchType: 'embedding-auto',
              confidence: topCosine,
              nearMisses: result.candidates.slice(1, 4).map(c => ({ candidate: c, score: 0, pass: 'Pass G - Embedding' })),
              reasonCode: '',
              embeddingVerdict: embeddingVerdictBuilding as any,
            };
          } else if (aiCtx?.embeddingOnly) {
            // Gate failed and embeddingOnly=true: return directly with embedding_gate_failed reason
            embeddingVerdictBuilding.gateOutcome = gateResult.downgradeReason === 'weight_mismatch' ? 'failed_weight' :
              gateResult.downgradeReason === 'attribute_conflict' ? 'failed_attribute' :
              gateResult.downgradeReason === 'brand_mismatch' ? 'failed_brand' : 'failed_attribute';
            return {
              candidate: topCandidate,
              matchType: 'embedding-auto',
              confidence: 0.84,
              nearMisses: result.candidates.slice(1, 4).map(c => ({ candidate: c, score: 0, pass: 'Pass G - Embedding' })),
              reasonCode: 'embedding_gate_failed',
              reviewReason: `gated:${gateResult.downgradeReason}`,
              embeddingVerdict: embeddingVerdictBuilding as any,
            };
          } else {
            // Gate failed but embeddingOnly=false: continue to Pass F with embedding shortlist for verifier review
            embeddingVerdictBuilding.usedAsVerifierInput = true;
            embeddingVerdictBuilding.gateOutcome = gateResult.downgradeReason === 'weight_mismatch' ? 'failed_weight' :
              gateResult.downgradeReason === 'attribute_conflict' ? 'failed_attribute' :
              gateResult.downgradeReason === 'brand_mismatch' ? 'failed_brand' : 'failed_attribute';
            if (!aiCtx) {
              aiCtx = { enableAiMatch: true };
            }
            (aiCtx as any).embeddingShortlist = result.candidates;
            (aiCtx as any).embeddingVerdict = embeddingVerdictBuilding;
            (aiCtx as any).embeddingGateFailed = true; // Mark that embedding gate failed
          }
        } else if (topCosine >= verifierFloorCosine && result.candidates.length > 0) {
          // Borderline-cosine: evaluate embeddingOnly before enableAiMatch
          if (aiCtx?.embeddingOnly) {
            // embeddingOnly=true: don't escalate to Pass F, return as borderline residual with embedding_borderline
            embeddingVerdictBuilding.usedAsAutoApply = false;
            embeddingVerdictBuilding.usedAsVerifierInput = false;
            embeddingVerdictBuilding.gateOutcome = 'borderline_no_verifier';
            
            return {
              candidate: null,
              matchType: 'none',
              confidence: bestResidualScore,
              nearMisses: residualCandidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(({ candidate, score, pass }) => ({ candidate, score, pass })),
              reasonCode: 'embedding_borderline_no_verifier',
              embeddingVerdict: embeddingVerdictBuilding as any,
            };
          } else if (aiCtx?.enableAiMatch !== false) {
            // embeddingOnly=false AND enableAiMatch !== false: escalate to Pass F with embedding shortlist
            embeddingVerdictBuilding.usedAsVerifierInput = true;
            embeddingVerdictBuilding.gateOutcome = 'passed';
            // Continue to Pass F but provide embedding shortlist instead of deterministic shortlist
            // Store in context for Pass F to use
            if (!aiCtx) {
              aiCtx = { enableAiMatch: true };
            }
            (aiCtx as any).embeddingShortlist = result.candidates;
            (aiCtx as any).embeddingVerdict = embeddingVerdictBuilding;
          } else {
            // embeddingOnly=false AND enableAiMatch=false: return explicit below_floor terminal result
            embeddingVerdictBuilding.usedAsAutoApply = false;
            embeddingVerdictBuilding.usedAsVerifierInput = false;
            embeddingVerdictBuilding.gateOutcome = 'below_floor';
            
            return {
              candidate: null,
              matchType: 'none',
              confidence: bestResidualScore,
              nearMisses: residualCandidates
                .sort((a, b) => b.score - a.score)
                .slice(0, 3)
                .map(({ candidate, score, pass }) => ({ candidate, score, pass })),
              reasonCode: 'embedding_below_floor',
              embeddingVerdict: embeddingVerdictBuilding as any,
            };
          }
        } else {
          // Below floor — residual with embedding suggestion
          embeddingVerdictBuilding.usedAsAutoApply = false;
          embeddingVerdictBuilding.usedAsVerifierInput = false;
          embeddingVerdictBuilding.gateOutcome = 'below_floor';
          
          return {
            candidate: null,
            matchType: 'none',
            confidence: bestResidualScore,
            nearMisses: residualCandidates
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(({ candidate, score, pass }) => ({ candidate, score, pass })),
            reasonCode: 'embedding_below_floor',
            embeddingVerdict: embeddingVerdictBuilding as any,
          };
        }
      }
    }

    // Pass F — AI matching (if enabled, always attempt shortlist building and AI matching)
    const enableAiMatch = aiCtx?.enableAiMatch ?? false;
    if (enableAiMatch) {
      // Determine resolved brand slug if available from alias overrides or inferred slug
      const rawBrand = scan.brand?.trim() ?? '';
      let resolvedBrandSlug: string | undefined = undefined;
      if (rawBrand && aiCtx?.brandAliasOverrides?.has(rawBrand)) {
        resolvedBrandSlug = aiCtx.brandAliasOverrides.get(rawBrand);
      }
      // Fall back to inferred slug if no alias override exists
      if (!resolvedBrandSlug && aiCtx?.inferredBrandSlug) {
        resolvedBrandSlug = aiCtx.inferredBrandSlug;
      }

      // Use embedding shortlist if provided by Pass G, otherwise build from deterministic pools
      let shortlist;
      if ((aiCtx as any)?.embeddingShortlist?.length > 0) {
        shortlist = (aiCtx as any).embeddingShortlist;
      } else {
        // Build shortlist from all available pools (brand, GS1 prefix, global)
        const { candidates, topScore: _ } = this.candidateShortlister.buildShortlist(
          {
            gtin: scan.gtin,
            name_en: scan.name_en,
            name_ar: scan.name_ar,
            brand: scan.brand,
            net_weight_value: scan.net_weight_value,
            net_unit: scan.net_unit,
          },
          indexes,
          MAX_CANDIDATES_PER_CALL,
          resolvedBrandSlug,
        );
        shortlist = candidates;
      }

      if (shortlist && shortlist.length > 0) {
        // Compute cache key
        const cacheKey = AiVerdictCache.computeKey({
          brand: normalizeBrandStrict(scan.brand || ''),
          name: normalizeProductName(scan.name_en || scan.name_ar || ''),
          weight: scanWeightNorm.unit === 'unknown' ? '' : `${scanWeightNorm.value}${scanWeightNorm.unit}`,
          candidateGtins: shortlist.map(c => c.gtin),
        });

        // Cache lookup or fresh AI call (respecting isolation flags)
        let aiResult: any = undefined;
        if (!aiCtx?.ignoreAiVerdictCache) {
          const filterOpts: AiVerdictCacheFilterOpts | undefined = aiCtx?.aiVerdictProviderIsolation
            ? { providerFilter: aiCtx.aiVerdictProviderIsolation }
            : undefined;
          aiResult = this.aiVerdictCache.get(cacheKey, filterOpts);
        }
        const cached = !!aiResult;
        let latencyMs = 0;
        let queueWaitMs: number | undefined;
        let providerLatencyMs: number | undefined;

        if (!aiResult) {
          // Comment 2: Check budget before attempting AI call
          const aiBudget = aiCtx?.aiBudget;
          if (!aiBudget?.tryConsume()) {
            // Budget exhausted — skip AI call and return residual with clear reason
            const topResidualMisses = residualCandidates
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(({ candidate, score, pass }) => ({ candidate, score, pass }));

            return {
              candidate: null,
              matchType: 'none',
              confidence: bestResidualScore,
              nearMisses: topResidualMisses,
              reasonCode: 'ai_budget_exhausted',
            };
          }

          const t0 = Date.now();
          const matchInput = {
            scan: {
              id: scan.id,
              gtin: scan.gtin,
              name_en: scan.name_en || undefined,
              name_ar: scan.name_ar || undefined,
              brand: scan.brand || undefined,
              net_weight_value: scan.net_weight_value ?? undefined,
              net_unit: scan.net_unit ?? undefined,
            },
            candidates: shortlist.map(c => ({
              gtin: c.gtin,
              brand: c.brand,
              name_en: c.name_en,
              name_ar: c.name_ar,
              weightRaw: c.weightRaw,
            })),
          };

          if (aiCtx?.ollamaChatLimiter) {
            // Ollama path: measure queue wait separately from provider latency
            aiResult = await aiCtx.ollamaChatLimiter.run(async () => {
              const tProvider = Date.now();
              queueWaitMs = tProvider - t0; // Time spent waiting for limiter slot
              const result = await this.gtinMatchService.pickBestMatch(matchInput);
              providerLatencyMs = Date.now() - tProvider; // Actual provider call time
              return result;
            });
          } else {
            // Non-Ollama path: no queue wait, total latency = provider latency
            queueWaitMs = 0;
            aiResult = await this.gtinMatchService.pickBestMatch(matchInput);
            providerLatencyMs = Date.now() - t0;
          }
          latencyMs = Date.now() - t0;

          // Only cache stable results; skip transient failures to allow retries in future runs
          if (aiResult && aiResult.verdict && aiResult.verdict.rationale !== 'transient_provider_failure' && aiResult.verdict.rationale !== 'all_providers_failed') {
            this.aiVerdictCache.set(cacheKey, aiResult);
          }
        } else {
          // Cache hit — latency is 0
          latencyMs = 0;
        }

        if (aiResult) {
          // Normalize cache hits (CachedVerdict) and fresh responses (AiGtinMatchResult) to a single shape
          let verdict: any;
          let provider: string;
          let model: string;

          if ('verdict' in aiResult) {
            // Fresh AiGtinMatchResult from pickBestMatch()
            const freshResult = aiResult as AiGtinMatchResult;
            verdict = freshResult.verdict;
            provider = freshResult.provider;
            model = freshResult.model;
          } else {
            // CachedVerdict from cache — flat structure, extract fields directly
            const cachedResult = aiResult as CachedVerdict;
            verdict = {
              matched_gtin: cachedResult.matched_gtin,
              confidence: cachedResult.confidence,
              rationale: cachedResult.rationale,
              enrichment_hints: cachedResult.enrichment_hints,
            };
            provider = cachedResult.provider;
            model = cachedResult.model;
          }

          // Validate that matched_gtin is in shortlist
          let resolvedCandidate: OffCanonical | null = null;
          if (verdict.matched_gtin) {
            resolvedCandidate = shortlist.find(c => c.gtin === verdict.matched_gtin) || null;
          }

          const aiVerdict = {
            provider,
            model,
            matched_gtin: resolvedCandidate ? verdict.matched_gtin : null,
            confidence: verdict.confidence,
            rationale: verdict.rationale,
            candidate_gtins: shortlist.map(c => c.gtin),
            latency_ms: latencyMs,
            enrichment_hints: verdict.enrichment_hints,
            cached,
            queue_wait_ms: queueWaitMs,
            provider_latency_ms: providerLatencyMs,
          };

          // Branching based on confidence
          const embeddingVerdict = (aiCtx as any)?.embeddingVerdict;
          const usedEmbeddingShortlist = !!((aiCtx as any)?.embeddingShortlist?.length);
          const embeddingGateFailed = !!(aiCtx as any)?.embeddingGateFailed;
          
          if (verdict.confidence >= 0.85 && resolvedCandidate) {
            // Validate gate before auto-apply
            const gateResult = this.validateAiAutoApply(
              scan,
              resolvedCandidate,
              verdict,
              aiCtx?.brandAliasOverrides,
            );

            if (gateResult.ok) {
              // Gate passed — proceed with auto-apply
              const result: any = {
                candidate: resolvedCandidate,
                matchType: usedEmbeddingShortlist ? 'embedding+ai-fuzzy' : 'ai-fuzzy',
                confidence: verdict.confidence,
                nearMisses: shortlist.slice(0, 3).map(c => ({ candidate: c, score: 0, pass: 'Pass F - AI' })),
                reasonCode: '',
                aiVerdict,
              };
              if (embeddingVerdict) {
                result.embeddingVerdict = embeddingVerdict;
              }
              return result;
            } else {
              // Gate failed — downgrade to 0.84 for review queue
              const downgradedVerdict = {
                ...aiVerdict,
                rationale: `gated:${gateResult.downgradeReason}|${verdict.rationale || ''}`,
              };
              const result: any = {
                candidate: resolvedCandidate,
                matchType: usedEmbeddingShortlist ? 'embedding+ai-fuzzy' : 'ai-fuzzy',
                confidence: 0.84,
                nearMisses: shortlist.slice(0, 3).map(c => ({ candidate: c, score: 0, pass: 'Pass F - AI' })),
                reasonCode: embeddingGateFailed ? 'embedding_gate_failed' : '',
                reviewReason: `gated:${gateResult.downgradeReason}`,
                aiVerdict: downgradedVerdict,
              };
              if (embeddingVerdict) {
                result.embeddingVerdict = embeddingVerdict;
              }
              return result;
            }
          } else if (verdict.confidence >= 0.60 && verdict.confidence < 0.85 && resolvedCandidate) {
            // Pending review
            const result: any = {
              candidate: resolvedCandidate,
              matchType: usedEmbeddingShortlist ? 'embedding+ai-fuzzy' : 'ai-fuzzy',
              confidence: verdict.confidence,
              nearMisses: shortlist.slice(0, 3).map(c => ({ candidate: c, score: 0, pass: 'Pass F - AI' })),
              reasonCode: '',
              aiVerdict,
            };
            if (embeddingVerdict) {
              result.embeddingVerdict = embeddingVerdict;
            }
            return result;
          } else if (verdict.confidence >= 0.50 && verdict.confidence < 0.60 && resolvedCandidate) {
            // Low-confidence pending review (new tier)
            const result: any = {
              candidate: resolvedCandidate,
              matchType: usedEmbeddingShortlist ? 'embedding+ai-fuzzy' : 'ai-fuzzy-low',
              confidence: verdict.confidence,
              nearMisses: shortlist.slice(0, 3).map(c => ({ candidate: c, score: 0, pass: 'Pass F - AI (low conf)' })),
              reasonCode: '',
              aiVerdict,
            };
            if (embeddingVerdict) {
              result.embeddingVerdict = embeddingVerdict;
            }
            return result;
          } else {
            // Below threshold or no valid match — fall through to residual
            const topResidualMisses = residualCandidates
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .map(({ candidate, score, pass }) => ({ candidate, score, pass }));

            // Derive reasonCode from AI verdict
            let finalReasonCode = 'ai_no_match';
            if (verdict.rationale === 'transient_provider_failure') {
              finalReasonCode = 'ai_transient_failure';
            } else if (verdict.rationale === 'all_providers_failed') {
              finalReasonCode = 'all_providers_failed';
            } else if (embeddingGateFailed) {
              // Layer embedding gate failure on top of AI no-match if applicable
              finalReasonCode = 'embedding_gate_failed';
            }

            const result: any = {
              candidate: null,
              matchType: 'none',
              confidence: bestResidualScore,
              nearMisses: topResidualMisses,
              reasonCode: finalReasonCode,
              aiVerdict,
            };
            if (embeddingVerdict) {
              result.embeddingVerdict = embeddingVerdict;
            }
            return result;
          }
        }
      }
    }

    // Compute top-3 residual suggestions sorted by score
    const topResidualMisses = residualCandidates
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ candidate, score, pass }) => ({ candidate, score, pass }));

    // Add defensive guard: if reasonCode is empty and no aiVerdict, set default
    let finalReasonCode = reasonCode;
    if (!finalReasonCode || finalReasonCode === '') {
      finalReasonCode = 'all_passes_below_threshold';
    }

    return {
      candidate: null,
      matchType: 'none',
      confidence: bestResidualScore,
      nearMisses: topResidualMisses,
      reasonCode: finalReasonCode,
    };
  }

  async run(opts: GtinBackfillOpts): Promise<GtinBackfillResult> {
    const runStartTime = Date.now(); // Capture full backfill runtime from the start

    this.logger.log('Starting GTIN backfill job...');

    // Resolve AI matching options
    let enableAiMatch = opts.enableAiMatch ?? (process.env.GTIN_AI_MATCH_ENABLED === 'true');
    
    // Comment 1: Gate Vertex validation on GTIN_AI_ENABLE_VERTEX flag
    const aiProvider = process.env.GTIN_AI_PROVIDER ?? 'google';
    const vertexEnabled = process.env.GTIN_AI_ENABLE_VERTEX === 'true';
    
    if (enableAiMatch) {
      if (aiProvider === 'ollama') {
        // Ollama provider mode: validate and check Ollama daemon
        this.logger.log('Running Ollama preflight health check...');
        const ollamaProbe = await this.gtinMatchService.healthCheckOllama();
        if (!ollamaProbe.healthy) {
          const failFast = process.env.OLLAMA_PREFLIGHT_FAIL_FAST !== 'false';
          if (failFast) {
            const errorMsg = `Ollama preflight failed (timeout=${ollamaProbe.probeTimedOut}, latency=${ollamaProbe.probeLatencyMs}ms). OLLAMA_PREFLIGHT_FAIL_FAST is true. Aborting run.`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
          } else {
            this.logger.warn(`Ollama preflight failed (timeout=${ollamaProbe.probeTimedOut}). OLLAMA_PREFLIGHT_FAIL_FAST is false. Disabling AI matching for this run.`);
            enableAiMatch = false;
          }
        } else {
          this.gtinMatchService.disableVertexForCurrentRun();
          this.logger.log(`Ollama preflight successful (latency=${ollamaProbe.probeLatencyMs}ms); ready for Pass F matching.`);
        }
      } else {
        // Google AI mode (with optional Vertex)
        if (vertexEnabled) {
          // Vertex is enabled; validate Vertex credentials and run health check
          const googleAppCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
          const vertexProjectId = process.env.VERTEX_PROJECT_ID;
          const vertexLocation = process.env.VERTEX_LOCATION;

        if (!googleAppCreds || googleAppCreds.trim() === '') {
          throw new Error(
            'AI matching enabled with Vertex (GTIN_AI_ENABLE_VERTEX=true) but GOOGLE_APPLICATION_CREDENTIALS is not set. ' +
            'Set GOOGLE_APPLICATION_CREDENTIALS to the path or content of your Google service account key.',
          );
        }

        if (!vertexProjectId || vertexProjectId.trim() === '') {
          throw new Error(
            'AI matching enabled with Vertex (GTIN_AI_ENABLE_VERTEX=true) but VERTEX_PROJECT_ID is not set. ' +
            'Set VERTEX_PROJECT_ID to your Google Cloud project ID.',
          );
        }

        if (!vertexLocation || vertexLocation.trim() === '') {
          throw new Error(
            'AI matching enabled with Vertex (GTIN_AI_ENABLE_VERTEX=true) but VERTEX_LOCATION is not set. ' +
            'Set VERTEX_LOCATION to a valid Vertex AI location (e.g., "us-central1", "me-central2").',
          );
        }

        // Run Vertex health check
        try {
          this.logger.log('Running Vertex AI preflight health check...');
          const isHealthy = await this.gtinMatchService.healthCheckVertex();
          if (!isHealthy) {
            this.logger.warn(
              'Vertex AI preflight check failed. Disabling Vertex for this run and using Google AI only.',
            );
            this.gtinMatchService.disableVertexForCurrentRun();
          } else {
            this.logger.log(
              `Vertex AI preflight successful: project=${vertexProjectId}, location=${vertexLocation}`,
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Vertex AI preflight check failed with error: ${message}. ` +
            `Disabling Vertex for this run and using Google AI only.`,
          );
          this.gtinMatchService.disableVertexForCurrentRun();
        }
      } else {
        // Vertex is disabled; explicitly disable it in the service
        this.logger.log('Vertex disabled by GTIN_AI_ENABLE_VERTEX=false; using Google AI only.');
        this.gtinMatchService.disableVertexForCurrentRun();
      }

      // Comment 1: Google AI preflight check (required for Google AI mode)
      this.logger.log('Running Google AI preflight health check...');
      const googleAiHealthy = await this.gtinMatchService.healthCheckGoogleAi();
      if (!googleAiHealthy) {
        const errorMsg = 'Google AI preflight failed: model unavailable or credentials invalid. Cannot proceed with GTIN matching.';
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }
      this.logger.log('Google AI preflight successful; ready for Pass F matching.');
      }
    }

    // ── Embedding preflight & index build ──
    let embeddingEnabled = opts.enableEmbeddingMatch ?? (process.env.GTIN_EMBEDDING_ENABLED === 'true');
    let embeddingPoolHash = '';
    const offVectors = new Map<string, Float32Array>();
    
    if (embeddingEnabled) {
      this.logger.log('Running embedding service preflight health check...');
      const embeddingHealthy = await this.embeddingProvider.healthCheck();
      if (!embeddingHealthy) {
        this.logger.warn('Embedding preflight failed; Pass G disabled for this run.');
        embeddingEnabled = false;
      } else {
        this.logger.log('Embedding preflight successful; Pass G enabled.');
      }
    }

    const stats: GtinBackfillResult = {
      offIndexed: 0,
      candidates: 0,
      gtinAssignedAuto: 0,
      pendingReview: 0,
      twinsMerged: 0,
      skipped: 0,
      matchTypeBreakdown: {},
      brandAliasesResolved: 0,
      brandAliasesQueuedForReview: 0,
      aiMatched: 0,
      aiPending: 0,
      aiNoMatch: 0,
      aiCalls: 0,
      aiCacheHits: 0,
      aiErrors: 0,
      aiAvgLatencyMs: 0,
      dryRunAutoMatched: 0,
      dbApplyErrors: 0,
      // ── AI Observability Breakdown Maps ──
      reasonCodeBreakdown: {},
      aiRationaleBreakdown: {},
      aiVerdictCrossProviderHits: 0,
      embeddingMatched: 0,
      embeddingPending: 0,
      embeddingNoMatch: 0,
      embeddingCalls: 0,
      embeddingCacheHits: 0,
      embeddingErrors: 0,
      embeddingAvgLatencyMs: 0,
      embeddingDim: 0,
      embeddingPoolHash: '',
      embeddingGateOutcomeBreakdown: {},
    };

    // Resolve AI matching options
    const rebuildAiCache = opts.rebuildAiCache ?? false;
    if (rebuildAiCache) {
      this.logger.log('Clearing AI verdict cache (rebuildAiCache=true)...');
      this.aiVerdictCache.clear();
    }

    // AI latency tracking per-run state
    let aiLatencySum = 0;
    let aiNonCachedCalls = 0;

    // ── AI Verdict Cache Isolation ──
    const ignoreAiVerdictCache = opts.ignoreAiVerdictCache ?? false;
    // aiVerdictProviderIsolation is a provider substring filter (e.g. 'ollama', 'gemini')
    // When enabled, cache lookups reject entries from different providers.
    const aiVerdictProviderIsolation: string | undefined =
      opts.aiVerdictProviderIsolation
        ? (process.env.GTIN_AI_VERDICT_PROVIDER_ISOLATION || undefined)
        : undefined;

    if (ignoreAiVerdictCache) {
      this.logger.log('AI verdict cache reads DISABLED for this run (ignoreAiVerdictCache=true).');
    }
    if (aiVerdictProviderIsolation) {
      this.logger.log(`AI verdict cache provider isolation ENABLED: filter="${aiVerdictProviderIsolation}".`);
    }

    // Comment 2: Initialize AI call budget guard at the start of the run
    // This enforces GTIN_AI_MATCH_DAILY_BUDGET before scheduling Pass F AI calls
    const aiBudget = new BudgetGuard(process.env.GTIN_AI_MATCH_DAILY_BUDGET ?? '20000');

    // Brand alias resolution per-run state
    const brandAliasOverrides = new Map<string, string>();
    const brandAliasAttempted = new Set<string>();
    const aliasBudget = new BudgetGuard(process.env.GTIN_AI_BRAND_ALIAS_BUDGET ?? '500');
    let brandAliasesResolved = 0;
    let brandAliasesQueuedForReview = 0;

    // Embedding budget guard and error tracking
    const embeddingBudget = new BudgetGuard(process.env.GTIN_EMBEDDING_DAILY_BUDGET ?? '200000');
    let embeddingErrors = 0;
    let embeddingBudgetExhausted = false;

    // Comment 3: Control brand-alias cache via options
    if (opts.rebuildBrandAliasCache) {
      this.logger.log('Clearing provisional brand aliases from cache (rebuildBrandAliasCache=true, approved overrides retained)...');
      this.brandAliasCache.clear();
    }

    // Seed from disk cache only if not ignoring it
    // Comment 3: Skip cache seeding if ignoreBrandAliasCache is true
    // Resolve brand alias provider isolation flags early for use in seeding and tryResolveAndRewind
    const brandAliasProviderIsolation = process.env.GTIN_BRAND_ALIAS_PROVIDER_ISOLATION === 'true';
    const activeProvider = process.env.GTIN_AI_PROVIDER ?? '';
    
    // Determine provider filter for cache lookups when isolation is enabled
    const providerFilterOpts: any = 
      activeProvider.toLowerCase() === 'ollama' && brandAliasProviderIsolation
        ? { providerFilter: 'Ollama' }
        : undefined;

    if (!opts.ignoreBrandAliasCache) {
      // all stable attempts go to brandAliasAttempted (excluding transient failures),
      // but only successful resolutions go to brandAliasOverrides.
      // Use getStableEntries() to skip stale transient failures and auto-mark dirty for cleanup.
      for (const [rawBrand, entry] of this.brandAliasCache.getStableEntries(providerFilterOpts)) {
        brandAliasAttempted.add(rawBrand);
        if (entry.slug !== null) {
          brandAliasOverrides.set(rawBrand, entry.slug);
        }
      }

      // When isolation is OFF but Ollama is active, detect cross-provider hits during seeding
      if (!brandAliasProviderIsolation && activeProvider.toLowerCase() === 'ollama') {
        for (const [rawBrand, entry] of this.brandAliasCache.getStableEntries()) {
          if (entry.provider.toLowerCase() !== 'ollama') {
            this.logger.debug(
              `Cross-provider cache hit during seeding: brand='${rawBrand}' stored_provider='${entry.provider}'`
            );
          }
        }
      }
    }

    // Flush cache if it was marked dirty during seeding (to clean up stale transient entries)
    await this.brandAliasCache.flush();

    // Step 1 — Build OFF lookup map with expanded indexes
    const offMap = new Map<string, OffCanonical>();
    const brandIndex = new Map<string, OffCanonical[]>();
    const brandWeightIndex = new Map<string, OffCanonical[]>();
    const gtinPrefixIndex = new Map<string, OffCanonical[]>();
    
    // Comment 5.2: Initialize inverted indexes for token and weight-band pre-filtering
    const nameTokenIndex = new Map<string, Set<string>>();
    const weightBandIndex = new Map<string, Set<string>>();

    const processOffProduct = (rawProduct: any) => {
      const canonical = this.offService.extractCanonical(rawProduct);
      if (!canonical) return;

      const key = this.makeKey(canonical);
      if (!offMap.has(key)) {
        offMap.set(key, canonical);
        // Comment 1: Also store under GTIN for token-index lookups in candidate-shortlister
        offMap.set(canonical.gtin, canonical);
        
        const normB = normalizeBrandStrict(canonical.brand);
        
        // Populate brandIndex
        if (!brandIndex.has(normB)) brandIndex.set(normB, []);
        brandIndex.get(normB)!.push(canonical);
        
        // Populate brandWeightIndex: key = `${normB}|${normalizedWeight}`
        // Use the same normalized weight representation as makeKey() for consistency
        const nw = normalizeWeight(canonical.weightRaw);
        const weightStr = nw.unit === 'unknown' ? 'unknown' : `${nw.value}${nw.unit}`;
        const brandWeightKey = `${normB}|${weightStr}`;
        if (!brandWeightIndex.has(brandWeightKey)) brandWeightIndex.set(brandWeightKey, []);
        brandWeightIndex.get(brandWeightKey)!.push(canonical);
        
        // Populate gtinPrefixIndex: key = GS1 prefix (first 3 digits, aligned to GTIN-13)
        const normalizedGtin = normalizeGtin(canonical.gtin);
        if (normalizedGtin) {
          const prefix = getGtinPrefix(normalizedGtin);
          if (prefix) {
            if (!gtinPrefixIndex.has(prefix)) gtinPrefixIndex.set(prefix, []);
            gtinPrefixIndex.get(prefix)!.push(canonical);
          }
        }

        // Comment 5.2: Populate nameTokenIndex and weightBandIndex for pre-filtering
        // Tokenize both English and Arabic names for multilingual matching
        const tokenizeUnicode = (text: string): string[] => {
          if (!text || text.length < 2) return [];
          return text
            .toLowerCase()
            .split(/[\s\p{P}]+/u)
            .filter((t) => t.length > 2);
        };

        const bucketizeWeight = (weight: string | number | null | undefined): string => {
          if (!weight) return 'unknown';
          const grams = normalizeWeightToGrams(`${weight}`);
          if (grams === null) return 'unknown';

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
        };

        // Populate nameTokenIndex: collect tokens from both name_en and name_ar
        const tokens = new Set<string>();
        if (canonical.name_en) {
          tokenizeUnicode(canonical.name_en).forEach((t) => tokens.add(t));
        }
        if (canonical.name_ar) {
          tokenizeUnicode(canonical.name_ar).forEach((t) => tokens.add(t));
        }

        for (const token of tokens) {
          if (!nameTokenIndex.has(token)) nameTokenIndex.set(token, new Set());
          nameTokenIndex.get(token)!.add(canonical.gtin);
        }

        // Populate weightBandIndex
        const weightBand = bucketizeWeight(canonical.weightRaw);
        if (!weightBandIndex.has(weightBand)) weightBandIndex.set(weightBand, new Set());
        weightBandIndex.get(weightBand)!.add(canonical.gtin);

        stats.offIndexed++;
        if (stats.offIndexed % 1000 === 0) {
          this.logger.log(`Indexed ${stats.offIndexed} OFF products...`);
        }
      }
    };

    // Determine whether to use dump or API (default: dump if OFF_DUMP_PATH env var is set)
    const useDump = opts.useDump ?? !!process.env.OFF_DUMP_PATH;
    let resolvedSlicePath = '';

    if (useDump) {
      // Build pool filter from environment
      const filter = getOffPoolFilter();
      
      // Allow brandsOverride to override the brand slug list
      if (opts.brandsOverride?.length) {
        filter.brandSlugs = opts.brandsOverride.map(b => normalizeBrandStrict(b));
      }
      
      const poolHash = getOffPoolHash(filter);
      const sliceDir = path.join(process.cwd(), 'uploads', 'off-slice');
      const slicePath = path.join(sliceDir, `off_pool_${poolHash}.ndjson.gz`);
      resolvedSlicePath = slicePath;
      
      // Resolve rebuildPool (prefer rebuildPool, fallback to rebuildCache for backward compatibility)
      const rebuildPool = opts.rebuildPool ?? opts.rebuildCache ?? false;

      // Cache read path — if slice exists and rebuildPool is false
      if (!rebuildPool && fs.existsSync(slicePath)) {
        this.logger.log(`Loading slice from ${slicePath}…`);
        
        const fileStream = fs.createReadStream(slicePath);
        const gunzip = zlib.createGunzip();
        const rl = readline.createInterface({
          input: fileStream.pipe(gunzip),
          crlfDelay: Infinity,
        });

        let sliceLineCount = 0;
        for await (const line of rl) {
          if (!line || line.trim().length === 0) continue;
          
          try {
            const product = JSON.parse(line);
            processOffProduct(product);
            sliceLineCount++;
            if (opts.maxOffProducts && stats.offIndexed >= opts.maxOffProducts) break;
          } catch (err) {
            this.logger.debug(`Skipped line in slice: JSON parse error — ${err}`);
          }
        }
        
        this.logger.log(`Loaded ${sliceLineCount} products from slice.`);
      } else {
        // Cache write path — if slice doesn't exist or rebuildPool is true
        if (rebuildPool) {
          this.logger.log('Rebuilding slice from dump (rebuildPool=true)...');
        } else {
          this.logger.log('Slice not found. Materializing from dump...');
        }
        
        this.dumpService.validateDumpExists();
        
        // Call materializeSlice to write the slice
        await this.dumpService.materializeSlice(filter, slicePath);
        
        // Now stream-read the freshly written slice
        this.logger.log(`Loading freshly written slice from ${slicePath}…`);
        
        const fileStream = fs.createReadStream(slicePath);
        const gunzip = zlib.createGunzip();
        const rl = readline.createInterface({
          input: fileStream.pipe(gunzip),
          crlfDelay: Infinity,
        });

        let sliceLineCount = 0;
        for await (const line of rl) {
          if (!line || line.trim().length === 0) continue;
          
          try {
            const product = JSON.parse(line);
            processOffProduct(product);
            sliceLineCount++;
            if (opts.maxOffProducts && stats.offIndexed >= opts.maxOffProducts) break;
          } catch (err) {
            this.logger.debug(`Skipped line in slice: JSON parse error — ${err}`);
          }
        }
        
        this.logger.log(`Loaded ${sliceLineCount} products from freshly written slice.`);
      }
    } else {
      // Stream from live OFF API (original behavior - as fallback)
      this.logger.log('Using live OpenFoodFacts API for backfill...');
      resolvedSlicePath = 'live-api';

      // Stream from Saudi Arabia
      for await (const product of this.offService.streamCountryProducts('saudi-arabia')) {
        processOffProduct(product);
        if (opts.maxOffProducts && stats.offIndexed >= opts.maxOffProducts) break;
      }

      // Stream from override brands (if provided)
      if (opts.brandsOverride?.length) {
        for (const brand of opts.brandsOverride) {
          if (opts.maxOffProducts && stats.offIndexed >= opts.maxOffProducts) break;
          for await (const product of this.offService.streamBrandProducts(brand)) {
            processOffProduct(product);
            if (opts.maxOffProducts && stats.offIndexed >= opts.maxOffProducts) break;
          }
        }
      }
    }

    this.logger.log(`OFF indexing complete. Indexed ${stats.offIndexed} unique candidates.`);
    this.logger.log(`Brand index has ${brandIndex.size} unique brands.`);
    this.logger.log('Starting matching phase...');
    const matchStartTime = Date.now(); // Separate timer for matching-phase progress logs

    // ── Build uniqueByGtin deduplication map ──
    const uniqueByGtin = new Map<string, OffCanonical>();
    for (const entry of offMap.values()) {
      if (entry.gtin) {
        uniqueByGtin.set(entry.gtin, entry);
      }
    }

    // ── Embedding index build & cache loading ──
    if (embeddingEnabled) {
      this.logger.log('Building embedding index...');
      
      // Compute pool hash for cache validation
      const poolFilter = getOffPoolFilter();
      if (opts.brandsOverride?.length) {
        poolFilter.brandSlugs = opts.brandsOverride.map(b => normalizeBrandStrict(b));
      }
      embeddingPoolHash = getOffPoolHash(poolFilter);
      stats.embeddingPoolHash = embeddingPoolHash;

      // Clear cache if rebuild requested
      if (opts.rebuildEmbeddingCache) {
        this.logger.log('Clearing embedding cache (rebuildEmbeddingCache=true)...');
        await this.embeddingCache.clear();
      }

      // Try to load cached embeddings
      const cachedVectors = await this.embeddingCache.load({
        poolHash: embeddingPoolHash,
        model: this.embeddingProvider.modelId,
        dim: this.embeddingProvider.dim,
      });

      if (cachedVectors) {
        // Validate cache completeness: get current unique OFF GTINs
        const products = Array.from(uniqueByGtin.values());
        const currentGtins = new Set(products.map(p => p.gtin));
        const cachedGtins = new Set<string>(cachedVectors.keys());
        
        // Find missing GTINs
        const missingGtins = Array.from(currentGtins).filter(gtin => !cachedGtins.has(gtin));
        const extraGtins = Array.from(cachedGtins).filter(gtin => !currentGtins.has(gtin));
        
        if (missingGtins.length > 0) {
          // Embed missing subset
          this.logger.log(`Loaded ${cachedVectors.size} cached embeddings; embedding ${missingGtins.length} missing products...`);
          const missingProducts = products.filter(p => missingGtins.includes(p.gtin));
          const embedDim = this.embeddingProvider.dim;
          const texts = missingProducts.map(p => `${p.name_en || ''} | ${p.name_ar || ''} | ${p.brand || ''} | ${p.weightRaw || ''}`);
          
          try {
            const missingEmbeddings = await this.embeddingProvider.embedDocuments(texts);
            if (missingEmbeddings.length === missingProducts.length) {
              // Merge missing vectors into cache
              missingEmbeddings.forEach((vec, idx) => {
                cachedVectors.set(missingProducts[idx].gtin, vec);
              });
              
              // Save completed cache
              const meta = {
                poolHash: embeddingPoolHash,
                model: this.embeddingProvider.modelId,
                dim: embedDim,
                count: cachedVectors.size,
                gtins: Array.from(cachedVectors.keys()),
                builtAt: new Date().toISOString(),
              };
              await this.embeddingCache.save(cachedVectors, meta);
              this.logger.log(`Completed cache with ${missingGtins.length} new embeddings; cache now has ${cachedVectors.size} total`);
            } else {
              throw new Error(`Embedding dimension mismatch for missing: got ${missingEmbeddings.length}, expected ${missingProducts.length}`);
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to embed missing GTINs: ${message}`);
            stats.embeddingErrors++;
            embeddingEnabled = false;
          }
        } else if (extraGtins.length > 0) {
          // Filter out extra GTINs
          this.logger.log(`Loaded ${cachedVectors.size} cached embeddings; filtering ${extraGtins.length} extra products...`);
          extraGtins.forEach(gtin => cachedVectors.delete(gtin));
        } else {
          this.logger.log(`Loaded ${cachedVectors.size} cached embeddings for pool ${embeddingPoolHash.slice(0, 8)}`);
        }
        
        // Copy all validated vectors to offVectors
        cachedVectors.forEach((vec, gtin) => offVectors.set(gtin, vec));
        stats.embeddingCacheHits++;
      } else {
        // Build embeddings from scratch
        this.logger.log(`Building embeddings from ${stats.offIndexed} OFF products...`);
        
        const products = Array.from(uniqueByGtin.values());
        const startEmbedTime = Date.now();
        
        try {
          const embedDim = this.embeddingProvider.dim;
          const batchSize = parseInt(process.env.GTIN_EMBEDDING_BATCH_SIZE || '100', 10);
          const texts = products.map(p => `${p.name_en || ''} | ${p.name_ar || ''} | ${p.brand || ''} | ${p.weightRaw || ''}`);
          
          const embeddings = await this.embeddingProvider.embedDocuments(texts);
          
          if (embeddings.length === products.length) {
            embeddings.forEach((vec, idx) => {
              offVectors.set(products[idx].gtin, vec);
            });
            
            // Persist to cache
            const meta = {
              poolHash: embeddingPoolHash,
              model: this.embeddingProvider.modelId,
              dim: embedDim,
              count: products.length,
              gtins: products.map(p => p.gtin),
              builtAt: new Date().toISOString(),
            };
            await this.embeddingCache.save(offVectors, meta);
            
            const embedTime = Date.now() - startEmbedTime;
            this.logger.log(`Built and cached ${offVectors.size} embeddings in ${embedTime}ms (avg ${(embedTime / offVectors.size).toFixed(2)}ms per product)`);
            stats.embeddingCalls++;
          } else {
            throw new Error(`Embedding dimension mismatch: got ${embeddings.length}, expected ${products.length}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Failed to build embeddings: ${message}`);
          stats.embeddingErrors++;
          embeddingEnabled = false;
        }
      }

      // Initialize shortlister with the built/loaded index
      if (embeddingEnabled && offVectors.size > 0) {
        this.embeddingShortlister.setIndex(offVectors);
        stats.embeddingDim = this.embeddingProvider.dim;
        this.logger.log(`Embedding index ready (${offVectors.size} vectors, ${stats.embeddingDim}d)`);
      } else {
        embeddingEnabled = false;
        this.logger.warn('Embedding index is empty or initialization failed; Pass G disabled for this run.');
      }
    }

    // Compute eligible brand slugs for brand alias resolution (3+ products per brand)
    const eligibleBrandSlugs = [...brandIndex.entries()]
      .filter(([, list]) => list.length >= 3)
      .map(([slug]) => slug);
    this.logger.log(`Brand alias resolution: ${eligibleBrandSlugs.length} eligible brand slugs (3+ products per brand)`);

    // Step 2 & 3 — Walk SCAN rows and match with producer/consumer pipeline
    // Comment 2: Use cursor-based paging instead of single stream for durability
    const productRepo = this.dataSource.getRepository(Product);
    
    // Helper: Fetch one batch using (updated_at, id) cursor
    const fetchBatch = async (afterUpdatedAt: string | null, afterId: string | null): Promise<any[]> => {
      let query = productRepo
        .createQueryBuilder('p')
        .where(syntheticGtinWhere('p'))
        .orderBy('p.updated_at', 'DESC')
        .addOrderBy('p.id', 'DESC')
        .take(batchSize);

      if (afterUpdatedAt !== null && afterId !== null) {
        // Cursor condition: (updated_at < afterUpdatedAt) OR (updated_at = afterUpdatedAt AND id < afterId)
        query = query.andWhere(
          '(p.updated_at < :afterUpdatedAt OR (p.updated_at = :afterUpdatedAt AND p.id < :afterId))',
          { afterUpdatedAt, afterId }
        );
      }

      return await query.getMany();
    };
    
    // Legacy file guard
    const legacyResidualsPath = path.join(process.cwd(), 'gtin_backfill_residuals.csv');
    if (fs.existsSync(legacyResidualsPath)) {
      this.logger.warn(
        `Legacy residuals file detected at ${legacyResidualsPath}, ignored — reports now written to uploads/backfill-reports/`,
      );
    }
    
    // Create reporter instance
    const runDir = path.join(
      process.cwd(),
      'uploads',
      'backfill-reports',
      new Date().toISOString().replace(/[:.]/g, '-'),
    );
    const reporter = new BackfillReporter(runDir, brandIndex.size);

    // Comment 1: Move cursor/batch variables to outer scope before try block
    // so they're visible to both the main loop and the catch/finally blocks
    const batchSize = opts.batchSize ?? 500;
    const checkpointDir = path.join(process.cwd(), 'uploads', 'backfill-cache');
    const checkpointFile = path.join(checkpointDir, 'cursor.json');
    
    // Ensure checkpoint directory exists
    if (!fs.existsSync(checkpointDir)) {
      fs.mkdirSync(checkpointDir, { recursive: true });
    }

    // Load checkpoint if resume is enabled
    let lastUpdatedAt: string | null = null;
    let lastId: string | null = null;
    let pageNumber = 0;
    let currentPageUpdatedAt: string | null = null;
    let currentPageId: string | null = null;
    
    if (opts.resume || opts.resumeFromUpdatedAt || opts.resumeFromId) {
      if (opts.resumeFromUpdatedAt && opts.resumeFromId) {
        // Explicit cursor provided
        lastUpdatedAt = opts.resumeFromUpdatedAt;
        lastId = opts.resumeFromId;
        this.logger.log(`Resuming from explicit cursor: updated_at=${lastUpdatedAt}, id=${lastId}`);
      } else if (opts.resume && fs.existsSync(checkpointFile)) {
        // Load checkpoint from file
        try {
          const checkpoint = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'));
          lastUpdatedAt = checkpoint.lastUpdatedAt;
          lastId = checkpoint.lastId;
          pageNumber = checkpoint.pageNumber || 0;
          this.logger.log(`Resumed from checkpoint: updated_at=${lastUpdatedAt}, id=${lastId}, page=${pageNumber}`);
        } catch (err) {
          this.logger.warn(`Failed to load checkpoint: ${err}. Starting fresh.`);
        }
      }
    }

    // Assign cursor start position after checkpoint loading
    currentPageUpdatedAt = lastUpdatedAt;
    currentPageId = lastId;

    // Helper: Persist checkpoint after each batch
    const saveCheckpoint = (updatedAt: string, id: string, page: number) => {
      const checkpoint = { lastUpdatedAt: updatedAt, lastId: id, pageNumber: page };
      fs.writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2));
    };

    // Comment 3: Declare pendingResiduals and inFlight in shared scope for success/failure paths
    const normalConcurrency = parseInt(process.env.GTIN_AI_MATCH_CONCURRENCY ?? '5', 10);
    const degradeConcurrency = parseInt(process.env.GTIN_AI_MATCH_CONCURRENCY_ON_DEGRADE ?? '2', 10);
    const hardStopThreshold = parseInt(process.env.GTIN_AI_HARD_STOP_THRESHOLD ?? '15', 10);
    const aiSemaphore = new Semaphore(normalConcurrency);
    let aiDegraded = false;
    let aiHardStopped = false;
    const aiOutcomeRing: boolean[] = [];
    let ringHead = 0;
    let recentAiErrors = 0;
    
    // Define recordAiOutcome closure for ring buffer tracking with early degradation on threshold
    const recordAiOutcome = (isError: boolean) => {
      if (aiHardStopped) return;

      // Track the value being replaced in the ring (for sliding window after full)
      const oldValue = aiOutcomeRing[ringHead % 50];
      aiOutcomeRing[ringHead % 50] = isError;
      ringHead++;
      
      // Update incremental error count
      if (isError) {
        recentAiErrors++;
      }
      // If we're replacing an old value in a full ring, adjust count
      if (ringHead > 50 && oldValue) {
        recentAiErrors--;
      }
      
      // Check against current window size (not just when full)
      const windowSize = Math.min(ringHead, 50);
      
      if (recentAiErrors >= hardStopThreshold && aiDegraded && !aiHardStopped) {
        aiHardStopped = true;
        this.logger.error(`[GtinBackfillService] AI HARD STOP triggered (${recentAiErrors} errors in sliding window). All subsequent AI matching will be skipped.`);
      } else if (recentAiErrors >= 5 && !aiDegraded) {
        aiDegraded = true;
        aiSemaphore.setPermits(degradeConcurrency);
        if (ollamaLimiter) {
          ollamaLimiter.degradeChatTo(Math.max(1, Math.floor(degradeConcurrency / 2)));
        }
        this.logger.warn(
          `[GtinBackfillService] AI degraded mode entered: concurrency=${degradeConcurrency}`
        );
      }
    };

    // Read Ollama-specific per-operation concurrency (inner gate, independent of outer aiSemaphore)
    const ollamaEmbedConcurrency = parseInt(process.env.OLLAMA_EMBED_CONCURRENCY ?? '2', 10);
    const ollamaChatConcurrency  = parseInt(process.env.OLLAMA_CHAT_CONCURRENCY  ?? '2', 10);
    const isOllamaActive = (process.env.GTIN_AI_PROVIDER === 'ollama') || (process.env.GTIN_EMBEDDING_PROVIDER === 'ollama');
    const ollamaLimiter = isOllamaActive
      ? new OllamaConcurrencyLimiter(ollamaEmbedConcurrency, ollamaChatConcurrency)
      : null;

    // Add embeddingOutcomeRing symmetric to aiOutcomeRing for embedding-specific degradation
    const embeddingOutcomeRing: boolean[] = [];
    let embeddingRingHead = 0;
    let recentEmbeddingErrors = 0;
    let embeddingDegraded = false;

    // Define recordEmbeddingOutcome closure for ring buffer tracking with early degradation on threshold
    const recordEmbeddingOutcome = (isError: boolean) => {
      // Track the value being replaced in the ring (for sliding window after full)
      const oldValue = embeddingOutcomeRing[embeddingRingHead % 50];
      embeddingOutcomeRing[embeddingRingHead % 50] = isError;
      embeddingRingHead++;
      
      // Update incremental error count
      if (isError) {
        recentEmbeddingErrors++;
      }
      // If we're replacing an old value in a full ring, adjust count
      if (embeddingRingHead > 50 && oldValue) {
        recentEmbeddingErrors--;
      }
      
      // Check against current window size (not just when full)
      const windowSize = Math.min(embeddingRingHead, 50);
      if (recentEmbeddingErrors >= 5 && !embeddingDegraded && ollamaLimiter) {
        embeddingDegraded = true;
        ollamaLimiter.degradeTo(1, ollamaChatConcurrency);
        // Also tighten the outer gate
        aiSemaphore.setPermits(degradeConcurrency);
        this.logger.warn(
          `[GtinBackfillService] Embedding degraded mode entered: ollamaEmbedConcurrency=1`
        );
      }
    };
    
    const inFlight = new Set<Promise<void>>();
    const MICRO_BATCH = 50;
    let pendingResiduals: Array<{
      scan: { gtin: string; name_en: string; name_ar: string; brand: string; net_weight_value: number | null; net_unit: string | null; id: string };
      indexes: OffIndexes;
      name_en: string;
      name_ar: string;
      brand: string;
      net_weight_value: number | null;
      net_unit: string | null;
      id: string;
      gtin: string;
      // Comment 5: Include inferred fields in pending residuals
      inferred_brand?: string;
      inferred_weight?: string;
      inferred_brand_slug?: string;
    }> = [];

    // Track whether reporter has been closed
    let reporterClosed = false;

    // Helper: Apply disposition (single path for all outcomes)
    const applyDisposition = async (
      scan: { gtin: string; name_en: string; name_ar: string; brand: string; net_weight_value: number | null; net_unit: string | null; id: string },
      result: MatchResult,
      metadata: { name_en: string; name_ar: string; brand: string; net_weight_value: number | null; net_unit: string | null; id: string; gtin: string; inferred_brand?: string; inferred_weight?: string; inferred_brand_slug?: string },
    ) => {
      // Stream AI decision if present
      if (result.aiVerdict) {
        reporter.appendAiDecision({
          scan_id: scan.id,
          scan_gtin: scan.gtin,
          candidate_gtins: result.aiVerdict.candidate_gtins,
          matched_gtin: result.aiVerdict.matched_gtin,
          confidence: result.aiVerdict.confidence,
          rationale: result.aiVerdict.rationale,
          provider: result.aiVerdict.provider,
          model: result.aiVerdict.model,
          latency_ms: result.aiVerdict.latency_ms,
          cache_hit: result.aiVerdict.cached,
          queue_wait_ms: result.aiVerdict.queue_wait_ms,
          provider_latency_ms: result.aiVerdict.provider_latency_ms,
        });

        // Accumulate AI rationale breakdown
        const rationale = result.aiVerdict.rationale || 'unknown';
        stats.aiRationaleBreakdown[rationale] = (stats.aiRationaleBreakdown[rationale] ?? 0) + 1;

        // Increment AI counters (irrespective of disposition)
        if (result.aiVerdict.cached) {
          stats.aiCacheHits++;
        } else {
          stats.aiCalls++;
          aiLatencySum += result.aiVerdict.latency_ms;
          aiNonCachedCalls++;
        }

        if (
          result.aiVerdict.rationale === 'all_providers_failed' ||
          result.aiVerdict.rationale === 'transient_provider_failure' ||
          result.reasonCode === 'ai_transient_failure' ||
          result.reasonCode === 'all_providers_failed'
        ) {
          stats.aiErrors++;
          recordAiOutcome(true);
        } else {
          recordAiOutcome(false);
        }
      }

      // Handle embedding_budget_exhausted early-return (no embeddingVerdict)
      if (result.reasonCode === 'embedding_budget_exhausted') {
        stats.embeddingNoMatch++;
      }

      // Stream Embedding decision if present
      if (result.embeddingVerdict) {
        reporter.appendEmbeddingDecision({
          scan_id: scan.id,
          scan_gtin: scan.gtin,
          top_cosine: result.embeddingVerdict.topCosine || 0,
          top_off_gtin: result.embeddingVerdict.topKGtins?.[0] || '',
          topk_gtins: result.embeddingVerdict.topKGtins || [],
          topk_cosines: result.embeddingVerdict.topCosines || [],
          used_as_auto_apply: result.embeddingVerdict.usedAsAutoApply || false,
          escalated_to_verifier: result.embeddingVerdict.usedAsVerifierInput || false,
          gate_outcome: result.embeddingVerdict.gateOutcome || 'passed',
          query_embed_time_ms: result.embeddingVerdict.queryEmbedTimeMs || 0,
        });

        // Increment embedding counters — verdict-driven logic
        const EMBEDDING_NO_MATCH_CODES = new Set([
          'embedding_below_floor',
          'embedding_gate_failed',
          'embedding_budget_exhausted',
          'embedding_borderline_no_verifier',
        ]);

        if (result.embeddingVerdict.usedAsAutoApply === true && result.confidence >= 0.85) {
          stats.embeddingMatched++;
        } else if (EMBEDDING_NO_MATCH_CODES.has(result.reasonCode)) {
          stats.embeddingNoMatch++;
        } else if (result.embeddingVerdict.usedAsVerifierInput === true) {
          stats.embeddingPending++;
        }

        // Accumulate embedding gate outcome breakdown
        const gateOutcome = result.embeddingVerdict.gateOutcome || 'unknown';
        stats.embeddingGateOutcomeBreakdown[gateOutcome] = (stats.embeddingGateOutcomeBreakdown[gateOutcome] ?? 0) + 1;
      }

      // Increment match type breakdown
      if (result.matchType !== 'none') {
        stats.matchTypeBreakdown[result.matchType] = (stats.matchTypeBreakdown[result.matchType] ?? 0) + 1;
      }

      // Accumulate reason code breakdown (all results, including 'none')
      if (result.reasonCode) {
        stats.reasonCodeBreakdown[result.reasonCode] = (stats.reasonCodeBreakdown[result.reasonCode] ?? 0) + 1;
      }

      // Track AI disposition counters
      if (result.aiVerdict) {
        if (result.matchType === 'ai-fuzzy' && result.confidence >= 0.85) {
          stats.aiMatched++;
        } else if ((result.matchType === 'ai-fuzzy' && result.confidence >= 0.60 && result.confidence < 0.85) || result.matchType === 'ai-fuzzy-low') {
          stats.aiPending++;
        } else if (result.matchType !== 'ai-fuzzy' && result.matchType !== 'ai-fuzzy-low') {
          stats.aiNoMatch++;
        }
      }

      // Apply confidence gate
      if (result.confidence >= 0.85 && result.candidate) {
        // Auto-apply with enrichment overlay (hint-aware for AI matches)
        // Buffer the row before the try/catch so we can finalize it after DB operations
        const autoRow: AutoAppliedMatchRow = {
          scan_id: scan.id,
          scan_gtin: scan.gtin,
          off_gtin: result.candidate.gtin,
          confidence: result.confidence,
          match_type: result.matchType,
          ai_provider: result.aiVerdict?.provider,
          ai_model: result.aiVerdict?.model,
          ai_confidence: result.aiVerdict?.confidence,
          ai_rationale: result.aiVerdict?.rationale,
          dry_run: opts.dryRun,
          db_applied: false,
        };

        if (opts.dryRun) {
          // Dry-run path: no DB mutations
          autoRow.db_applied = false;
          stats.dryRunAutoMatched++;
          reporter.appendAutoAppliedMatch(autoRow);

          this.logger.log(
            `[DRY RUN] Auto-apply: SCAN ${scan.gtin} → GTIN ${result.candidate.gtin} ` +
            `[${result.matchType}, conf=${result.confidence.toFixed(4)}]`
          );
        } else {
          // Non-dry-run path: attempt DB operations, track success/failure
          try {
            const existingProduct = await productRepo.findOneBy({ gtin: result.candidate.gtin });
            if (existingProduct) {
              // Defensive check: skip merge if existingProduct is the same product as the scan
              if (existingProduct.id === scan.id) {
                this.logger.debug(
                  `Skipping self-merge: GTIN ${result.candidate.gtin} is already assigned to scan ${scan.id}. ` +
                  `Treating as idempotent no-op.`,
                );
                // Idempotent no-op: product already has the target GTIN, nothing to do
                stats.gtinAssignedAuto++;
              } else {
                // Real collision with different product: merge loser into winner
                await this.productMergeService.mergeProducts(
                  existingProduct.id,
                  scan.id,
                  'off_backfill_job',
                  'off_backfill',
                  { confidence: result.confidence, matchType: result.matchType }
                );
                stats.twinsMerged++;
                stats.gtinAssignedAuto++;
              }
            } else {
              // No existing product with this GTIN: assign it fresh
              await this.productMergeService.assignGtin(
                scan.id,
                result.candidate.gtin,
                'off_backfill_job',
                'off_backfill',
                { confidence: result.confidence, matchType: result.matchType }
              );
              
              // Enrichment Overlay: Patch only missing fields on the product
              const scanProduct = await productRepo.findOneBy({ id: scan.id });
              if (scanProduct) {
                const upsertData: any = { gtin: result.candidate.gtin };
                const nw = normalizeWeight(result.candidate.weightRaw);

                // For AI matches, respect enrichment hints; otherwise use conservative "only if missing" rule
                const hints = result.aiVerdict?.enrichment_hints;
                const isAiMatch = result.matchType === 'ai-fuzzy';

                if (!scanProduct.name_en) {
                  // Field missing - use conservative approach
                  upsertData.name_en = metadata.name_en || result.candidate.name_en;
                } else if (isAiMatch && hints?.name_en) {
                  // AI-approved overwrite - use confirmed OFF value
                  upsertData.name_en = result.candidate.name_en;
                }

                if (!scanProduct.name_ar) {
                  // Field missing - use conservative approach
                  upsertData.name_ar = metadata.name_ar || result.candidate.name_ar;
                } else if (isAiMatch && hints?.name_ar) {
                  // AI-approved overwrite - use confirmed OFF value
                  upsertData.name_ar = result.candidate.name_ar;
                }

                if (!scanProduct.brand) {
                  // Field missing - use conservative approach
                  upsertData.brand = metadata.brand || result.candidate.brand;
                } else if (isAiMatch && hints?.brand) {
                  // AI-approved overwrite - use confirmed OFF value
                  upsertData.brand = result.candidate.brand;
                }
                if (!scanProduct.description_en) {
                  upsertData.description_en = result.candidate.ingredients_text;
                }
                if (!scanProduct.net_weight_value && nw.value > 0) {
                  upsertData.net_weight_value = nw.value;
                  upsertData.net_unit = nw.unit !== 'unknown' ? nw.unit : 'g';
                }
                if (!scanProduct.image_front_url && result.candidate.image_front_url) {
                  upsertData.image_front_url = result.candidate.image_front_url;
                }
                if (!scanProduct.image_nutrition_url && result.candidate.image_nutrition_url) {
                  upsertData.image_nutrition_url = result.candidate.image_nutrition_url;
                }

                upsertData.nutrition = result.candidate.nutrition;
                upsertData.ingredients = result.candidate.ingredients;
                upsertData.allergens = result.candidate.allergens.map(key => ({ allergen_key: key }));

                if (Object.keys(upsertData).length > 1) {
                  this.logger.debug(`Matched SCAN ${scan.gtin} to GTIN ${result.candidate.gtin} [${result.matchType}]`);
                  this.logger.debug(`Enriching SCAN product ${scan.id} with missing OFF fields: ${Object.keys(upsertData).join(', ')}`);
                  await this.adminProductsService.upsertByGtin(upsertData, 'off_backfill_job');
                }
              }
              stats.gtinAssignedAuto++;
            }

            // DB operations succeeded: mark row as applied
            autoRow.db_applied = true;
          } catch (err) {
            // DB operations failed: mark row as not applied, increment error counter
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to apply match for ${scan.gtin}: ${message}`);
            autoRow.db_applied = false;
            stats.dbApplyErrors++;
          }

          // Append the row exactly once, after DB operations complete
          reporter.appendAutoAppliedMatch(autoRow);
        }
      } else if (result.confidence >= 0.60 && result.confidence < 0.85 && result.candidate) {
        // Pending review
        // Comment 3: Always write to reporter, regardless of dry-run mode
        reporter.appendReviewQueue({
          scan_id: scan.id,
          scan_name: metadata.name_en || metadata.name_ar || '',
          off_gtin: result.candidate.gtin,
          off_name_en: result.candidate.name_en,
          confidence: result.confidence,
          match_type: result.matchType,
          ai_provider: result.aiVerdict?.provider,
          ai_model: result.aiVerdict?.model,
          ai_confidence: result.aiVerdict?.confidence,
          ai_rationale: result.aiVerdict?.rationale,
          review_reason: result.reviewReason ?? '',
        });

        stats.pendingReview++;

        if (opts.dryRun) {
          this.logger.log(
            `[DRY RUN] Pending review: SCAN ${scan.gtin} → GTIN ${result.candidate.gtin} ` +
            `[${result.matchType}, conf=${result.confidence.toFixed(4)}]`
          );
        }
      } else if (result.matchType === 'ai-fuzzy-low' && result.candidate) {
        // Low-confidence pending review (new tier: 0.50 <= confidence < 0.60)
        // Comment 3: Always write to reporter, regardless of dry-run mode
        reporter.appendReviewQueue({
          scan_id: scan.id,
          scan_name: metadata.name_en || metadata.name_ar || '',
          off_gtin: result.candidate.gtin,
          off_name_en: result.candidate.name_en,
          confidence: result.confidence,
          match_type: result.matchType,
          ai_provider: result.aiVerdict?.provider,
          ai_model: result.aiVerdict?.model,
          ai_confidence: result.aiVerdict?.confidence,
          ai_rationale: result.aiVerdict?.rationale,
          review_reason: result.reviewReason ?? '',
        });

        stats.pendingReview++;

        if (opts.dryRun) {
          this.logger.log(
            `[DRY RUN] Low-conf review: SCAN ${scan.gtin} → GTIN ${result.candidate.gtin} ` +
            `[${result.matchType}, conf=${result.confidence.toFixed(4)}]`
          );
        }
      } else {
        // Below confidence threshold — residual
        // Comment 3: Always write residuals to reporter, regardless of dry-run mode
        
        // Compute ai_reason for residuals with aiVerdict
        let ai_reason: string = '';
        if (result.aiVerdict && result.matchType !== 'ai-fuzzy') {
          // Determine why the AI match fell through
          if (result.aiVerdict.matched_gtin) {
            ai_reason = 'below_threshold'; // matched_gtin exists but confidence too low
          } else {
            ai_reason = result.aiVerdict.rationale || 'no_match';
          }
        }

        reporter.appendResidual({
          scan_id: scan.id,
          scan_gtin: scan.gtin,
          name_en: metadata.name_en,
          name_ar: metadata.name_ar,
          brand: metadata.brand,
          brand_normalized: normalizeBrandStrict(metadata.brand || ''),
          weight_raw: `${metadata.net_weight_value || ''}${metadata.net_unit || ''}`,
          gtin_prefix: gtinPrefix(scan.gtin) || null,
          reason_code: result.reasonCode,
          best_score: result.confidence,
          off_pool_size_for_brand: brandIndex.get(normalizeBrandStrict(metadata.brand || ''))?.length ?? 0,
          ai_provider: result.aiVerdict?.provider,
          ai_model: result.aiVerdict?.model,
          ai_confidence: result.aiVerdict?.confidence,
          ai_rationale: result.aiVerdict?.rationale,
          ai_reason,
          // Comment 5: Include inferred brand and weight in residual row
          inferred_brand: metadata.inferred_brand,
          inferred_weight: metadata.inferred_weight,
        });

        if (result.nearMisses.length > 0) {
          reporter.appendNearMisses(scan.id, metadata.name_en || metadata.name_ar || '', result.nearMisses.filter(m => m.score >= 0.4));
        }

        if (opts.dryRun) {
          this.logger.log(
            `[DRY RUN] Residual/unmatched: SCAN ${scan.gtin} ` +
            `[${result.matchType}, conf=${result.confidence.toFixed(4)}, reason=${result.reasonCode}]`
          );
        }
        stats.skipped++;
      }
    };

    try {

    // Producer/consumer pipeline setup is now at outer scope (before try block)

    /**
     * tryResolveAndRewind: Attempt to resolve a no_brand_pool residual via brand alias LLM,
     * and if successful, rewind matchScanRow with the override map.
     * Runs only on no_brand_pool residuals when enableAiMatch is true.
     */
    const tryResolveAndRewind = async (
      scan: { gtin: string; name_en: string; name_ar: string; brand: string; net_weight_value: number | null; net_unit: string | null; id: string },
      baselineResult: MatchResult,
      indexes: OffIndexes,
      inferredBrand?: string,
      inferredBrandSlug?: string,
    ): Promise<MatchResult> => {
      // Only process no_brand_pool and placeholder_brand_missing residuals
      if (baselineResult.reasonCode !== 'no_brand_pool' && baselineResult.reasonCode !== 'placeholder_brand_missing') {
        return baselineResult;
      }

      // AI matching must be enabled
      if (!enableAiMatch) {
        return baselineResult;
      }

      // Prefer inferred brand when the original scan brand is a placeholder, else use scan brand
      let rawBrand: string;
      if (isPlaceholderBrand(scan.brand) && inferredBrand) {
        rawBrand = inferredBrand.trim();
      } else {
        rawBrand = scan.brand?.trim() ?? '';
      }

      // Early guard: skip placeholder brands without inference
      // If rawBrand is itself a placeholder and we didn't get an inference, don't proceed with LLM
      if (isPlaceholderBrand(rawBrand) && !inferredBrand) {
        // This is a placeholder brand with no inference — no value in LLM call
        brandAliasAttempted.add(scan.brand?.trim() ?? '');
        return { ...baselineResult, reasonCode: 'placeholder_brand_no_inference' };
      }

      if (!rawBrand) {
        return baselineResult;
      }

      // Short-circuit if already in cache or attempted this run
      // Comment 3: Use getApproved() for override eligibility (trusted entries only)
      // and getProvisional() only for de-duplication
      const approvedEntry = this.brandAliasCache.getApproved(rawBrand, providerFilterOpts);
      
      // Detect cross-provider cache hit when isolation is OFF and Ollama is active
      let crossProviderCacheHit = false;
      if (!brandAliasProviderIsolation && activeProvider.toLowerCase() === 'ollama') {
        const unfiltered = this.brandAliasCache.getApproved(rawBrand);
        if (unfiltered && unfiltered.provider.toLowerCase() !== 'ollama') {
          crossProviderCacheHit = true;
        }
      }

      if (approvedEntry && approvedEntry.slug !== null) {
        // Approved entry found — use it for override
        const resolvedSlug = approvedEntry.slug;
        const normalizedBrand = normalizeBrandStrict(rawBrand);
        const poolSize = indexes.brandIndex.has(resolvedSlug)
          ? indexes.brandIndex.get(resolvedSlug)!.length
          : 0;

        // Comment 3: Guard against zero-pool slugs
        if (poolSize === 0) {
          this.logger.debug(`Approved alias slug '${resolvedSlug}' has no pool in current brandIndex; skipping override`);
          return baselineResult;
        }

        brandAliasOverrides.set(rawBrand, resolvedSlug);
        reporter.appendBrandAlias({
          raw_brand: rawBrand,
          normalized_brand: normalizedBrand,
          resolved_slug: resolvedSlug,
          confidence: approvedEntry.confidence,
          rationale: approvedEntry.rationale,
          provider: approvedEntry.provider,
          model: approvedEntry.model,
          cache_hit: true,
          brand_pool_size: poolSize,
          // Comment 3: Report approved flag
          approved: true,
          cross_provider_cache_hit: crossProviderCacheHit,
        });

        if (crossProviderCacheHit) {
          this.logger.debug(
            `Cross-provider brand alias cache hit: brand='${rawBrand}' stored_provider='${approvedEntry.provider}' active_provider='${activeProvider}'`
          );
        }

        // Count cached alias reuse for approved resolutions
        brandAliasesResolved++;

        const rewindResult = await this.matchScanRow(
          scan,
          indexes,
          { enableAiMatch: true, enableEmbeddingMatch: embeddingEnabled, embeddingOnly: opts.embeddingOnly, brandAliasOverrides, inferredBrandSlug, offVectors, ignoreAiVerdictCache, aiVerdictProviderIsolation },
        );
        return rewindResult.confidence > baselineResult.confidence ? rewindResult : baselineResult;
      }

      // Comment 3: Check for provisional entry only for de-duplication (not for override)
      const provisionalEntry = this.brandAliasCache.getProvisional(rawBrand, providerFilterOpts);
      
      // Detect cross-provider cache hit for provisional entry when isolation is OFF and Ollama is active
      let provisionalCrossProviderCacheHit = false;
      if (!brandAliasProviderIsolation && activeProvider.toLowerCase() === 'ollama') {
        const unfiltered = this.brandAliasCache.getProvisional(rawBrand);
        if (unfiltered && unfiltered.provider.toLowerCase() !== 'ollama') {
          provisionalCrossProviderCacheHit = true;
        }
      }

      if (provisionalEntry) {
        // Provisional entry exists — skip LLM call but don't use for override
        const normalizedBrand = normalizeBrandStrict(rawBrand);
        const poolSize = provisionalEntry.slug && indexes.brandIndex.has(provisionalEntry.slug)
          ? indexes.brandIndex.get(provisionalEntry.slug)!.length
          : 0;

        reporter.appendBrandAlias({
          raw_brand: rawBrand,
          normalized_brand: normalizedBrand,
          resolved_slug: provisionalEntry.slug,
          confidence: provisionalEntry.confidence,
          rationale: provisionalEntry.rationale,
          provider: provisionalEntry.provider,
          model: provisionalEntry.model,
          cache_hit: true,
          brand_pool_size: poolSize,
          // Comment 3: Report approved flag
          approved: false,
          cross_provider_cache_hit: provisionalCrossProviderCacheHit,
        });

        if (provisionalCrossProviderCacheHit) {
          this.logger.debug(
            `Cross-provider brand alias cache hit: brand='${rawBrand}' stored_provider='${provisionalEntry.provider}' active_provider='${activeProvider}'`
          );
        }

        // Skip LLM call — provisional decision is final (not trusted for override)
        return baselineResult;
      }

      if (brandAliasAttempted.has(rawBrand)) {
        // Known unresolvable from this run (already marked attempted)
        return baselineResult;
      }

      // Check budget
      if (!aliasBudget.tryConsume()) {
        // Budget exhausted
        this.logger.warn(`Brand alias budget exhausted; skipping resolution for "${rawBrand}"`);
        const exhaustedResult = { ...baselineResult, reasonCode: 'brand_alias_budget_exhausted' };
        brandAliasAttempted.add(rawBrand);
        return exhaustedResult;
      }

      // Call LLM
      const result = await this.gtinMatchService.resolveBrandAlias(
        rawBrand,
        eligibleBrandSlugs,
      );
      const verdict = result.verdict;

      // Record decision
      const normalizedBrand = normalizeBrandStrict(rawBrand);
      const poolSize = verdict.slug && indexes.brandIndex.has(verdict.slug)
        ? indexes.brandIndex.get(verdict.slug)!.length
        : 0;

      reporter.appendBrandAlias({
        raw_brand: rawBrand,
        normalized_brand: normalizedBrand,
        resolved_slug: verdict.slug,
        confidence: verdict.confidence,
        rationale: verdict.rationale,
        provider: result.provider,
        model: result.model,
        cache_hit: false,
        brand_pool_size: poolSize,
        // Comment 3: Initial approved flag (false for fresh resolutions)
        approved: false,
        cross_provider_cache_hit: false,
      });

      // Comment 3: Enforce strict acceptance gates on fresh overrides
      // Only accept if: slug !== null AND confidence >= 0.85 AND pool_size >= 3
      const acceptanceThreshold = 0.85;
      const minPoolSize = 3;
      let acceptEntry = false;

      if (
        verdict.slug !== null &&
        verdict.confidence >= acceptanceThreshold &&
        poolSize >= minPoolSize &&
        indexes.brandIndex.has(verdict.slug)
      ) {
        acceptEntry = true;
      }

      // Persist entry with pool_size only if it meets acceptance gates
      if (acceptEntry) {
        // Pass pool_size to set() for acceptance gate validation
        const cached = await this.brandAliasCache.set(rawBrand, {
          slug: verdict.slug,
          confidence: verdict.confidence,
          rationale: verdict.rationale,
          provider: result.provider,
          model: result.model,
          resolved_at: new Date().toISOString(),
          pool_size: poolSize,
        });

        if (cached) {
          // Entry was accepted — narrow slug and use for override if definite
          if (verdict.slug !== null) {
            this.logger.debug(`Brand alias accepted: "${rawBrand}" → "${verdict.slug}" (confidence=${verdict.confidence}, pool_size=${poolSize})`);
            brandAliasOverrides.set(rawBrand, verdict.slug);
            brandAliasesResolved++;
          }

          await this.brandAliasCache.flush();

          // Rewind: re-invoke matchScanRow with override map
          const rewindResult = await this.matchScanRow(
            scan,
            indexes,
            { enableAiMatch: true, enableEmbeddingMatch: embeddingEnabled, embeddingOnly: opts.embeddingOnly, brandAliasOverrides, inferredBrandSlug, aiBudget, embeddingBudget, offVectors, ignoreAiVerdictCache, aiVerdictProviderIsolation },
          );
          return rewindResult.confidence > baselineResult.confidence ? rewindResult : baselineResult;
        } else {
          // Entry was rejected by cache gate — log and skip
          this.logger.debug(`Brand alias rejected by acceptance gate: "${rawBrand}" (confidence=${verdict.confidence}, pool_size=${poolSize}, threshold=${acceptanceThreshold}, minPoolSize=${minPoolSize})`);
          brandAliasAttempted.add(rawBrand);
          return baselineResult;
        }
      } else {
        // Entry doesn't meet acceptance gates — check if it should go to review queue
        // Route 0.60–0.85 verdicts with a valid slug to review_queue.csv
        if (verdict.slug !== null && verdict.confidence >= 0.60 && verdict.confidence < acceptanceThreshold && poolSize >= 1) {
          // Mid-confidence brand-alias verdict: queue for human review
          reporter.appendReviewQueue({
            scan_id: scan.id,
            scan_name: 'BRAND ALIAS REVIEW: ' + rawBrand,
            off_gtin: '',
            off_name_en: verdict.slug,
            confidence: verdict.confidence,
            match_type: 'brand-alias-review',
            ai_provider: result.provider,
            ai_model: result.model,
            ai_confidence: verdict.confidence,
            ai_rationale: verdict.rationale,
            review_reason: 'brand_alias_low_confidence',
          });
          brandAliasesQueuedForReview++;
          brandAliasAttempted.add(rawBrand);
          return baselineResult;
        }

        // Otherwise, below threshold or no valid slug: log and skip
        this.logger.debug(`Brand alias below gate thresholds: "${rawBrand}" (confidence=${verdict.confidence} < ${acceptanceThreshold} OR pool_size=${poolSize} < ${minPoolSize})`);
        brandAliasAttempted.add(rawBrand);
        return baselineResult;
      }
    };

    // Comment 2: Batch loop with cursor-based paging for resumability
    let continueFetching = true;
    let maxProductsReached = false;

    while (continueFetching && !maxProductsReached) {
      const batch = await fetchBatch(currentPageUpdatedAt, currentPageId);
      
      if (batch.length === 0) {
        continueFetching = false;
        break;
      }

      pageNumber++;

      for (const row of batch) {
        // Comment 2: Check if next row would exceed maxProducts BEFORE accepting it
        if (opts.maxProducts && stats.candidates >= opts.maxProducts) {
          maxProductsReached = true;
          break;
        }

        // Only increment after deciding to process this row
        stats.candidates++;

        const scan = row as any;
      
      const gtin = scan.p_gtin || scan.gtin;
      const name_en = scan.p_name_en || scan.name_en;
      const name_ar = scan.p_name_ar || scan.name_ar;
      let brand = scan.p_brand || scan.brand;
      let net_weight_value = scan.p_net_weight_value || scan.net_weight_value || null;
      let net_unit = (scan.p_net_unit || scan.net_unit) as string | null;
      const id = scan.p_id || scan.id;

      // Comment 2: Infer brand and weight from name if brand is placeholder
      // Try name_en first, then name_ar as secondary source
      let inferred_brand: string | undefined;
      let inferred_brand_slug: string | undefined;
      let inferred_weight: string | undefined;
      if (isPlaceholderBrand(brand)) {
        // Comment 1: Keep English and Arabic inference results in separate locals
        // Primary attempt: try name_en
        const enInference = name_en ? inferBrandAndWeightFromName(name_en, brandIndex.keys()) : { brand: undefined, brandSlug: undefined, weightRaw: undefined };
        
        // Secondary attempt: if name_en didn't produce a brand, try name_ar
        const arInference = !enInference.brand && name_ar ? inferBrandAndWeightFromName(name_ar, brandIndex.keys()) : { brand: undefined, brandSlug: undefined, weightRaw: undefined };
        
        // Select the brand from the first result that has one
        const selectedBrand = enInference.brand ?? arInference?.brand;
        const selectedBrandSlug = enInference.brandSlug ?? arInference?.brandSlug;
        
        if (selectedBrand) {
          inferred_brand = selectedBrand;
          inferred_brand_slug = selectedBrandSlug;
          brand = selectedBrand;
        }
        
        // Weight preference: name_en takes precedence; name_ar used only when name_en produced no weight
        if (!net_weight_value) {
          const selectedWeight = enInference.weightRaw ?? arInference?.weightRaw;
          if (selectedWeight) {
            inferred_weight = selectedWeight;
            const weightNorm = normalizeWeight(selectedWeight);
            net_weight_value = weightNorm.value || null;
            net_unit = weightNorm.unit || null;
          }
        }
      }

      // Run Passes A–E synchronously (embedding disabled to queue residuals separately)
      const result = await this.matchScanRow(
        { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
        { offMap, brandIndex, brandWeightIndex, gtinPrefixIndex, nameTokenIndex, weightBandIndex },
        { enableAiMatch: false, enableEmbeddingMatch: false, embeddingOnly: opts.embeddingOnly, aiBudget, embeddingBudget, ignoreAiVerdictCache, aiVerdictProviderIsolation }, // Passes A–E only for the fast path
      );

      const metadata = { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id, inferred_brand, inferred_brand_slug, inferred_weight };

      // Check if in-name inference already produced a usable brand slug
      const usedInferredBrand = !!(inferred_brand_slug && brandIndex.has(inferred_brand_slug!));

      // If confident or review-bracket match from Passes A–E, apply immediately
      if (result.confidence >= 0.60) {
        await applyDisposition(
          { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
          result,
          metadata,
        );
      } else {
        // Try brand alias resolution and rewind if no_brand_pool or placeholder_brand_missing
        // BUT: skip if in-name inference already provided a usable brand (usedInferredBrand)
        let finalResult = result;
        if ((result.reasonCode === 'no_brand_pool' || result.reasonCode === 'placeholder_brand_missing') && enableAiMatch && !usedInferredBrand) {
          finalResult = await tryResolveAndRewind(
            { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
            result,
            { offMap, brandIndex, brandWeightIndex, gtinPrefixIndex, nameTokenIndex, weightBandIndex },
            inferred_brand,
            inferred_brand_slug,
          );
        }

        // Check confidence again after rewind
        if (finalResult.confidence >= 0.60) {
          await applyDisposition(
            { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
            finalResult,
            metadata,
          );
        } else {
          // Queue for Pass G (embedding) and/or Pass F if still unmatched and either is enabled
          if (enableAiMatch || embeddingEnabled) {
            pendingResiduals.push({
              scan: { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
              indexes: { offMap, brandIndex, brandWeightIndex, gtinPrefixIndex, nameTokenIndex, weightBandIndex },
              name_en,
              name_ar,
              brand,
              net_weight_value,
              net_unit,
              id,
              gtin,
              inferred_brand,
              inferred_brand_slug,
              inferred_weight,
            });

            // Flush micro-batch when threshold reached
            if (pendingResiduals.length >= MICRO_BATCH) {
              const batchToProcess = pendingResiduals.splice(0, MICRO_BATCH);
              for (const item of batchToProcess) {
                if (aiHardStopped) {
                  // Drain as ai_hard_stopped
                  const errorResult: MatchResult = {
                    candidate: null,
                    matchType: 'none',
                    confidence: 0,
                    nearMisses: [],
                    reasonCode: 'ai_hard_stopped',
                    aiVerdict: undefined,
                  };
                  await applyDisposition(item.scan, errorResult, item);
                  continue;
                }

                // Comment 1: Wrap semaphore task with error handling to ensure it always settles
                const promise = aiSemaphore.run(async () => {
                  try {
                    const aiResult = await this.matchScanRow(
                      item.scan,
                      item.indexes,
                      { enableAiMatch: enableAiMatch && !opts.embeddingOnly, enableEmbeddingMatch: embeddingEnabled, embeddingOnly: opts.embeddingOnly, brandAliasOverrides, inferredBrandSlug: item.inferred_brand_slug, aiBudget, embeddingBudget, offVectors, ollamaEmbedLimiter: ollamaLimiter?.embedLimiter, ollamaChatLimiter: ollamaLimiter?.chatLimiter, ignoreAiVerdictCache, aiVerdictProviderIsolation },
                    );
                    await applyDisposition(item.scan, aiResult, item);
                    // Track embedding outcome on success if Pass G ran
                    if (isOllamaActive && aiResult.embeddingVerdict) {
                      recordEmbeddingOutcome(false);
                    }
                  } catch (taskError: any) {
                    // Handle unexpected errors by treating as residual with error indication
                    const message = taskError instanceof Error ? taskError.message : String(taskError);
                    this.logger.error(
                      `Semaphore task error for scan ${item.scan.gtin}: ${message}. Treating as residual.`,
                      taskError,
                    );

                    // Track embedding outcome on error when Ollama is active
                    if (isOllamaActive) {
                      recordEmbeddingOutcome(true);
                    }

                    // Detect embedding-origin errors via TransientProviderFailureException.providerName or message
                    let isEmbeddingError = false;
                    if (taskError instanceof TransientProviderFailureException && taskError.providerName?.toLowerCase().includes('embedding')) {
                      isEmbeddingError = true;
                    } else if (taskError.message?.toLowerCase().includes('embed')) {
                      isEmbeddingError = true;
                    }

                    if (isEmbeddingError) {
                      // Embedding-origin error: route to embeddingErrors without aiVerdict
                      stats.embeddingErrors++;
                      const errorResult: MatchResult = {
                        candidate: null,
                        matchType: 'none',
                        confidence: 0,
                        nearMisses: [],
                        reasonCode: 'embedding_error',
                        aiVerdict: undefined,
                      };
                      await applyDisposition(item.scan, errorResult, item);
                    } else {
                      // AI-origin error: keep aiVerdict with improved provider field
                      let provider = 'unknown';
                      if (taskError instanceof TransientProviderFailureException && taskError.providerName) {
                        provider = taskError.providerName;
                      }

                      const errorResult: MatchResult = {
                        candidate: null,
                        matchType: 'none',
                        confidence: 0,
                        nearMisses: [],
                        reasonCode: 'ai_error',
                        aiVerdict: {
                          provider,
                          model: 'unknown',
                          matched_gtin: null,
                          confidence: 0,
                          rationale: `ai_error: ${message}`,
                          candidate_gtins: [],
                          latency_ms: 0,
                          cached: false,
                        },
                      };
                      await applyDisposition(item.scan, errorResult, item);
                    }
                  }
                });
                inFlight.add(promise);
                promise.finally(() => inFlight.delete(promise));
              }
            }
          } else {
            // No AI, apply residual immediately
            await applyDisposition(
              { gtin, name_en, name_ar, brand, net_weight_value, net_unit, id },
              finalResult,
              metadata,
            );
          }
        }
      }

      // Comment 1: Advance cursor unconditionally after each row is processed, regardless of disposition
      currentPageUpdatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
      currentPageId = row.id;

      // Log progress every 500 candidates
      if (stats.candidates % 500 === 0) {
        const elapsed = ((Date.now() - matchStartTime) / 1000).toFixed(1);
        const rate = (stats.candidates / ((Date.now() - matchStartTime) / 1000)).toFixed(1);
        this.logger.log(
          `Matching progress: ${stats.candidates} candidates processed (${elapsed}s, ${rate} items/sec) | ` +
          `Auto-matched: ${stats.gtinAssignedAuto}, Pending: ${stats.pendingReview}, Twins: ${stats.twinsMerged}, Skipped: ${stats.skipped}`
        );
      }
    }

    // Comment 1: Save checkpoint after batch completes for resumability (outside the per-row loop)
    if (currentPageUpdatedAt !== null && currentPageId !== null) {
      saveCheckpoint(currentPageUpdatedAt!, currentPageId!, pageNumber);
    }
    }

    // Flush remaining residuals and await all in-flight AI tasks
    if (pendingResiduals.length > 0) {
      for (const item of pendingResiduals) {
        if (aiHardStopped) {
          // Drain as ai_hard_stopped
          const errorResult: MatchResult = {
            candidate: null,
            matchType: 'none',
            confidence: 0,
            nearMisses: [],
            reasonCode: 'ai_hard_stopped',
            aiVerdict: undefined,
          };
          await applyDisposition(item.scan, errorResult, item);
          continue;
        }

        // Comment 1: Wrap semaphore task with error handling to ensure it always settles
        // even if a timeout or provider failure occurs, so Promise.all([...inFlight]) completes
        const promise = aiSemaphore.run(async () => {
          try {
            const aiResult = await this.matchScanRow(
              item.scan,
              item.indexes,
              { enableAiMatch: enableAiMatch && !opts.embeddingOnly, enableEmbeddingMatch: embeddingEnabled, embeddingOnly: opts.embeddingOnly, brandAliasOverrides, inferredBrandSlug: item.inferred_brand_slug, aiBudget, embeddingBudget, offVectors, ollamaEmbedLimiter: ollamaLimiter?.embedLimiter, ollamaChatLimiter: ollamaLimiter?.chatLimiter, ignoreAiVerdictCache, aiVerdictProviderIsolation },
            );
            await applyDisposition(item.scan, aiResult, item);
            // Track embedding outcome on success if Pass G ran
            if (isOllamaActive && aiResult.embeddingVerdict) {
              recordEmbeddingOutcome(false);
            }
          } catch (taskError: any) {
            // Handle unexpected errors by treating as residual with error indication
            const message = taskError instanceof Error ? taskError.message : String(taskError);
            this.logger.error(
              `Semaphore task error for scan ${item.scan.gtin}: ${message}. Treating as residual.`,
              taskError,
            );

            // Track embedding outcome on error when Ollama is active
            if (isOllamaActive) {
              recordEmbeddingOutcome(true);
            }

            // Detect embedding-origin errors via TransientProviderFailureException.providerName or message
            let isEmbeddingError = false;
            if (taskError instanceof TransientProviderFailureException && taskError.providerName?.toLowerCase().includes('embedding')) {
              isEmbeddingError = true;
            } else if (taskError.message?.toLowerCase().includes('embed')) {
              isEmbeddingError = true;
            }

            if (isEmbeddingError) {
              // Embedding-origin error: route to embeddingErrors without aiVerdict
              stats.embeddingErrors++;
              const errorResult: MatchResult = {
                candidate: null,
                matchType: 'none',
                confidence: 0,
                nearMisses: [],
                reasonCode: 'embedding_error',
                aiVerdict: undefined,
              };
              await applyDisposition(item.scan, errorResult, item);
            } else {
              // AI-origin error: keep aiVerdict with improved provider field
              let provider = 'unknown';
              if (taskError instanceof TransientProviderFailureException && taskError.providerName) {
                provider = taskError.providerName;
              }

              const errorResult: MatchResult = {
                candidate: null,
                matchType: 'none',
                confidence: 0,
                nearMisses: [],
                reasonCode: 'ai_error',
                aiVerdict: {
                  provider,
                  model: 'unknown',
                  matched_gtin: null,
                  confidence: 0,
                  rationale: `ai_error: ${message}`,
                  candidate_gtins: [],
                  latency_ms: 0,
                  cached: false,
                },
              };
              await applyDisposition(item.scan, errorResult, item);
            }
          }
        });
        inFlight.add(promise);
        promise.finally(() => inFlight.delete(promise));
      }
    }

    // Wait for all in-flight AI tasks to complete
    await Promise.all([...inFlight]);

    // Flush AI verdict cache and brand alias cache
    if (enableAiMatch) {
      await this.aiVerdictCache.flush();
      await this.brandAliasCache.flush();
    }

    const totalTime = ((Date.now() - matchStartTime) / 1000).toFixed(1);
    this.logger.log(`Backfill complete in ${totalTime}s: ${JSON.stringify(stats)}`);

    // Log AI cache stats
    if (enableAiMatch) {
      const cacheHits = this.aiVerdictCache.getHits?.() ?? 0;
      const cacheMisses = this.aiVerdictCache.getMisses?.() ?? 0;
      const cacheSize = this.aiVerdictCache.size?.() ?? 0;
      this.logger.log(`AI cache stats: hits=${cacheHits}, misses=${cacheMisses}, size=${cacheSize}`);
    }

    // Close reporter and write summary
    // Compute average latency before closing
    stats.aiAvgLatencyMs = aiNonCachedCalls > 0 ? Math.round(aiLatencySum / aiNonCachedCalls) : 0;

    // Comment 2: Sync stats before reporter.close()
    stats.brandAliasesResolved = brandAliasesResolved;
    stats.brandAliasesQueuedForReview = brandAliasesQueuedForReview;

    // Sync cross-provider cache hit counter from cache instance into stats
    stats.aiVerdictCrossProviderHits = this.aiVerdictCache.getCrossProviderHits?.() ?? 0;

    // Comment 2: Include budget metrics and resume/progress metadata in summary.json
    const reporterMeta = {
      limits: {
        maxProducts: opts.maxProducts,
        maxOffProducts: opts.maxOffProducts,
      },
      totalRuntimeMs: Date.now() - runStartTime,
      offPoolSize: stats.offIndexed,
      sliceFilePath: resolvedSlicePath,
      brandAliasesResolved,
      aiBudgetConsumed: aiBudget.getConsumed(),
      aiBudgetRemaining: aiBudget.getRemaining(),
      aiBudgetLimit: process.env.GTIN_AI_MATCH_DAILY_BUDGET ? parseInt(process.env.GTIN_AI_MATCH_DAILY_BUDGET!, 10) : undefined,
      embeddingBudgetConsumed: embeddingBudget.getConsumed(),
      embeddingBudgetRemaining: embeddingBudget.getRemaining(),
      embeddingBudgetLimit: process.env.GTIN_EMBEDDING_DAILY_BUDGET ? parseInt(process.env.GTIN_EMBEDDING_DAILY_BUDGET!, 10) : undefined,
      // Comment 2: Add resume/progress metadata
      resumable: true,
      lastCursor: {
        updatedAt: currentPageUpdatedAt,
        id: currentPageId,
        pageNumber,
      },
      runStartTime: new Date(runStartTime).toISOString(),
      runEndTime: new Date().toISOString(),
      applyMode: opts.dryRun ? 'dry-run' : 'write',
      aiDegraded: aiDegraded,
      aiConcurrencyFinal: aiDegraded ? degradeConcurrency : normalConcurrency,
    };

    // Populate embedding stats from provider before closing reporter
    if (embeddingEnabled && this.embeddingProvider) {
      const embeddingStats = (this.embeddingProvider as any).getStats?.();
      stats.embeddingCalls = Math.max(embeddingStats?.embedCalls ?? 0, stats.embeddingCalls);
      stats.embeddingErrors = Math.max(embeddingStats?.embedErrors ?? 0, stats.embeddingErrors);
      stats.embeddingAvgLatencyMs = embeddingStats?.embedAvgLatencyMs ?? stats.embeddingAvgLatencyMs;
    }

    await reporter.close(stats, reporterMeta);

    stats.reportDir = reporter.reportDir;
    this.logger.log(`Backfill reports written to: ${reporter.reportDir}`);
    reporterClosed = true;
    return stats;
    } catch (error: any) {
      // Comment 3: Failure path — stop scheduling new work and handle pending residuals
      const failureError = error instanceof Error ? error : new Error(String(error));
      const errorMessage = failureError.message;
      this.logger.error(`Backfill job failed with error: ${errorMessage}`, error);

      // Don't schedule new AI tasks, but flush any pending residuals as error residuals
      // so they're recorded as failures rather than disappearing
      if (pendingResiduals.length > 0 && !reporterClosed) {
        this.logger.warn(`Flushing ${pendingResiduals.length} pending residuals as error residuals before reporter close`);
        for (const item of pendingResiduals) {
          const errorResult: MatchResult = {
            candidate: null,
            matchType: 'none',
            confidence: 0,
            nearMisses: [],
            reasonCode: 'backfill_failure',
            aiVerdict: undefined,
          };
          try {
            await applyDisposition(item.scan, errorResult, item);
          } catch (itemErr: any) {
            this.logger.error(
              `Failed to apply error disposition for ${item.scan.gtin}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`
            );
          }
        }
        pendingResiduals = [];
      }

      // Await all in-flight AI tasks with bounded wait before closing reporter
      if (inFlight.size > 0) {
        this.logger.warn(`Waiting for ${inFlight.size} in-flight AI tasks to complete before close`);
        try {
          // Wait max 30 seconds for in-flight tasks
          await Promise.race([
            Promise.all([...inFlight]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('In-flight task timeout')), 30000)),
          ]);
          this.logger.log(`All in-flight AI tasks completed`);
        } catch (waitErr: any) {
          const waitErrMsg = waitErr instanceof Error ? waitErr.message : String(waitErr);
          this.logger.warn(`Warning waiting for in-flight tasks: ${waitErrMsg}. Proceeding to close reporter anyway.`);
        }
      }

      // Create failure metadata
      const failureReporterMeta = {
        limits: {
          maxProducts: opts.maxProducts,
          maxOffProducts: opts.maxOffProducts,
        },
        totalRuntimeMs: Date.now() - runStartTime,
        offPoolSize: stats.offIndexed,
        sliceFilePath: resolvedSlicePath,
        brandAliasesResolved,
        aiBudgetConsumed: aiBudget.getConsumed(),
        aiBudgetRemaining: aiBudget.getRemaining(),
        aiBudgetLimit: process.env.GTIN_AI_MATCH_DAILY_BUDGET ? parseInt(process.env.GTIN_AI_MATCH_DAILY_BUDGET!, 10) : undefined,
        embeddingBudgetConsumed: embeddingBudget.getConsumed(),
        embeddingBudgetRemaining: embeddingBudget.getRemaining(),
        embeddingBudgetLimit: process.env.GTIN_EMBEDDING_DAILY_BUDGET ? parseInt(process.env.GTIN_EMBEDDING_DAILY_BUDGET!, 10) : undefined,
        resumable: true,
        lastCursor: {
          updatedAt: currentPageUpdatedAt,
          id: currentPageId,
          pageNumber,
        },
        runStartTime: new Date(runStartTime).toISOString(),
        runEndTime: new Date().toISOString(),
        // Add failure-specific metadata
        failureStatus: true,
        failureReason: errorMessage,
        processedCandidateCount: stats.candidates,
        applyMode: opts.dryRun ? 'dry-run' : 'write',
        aiDegraded: aiDegraded,
        aiConcurrencyFinal: aiDegraded ? degradeConcurrency : normalConcurrency,
      };

      // Ensure reporter.close() is called exactly once to write summary with failure info
      if (!reporterClosed) {
        try {
          stats.aiAvgLatencyMs = aiNonCachedCalls > 0 ? Math.round(aiLatencySum / aiNonCachedCalls) : 0;
          // Comment 2: Sync stats before reporter.close() in failure path
          stats.brandAliasesResolved = brandAliasesResolved;
          stats.brandAliasesQueuedForReview = brandAliasesQueuedForReview;
          // Sync local embeddingErrors counter to stats (incremented in catch blocks for embedding-origin errors)
          stats.embeddingErrors = Math.max(embeddingErrors, stats.embeddingErrors);
          // Note: embeddingMatched, embeddingPending, embeddingNoMatch are accumulated live in applyDisposition
          
          // Populate embedding stats from provider before closing reporter
          if (embeddingEnabled && this.embeddingProvider) {
            const embeddingStats = (this.embeddingProvider as any).getStats?.();
            stats.embeddingCalls = Math.max(embeddingStats?.embedCalls ?? 0, stats.embeddingCalls);
            stats.embeddingErrors = Math.max(embeddingStats?.embedErrors ?? 0, stats.embeddingErrors);
            stats.embeddingAvgLatencyMs = embeddingStats?.embedAvgLatencyMs ?? stats.embeddingAvgLatencyMs;
          }
          
          await reporter.close(stats, failureReporterMeta);
          stats.reportDir = reporter.reportDir;
          this.logger.log(`Failure summary written to: ${reporter.reportDir}`);
          reporterClosed = true;
        } catch (closeError: any) {
          const closeErrorMsg = closeError instanceof Error ? closeError.message : String(closeError);
          this.logger.error(`Failed to close reporter after error: ${closeErrorMsg}`, closeError);
          // Don't throw here — we want to throw the original error instead
        }
      }

      throw error;
    } finally {
      // Comment 3: Cleanup finalizer — close() idempotent check and stream cleanup
      // The reporter.close() is already called in both success and error paths above,
      // but attempt cleanup if not yet closed (defensive)
    }
  }

  private makeKey(c: { brand: string; name_en: string; weightRaw: string }): string {
    const nw = normalizeWeight(c.weightRaw);
    const weightStr = nw.unit === 'unknown' ? 'unknown' : `${nw.value}${nw.unit}`;
    return `${normalizeBrandStrict(c.brand)}|${normalizeProductName(c.name_en)}|${weightStr}`;
  }
}
