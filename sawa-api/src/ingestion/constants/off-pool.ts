import * as crypto from 'crypto';
import { DumpStreamFilter } from '../open-food-facts-dump.service';
import { GLOBAL_BRANDS_FOR_POOL } from './global-brands';

const logger = {
  warn: (msg: string) => console.warn(`[WARN] ${msg}`),
};

export const GCC_COUNTRY_TAGS = [
  'saudi-arabia',
  'united-arab-emirates',
  'bahrain',
  'kuwait',
  'qatar',
  'oman',
];

export const GCC_GS1_PREFIXES = [
  '628',
  '629',
];

/**
 * Build a DumpStreamFilter from environment variables.
 * - OFF_POOL_COUNTRIES: CSV of country tags (default: GCC_COUNTRY_TAGS)
 * - OFF_POOL_GTIN_PREFIXES: CSV of GS1 prefixes (default: GCC_GS1_PREFIXES)
 * - OFF_POOL_BRANDS_OVERRIDE: CSV of brand names (optional, undefined if empty)
 *
 * Returns a filter compatible with DumpStreamFilter, including requireAny = true
 * to apply union semantics (country OR prefix OR brand match).
 *
 * WARNING: If OFF_BACKFILL_BRANDS is set but OFF_POOL_BRANDS_OVERRIDE is not,
 * the deprecated variable will be silently ignored and the pool will be driven
 * only by country tags and GTIN prefixes.
 */
export function getOffPoolFilter(): DumpStreamFilter {
  // Check for deprecated OFF_BACKFILL_BRANDS variable
  const legacyBrands = process.env.OFF_BACKFILL_BRANDS;
  const newBrandsOverride = process.env.OFF_POOL_BRANDS_OVERRIDE;
  
  if (legacyBrands && !newBrandsOverride) {
    logger.warn(
      'OFF_BACKFILL_BRANDS is set but OFF_POOL_BRANDS_OVERRIDE is not. ' +
      'The deprecated OFF_BACKFILL_BRANDS variable will be ignored. ' +
      'The OFF pool will be driven by OFF_POOL_COUNTRIES, OFF_POOL_GTIN_PREFIXES, and GLOBAL_BRANDS_FOR_POOL. ' +
      'Update your configuration to use OFF_POOL_BRANDS_OVERRIDE if additional brand-based filtering is needed.'
    );
  }

  const countryTagsEnv = process.env.OFF_POOL_COUNTRIES;
  const countryTags = countryTagsEnv
    ? countryTagsEnv.split(',').map((t) => t.trim()).filter((t) => t.length > 0)
    : GCC_COUNTRY_TAGS;

  const prefixesEnv = process.env.OFF_POOL_GTIN_PREFIXES;
  const gtinPrefixes = prefixesEnv
    ? prefixesEnv.split(',').map((p) => p.trim()).filter((p) => p.length > 0)
    : GCC_GS1_PREFIXES;

  const brandsOverrideEnv = process.env.OFF_POOL_BRANDS_OVERRIDE;
  const overrideSlugs = brandsOverrideEnv && brandsOverrideEnv.trim().length > 0
    ? brandsOverrideEnv.split(',').map((b) => b.trim()).filter((b) => b.length > 0)
    : [];

  const brandSlugs = Array.from(new Set([...GLOBAL_BRANDS_FOR_POOL, ...overrideSlugs]));

  return {
    countryTags,
    gtinPrefixes,
    brandSlugs,
    requireAny: true,
  };
}

/**
 * Generate a deterministic hash string for a DumpStreamFilter.
 * Used to name the slice file (e.g., off_pool_<hash>.ndjson.gz).
 * Hash is derived from sorted country tags and GTIN prefixes (brand slugs are not hashed).
 */
export function getOffPoolHash(filter: DumpStreamFilter): string {
  const sortedCountries = (filter.countryTags || []).sort().join(',');
  const sortedPrefixes = (filter.gtinPrefixes || []).sort().join(',');
  const combined = `${sortedCountries}|${sortedPrefixes}`;
  return crypto
    .createHash('md5')
    .update(combined)
    .digest('hex')
    .slice(0, 8);
}
