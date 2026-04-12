import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductReport1715500000000 implements MigrationInterface {
  name = 'AddProductReport1715500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "product_report" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "gtin" character varying NOT NULL,
        "reporter_uid" character varying,
        "payload" jsonb NOT NULL,
        "status" character varying NOT NULL DEFAULT 'pending',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_report_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_report_gtin" ON "product_report" ("gtin")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_report_gtin"`);
    await queryRunner.query(`DROP TABLE "product_report"`);
  }
}
