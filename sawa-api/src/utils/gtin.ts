/**
 * GTIN utilities — source of truth for validating official GTINs and identifying synthetic placeholders.
 */

/**
 * Regex matching official GTINs: 8 digits, or 12–14 digits.
 * Rejects SCAN-*, URL-*, numeric IDs (Ninja) like 523, and raw URLs.
 */
export const GTIN_REGEX = /^\d{8}$|^\d{12,14}$/;

/**
 * Validates whether a string is a real (official) GTIN.
 */
export function isRealGtin(gtin: string): boolean {
  return GTIN_REGEX.test(gtin);
}

/**
 * Returns the SQL WHERE clause for matching synthetic-GTIN rows.
 * These are rows with SCAN-*, URL-*, or short numeric IDs (non-official GTINs).
 * Uses Postgres regex negation: `!~` means "does NOT match".
 * 
 * @param alias The table alias to use (e.g., 'p' or 'product')
 * @returns A string ready for use in typeorm QueryBuilder.where()
 */
export function syntheticGtinWhere(alias: string): string {
  return `${alias}.gtin !~ '^[0-9]{8}$|^[0-9]{12,14}$'`;
}
