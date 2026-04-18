import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedMerchants1715200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            INSERT INTO "merchant" (id, name_en, name_ar, base_url, data_source_type)
            VALUES 
                (uuid_generate_v4(), 'Ninja', 'نينجا', 'https://www.ninjapacks.com', 'scrape'),
                (uuid_generate_v4(), 'HungerStation', 'هنقرستيشن', 'https://hungerstation.com', 'scrape'),
                (uuid_generate_v4(), 'Panda', 'بنده', 'https://www.pfrh.com', 'scrape'),
                (uuid_generate_v4(), 'Carrefour', ' كارفور', 'https://www.carrefourksa.com', 'scrape')
            ON CONFLICT (name_en) DO NOTHING;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "merchant" WHERE name_en IN ('Ninja', 'HungerStation', 'Panda', 'Carrefour');`,
    );
  }
}
