import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIntelligenceColumns1715700000000 implements MigrationInterface {
  name = 'AddIntelligenceColumns1715700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ──── Product table: new columns ────
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "subcategory" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "description_ar" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "description_en" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "allergen_tags" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "ingredient_tags" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "image_front_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "image_nutrition_url" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "nutrition_data_complete" boolean NOT NULL DEFAULT false`,
    );

    // ──── ProductPrice table: promo & unit pricing ────
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD COLUMN IF NOT EXISTS "promo_price_sar" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD COLUMN IF NOT EXISTS "unit_price_sar" double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD COLUMN IF NOT EXISTS "unit_price_unit" character varying`,
    );

    // ──── ProductAllergen table ────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "product_allergen" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "allergen_key" character varying NOT NULL,
        "name_ar" character varying,
        "name_en" character varying,
        "source" character varying,
        "product_id" uuid NOT NULL,
        CONSTRAINT "PK_product_allergen_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `ALTER TABLE "product_allergen" ADD CONSTRAINT "FK_product_allergen_product" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_product_allergen_product_id" ON "product_allergen" ("product_id")`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_product_allergen" ON "product_allergen" ("product_id", "allergen_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop product_allergen
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_product_allergen"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_product_allergen_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_allergen" DROP CONSTRAINT IF EXISTS "FK_product_allergen_product"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "product_allergen"`);

    // Revert product_price columns
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP COLUMN IF EXISTS "unit_price_unit"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP COLUMN IF EXISTS "unit_price_sar"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP COLUMN IF EXISTS "promo_price_sar"`,
    );

    // Revert product columns
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "nutrition_data_complete"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "image_nutrition_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "image_front_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "ingredient_tags"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "allergen_tags"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "description_en"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "description_ar"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product" DROP COLUMN IF EXISTS "subcategory"`,
    );
  }
}
