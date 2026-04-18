import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1715000000000 implements MigrationInterface {
  name = 'InitialSchema1715000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(
      `CREATE TABLE "merchant" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name_ar" character varying, "name_en" character varying, "base_url" character varying, "logo_url" character varying, "data_source_type" character varying, CONSTRAINT "PK_merchant_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "product" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "gtin" character varying NOT NULL, "name_ar" character varying, "name_en" character varying, "brand" character varying, "manufacturer" character varying, "category" character varying, "sfda_registration_status" character varying, "halal_certified" boolean, "nova_group" integer, "nutri_score_grade" character(1), "sfda_npm_score" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_product_gtin" UNIQUE ("gtin"), CONSTRAINT "PK_product_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_product_gtin" ON "product" ("gtin")`,
    );

    await queryRunner.query(
      `CREATE TABLE "nutrition_fact" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "energy_kcal" double precision, "fat_g" double precision, "saturated_fat_g" double precision, "carbs_g" double precision, "sugars_g" double precision, "fiber_g" double precision, "protein_g" double precision, "sodium_mg" double precision, "serving_size_g" integer, "product_id" uuid NOT NULL, CONSTRAINT "REL_nutrition_product" UNIQUE ("product_id"), CONSTRAINT "PK_nutrition_fact_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "ingredient" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name_ar" character varying, "name_en" character varying, "e_number" character varying, "inci_name" character varying, "sfda_status" character varying, "restriction_note" character varying, "product_id" uuid NOT NULL, CONSTRAINT "PK_ingredient_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ingredient_product_id" ON "ingredient" ("product_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "product_price" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "price_sar_incl_vat" double precision NOT NULL, "currency" character varying NOT NULL, "in_stock" boolean NOT NULL, "source_url" character varying, "scraped_at" TIMESTAMP NOT NULL, "product_id" uuid NOT NULL, "merchant_id" uuid NOT NULL, CONSTRAINT "PK_product_price_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_scraped_at" ON "product_price" ("scraped_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_product_id" ON "product_price" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_merchant_id" ON "product_price" ("merchant_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE "product_image" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "url" character varying NOT NULL, "source" character varying, "image_type" character varying, "ingested_at" TIMESTAMP NOT NULL DEFAULT now(), "product_id" uuid NOT NULL, CONSTRAINT "PK_product_image_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `ALTER TABLE "nutrition_fact" ADD CONSTRAINT "FK_nutrition_product" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredient" ADD CONSTRAINT "FK_ingredient_product" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD CONSTRAINT "FK_price_product" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD CONSTRAINT "FK_price_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_image" ADD CONSTRAINT "FK_image_product" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_image" DROP CONSTRAINT "FK_image_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP CONSTRAINT "FK_price_merchant"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP CONSTRAINT "FK_price_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ingredient" DROP CONSTRAINT "FK_ingredient_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "nutrition_fact" DROP CONSTRAINT "FK_nutrition_product"`,
    );

    await queryRunner.query(`DROP TABLE "product_image"`);

    await queryRunner.query(`DROP INDEX "IDX_price_merchant_id"`);
    await queryRunner.query(`DROP INDEX "IDX_price_product_id"`);
    await queryRunner.query(`DROP INDEX "IDX_price_scraped_at"`);
    await queryRunner.query(`DROP TABLE "product_price"`);

    await queryRunner.query(`DROP INDEX "IDX_ingredient_product_id"`);
    await queryRunner.query(`DROP TABLE "ingredient"`);

    await queryRunner.query(`DROP TABLE "nutrition_fact"`);

    await queryRunner.query(`DROP INDEX "IDX_product_gtin"`);
    await queryRunner.query(`DROP TABLE "product"`);

    await queryRunner.query(`DROP TABLE "merchant"`);
  }
}
