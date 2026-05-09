// ─── Verticals ───────────────────────────────────────────────────────────────

export type HsVertical =
  | 'hypermarket'
  | 'grocery'
  | 'pharmacy'
  | 'bakery'
  | 'sweets'
  | 'flowers'
  | 'pet'
  | 'other'
  | 'restaurant'
  | 'cuisine'
  | 'food';

/** Non-food verticals we actively want to discover and persist. */
export const HUNGERSTATION_ALLOWED_VERTICALS: ReadonlySet<HsVertical> = new Set(
  ['hypermarket', 'grocery', 'pharmacy', 'bakery', 'sweets', 'flowers', 'pet'],
);

/** Food / restaurant verticals — hard-reject at classification time. */
export const HUNGERSTATION_REJECTED_VERTICALS: ReadonlySet<HsVertical> =
  new Set(['restaurant', 'cuisine', 'food']);

/**
 * Maps a URL path segment (as HungerStation uses it) to our canonical vertical.
 * The first matching segment wins during classification.
 */
export const HUNGERSTATION_URL_SEGMENT_TO_VERTICAL: Record<string, HsVertical> =
  {
    hmarket: 'hypermarket',
    grocery: 'grocery',
    pharmacy: 'pharmacy',
    bakery: 'bakery',
    sweets: 'sweets',
    flowers: 'flowers',
    pet: 'pet',
    restaurants: 'restaurant',
    cuisine: 'cuisine',
    food: 'food',
  };

// ─── Domain entities ──────────────────────────────────────────────────────────

export interface HsCity {
  slug: string;
  name_en: string;
  name_ar?: string;
  url: string;
}

export interface HsDistrict {
  slug: string;
  name_en: string;
  name_ar?: string;
  url: string;
  citySlug: string;
}

export interface HsBranch {
  platform_branch_id: string;
  platform_branch_uuid: string;
  merchant_name_en: string;
  merchant_name_ar?: string;
  vertical: HsVertical;
  lat?: number;
  lng?: number;
  source_url: string;
  citySlug: string;
  districtSlug: string;
}

// ─── URL / path constants ─────────────────────────────────────────────────────

export const HS_BASE_URL = 'https://hungerstation.com';
export const HS_LOCALE_PATH = '/sa-en';
export const HS_SUPERMARKETS_INDEX = '/sa-en/qc/supermarkets';

export interface HsSearchResult {
  name: string;
  price: number;
  imageUrl: string | null;
  weight: string | null;
  productPageUrl: string;
}
