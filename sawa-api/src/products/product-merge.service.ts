import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductMergeLog } from '../entities/product-merge-log.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { ProductReport } from '../entities/product-report.entity';
import { normalizeWeight } from '../utils/string-similarity';
import { syntheticGtinWhere, isRealGtin } from '../utils/gtin';
import { gtinPrefix } from '../utils/normalization';

@Injectable()
export class ProductMergeService {
  private readonly logger = new Logger(ProductMergeService.name);

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Merges a "loser" product into a "winner" product.
   * All relations from loser are moved to winner, and loser is deleted.
   * Defensive same-ID guard: rejects if winnerId === loserId (no self-merge).
   */
  async mergeProducts(
    winnerId: string,
    loserId: string,
    adminId: string,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    // Defensive same-ID guard: prevent self-merge
    if (winnerId === loserId) {
      this.logger.warn(
        `Attempted to merge product ${winnerId} into itself. Skipping (same-ID no-op).`,
      );
      return; // Idempotent no-op
    }

    await this.dataSource.transaction(async (manager) => {
      const winner = await manager.findOneBy(Product, { id: winnerId });
      const loser = await manager.findOneBy(Product, { id: loserId });

      if (!winner || !loser) throw new Error('Winner or Loser not found');

      this.logger.log(`Merging loser ${loser.gtin} (${loser.id}) into winner ${winner.gtin} (${winner.id})`);

      // 1. Move Prices
      await manager.update(ProductPrice, { product_id: loserId }, { product_id: winnerId });

      // 2. Move Reports (Update by GTIN)
      await manager.update(ProductReport, { gtin: loser.gtin }, { gtin: winner.gtin });

      // 3. Move Images (Conflict handling: only move if winner doesn't have same URL)
      const loserImages = await manager.findBy(ProductImage, { product_id: loserId });
      for (const img of loserImages) {
        const exists = await manager.findOneBy(ProductImage, { product_id: winnerId, url: img.url });
        if (!exists) {
          await manager.update(ProductImage, { id: img.id }, { product_id: winnerId });
        } else {
          await manager.remove(img);
        }
      }

      // 4. Move Allergens
      const loserAllergens = await manager.findBy(ProductAllergen, { product_id: loserId });
      for (const alg of loserAllergens) {
        const exists = await manager.findOneBy(ProductAllergen, { product_id: winnerId, allergen_key: alg.allergen_key });
        if (!exists) {
          await manager.update(ProductAllergen, { id: alg.id }, { product_id: winnerId });
        } else {
          await manager.remove(alg);
        }
      }

      // 5. Handle Nutrition (Keep winner's if exists, else move loser's)
      const winnerNutrition = await manager.findOneBy(NutritionFact, { product_id: winnerId });
      if (!winnerNutrition) {
        await manager.update(NutritionFact, { product_id: loserId }, { product_id: winnerId });
      } else {
        await manager.delete(NutritionFact, { product_id: loserId });
      }

      // 6. Log the merge
      const log = manager.create(ProductMergeLog, {
        winner_product_id: winnerId,
        loser_product_id: loserId,
        winner_gtin: winner.gtin,
        loser_gtin: loser.gtin,
        reason: reason,
        triggered_by: adminId === 'off_backfill_job' ? 'off_backfill_job' : 'admin',
        actor_uid: adminId,
        payload: {
          action: 'MERGE',
          winner_name: winner.name_en || winner.name_ar,
          loser_name: loser.name_en || loser.name_ar,
          ...(metadata ?? {}),
        },
      });
      await manager.save(log);

      // 7. Delete Loser
      await manager.remove(loser);
    });
  }

  /**
   * Assigns an official GTIN to a product (usually a SCAN-* one).
   * Defensive same-ID guard: skips merge if lookup returns the same product.
   */
  async assignGtin(
    productId: string,
    newGtin: string,
    adminId: string,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const product = await manager.findOneBy(Product, { id: productId });
      if (!product) throw new Error('Product not found');

      const oldGtin = product.gtin;
      this.logger.log(`Assigning GTIN ${newGtin} to product ${productId} (old: ${oldGtin})`);

      // Check if new GTIN already exists
      const existing = await manager.findOneBy(Product, { gtin: newGtin });
      if (existing) {
        // Defensive: only merge if it's a different product; skip if it's the same product
        if (existing.id === productId) {
          this.logger.debug(
            `Product ${productId} already has GTIN ${newGtin}. Skipping (idempotent no-op).`,
          );
          return; // Idempotent no-op
        }

        // Real collision with different product: merge loser into winner
        return this.mergeProducts(existing.id, productId, adminId, `GTIN Collision Merge: ${reason}`, metadata);
      }

      // Update GTIN
      product.gtin = newGtin;
      product.gtin_prefix = gtinPrefix(newGtin);
      await manager.save(product);

      // Update Reports
      await manager.update(ProductReport, { gtin: oldGtin }, { gtin: newGtin });

      // Log the assignment
      const log = manager.create(ProductMergeLog, {
        winner_product_id: productId,
        winner_gtin: newGtin,
        loser_gtin: oldGtin,
        reason: reason,
        triggered_by: adminId === 'off_backfill_job' ? 'off_backfill_job' : 'admin',
        actor_uid: adminId,
        payload: { action: 'ASSIGN_GTIN', ...(metadata ?? {}) },
      });
      await manager.save(log);
    });
  }

  /**
   * Attempts to find a synthetic-GTIN twin for a given official product.
   * Synthetic GTINs include SCAN-*, URL-*, and short numeric IDs.
   * Matches by brand and normalized weight. Bounds the search to the first 50 results
   * since synthetic-GTIN rows are now the majority in the database.
   */
  async findSyntheticTwinFor(officialProduct: Partial<Product>): Promise<Product | null> {
    if (!officialProduct.brand || !officialProduct.net_weight_value) return null;

    const brand = officialProduct.brand.toLowerCase();
    const weight = officialProduct.net_weight_value;
    const unit = officialProduct.net_unit || 'g';

    const normalizedWeight = normalizeWeight(`${weight}${unit}`);

    // Filtering in JS for simplicity; limit to first 50 to bound the search
    const query = this.dataSource.getRepository(Product)
      .createQueryBuilder('product')
      .where(syntheticGtinWhere('product'))
      .andWhere('LOWER(product.brand) = :brand', { brand })
      .limit(50);

    const scanProducts = await query.getMany();

    for (const scan of scanProducts) {
      const scanNormalized = normalizeWeight(`${scan.net_weight_value}${scan.net_unit}`);
      if (scanNormalized === normalizedWeight) {
        return scan;
      }
    }

    return null;
  }
}
