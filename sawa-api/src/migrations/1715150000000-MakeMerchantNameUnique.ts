import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeMerchantNameUnique1715150000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant" ADD CONSTRAINT "UQ_merchant_name_en" UNIQUE ("name_en")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "merchant" DROP CONSTRAINT "UQ_merchant_name_en"`,
    );
  }
}
