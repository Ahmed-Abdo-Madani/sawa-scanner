/**
 * SFDA-aligned allergen constants for the Saudi Arabian market.
 *
 * These keys map to the 14 major allergen groups recognized by SFDA
 * (Saudi Food & Drug Authority) food labeling regulations, with bilingual
 * Arabic/English labels for direct UI consumption.
 */

export interface SfdaAllergenDefinition {
  key: string;
  name_en: string;
  name_ar: string;
  /** Common aliases found in HS/OFF ingredient text (case-insensitive). */
  aliases_en: string[];
  aliases_ar: string[];
}

export const SFDA_ALLERGENS: SfdaAllergenDefinition[] = [
  {
    key: 'gluten',
    name_en: 'Gluten',
    name_ar: 'الغلوتين',
    aliases_en: ['gluten', 'wheat', 'barley', 'rye', 'oats', 'spelt'],
    aliases_ar: ['غلوتين', 'قمح', 'شعير', 'جاودار', 'شوفان'],
  },
  {
    key: 'milk',
    name_en: 'Milk',
    name_ar: 'الحليب',
    aliases_en: ['milk', 'dairy', 'lactose', 'casein', 'whey', 'cream', 'butter', 'cheese'],
    aliases_ar: ['حليب', 'لبن', 'لاكتوز', 'كازين', 'جبن', 'قشطة', 'زبدة'],
  },
  {
    key: 'eggs',
    name_en: 'Eggs',
    name_ar: 'البيض',
    aliases_en: ['egg', 'eggs', 'albumin', 'lysozyme', 'mayonnaise'],
    aliases_ar: ['بيض', 'بياض', 'صفار'],
  },
  {
    key: 'fish',
    name_en: 'Fish',
    name_ar: 'الأسماك',
    aliases_en: ['fish', 'cod', 'salmon', 'tuna', 'anchovy', 'sardine'],
    aliases_ar: ['سمك', 'أسماك', 'تونة', 'سلمون', 'سردين'],
  },
  {
    key: 'crustaceans',
    name_en: 'Crustaceans',
    name_ar: 'القشريات',
    aliases_en: ['crustacean', 'shrimp', 'prawn', 'crab', 'lobster', 'crayfish'],
    aliases_ar: ['قشريات', 'روبيان', 'جمبري', 'سلطعون', 'كابوريا'],
  },
  {
    key: 'peanuts',
    name_en: 'Peanuts',
    name_ar: 'الفول السوداني',
    aliases_en: ['peanut', 'peanuts', 'groundnut'],
    aliases_ar: ['فول سوداني', 'فستق سوداني'],
  },
  {
    key: 'tree_nuts',
    name_en: 'Tree Nuts',
    name_ar: 'المكسرات',
    aliases_en: ['almond', 'cashew', 'walnut', 'pistachio', 'hazelnut', 'pecan', 'macadamia', 'brazil nut', 'tree nut'],
    aliases_ar: ['لوز', 'كاجو', 'جوز', 'فستق', 'بندق', 'مكسرات'],
  },
  {
    key: 'soy',
    name_en: 'Soy',
    name_ar: 'الصويا',
    aliases_en: ['soy', 'soya', 'soybean', 'soy lecithin', 'edamame', 'tofu'],
    aliases_ar: ['صويا', 'فول صويا', 'ليسيثين الصويا'],
  },
  {
    key: 'celery',
    name_en: 'Celery',
    name_ar: 'الكرفس',
    aliases_en: ['celery', 'celeriac'],
    aliases_ar: ['كرفس'],
  },
  {
    key: 'mustard',
    name_en: 'Mustard',
    name_ar: 'الخردل',
    aliases_en: ['mustard'],
    aliases_ar: ['خردل'],
  },
  {
    key: 'sesame',
    name_en: 'Sesame',
    name_ar: 'السمسم',
    aliases_en: ['sesame', 'tahini'],
    aliases_ar: ['سمسم', 'طحينة', 'طحينية'],
  },
  {
    key: 'sulfites',
    name_en: 'Sulfites',
    name_ar: 'الكبريتيت',
    aliases_en: ['sulfite', 'sulphite', 'sulfur dioxide', 'so2', 'metabisulfite'],
    aliases_ar: ['كبريتيت', 'ثاني أكسيد الكبريت'],
  },
  {
    key: 'lupin',
    name_en: 'Lupin',
    name_ar: 'الترمس',
    aliases_en: ['lupin', 'lupine'],
    aliases_ar: ['ترمس'],
  },
  {
    key: 'molluscs',
    name_en: 'Molluscs',
    name_ar: 'الرخويات',
    aliases_en: ['mollusc', 'mollusk', 'squid', 'octopus', 'mussel', 'clam', 'oyster', 'snail'],
    aliases_ar: ['رخويات', 'حبار', 'أخطبوط', 'بلح البحر', 'محار'],
  },
];

/**
 * Detect allergens from a list of ingredient texts (mixed AR/EN).
 * Returns an array of matched allergen keys.
 */
export function detectAllergensFromText(
  ingredientTexts: string[],
): string[] {
  const combined = ingredientTexts.join(' ').toLowerCase();
  const matched = new Set<string>();

  for (const allergen of SFDA_ALLERGENS) {
    for (const alias of allergen.aliases_en) {
      if (combined.includes(alias.toLowerCase())) {
        matched.add(allergen.key);
        break;
      }
    }
    if (!matched.has(allergen.key)) {
      for (const alias of allergen.aliases_ar) {
        if (combined.includes(alias)) {
          matched.add(allergen.key);
          break;
        }
      }
    }
  }

  return Array.from(matched);
}

/**
 * Look up the full allergen definition by key.
 */
export function getAllergenByKey(key: string): SfdaAllergenDefinition | undefined {
  return SFDA_ALLERGENS.find((a) => a.key === key);
}
