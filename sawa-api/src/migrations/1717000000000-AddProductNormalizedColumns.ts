import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductNormalizedColumns1717000000000 implements MigrationInterface {
  name = 'AddProductNormalizedColumns1717000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──── Product table: add normalized columns ────
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "brand_normalized" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "name_normalized" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "gtin_prefix" character varying(4)`,
    );

    // ──── Backfill with SQL ────
    // Backfill strategy: compute normalized fields using the simplified SQL path for all rows.
    // brand_normalized handles basic Latin normalization.
    // name_normalized falls back to name_ar when name_en is NULL and also removes packaging words.
    // gtin_prefix is populated for all rows with a GTIN, with GTIN-14 alignment:
    //   - For 14-digit GTINs: drop the packaging digit (position 0) and take positions 1-3
    //   - For other valid GTINs: take the first 3 digits
    // Note: complex cases like Arabic brand aliases, full packaging word lists, and word boundary matching
    // with Arabic text may not be captured in the SQL backfill and will be re-normalized on next write via the ingestion path.
    await queryRunner.query(`
      UPDATE "product"
      SET
        "brand_normalized" = CASE 
          WHEN brand IS NOT NULL THEN LOWER(REGEXP_REPLACE(REGEXP_REPLACE(brand, '[^a-z0-9]+', '-', 'gi'), '^-+|-+$', '', 'g'))
          ELSE NULL
        END,
        "name_normalized" = CASE 
          WHEN COALESCE(name_en, name_ar) IS NOT NULL THEN TRIM(LOWER(REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                COALESCE(name_en, name_ar),
                '\\d+\\.?\\d*\\s*(g|kg|ml|l|cl|cc|oz|pcs|pack)',
                '',
                'gi'
              ),
              '(pack\\s+of|multipack|value\\s+pack|bundle|bottle|can|box)',
              '',
              'gi'
            ),
            '\\s+',
            ' ',
            'g'
          )))
          ELSE NULL
        END,
        "gtin_prefix" = CASE 
          WHEN gtin IS NOT NULL AND LENGTH(gtin) = 14 THEN SUBSTRING(gtin, 2, 3)
          WHEN gtin IS NOT NULL AND LENGTH(gtin) >= 3 THEN LEFT(gtin, 3)
          ELSE NULL
        END
    `);

    // ──── Create indexes ────
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_brand_normalized" ON "product" ("brand_normalized")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_brand_normalized_weight" ON "product" ("brand_normalized", "net_weight_value", "net_unit")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_product_gtin_prefix" ON "product" ("gtin_prefix")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ──── Drop indexes ────
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_product_gtin_prefix"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_product_brand_normalized_weight"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_product_brand_normalized"`,
    );

    // ──── Drop columns ────
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "gtin_prefix"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "name_normalized"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "brand_normalized"`,
    );
  }
}
