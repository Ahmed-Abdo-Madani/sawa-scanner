import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: HS Catalog Pivot
 *
 * This migration prepares the database for the HungerStation-first catalog approach:
 * 1. FK-safe truncation of all product-related tables (keeping merchant/store data intact).
 * 2. Makes gtin nullable and switches to a partial unique index.
 * 3. Adds hs_product_id and hs_product_url columns for HungerStation product identity.
 */
export class HsCatalogPivot1719000000000 implements MigrationInterface {
  name = 'HsCatalogPivot1719000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Step 1: Truncate product-related tables in FK-safe order ──────────
    // Keeping merchant and store tables intact.
    await queryRunner.query(`TRUNCATE TABLE "product_alternative_name" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product_allergen" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product_image" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product_price" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "nutrition_fact" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "ingredient" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product_merge_log" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product_report" CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE "product" CASCADE`);

    // ── Step 2: Drop old unique constraint on gtin, make nullable ─────────
    // Drop the old unique index first
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_product_gtin_unique"
    `);
    await queryRunner.query(`
      ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "UQ_product_gtin"
    `);
    // Also drop the auto-generated TypeORM constraint name patterns
    await queryRunner.query(`
      ALTER TABLE "product" DROP CONSTRAINT IF EXISTS "UQ_50bfa6a07c0eb2de4cae23fc556"
    `);

    // Make gtin nullable
    await queryRunner.query(`
      ALTER TABLE "product" ALTER COLUMN "gtin" DROP NOT NULL
    `);

    // Create partial unique index on gtin (only for non-null values)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_gtin_unique_nonnull"
      ON "product" ("gtin")
      WHERE "gtin" IS NOT NULL
    `);

    // ── Step 3: Add hs_product_id and hs_product_url columns ─────────────
    await queryRunner.query(`
      ALTER TABLE "product"
      ADD COLUMN "hs_product_id" VARCHAR NULL,
      ADD COLUMN "hs_product_url" TEXT NULL
    `);

    // Create partial unique index on hs_product_id (only for non-null values)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_hs_product_id"
      ON "product" ("hs_product_id")
      WHERE "hs_product_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove HS columns
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_hs_product_id"`);
    await queryRunner.query(`
      ALTER TABLE "product"
      DROP COLUMN IF EXISTS "hs_product_url",
      DROP COLUMN IF EXISTS "hs_product_id"
    `);

    // Restore gtin as NOT NULL with unique constraint
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_gtin_unique_nonnull"`);
    await queryRunner.query(`
      ALTER TABLE "product" ALTER COLUMN "gtin" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "product" ADD CONSTRAINT "UQ_product_gtin" UNIQUE ("gtin")
    `);
  }
}
