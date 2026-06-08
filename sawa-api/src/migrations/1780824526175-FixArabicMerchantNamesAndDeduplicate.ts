import { MigrationInterface, QueryRunner } from "typeorm";

function normalizeHsMerchantName(rawName: string, isArabic = false): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Strip HungerStation delivery estimations (e.g., "25 - 40mins" or "10-20mins" or "٣٠-٤٥ دقيقة" or "1.5 - 2hours")
  name = name.replace(/(?:[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?\s*-?\s*[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?|[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?)\s*(?:mins|min|hours|hour|hour-min|hours-mins|دقيقة|دقيقه|د|ساعة|ساعه|س).*$/i, '').trim();

  // 2. Collapse consecutive duplicate words (e.g., "BakeryBakery" from DOM text concat)
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2'); // "BakeryBakery" → "Bakery Bakery"
  name = name.replace(/\b(\w+)\s+\1\b/gi, '$1'); // "Bakery Bakery" → "Bakery"
  name = name.replace(/\s{2,}/g, ' ').trim();

  // 3. Strip "Al " prefix common in Saudi chain names if present (only for English names!)
  if (name.toLowerCase().startsWith('al ')) {
    name = name.substring(3).trim();
  }

  const lower = name.toLowerCase();

  if (isArabic) {
    if (lower.includes('othaim') || name.includes('العثيم')) return 'العثيم';
    if (lower.includes('panda') || name.includes('بنده') || name.includes('بندا')) return 'بنده';
    if (lower.includes('carrefour') || name.includes('كارفور')) return 'كارفور';
    if (lower.includes('tamimi') || name.includes('التميمي')) return 'أسواق التميمي';
    if (lower.includes('danube') || name.includes('الدانوب')) return 'الدانوب';
    if (lower.includes('lulu') || name.includes('لولو')) {
      if (lower.includes('express') || name.includes('إكسبريس')) return 'لولو إكسبريس';
      return 'لولو';
    }
    if (lower.includes('spinneys') || name.includes('سبينس')) return 'سبينس';
    if (lower.includes('marks') || lower.includes('spencer') || name.includes('ماركس')) return 'ماركس وسبنسر';
    if (lower.includes('saco') || name.includes('ساكو')) return 'ساكو';
    if (lower.includes('meed') || name.includes('ميد')) return 'ميد';
    if (lower.includes('ninja') || name.includes('نينجا')) return 'نينجا';
  } else {
    if (lower.includes('othaim')) return 'Othaim';
    if (lower.includes('panda')) return 'Panda';
    if (lower.includes('carrefour')) return 'Carrefour';
    if (lower.includes('tamimi')) return 'Tamimi';
    if (lower.includes('danube')) return 'Danube';
    if (lower.includes('lulu')) {
      if (lower.includes('express')) return 'Lulu Express';
      return 'Lulu Hypermarket';
    }
    if (lower.includes('ninja')) return 'Ninja';
    if (lower.includes('spinneys')) return 'Spinneys';
    if (lower.includes('circle k') || lower === 'circlek') return 'Circle K';
    if (lower.includes('marks') || lower.includes('spencer')) return 'Marks and Spencer';
    if (lower.includes('saco')) return 'SACO';
    if (lower.includes('meed')) return 'Meed';
  }

  // Fallbacks for Arabic overrides if name itself is in Arabic
  if (name.includes('العثيم')) return 'العثيم';
  if (name.includes('بنده') || name.includes('بندا')) return 'بنده';
  if (name.includes('كارفور')) return 'كارفور';
  if (name.includes('التميمي')) return 'أسواق التميمي';
  if (name.includes('الدانوب')) return 'الدانوب';
  if (name.includes('لولو')) return 'لولو';

  return name;
}

export class FixArabicMerchantNamesAndDeduplicate1780824526175 implements MigrationInterface {
    name = 'FixArabicMerchantNamesAndDeduplicate1780824526175'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const merchants = await queryRunner.query('SELECT id, name_en, name_ar FROM merchant');
        
        const normalizedMap = new Map<string, { id: string; name_en: string; cleanEn: string; cleanAr: string }>();
        const merges: { sourceId: string; targetId: string; cleanEn: string; cleanAr: string }[] = [];
        const updates: { id: string; cleanEn: string; cleanAr: string }[] = [];

        for (const row of merchants) {
            const cleanEn = normalizeHsMerchantName(row.name_en, false);
            const cleanAr = row.name_ar ? normalizeHsMerchantName(row.name_ar, true) : normalizeHsMerchantName(row.name_en, true);

            const key = cleanEn.toLowerCase();
            const existing = normalizedMap.get(key);
            
            if (existing) {
                merges.push({
                    sourceId: row.id,
                    targetId: existing.id,
                    cleanEn,
                    cleanAr: existing.cleanAr || cleanAr,
                });
            } else {
                normalizedMap.set(key, { id: row.id, name_en: row.name_en, cleanEn, cleanAr });
                if (row.name_en !== cleanEn || row.name_ar !== cleanAr) {
                    updates.push({
                        id: row.id,
                        cleanEn,
                        cleanAr,
                    });
                }
            }
        }

        // Execute merges first
        for (const m of merges) {
            // Update stores to point to the target merchant
            await queryRunner.query(
                `UPDATE "store" SET "merchant_id" = $1 WHERE "merchant_id" = $2`,
                [m.targetId, m.sourceId]
            );
            // Update product prices to point to the target merchant
            await queryRunner.query(
                `UPDATE "product_price" SET "merchant_id" = $1 WHERE "merchant_id" = $2`,
                [m.targetId, m.sourceId]
            );
            // Delete the duplicate merchant
            await queryRunner.query(
                `DELETE FROM "merchant" WHERE "id" = $1`,
                [m.sourceId]
            );
        }

        // Execute renames/updates
        for (const u of updates) {
            await queryRunner.query(
                `UPDATE "merchant" SET "name_en" = $1, "name_ar" = $2 WHERE "id" = $3`,
                [u.cleanEn, u.cleanAr, u.id]
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // renaming and merging is destructive/one-way
    }
}
