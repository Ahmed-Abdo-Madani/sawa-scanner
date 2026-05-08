import {
  AiGtinMatchInput,
  AiBrandAliasInput,
  MAX_CANDIDATES_PER_CALL,
  MAX_BRAND_SLUGS_PER_CALL,
} from './llm-gtin-match-provider.interface';

/**
 * Generate the GTIN matching prompt for the LLM.
 * Verbatim copy of the logic from GoogleAiGeminiGtinMatchProvider.getPrompt().
 */
export function getPrompt(input: AiGtinMatchInput): string {
  const candidatesJson = input.candidates
    .slice(0, MAX_CANDIDATES_PER_CALL)
    .map((c, i) => ({
      index: i,
      gtin: c.gtin,
      brand: c.brand || '',
      name_en: c.name_en || '',
      name_ar: c.name_ar || '',
      weightRaw: c.weightRaw || '',
    }));

  return `You are an expert product matching specialist for the Saudi Arabian market.
Your task is to match a scanned product to the best candidate from a list of OpenFoodFacts records.

SCANNED PRODUCT:
${JSON.stringify(input.scan, null, 2)}

CANDIDATE MATCHES (up to ${MAX_CANDIDATES_PER_CALL}):
${JSON.stringify(candidatesJson, null, 2)}

MATCHING CRITERIA:
1. Name Matching: Consider name_en and name_ar equally. Transliterations count as matches. Partial matches are OK if the core product name is present.
2. Brand Matching: Must match or be a clear variant (e.g., "Brand" vs "Brand Co.").
3. Weight and Package Matching: Weight and package divergence are critical signals; they are NOT mere tie-breakers. Define a "strict same-SKU package signal" as: identical brand AND identical product name AND identical pack/format/flavor/variant tokens (e.g., same "pack of N", same "multipack"/"family"/"value"/"single", same container word "bottle"/"can"/"box"/"sachet"/"tin"/"carton", same flavor token, same fat/sweetness token, same form token "powder"/"liquid"/"rtd").
   - When both weightRaw values are known and differ by more than ±15%, treat as a major divergence. Divergences exceeding ±25% are especially severe.
   - When the candidate's package qualifier (pack-of-N vs unit, drained vs total, multipack, family/value pack, container type) does not match the scan, treat as package_mismatch_major.
   - Under either condition (weight divergence > ±15% OR package mismatch), the model MUST NOT return that candidate as a match unless the scan and candidate share the strict same-SKU package signal. Otherwise return matched_gtin: null (or confidence < 0.60) with the reject token (weight_mismatch_major or package_mismatch_major) in rationale.
   - Within ±15% weight divergence and matching package qualifier, accept the match and emit weight_mismatch_minor in rationale only if weight actually diverges.
   - For flavor/variant/form tokens (e.g., chocolate vs vanilla, diet vs zero, powder vs liquid): when one side carries a distinct token and the other carries a different token from the same category, return matched_gtin: null with rationale "flavor_mismatch" / "variant_mismatch" / "form_mismatch".
4. Hard Constraint: Reject tokens (weight_mismatch_major, package_mismatch_major, flavor_mismatch, variant_mismatch, form_mismatch, brand_mismatch, no_candidates) are mandatory under their conditions. Prefer matched_gtin: null over speculative matches.

RESPONSE SCHEMA:
Return a JSON object with:
- matched_gtin: The GTIN of the best candidate, or null if no acceptable match exists.
- confidence: A value between 0.0 and 1.0 (0.9+ = very high confidence, 0.7+ = good confidence, <0.5 = uncertain).
- rationale: A controlled-vocabulary token from: accept tokens (name_match_high_confidence, weight_mismatch_minor ≤ ±15%, allowed to match); reject tokens (weight_mismatch_major > ±15%, package_mismatch_major, flavor_mismatch, variant_mismatch, form_mismatch, brand_mismatch, no_candidates, transient_provider_failure, all_providers_failed). A reject token requires matched_gtin: null unless a strict same-SKU signal is present.
- enrichment_hints: An optional object where each field (name_en, name_ar, brand) is true only if the candidate value is clearly higher quality than the scan value.

INSTRUCTIONS:
- If more than one candidate appears to match, pick the one with the highest overall confidence.
- Prefer candidates with complete (non-empty) name and brand fields.
- Apply the weight and package matching rules strictly: reject tokens are mandatory under their conditions. Do not return any match when weight divergence exceeds ±15% or package mismatch is detected, unless the strict same-SKU signal is present. Divergences > ±25% are especially severe and nearly always mandate rejection.
- For weight divergence within ±15%, emit "weight_mismatch_minor" when it diverges, still enabling a match.
- Always return a valid JSON object; never return null or undefined for the top-level response.
`;
}

/**
 * Generate the brand alias matching prompt for the LLM.
 * Verbatim copy of the logic from GoogleAiGeminiGtinMatchProvider.getBrandAliasPrompt().
 */
export function getBrandAliasPrompt(input: AiBrandAliasInput): string {
  const slugsJson = input.knownOffBrandSlugs
    .slice(0, MAX_BRAND_SLUGS_PER_CALL)
    .join('\n  ');

  return `You are an expert brand name matching specialist for the Saudi Arabian market.
Your task is to match a scanned product's brand name to the most likely OpenFoodFacts brand slug.

SCANNED BRAND:
- Raw (as scanned): "${input.scanBrandRaw}"
- Normalized (Latin/ASCII): "${input.scanBrandNormalized}"

CANDIDATE BRAND SLUGS (up to ${MAX_BRAND_SLUGS_PER_CALL}):
  ${slugsJson}

MATCHING CRITERIA:
1. Prefer exact transliterations: if the raw scan brand is in Arabic or other script, match it against transliterations of the candidate slugs.
2. Accept normalized variant matches: the normalized form often surfaces valid transliterations (e.g., "Coca Cola" matches "coca-cola").
3. Confidence Threshold: Return slug=null if confidence is below 0.7 (better to skip than misalign brands).
4. Return rationale in all cases: cite the chosen slug or explain "no_confident_match" if uncertain.

RESPONSE SCHEMA:
Return a JSON object with:
- slug: The matched OFF brand slug (e.g., "coca-cola", "nestle", "almarai"), or null if no confident match.
- confidence: A value between 0.0 and 1.0 (0.9+ = very high, 0.7-0.9 = good, <0.7 = no match).
- rationale: Brief explanation (e.g., "exact_transliteration", "normalized_match", "no_confident_match").

INSTRUCTIONS:
- Always return a valid JSON object; never return null or undefined for the top-level response.
- If uncertain, prefer returning slug=null with rationale="no_confident_match" over guessing.
`;
}

/**
 * Return plain JSON Schema for GTIN matching response (Ollama-compatible).
 * Uses string literals instead of SchemaType enums.
 */
export function gtinMatchJsonSchema(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      matched_gtin: {
        type: ['string', 'null'],
        description: 'The GTIN of the best-matching candidate, or null if no match.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score from 0.0 to 1.0.',
      },
      rationale: {
        type: 'string',
        description:
          'A controlled-vocabulary token explaining the decision. Accept tokens: name_match_high_confidence, weight_mismatch_minor (≤ ±15%, allowed to match). Reject tokens (must set matched_gtin: null unless strict same-SKU signal present): weight_mismatch_major (> ±15%), package_mismatch_major, flavor_mismatch, variant_mismatch, form_mismatch, brand_mismatch, no_candidates, transient_provider_failure, all_providers_failed. Other explanatory tokens may follow the primary token.',
      },
      enrichment_hints: {
        type: ['object', 'null'],
        properties: {
          name_en: {
            type: ['boolean', 'null'],
            description: 'true if candidate name_en is significantly better than scan name_en',
          },
          name_ar: {
            type: ['boolean', 'null'],
            description: 'true if candidate name_ar is significantly better than scan name_ar',
          },
          brand: {
            type: ['boolean', 'null'],
            description: 'true if candidate brand is significantly better than scan brand',
          },
        },
      },
    },
    required: ['matched_gtin', 'confidence', 'rationale'],
  };
}

/**
 * Return plain JSON Schema for brand alias matching response (Ollama-compatible).
 * Uses string literals instead of SchemaType enums.
 */
export function brandAliasJsonSchema(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      slug: {
        type: ['string', 'null'],
        description: 'The matched OFF brand slug, or null if no confident match.',
      },
      confidence: {
        type: 'number',
        description: 'Confidence score from 0.0 to 1.0.',
      },
      rationale: {
        type: 'string',
        description: 'Human-readable explanation of the decision or reason for no match.',
      },
    },
    required: ['slug', 'confidence', 'rationale'],
  };
}
