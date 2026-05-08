/**
 * Normalization utilities — single source of truth for brand, product name, and GTIN normalization.
 */

import { isRealGtin } from './gtin';

/**
 * Arabic brand aliases — checked first before any other transformation.
 */
const ARABIC_BRAND_ALIASES: Record<string, string> = {
  'المراعي': 'almarai',
  'كوكا كولا': 'coca-cola',
  'بيبسي': 'pepsi',
  'نستله': 'nestle',
  'ماجي': 'maggi',
  'نيدو': 'nido',
  'ليبتون': 'lipton',
  'ريد بول': 'red-bull',
  'اوريو': 'oreo',
  'برينجلز': 'pringles',
  'نوتيلا': 'nutella',
  'انستنت نودلز': 'indomie',
};

/**
 * Normalizes a brand name to lowercase, Latin slug format.
 * - Checks Arabic alias map first
 * - Applies NFKD Unicode normalization and strips diacritics
 * - Removes apostrophes/quotes
 * - Replaces & with "-and-"
 * - Replaces non-alphanumeric runs with "-"
 * - Trims and collapses repeated dashes
 */
export function normalizeBrandStrict(brand: string): string {
  if (!brand) return '';

  // Check Arabic aliases first
  if (ARABIC_BRAND_ALIASES[brand]) {
    return ARABIC_BRAND_ALIASES[brand];
  }

  return normalizeBrandPipeline(brand);
}

/**
 * Private helper that applies the NFKD/diacritic/regex pipeline.
 * Extracted for reuse by normalizeBrandStrictWithOverrides.
 */
function normalizeBrandPipeline(brand: string): string {
  return brand
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '') // Strip combining diacritical marks
    .toLowerCase()
    .replace(/[''ʼ]/g, '') // Remove apostrophes/right-single-quotes
    .replace(/&/g, '-and-') // Replace & with "-and-"
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric runs with "-"
    .replace(/^-+|-+$/g, '') // Trim dashes from edges
    .replace(/-+/g, '-'); // Collapse repeated dashes
}

/**
 * Normalizes a brand name to lowercase, Latin slug format, with runtime overrides.
 * - Checks overrides map first (runtime aliases, typically from cache)
 * - Then checks ARABIC_BRAND_ALIASES (static package-level aliases)
 * - Falls back to the NFKD/diacritic/regex pipeline
 * - Does NOT mutate ARABIC_BRAND_ALIASES
 *
 * @param brand - The raw brand string to normalize
 * @param overrides - Optional Map or plain object of raw brand → slug overrides
 * @returns The normalized brand slug
 */
export function normalizeBrandStrictWithOverrides(
  brand: string,
  overrides?: Map<string, string> | Record<string, string>,
): string {
  if (!brand) return '';

  // Check overrides first (runtime precedence)
  if (overrides) {
    if (overrides instanceof Map) {
      if (overrides.has(brand)) {
        return overrides.get(brand)!;
      }
    } else {
      if (brand in overrides) {
        return overrides[brand];
      }
    }
  }

  // Then check static Arabic aliases
  if (ARABIC_BRAND_ALIASES[brand]) {
    return ARABIC_BRAND_ALIASES[brand];
  }

  // Fall back to normalization pipeline
  return normalizeBrandPipeline(brand);
}

/**
 * Normalizes a product name for deduplication:
 * - Lowercases
 * - Strips weight/unit tokens: g, kg, ml, l, cl, cc, oz, pcs, pack (English) and لتر, ملل, غرام, كغ, حبة (Arabic)
 * - Strips English packaging words (pack of, multipack, bundle, etc.)
 * - Strips Arabic packaging words (عبوة, علبة, كرتون, زجاجة, علب)
 * - Collapses whitespace and trims
 */
export function normalizeProductName(name: string): string {
  if (!name) return '';

  return name
    .toLowerCase()
    // Strip weight/unit tokens (both Latin and Arabic)
    .replace(/\d+\.?\d*\s*(g|kg|ml|l|cl|cc|oz|pcs|pack|لتر|ملل|غرام|كغ|حبة)\s?/gi, '')
    // Strip English packaging words (case-insensitive, whole-word)
    .replace(/\b(pack\s+of|multipack|bundle|value\s+pack|family\s+size|single|bottle|can|tin|box|carton|sachet)\b/gi, '')
    // Strip Arabic packaging equivalents
    .replace(/(عبوة|علبة|كرتون|زجاجة|علب)/g, '')
    // Collapse whitespace and trim
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes a GTIN string:
 * - Returns null if input is falsy, starts with SCAN-/URL-, or contains non-digits
 * - Only pads 12-digit inputs to 13 digits; preserves zero-prefixed valid 8/13/14-digit GTINs
 * - Validates with isRealGtin; returns null if invalid
 * - Returns the normalized GTIN string
 */
export function normalizeGtin(raw: string): string | null {
  if (!raw) return null;
  if (raw.startsWith('SCAN-') || raw.startsWith('URL-')) return null;
  if (!/^\d+$/.test(raw)) return null;

  const length = raw.length;

  // Only pad 12-digit inputs to 13 digits
  if (length === 12) {
    const normalized = raw.padStart(13, '0');
    if (!isRealGtin(normalized)) return null;
    return normalized;
  }

  // For 8, 13, 14 digit inputs, validate without stripping leading zeros
  if (isRealGtin(raw)) {
    return raw;
  }

  return null;
}

/**
 * Extract the GS1 prefix (first 3 digits) from a normalized GTIN.
 * Handles GTIN-14 codes with leading zeros: a GTIN-14 starting with '0' is aligned
 * to GTIN-13 by dropping the packaging digit, so prefix is extracted from positions 1-3.
 *
 * @param gtin - A normalized GTIN string (null treated as no prefix)
 * @returns The 3-digit GS1 prefix, or null if invalid
 *
 * Examples:
 * - "6281234567890" → "628" (GTIN-13)
 * - "06281234567890" → "628" (GTIN-14 with packaging digit 0)
 * - "16281234567890" → "628" (GTIN-14 with packaging digit 1)
 */
export function getGtinPrefix(gtin: string | null): string | null {
  if (!gtin || gtin.length < 3) return null;

  // GTIN-14 codes: drop the packaging digit (position 0) and take positions 1-3
  if (gtin.length === 14) {
    return gtin.substring(1, 4);
  }

  // GTIN-13, GTIN-12, GTIN-8: take first 3 digits
  return gtin.substring(0, 3);
}

/**
 * Extracts the GS1 prefix (first 3 digits) from a raw GTIN string.
 * First normalizes the GTIN, then applies the same prefix extraction logic as getGtinPrefix.
 * Handles GTIN-14 alignment: GTIN-14 codes drop the packaging digit.
 * 
 * @param gtin - A raw GTIN string to normalize and extract prefix from
 * @param len - Length of prefix to extract (default 3). Note: len parameter is ignored for GTIN-14 alignment
 * @returns The 3-digit GS1 prefix, or null if normalization fails
 */
export function gtinPrefix(gtin: string, len = 3): string | null {
  const normalized = normalizeGtin(gtin);
  if (!normalized) return null;
  return getGtinPrefix(normalized);
}

/**
 * Normalizes a weight/quantity string to grams.
 * - Parses numeric value and unit from strings like "500g", "1.5kg", "330ml", "1l"
 * - Converts units: kg → g (×1000), l → ml (×1000)
 * - Treats ml as equivalent to g for range filtering purposes
 * - Returns null if string is absent or unparseable
 *
 * @param quantity - A quantity string (e.g., "500g", "1.5kg", "330ml", "1l")
 * @returns The weight in grams, or null if unparseable
 */
export function normalizeWeightToGrams(quantity: string | undefined): number | null {
  if (!quantity || typeof quantity !== 'string') return null;

  const trimmed = quantity.trim();
  if (!trimmed) return null;

  // Match numeric value (integer or float) followed by optional unit
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([a-z]+)?$/i);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2]?.toLowerCase() || 'g'; // Default to grams if no unit specified

  if (isNaN(value) || value < 0) return null;

  // Convert to grams
  switch (unit) {
    case 'g':
      return value;
    case 'kg':
      return value * 1000;
    case 'ml':
      return value; // Treat ml as equivalent to g
    case 'l':
      return value * 1000; // 1l = 1000ml = ~1000g
    case 'cl':
      return value * 10; // 1cl = 10ml
    case 'mg':
      return value / 1000; // 1mg = 0.001g
    default:
      // Unknown unit, treat as grams
      return value;
  }
}

/**
 * Set of placeholder/generic brand names that indicate missing brand information.
 * Comparison is done after lowercasing and trimming.
 * Includes English and Arabic variants.
 */
export const PLACEHOLDER_BRANDS: ReadonlySet<string> = new Set([
  'generic',
  'unnamed',
  'unnamed product',
  'unknown',
  'n/a',
  'na',
  'none',
]);

/**
 * Determines if a brand value is a placeholder (generic/missing brand indicator).
 * Returns true when:
 * - Input is null, undefined, or empty string
 * - Input is whitespace-only
 * - Input (after lowercasing and trimming) is in PLACEHOLDER_BRANDS
 *
 * @param raw - The raw brand string to check
 * @returns true if brand is a placeholder or missing
 */
export function isPlaceholderBrand(raw: string | null | undefined): boolean {
  if (!raw) return true;
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return PLACEHOLDER_BRANDS.has(trimmed.toLowerCase());
}

/**
 * Normalizes a brand name to a usable slug, treating placeholder brands as missing.
 * - Returns empty string when isPlaceholderBrand(raw) is true
 * - Otherwise delegates to normalizeBrandStrict for standard normalization
 *
 * This allows code to treat placeholder brands as missing data without breaking
 * existing callers of normalizeBrandStrict that don't need placeholder handling.
 *
 * @param raw - The raw brand string to normalize
 * @returns The normalized brand slug, or empty string if placeholder
 */
export function normalizeBrandUsable(raw: string | null | undefined): string {
  if (isPlaceholderBrand(raw)) return '';
  return normalizeBrandStrict(raw || '');
}

/**
 * Infers brand and weight from a product name using heuristics.
 * Useful when brand column is missing or placeholder.
 *
 * - Extracts weight/unit (first match of \d+(\.\d+)?\s*(g|kg|ml|l|cl|oz))
 * - If knownBrandSlugs is provided, scans first 1-3 tokens of the name
 *   for brand matches (normalized token vs known slug comparison)
 *
 * @param name - The product name to analyze
 * @param knownBrandSlugs - Optional iterable of known normalized brand slugs to check against
 * @returns Object with optional inferred brand (original casing), brandSlug, and weightRaw
 */
export function inferBrandAndWeightFromName(
  name: string,
  knownBrandSlugs?: Iterable<string>,
): { brand?: string; brandSlug?: string; weightRaw?: string } {
  const result: { brand?: string; brandSlug?: string; weightRaw?: string } = {};

  if (!name) return result;

  // Extract weight: first match of number + unit
  const weightRegex = /(\d+(?:\.\d+)?)\s*(g|kg|ml|l|cl|oz)\b/i;
  const weightMatch = name.match(weightRegex);
  if (weightMatch) {
    result.weightRaw = weightMatch[0]; // e.g., "1L", "500g"
  }

  // If knownBrandSlugs provided, scan tokens for brand match
  if (knownBrandSlugs) {
    // Split name into tokens, scan first 1-3
    const tokens = name.split(/\s+/).filter((t) => t.length > 0);
    const knownSlugsSet = new Set<string>();
    for (const slug of knownBrandSlugs) {
      knownSlugsSet.add(slug);
    }

    // Try to match each of the first few tokens to a known brand
    for (let i = 0; i < Math.min(3, tokens.length); i++) {
      const token = tokens[i];
      const normalized = normalizeBrandStrict(token);

      if (normalized && knownSlugsSet.has(normalized)) {
        result.brand = token; // Original casing
        result.brandSlug = normalized;
        break;
      }
    }
  }

  return result;
}
