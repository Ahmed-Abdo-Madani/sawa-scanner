import { MigrationInterface, QueryRunner } from "typeorm";

export class TruncateForOffPivot1718000000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`TRUNCATE "product_merge_log" CASCADE`);
        await queryRunner.query(`TRUNCATE "product_price" CASCADE`);
        await queryRunner.query(`TRUNCATE "product_image" CASCADE`);
        await queryRunner.query(`TRUNCATE "product_allergen" CASCADE`);
        await queryRunner.query(`TRUNCATE "ingredient" CASCADE`);
        await queryRunner.query(`TRUNCATE "nutrition_fact" CASCADE`);
        await queryRunner.query(`TRUNCATE "product_report" CASCADE`);
        await queryRunner.query(`TRUNCATE "product" CASCADE`);

        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "data_source" character varying NOT NULL DEFAULT 'off'`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "data_completeness_score" double precision NOT NULL DEFAULT 0`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "off_categories_tags" text`);
        await queryRunner.query(`ALTER TABLE "product" ADD COLUMN IF NOT EXISTS "off_countries_tags" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        throw new Error("TruncateForOffPivot is a one-way migration. Data is irrecoverable — no rollback possible.");
    }
}
