import { MigrationInterface, QueryRunner } from "typeorm";

function normalizeHsMerchantName(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Strip HungerStation delivery estimations (e.g., "25 - 40mins" or "10-20mins" or "٣٠-٤٥ دقيقة" or "1.5 - 2hours")
  name = name.replace(/(?:[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?\s*-?\s*[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?|[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?)\s*(?:mins|min|hours|hour|hour-min|hours-mins|دقيقة|دقيقه|د|ساعة|ساعه|س).*$/i, '').trim();

  // 2. Collapse consecutive duplicate words (e.g., "BakeryBakery" from DOM text concat)
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  name = name.replace(/\b(\w+)\s+\1\b/gi, '$1');
  name = name.replace(/\s{2,}/g, ' ').trim();

  // 3. Strip "Al " prefix common in Saudi chain names if present
  if (name.toLowerCase().startsWith('al ')) {
    name = name.substring(3).trim();
  }

  // 4. Known chain aliases/overrides
  const lower = name.toLowerCase();
  if (lower.includes('othaim')) return 'Othaim';
  if (lower.includes('panda')) return 'Panda';
  if (lower.includes('carrefour')) return 'Carrefour';
  if (lower.includes('tamimi')) return 'Tamimi';
  if (lower.includes('ninja')) return 'Ninja';
  if (lower.includes('spinneys')) return 'Spinneys';
  if (lower.includes('circle k') || lower === 'circlek') return 'Circle K';

  return name;
}

export class CleanHungerStationMerchants1779969738152 implements MigrationInterface {
    name = 'CleanHungerStationMerchants1779969738152'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const merchants = await queryRunner.query('SELECT id, name_en, name_ar FROM merchant');
        
        const normalizedMap = new Map<string, { id: string; name_en: string; cleanEn: string; cleanAr: string }>();
        const merges: { sourceId: string; targetId: string; cleanEn: string; cleanAr: string }[] = [];
        const updates: { id: string; cleanEn: string; cleanAr: string }[] = [];

        for (const row of merchants) {
            const cleanEn = normalizeHsMerchantName(row.name_en);
            
            // Normalize Arabic name
            let cleanAr = row.name_ar ? normalizeHsMerchantName(row.name_ar) : '';
            if (!cleanAr || cleanAr.toLowerCase() === cleanEn.toLowerCase()) {
                cleanAr = row.name_ar ? row.name_ar.replace(/(?:[\d\u0660-\u0669]+\s*-?\s*[\d\u0660-\u0669]+|[\d\u0660-\u0669]+)\s*(?:mins|min|دقيقة|دقيقه|د).*$/i, '').trim() : '';
                if (!cleanAr) {
                    cleanAr = cleanEn;
                }
            }

            // Special Arabic chain overrides
            if (cleanAr.includes('العثيم')) cleanAr = 'العثيم';
            if (cleanAr.includes('بنده') || cleanAr.includes('بندا')) cleanAr = 'بنده';
            if (cleanAr.includes('كارفور')) cleanAr = 'كارفور';
            if (cleanAr.includes('التميمي')) cleanAr = 'أسواق التميمي';
            if (cleanAr.includes('لولو')) cleanAr = 'لولو';

            const key = cleanEn.toLowerCase();
            const existing = normalizedMap.get(key);
            
            if (existing) {
                merges.push({
                    sourceId: row.id,
                    targetId: existing.id,
                    cleanEn,
                    cleanAr,
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
        // Renaming and merging is destructive/one-way, cannot be easily reverted to original dirty strings.
    }
}
