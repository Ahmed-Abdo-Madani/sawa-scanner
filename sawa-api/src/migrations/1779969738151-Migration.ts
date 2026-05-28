import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779969738151 implements MigrationInterface {
    name = 'Migration1779969738151'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "user_subscription" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "firebaseUid" character varying NOT NULL, "originalTransactionId" character varying, "productId" character varying, "status" character varying NOT NULL DEFAULT 'expired', "expiresAt" TIMESTAMP WITH TIME ZONE, "purchaseDate" TIMESTAMP WITH TIME ZONE, "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_4161294dfeae04b0bebfb70f49e" UNIQUE ("firebaseUid"), CONSTRAINT "PK_ec4e57f4138e339fb111948a16f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_4161294dfeae04b0bebfb70f49" ON "user_subscription" ("firebaseUid") `);
        await queryRunner.query(`CREATE INDEX "IDX_6f019ebb5389a1690593045878" ON "user_subscription" ("originalTransactionId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_6f019ebb5389a1690593045878"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_4161294dfeae04b0bebfb70f49"`);
        await queryRunner.query(`DROP TABLE "user_subscription"`);
    }

}
