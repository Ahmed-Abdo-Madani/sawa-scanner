import { MigrationInterface, QueryRunner } from "typeorm";

export class SfdaProhibitedIngredients1715100000000 implements MigrationInterface {
    name = 'SfdaProhibitedIngredients1715100000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "sfda_prohibited_ingredients" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "e_number" character varying,
                "inci_name" character varying,
                "name_en" character varying NOT NULL,
                "name_ar" character varying,
                "sfda_status" character varying NOT NULL DEFAULT 'prohibited',
                "restriction_note" text,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_sfda_prohibited_ingredients" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`CREATE INDEX "IDX_sfda_prohibited_ingredients_e_number" ON "sfda_prohibited_ingredients" ("e_number") `);

        // Seed initial data
        await queryRunner.query(`
            INSERT INTO "sfda_prohibited_ingredients" (e_number, name_en, name_ar, sfda_status, restriction_note)
            VALUES 
            ('E102', 'Tartrazine', 'تارترازين', 'restricted', 'Must be labeled as "may have an adverse effect on activity and attention in children"'),
            ('E110', 'Sunset Yellow FCF', 'سنسيت يلو', 'restricted', 'Must be labeled as "may have an adverse effect on activity and attention in children"'),
            ('E123', 'Amaranth', 'أمارانث', 'prohibited', 'Prohibited in food products by SFDA'),
            ('E128', 'Red 2G', 'أحمر 2G', 'prohibited', 'Prohibited in food products by SFDA');
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_sfda_prohibited_ingredients_e_number"`);
        await queryRunner.query(`DROP TABLE "sfda_prohibited_ingredients"`);
    }
}
