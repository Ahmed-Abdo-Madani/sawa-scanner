/**
 * Utility functions for semantic string matching and weight normalization.
 */

/**
 * Calculates the Sørensen–Dice coefficient between two strings.
 * Returns a score between 0.0 (no similarity) and 1.0 (exact match).
 */
export function diceCoefficient(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  // Normalize strings
  const s1 = str1.toLowerCase().trim().replace(/\s+/g, ' ');
  const s2 = str2.toLowerCase().trim().replace(/\s+/g, ' ');

  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  // Create bigrams
  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bigram = str.substring(i, i + 2);
      bigrams.set(bigram, (bigrams.get(bigram) ?? 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  for (const [bigram, count] of bg1.entries()) {
    if (bg2.has(bigram)) {
      intersection += Math.min(count, bg2.get(bigram)!);
    }
  }

  const total = s1.length - 1 + (s2.length - 1);
  return (2.0 * intersection) / total;
}

/**
 * Extracts and normalizes a weight string into grams.
 * Example: "1L" -> { value: 1000, unit: "g" }
 * Example: "500ml" -> { value: 500, unit: "g" }
 * Example: "1.5 kg" -> { value: 1500, unit: "g" }
 */
export function normalizeWeightToGrams(
  weightStr: string | null | undefined,
): number | null {
  if (!weightStr) return null;
  const match = weightStr
    .toLowerCase()
    .match(/([\d.]+)\s*(g|kg|ml|l|liter|liters|mg)/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  if (isNaN(value)) return null;

  const unit = match[2];
  switch (unit) {
    case 'kg':
    case 'l':
    case 'liter':
    case 'liters':
      return value * 1000;
    case 'mg':
      return value / 1000;
    case 'g':
    case 'ml':
    default:
      return value;
  }
}

/**
 * Checks if two weight objects strictly match (within an acceptable tolerance).
 */
export function doWeightsMatchStrictly(
  dbValue: number | null,
  dbUnit: string | null,
  ocrWeightRaw: string | null,
): boolean {
  // If OCR failed to extract a weight, we cannot strictly check it.
  // Should we reject? Based on the strict rule, yes, if both are missing we can accept, but if one has it and the other doesn't, we should handle carefully.
  // Actually, let's just parse both to grams.
  const ocrGrams = normalizeWeightToGrams(ocrWeightRaw);
  const dbGrams = normalizeWeightToGrams(`${dbValue ?? ''} ${dbUnit ?? ''}`);

  if (ocrGrams === null && dbGrams === null) return true; // Both unknown -> Accept as match
  if (ocrGrams === null || dbGrams === null) return false; // One unknown -> Strict reject (avoid 1L matching 2L)

  // Allow a 10% tolerance for rounding issues (e.g. 330ml vs 350ml in some listings)
  const margin = dbGrams * 0.1;
  return Math.abs(ocrGrams - dbGrams) <= margin;
}

/**
 * Normalizes weight into a standardized object.
 * Identical to the logic in ProductClusteringService.
 */
export function normalizeWeight(weightRaw: any): {
  value: number;
  unit: 'g' | 'ml' | 'unknown';
} {
  if (!weightRaw) return { value: 0, unit: 'unknown' };
  let raw = '';
  if (typeof weightRaw === 'object') {
    raw = `${weightRaw.value || ''}${weightRaw.unit || ''}`.trim();
  } else {
    raw = String(weightRaw).toLowerCase().trim();
  }
  const match = raw.match(/(\d+\.?\d*)\s*(g|kg|l|ml|cc|cl)/);

  if (!match) return { value: 0, unit: 'unknown' };

  let value = parseFloat(match[1]);
  let unit = match[2];

  // Standardize units
  if (unit === 'kg') {
    value *= 1000;
    unit = 'g';
  } else if (unit === 'l') {
    value *= 1000;
    unit = 'ml';
  } else if (unit === 'cc' || unit === 'cl') {
    if (unit === 'cl') value *= 10;
    unit = 'ml';
  }

  return { value, unit: unit as 'g' | 'ml' };
}

