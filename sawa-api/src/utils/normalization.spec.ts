import {
  normalizeBrandStrict,
  normalizeProductName,
  normalizeGtin,
  gtinPrefix,
  isPlaceholderBrand,
  normalizeBrandUsable,
  inferBrandAndWeightFromName,
} from './normalization';

describe('Normalization utilities', () => {
  describe('normalizeBrandStrict', () => {
    it('should handle apostrophes', () => {
      expect(normalizeBrandStrict("Kellogg's")).toBe('kelloggs');
    });

    it('should handle ampersands', () => {
      expect(normalizeBrandStrict('P&G')).toBe('p-and-g');
    });

    it('should handle Arabic alias for المراعي', () => {
      expect(normalizeBrandStrict('المراعي')).toBe('almarai');
    });

    it('should handle Arabic alias for كوكا كولا', () => {
      expect(normalizeBrandStrict('كوكا كولا')).toBe('coca-cola');
    });

    it('should strip diacritics and normalize', () => {
      expect(normalizeBrandStrict('Café Najd')).toBe('cafe-najd');
    });

    it('should return empty string for falsy input', () => {
      expect(normalizeBrandStrict('')).toBe('');
      expect(normalizeBrandStrict(null as any)).toBe('');
      expect(normalizeBrandStrict(undefined as any)).toBe('');
    });
  });

  describe('normalizeProductName', () => {
    it('should strip weight units', () => {
      expect(normalizeProductName('Almarai Full Cream Milk 1L')).toBe(
        'almarai full cream milk',
      );
    });

    it('should strip packaging words (English)', () => {
      expect(normalizeProductName('Oreo Value Pack 500g')).toBe('oreo');
    });

    it('should strip packaging words (Arabic)', () => {
      expect(normalizeProductName('حليب المراعي علبة 1 لتر')).toBe(
        'حليب المراعي',
      );
    });

    it('should collapse whitespace', () => {
      expect(normalizeProductName('Product   Name   Here')).toBe(
        'product name here',
      );
    });

    it('should return empty string for falsy input', () => {
      expect(normalizeProductName('')).toBe('');
      expect(normalizeProductName(null as any)).toBe('');
      expect(normalizeProductName(undefined as any)).toBe('');
    });
  });

  describe('normalizeGtin', () => {
    it('should pad 12-digit GTIN to 13 digits', () => {
      expect(normalizeGtin('628100712345')).toBe('0628100712345');
    });

    it('should preserve 8-digit GTIN with leading zero', () => {
      expect(normalizeGtin('01234567')).toBe('01234567');
    });

    it('should preserve 13-digit GTIN with leading zero', () => {
      expect(normalizeGtin('01234567890123')).toBe('01234567890123');
    });

    it('should preserve 14-digit GTIN', () => {
      // Valid 14-digit GTIN: packaging digit (1) + 13-digit GTIN (6281234567890)
      expect(normalizeGtin('16281234567890')).toBe('16281234567890');
    });

    it('should return null for SCAN- prefix', () => {
      expect(normalizeGtin('SCAN-1234567890')).toBeNull();
    });

    it('should return null for URL- prefix', () => {
      expect(normalizeGtin('URL-https://...')).toBeNull();
    });

    it('should keep valid 13-digit GTIN', () => {
      expect(normalizeGtin('6281007123456')).toBe('6281007123456');
    });

    it('should return null for invalid GTIN', () => {
      expect(normalizeGtin('123')).toBeNull(); // Too short
    });

    it('should return null for non-numeric input', () => {
      expect(normalizeGtin('ABC123')).toBeNull();
    });

    it('should return null for falsy input', () => {
      expect(normalizeGtin('')).toBeNull();
      expect(normalizeGtin(null as any)).toBeNull();
      expect(normalizeGtin(undefined as any)).toBeNull();
    });
  });

  describe('gtinPrefix', () => {
    it('should extract GS1 prefix from GTIN-13', () => {
      expect(gtinPrefix('6281007123456')).toBe('628');
    });

    it('should preserve leading zero in prefix from GTIN-8', () => {
      expect(gtinPrefix('01234567')).toBe('012');
    });

    it('should apply GTIN-14 alignment: drop packaging digit, take positions 1-3', () => {
      // GTIN-14 "16281234567890" - drop packaging digit 1, take positions 1-3 ("628")
      expect(gtinPrefix('16281234567890')).toBe('628');
    });

    it('should apply GTIN-14 alignment for packaging digit 0', () => {
      // GTIN-14 "06281234567890" - drop packaging digit 0, take positions 1-3 ("628")
      expect(gtinPrefix('06281234567890')).toBe('628');
    });

    it('should extract prefix from padded 12-digit GTIN (becomes GTIN-13)', () => {
      // 12-digit "628100712345" normalizes to 13-digit "0628100712345", prefix is "062"
      expect(gtinPrefix('628100712345')).toBe('062');
    });

    it('should return null for SCAN- prefix', () => {
      expect(gtinPrefix('SCAN-123')).toBeNull();
    });

    it('should return null for invalid GTIN', () => {
      expect(gtinPrefix('invalid')).toBeNull();
    });

    it('should return null for falsy input', () => {
      expect(gtinPrefix('')).toBeNull();
      expect(gtinPrefix(null as any)).toBeNull();
      expect(gtinPrefix(undefined as any)).toBeNull();
    });
  });

  describe('isPlaceholderBrand', () => {
    it('should identify "Generic" as placeholder', () => {
      expect(isPlaceholderBrand('Generic')).toBe(true);
    });

    it('should identify "generic" as placeholder (case-insensitive)', () => {
      expect(isPlaceholderBrand('generic')).toBe(true);
    });

    it('should identify "Unnamed" as placeholder', () => {
      expect(isPlaceholderBrand('Unnamed')).toBe(true);
    });

    it('should identify "Unnamed Product" as placeholder', () => {
      expect(isPlaceholderBrand('Unnamed Product')).toBe(true);
    });

    it('should identify "Unknown" as placeholder', () => {
      expect(isPlaceholderBrand('Unknown')).toBe(true);
    });

    it('should identify "N/A" as placeholder', () => {
      expect(isPlaceholderBrand('N/A')).toBe(true);
    });

    it('should identify "NA" as placeholder', () => {
      expect(isPlaceholderBrand('NA')).toBe(true);
    });

    it('should identify "none" as placeholder', () => {
      expect(isPlaceholderBrand('none')).toBe(true);
    });

    it('should identify whitespace-only strings as placeholder', () => {
      expect(isPlaceholderBrand('   ')).toBe(true);
    });

    it('should identify empty string as placeholder', () => {
      expect(isPlaceholderBrand('')).toBe(true);
    });

    it('should identify null as placeholder', () => {
      expect(isPlaceholderBrand(null)).toBe(true);
    });

    it('should identify undefined as placeholder', () => {
      expect(isPlaceholderBrand(undefined)).toBe(true);
    });

    it('should not identify real brand as placeholder', () => {
      expect(isPlaceholderBrand('Almarai')).toBe(false);
    });
  });

  describe('normalizeBrandUsable', () => {
    it('should return empty string for placeholder', () => {
      expect(normalizeBrandUsable('Generic')).toBe('');
    });

    it('should normalize non-placeholder brand', () => {
      expect(normalizeBrandUsable('Almarai')).toBe('almarai');
    });

    it('should return empty string for null', () => {
      expect(normalizeBrandUsable(null)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(normalizeBrandUsable('')).toBe('');
    });
  });

  describe('inferBrandAndWeightFromName', () => {
    it('should extract weight from name', () => {
      const result = inferBrandAndWeightFromName('Almarai Full Cream Milk 1L');
      expect(result.weightRaw).toBe('1L');
    });

    it('should infer brand from name when known brand list provided', () => {
      const result = inferBrandAndWeightFromName('Almarai Full Cream Milk 1L', ['almarai', 'nestle']);
      expect(result.brand).toBe('Almarai');
      expect(result.brandSlug).toBe('almarai');
    });

    it('should extract both brand and weight', () => {
      const result = inferBrandAndWeightFromName('Almarai Full Cream Milk 1L', ['almarai', 'nestle']);
      expect(result.brand).toBe('Almarai');
      expect(result.brandSlug).toBe('almarai');
      expect(result.weightRaw).toBe('1L');
    });

    it('should return empty object for no matches', () => {
      const result = inferBrandAndWeightFromName('Unknown Brand Product', ['almarai', 'nestle']);
      expect(result.brand).toBeUndefined();
      expect(result.brandSlug).toBeUndefined();
      expect(result.weightRaw).toBeUndefined();
    });

    it('should handle weight in grams', () => {
      const result = inferBrandAndWeightFromName('Nestle Chocolate 500g', ['nestle']);
      expect(result.brand).toBe('Nestle');
      expect(result.weightRaw).toBe('500g');
    });

    it('should handle empty name', () => {
      const result = inferBrandAndWeightFromName('', ['almarai']);
      expect(result.brand).toBeUndefined();
      expect(result.weightRaw).toBeUndefined();
    });
  });
});
