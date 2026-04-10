import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductWeightColumns1715300000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" ADD "net_weight_value" double precision`);
        await queryRunner.query(`ALTER TABLE "product" ADD "net_unit" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "net_unit"`);
        await queryRunner.query(`ALTER TABLE "product" DROP COLUMN "net_weight_value"`);
    }
}
