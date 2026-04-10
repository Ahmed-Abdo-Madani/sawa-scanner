import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedOthaimTamimi1715400000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            INSERT INTO "merchant" (id, name_en, name_ar, base_url, data_source_type)
            VALUES 
                (uuid_generate_v4(), 'Othaim', 'العثيم', 'https://www.othaimmarkets.com', 'scrape'),
                (uuid_generate_v4(), 'Tamimi', 'التميمي', 'https://www.tamimimarkets.com', 'scrape')
            ON CONFLICT (name_en) DO NOTHING;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DELETE FROM "merchant" WHERE name_en IN ('Othaim', 'Tamimi');`);
    }
}
