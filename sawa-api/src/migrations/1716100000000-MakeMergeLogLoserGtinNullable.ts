import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeMergeLogLoserGtinNullable1716100000000 implements MigrationInterface {
  name = 'MakeMergeLogLoserGtinNullable1716100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_merge_log" ALTER COLUMN "loser_gtin" DROP NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_merge_log" ALTER COLUMN "loser_gtin" SET NOT NULL`
    );
  }
}
