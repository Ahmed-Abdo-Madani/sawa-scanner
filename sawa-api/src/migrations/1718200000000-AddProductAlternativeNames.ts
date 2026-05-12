import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductAlternativeNames1718200000000 implements MigrationInterface {
  name = 'AddProductAlternativeNames1718200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "product_alternative_name" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "product_id" uuid NOT NULL,
        "name" text NOT NULL,
        "measure" varchar(50),
        "popularity" integer NOT NULL DEFAULT 0,
        "source" varchar(50) NOT NULL DEFAULT 'barcode-list',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_alternative_name" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pan_product" FOREIGN KEY ("product_id")
          REFERENCES "product"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_pan_product_name" UNIQUE ("product_id", "name")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pan_product_id" ON "product_alternative_name" ("product_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "product_alternative_name"`);
  }
}
