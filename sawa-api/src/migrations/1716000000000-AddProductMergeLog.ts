import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductMergeLog1716000000000 implements MigrationInterface {
  name = 'AddProductMergeLog1716000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "product_merge_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "winner_product_id" uuid NOT NULL,
        "loser_product_id" uuid,
        "winner_gtin" character varying NOT NULL,
        "loser_gtin" character varying NOT NULL,
        "reason" character varying NOT NULL,
        "triggered_by" character varying NOT NULL,
        "actor_uid" character varying,
        "payload" jsonb NOT NULL DEFAULT '{}',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_merge_log_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pml_winner_product_id" ON "product_merge_log" ("winner_product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pml_loser_gtin" ON "product_merge_log" ("loser_gtin")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pml_created_at" ON "product_merge_log" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_pml_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_pml_loser_gtin"`);
    await queryRunner.query(`DROP INDEX "IDX_pml_winner_product_id"`);
    await queryRunner.query(`DROP TABLE "product_merge_log"`);
  }
}
