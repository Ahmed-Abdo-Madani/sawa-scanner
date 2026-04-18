import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreEntity1715600000000 implements MigrationInterface {
  name = 'AddStoreEntity1715600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "store" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "merchant_id" uuid NOT NULL,
                "platform" character varying NOT NULL,
                "platform_branch_id" character varying,
                "platform_branch_uuid" character varying NOT NULL,
                "vertical" character varying,
                "city_slug" character varying NOT NULL,
                "city_name_ar" character varying,
                "city_name_en" character varying,
                "district_slug" character varying,
                "district_name_ar" character varying,
                "district_name_en" character varying,
                "lat" double precision,
                "lng" double precision,
                "source_url" character varying,
                "last_seen_at" TIMESTAMP NOT NULL DEFAULT now(),
                "is_active" boolean NOT NULL DEFAULT true,
                CONSTRAINT "PK_store_id" PRIMARY KEY ("id")
            )
        `);

    await queryRunner.query(
      `ALTER TABLE "store" ADD CONSTRAINT "FK_store_merchant" FOREIGN KEY ("merchant_id") REFERENCES "merchant"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_store_platform_branch_uuid" ON "store" ("platform", "platform_branch_uuid")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_store_merchant_id" ON "store" ("merchant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_store_city_district" ON "store" ("city_slug", "district_slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_store_vertical" ON "store" ("vertical")`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_price" ADD COLUMN "store_id" uuid NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" ADD CONSTRAINT "FK_price_store" FOREIGN KEY ("store_id") REFERENCES "store"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_price_store_id" ON "product_price" ("store_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_price_store_id"`);
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP CONSTRAINT "FK_price_store"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_price" DROP COLUMN "store_id"`,
    );

    await queryRunner.query(`DROP INDEX "IDX_store_vertical"`);
    await queryRunner.query(`DROP INDEX "IDX_store_city_district"`);
    await queryRunner.query(`DROP INDEX "IDX_store_merchant_id"`);
    await queryRunner.query(`DROP INDEX "UQ_store_platform_branch_uuid"`);
    await queryRunner.query(
      `ALTER TABLE "store" DROP CONSTRAINT "FK_store_merchant"`,
    );
    await queryRunner.query(`DROP TABLE "store"`);
  }
}
