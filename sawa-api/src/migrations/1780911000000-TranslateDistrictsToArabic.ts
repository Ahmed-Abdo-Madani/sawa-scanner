import { MigrationInterface, QueryRunner } from "typeorm";
import { DISTRICT_TRANSLATIONS } from "../utils/districts";

export class TranslateDistrictsToArabic1780911000000 implements MigrationInterface {
    name = 'TranslateDistrictsToArabic1780911000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Run updates for all districts in the dictionary
        for (const [englishName, arabicName] of Object.entries(DISTRICT_TRANSLATIONS)) {
            // Case-insensitive update to make it robust
            await queryRunner.query(
                `UPDATE "store" SET "district_name_ar" = $1 WHERE LOWER("district_name_en") = $2 AND "district_name_ar" IS NULL`,
                [arabicName, englishName.toLowerCase()]
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Set all district_name_ar back to NULL
        await queryRunner.query(`UPDATE "store" SET "district_name_ar" = NULL`);
    }
}
