/**
 * GTIN Entity Matching LLM Provider Interface & Types
 * Matches a scanned product to one of N OpenFoodFacts candidates via structured AI inference.
 */

/**
 * Scanned product snapshot: the input from a barcode + label scan.
 */
export interface AiGtinMatchInput {
  scan: {
    id: string;
    gtin: string;
    name_en?: string;
    name_ar?: string;
    brand?: string;
    net_weight_value?: number;
    net_unit?: string; // e.g., 'g', 'ml'
  };
  candidates: Array<{
    gtin: string;
    brand?: string;
    name_en?: string;
    name_ar?: string;
    weightRaw?: string; // e.g., "500 g", "1 L"
  }>;
}

/**
 * Result of GTIN matching: the AI's best verdict on which candidate (if any) the scan matches.
 */
export interface AiGtinMatchVerdict {
  matched_gtin: string | null;
  confidence: number; // 0..1 scale
  rationale: string; // Explanation of the decision (e.g., 'weight_mismatch', 'all_providers_failed')
  enrichment_hints?: {
    name_en?: boolean; // true if OFF candidate's name_en is clearly better than scan's
    name_ar?: boolean; // true if OFF candidate's name_ar is clearly better than scan's
    brand?: boolean; // true if OFF candidate's brand is clearly better than scan's
  };
}

/**
 * Complete result of GTIN matching, including verdict and provider metadata.
 */
export interface AiGtinMatchResult {
  verdict: AiGtinMatchVerdict;
  provider: string; // Name of the provider that produced this verdict
  model: string; // Model name or identifier used
}

/**
 * Brand alias resolution input: raw brand, normalized, and candidate pool.
 */
export interface AiBrandAliasInput {
  scanBrandRaw: string; // Raw brand string from scan
  scanBrandNormalized: string; // Brand after normalizeBrandStrict
  knownOffBrandSlugs: string[]; // Candidate brand slugs from OFF index
}

/**
 * Brand alias resolution verdict: matched slug (or null), confidence, and explanation.
 */
export interface AiBrandAliasVerdict {
  slug: string | null; // Matched OFF brand slug, or null if no confident match
  confidence: number; // 0..1 scale
  rationale: string; // Explanation (e.g., 'exact_transliteration', 'no_confident_match')
}

/**
 * Complete result of brand alias resolution, including verdict and provider metadata.
 */
export interface AiBrandAliasResult {
  verdict: AiBrandAliasVerdict;
  provider: string; // Name of the provider that produced this verdict
  model: string; // Model name or identifier used
}

/**
 * LLM provider interface for GTIN matching.
 */
export interface LlmGtinMatchProvider {
  readonly name: string;
  pickBestMatch(input: AiGtinMatchInput): Promise<AiGtinMatchResult>;
  resolveBrandAlias(input: AiBrandAliasInput): Promise<AiBrandAliasResult>;
  healthCheck?(): Promise<boolean>; // Optional health check for provider availability
}

/**
 * Maximum number of candidates to send in a single GTIN match LLM call.
 * If input exceeds this, the service will batch or reject.
 */
export const MAX_CANDIDATES_PER_CALL = 10;

/**
 * Maximum number of brand slugs to send in a single brand alias LLM call.
 * Prompts with too many candidates become slow/inaccurate; slice if needed.
 */
export const MAX_BRAND_SLUGS_PER_CALL = 200;

/**
 * Validate that the verdict meets all contract constraints:
 * - If matched_gtin is present, it must be one of the supplied candidates.
 * - Confidence must be in the [0, 1] range.
 * Returns the verdict unchanged if valid; sanitizes to null if invalid.
 */
export function validateVerdictAgainstCandidates(
  verdict: AiGtinMatchVerdict,
  candidateGtins: string[],
): AiGtinMatchVerdict {
  if (verdict.matched_gtin === null) {
    // Null is always valid (model chose not to match).
    // Still validate confidence bounds.
    if (verdict.confidence < 0 || verdict.confidence > 1) {
      return {
        matched_gtin: null,
        confidence: 0,
        rationale: `invalid_confidence:${verdict.confidence}`,
      };
    }
    return verdict;
  }

  if (!candidateGtins.includes(verdict.matched_gtin)) {
    // Model hallucinated a GTIN not in the candidate list.
    return {
      matched_gtin: null,
      confidence: 0,
      rationale: `invalid_gtin_returned:${verdict.matched_gtin}`,
    };
  }

  // Validate confidence is in [0, 1] range.
  if (verdict.confidence < 0 || verdict.confidence > 1) {
    return {
      matched_gtin: null,
      confidence: 0,
      rationale: `invalid_confidence:${verdict.confidence}`,
    };
  }

  return verdict;
}

/**
 * Validate a brand alias verdict against the known brand slug list.
 * - Sanitizes confidence to [0, 1] range
 * - Forces slug to null if it's not in the supplied list (prevents hallucination)
 * Returns the verdict with sanitized fields.
 */
export function validateBrandAliasVerdict(
  verdict: AiBrandAliasVerdict,
  knownSlugs: string[],
): AiBrandAliasVerdict {
  // Clamp confidence to [0, 1]
  let confidence = verdict.confidence;
  if (confidence < 0) confidence = 0;
  if (confidence > 1) confidence = 1;

  // If slug is present, validate it's in the known list
  let slug = verdict.slug;
  if (slug !== null && !knownSlugs.includes(slug)) {
    slug = null;
  }

  return {
    slug,
    confidence,
    rationale: verdict.rationale,
  };
}
