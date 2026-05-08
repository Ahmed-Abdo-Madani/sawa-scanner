import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Schema Compatibility Service
 *
 * Verifies at startup that the required migration has been applied.
 * Specifically, it checks for the existence of:
 * - product.brand_normalized
 * - product.name_normalized
 * - product.gtin_prefix
 *
 * This is a fail-fast guard that prevents the server from starting if the schema
 * is not compatible with the application's expectations.
 */
@Injectable()
export class SchemaCompatibilityService implements OnModuleInit {
  private readonly logger = new Logger(SchemaCompatibilityService.name);

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    await this.checkSchemaCompatibility();
  }

  /**
   * Verify that the migration 1717000000000-AddProductNormalizedColumns has been applied.
   * Check for the existence of the normalized columns in the product table.
   * Throws an error if the schema is incompatible.
   */
  private async checkSchemaCompatibility(): Promise<void> {
    this.logger.log('Starting schema compatibility check...');

    try {
      // Get the product table and verify required columns exist
      const queryRunner = this.dataSource.createQueryRunner();
      const productTable = await queryRunner.getTable('product');
      await queryRunner.release();

      if (!productTable) {
        const errorMsg =
          '[FATAL] Schema compatibility check FAILED. ' +
          'The "product" table does not exist. ' +
          'Please ensure the base schema is initialized before starting the server.';
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      const columnNames = productTable.columns.map((col) => col.name);

      // Check for required columns
      const requiredColumns = [
        'brand_normalized',
        'name_normalized',
        'gtin_prefix',
      ];

      const missingColumns = requiredColumns.filter(
        (col) => !columnNames.includes(col),
      );

      if (missingColumns.length > 0) {
        const errorMsg =
          `[FATAL] Schema compatibility check FAILED. ` +
          `Migration 1717000000000-AddProductNormalizedColumns has not been applied. ` +
          `Missing columns: ${missingColumns.join(', ')}. ` +
          `Please run migrations before starting the server: ` +
          `npm run migration:run`;

        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Additionally, check if the migration is recorded in the migrations table
      const migrationRecorded = await this.isMigrationRecorded(
        'AddProductNormalizedColumns1717000000000',
      );

      if (!migrationRecorded) {
        this.logger.warn(
          'Schema columns exist, but migration is not recorded in the migrations table. ' +
          'This may indicate an incomplete or manual migration. Proceeding with caution.',
        );
      }

      this.logger.log(
        `✓ Schema compatibility check PASSED. ` +
        `All required columns are present in the product table.`,
      );
    } catch (error) {
      // If we can't connect to the database or query the schema, fail fast
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Unknown error during schema compatibility check';
      this.logger.error(
        `[FATAL] Schema compatibility check FAILED: ${errorMsg}`,
      );
      throw error;
    }
  }

  /**
   * Check if a migration is recorded as applied in the migrations table.
   * This is a secondary check to ensure the migration was properly registered.
   */
  private async isMigrationRecorded(migrationName: string): Promise<boolean> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();

      // Get the migrations table name from the DataSource options
      // Default is 'migrations' if not explicitly configured
      const migrationsTable =
        (this.dataSource.options as any).migrationsTableName || 'migrations';

      // Check if the migrations table exists
      const migrationsTableObj = await queryRunner.getTable(migrationsTable);
      if (!migrationsTableObj) {
        this.logger.warn(
          `Migrations table "${migrationsTable}" does not exist. ` +
          'This may indicate migrations have not been initialized.',
        );
        await queryRunner.release();
        return false;
      }

      // Query the migrations table for this specific migration
      const result = await queryRunner.query(
        `SELECT * FROM "${migrationsTable}" WHERE name = $1`,
        [migrationName],
      );

      await queryRunner.release();

      return result.length > 0;
    } catch (error) {
      // If we can't check the migrations table, log a warning but don't fail
      this.logger.warn(
        `Could not verify migration record: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      return false;
    }
  }
}
