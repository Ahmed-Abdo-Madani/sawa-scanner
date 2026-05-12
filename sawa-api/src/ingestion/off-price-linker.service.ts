import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { Store } from '../entities/store.entity';
import { Merchant } from '../entities/merchant.entity';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { HungerStationScraper } from './scraper/hungerstation-scraper';
import { HsSearchResult, HS_BASE_URL } from './scraper/hungerstation-types';
import { OffPriceLinkingJobDto } from './dto/off-price-linking-job.dto';
import { ConfigService } from '@nestjs/config';
import { applyJitter } from './scraper/evasion';
import { diceCoefficient, normalizeWeightToGrams } from '../utils/string-similarity';
import { normalizeBrandStrict } from '../utils/normalization';

interface PriceLinkingSummary {
  productsSearched: number;
  autoLinked: number;
  reviewFlagged: number;
  discarded: number;
  avgConfidence: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

@Injectable()
export class OffPriceLinkerService {
  private readonly logger = new Logger(OffPriceLinkerService.name);

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductPrice) private readonly productPriceRepo: Repository<ProductPrice>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(Merchant) private readonly merchantRepo: Repository<Merchant>,
    private readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
  ) {}

  /** Major supermarket chain names — only these stores are worth searching for product matches. */
  private static readonly MAJOR_CHAINS = new Set([
    'panda', 'lulu', 'carrefour', 'othaim', 'al-othaim', 'danube',
    'tamimi', 'hungerstation-market', 'hyper panda', 'bin dawood',
    'farm', 'nesto', 'manuel', 'extra', 'lulu hypermarket',
  ]);

  /** Returns true if name_en is a useful search query (latin chars, >= 5 chars, >= 2 words). */
  private isSearchableProductName(name: string | null): boolean {
    if (!name) return false;
    const trimmed = name.trim();
    if (trimmed.length < 5) return false;
    // Reject if more than 50% non-latin characters (Arabic/CJK names)
    const latinChars = (trimmed.match(/[a-zA-Z]/g) || []).length;
    if (latinChars / trimmed.length < 0.4) return false;
    // Reject single-word names like "Break", "Toast"
    const words = trimmed.split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2) return false;
    return true;
  }

  async run(opts: OffPriceLinkingJobDto): Promise<PriceLinkingSummary> {
    const startedAt = new Date();
    const dryRun = opts.dryRun ?? false;
    const maxProducts = opts.maxProducts ?? 0;
    const dailyBudget =
      opts.dailyBudget ??
      Number.parseInt(this.configService.get<string>('HS_PRICE_LINKING_DAILY_BUDGET') || '5000', 10);
    const minConfidence =
      opts.minConfidence ??
      Number.parseFloat(this.configService.get<string>('HS_PRICE_LINKING_MIN_CONFIDENCE') || '0.60');

    this.logger.log(`Starting OFF Price Linking (dryRun=${dryRun}, budget=${dailyBudget}, minConf=${minConfidence})`);

    // Resolve HungerStation merchant record (required FK for product_price)
    const hsMerchant = await this.merchantRepo.findOne({ where: { name_en: 'HungerStation' } });
    if (!hsMerchant) {
      this.logger.error('HungerStation merchant not found in database. Cannot proceed.');
      return this.createSummary(0, 0, 0, 0, 0, startedAt);
    }

    // Only fetch stores from major supermarket chains — skip bakeries, sweets, etc.
    const allStores = await this.storeRepo
      .createQueryBuilder('store')
      .where('store.vertical IN (:...verticals)', { verticals: ['hypermarket', 'grocery'] })
      .andWhere('store.is_active = true')
      .getMany();

    const stores = allStores.filter(s => {
      const urlLower = (s.source_url || '').toLowerCase();
      return [...OffPriceLinkerService.MAJOR_CHAINS].some(chain =>
        urlLower.includes(chain.replace(/\s+/g, '-')) || urlLower.includes(chain.replace(/\s+/g, '')),
      );
    });

    if (stores.length === 0) {
      this.logger.warn('No major supermarket stores found. Falling back to all hypermarket stores.');
      const fallback = allStores.filter(s => s.vertical === 'hypermarket');
      if (fallback.length === 0) {
        this.logger.warn('No stores available for price linking.');
        return this.createSummary(0, 0, 0, 0, 0, startedAt);
      }
      stores.push(...fallback);
    }

    this.logger.log(`Using ${stores.length} major supermarket stores for searching.`);

    const qb = this.productRepo
      .createQueryBuilder('product')
      .where('product.name_en IS NOT NULL')
      .andWhere('LENGTH(product.name_en) >= 5')
      .orderBy('product.data_completeness_score', 'DESC');
    
    if (maxProducts > 0) {
      qb.limit(maxProducts);
    }

    const allProducts = await qb.getMany();
    // Filter for searchable names in-app (regex checks not possible in SQL easily)
    const products = allProducts.filter(p => this.isSearchableProductName(p.name_en));
    this.logger.log(`${products.length} products with searchable names (filtered from ${allProducts.length}).`);

    const processLimit = Math.min(products.length, dailyBudget);
    
    let productsSearched = 0;
    let autoLinked = 0;
    let reviewFlagged = 0;
    let discarded = 0;
    let totalConfidence = 0;
    let confidencesCount = 0;
    const MAX_STORES_PER_PRODUCT = 3;

    const scraper = new HungerStationScraper(this.robotsTxtService, {
      headless: true,
      cookieSessionPath: './scraper-sessions/hungerstation',
    });

    try {
      await scraper.launch();

      let storeIndex = 0;

      for (let i = 0; i < processLimit; i++) {
        const product = products[i];

        let bestMatch: HsSearchResult | null = null;
        let bestScore = 0;
        let bestStore: typeof stores[0] | null = null;

        // Try up to MAX_STORES_PER_PRODUCT stores per product for better coverage
        for (let attempt = 0; attempt < Math.min(MAX_STORES_PER_PRODUCT, stores.length); attempt++) {
          const store = stores[storeIndex % stores.length];
          storeIndex++;

          const baseUrl = store.source_url || `${HS_BASE_URL}/sa-en/restaurant/store/${store.platform_branch_uuid}`;
          const searchUrl = baseUrl.includes('?') 
            ? `${baseUrl}&query=${encodeURIComponent(product.name_en)}`
            : `${baseUrl}?query=${encodeURIComponent(product.name_en)}`;

          const allowed = await this.robotsTxtService.isAllowed(searchUrl);
          if (!allowed) continue;

          try {
            const results = await scraper.searchProducts(
              product.name_en,
              store.source_url,
              store.platform_branch_uuid,
            );

            for (const result of results) {
              const score = this.scoreMatch(product, result);
              if (score > bestScore) {
                bestScore = score;
                bestMatch = result;
                bestStore = store;
              }
            }

            // If we already have a strong match, stop searching other stores
            if (bestScore >= minConfidence) break;

            await applyJitter(1500, 1500);
          } catch (error: any) {
            this.logger.warn(`Search failed for "${product.name_en}" at store: ${error.message}`);
          }
        }

        productsSearched++;

        if (bestMatch && bestStore) {
          totalConfidence += bestScore;
          confidencesCount++;

          if (bestScore >= minConfidence) {
            if (!dryRun) {
              await this.productPriceRepo.save({
                product_id: product.id,
                merchant_id: hsMerchant.id,
                store_id: bestStore.id,
                price_sar_incl_vat: bestMatch.price ?? 0,
                currency: 'SAR',
                in_stock: true,
                source_url: bestMatch.productPageUrl,
                scraped_at: new Date(),
              });
            }
            autoLinked++;
            this.logger.log(`[LINKED] ${product.name_en} -> ${bestMatch.name} (score=${bestScore.toFixed(2)}, price=${bestMatch.price})`);
          } else if (bestScore >= 0.45) {
            reviewFlagged++;
            this.logger.debug(`[REVIEW] ${product.name_en} -> ${bestMatch.name} (score=${bestScore.toFixed(2)})`);
          } else {
            discarded++;
          }
        } else {
          discarded++;
        }

        if (productsSearched % 50 === 0) {
          this.logger.log(`Progress: ${productsSearched}/${processLimit} | linked=${autoLinked} review=${reviewFlagged} discarded=${discarded}`);
        }

        await applyJitter(1000, 1000);
      }
    } finally {
      await scraper.close();
    }

    const avgConfidence = confidencesCount > 0 ? totalConfidence / confidencesCount : 0;
    const summary = this.createSummary(productsSearched, autoLinked, reviewFlagged, discarded, avgConfidence, startedAt);

    if (!dryRun) {
      await this.writeSummaryReport(summary);
    }

    return summary;
  }

  /**
   * Computes a weighted match score (0-1) between an OFF product and a HungerStation search result.
   *
   * Strategy: OFF names tend to be verbose (e.g. "London Dairy Premium Ice Cream Vanilla Cup 100ml")
   * while HS names are compact (e.g. "London Dairy Vanilla Cup"). Pure dice coefficient on
   * these asymmetric strings produces ~0.30 which is unusable. We supplement it with a
   * keyword-overlap ratio that is much more forgiving of length differences.
   *
   * Weights: Name 0.45, Brand 0.20, Weight 0.25, Image baseline 0.10
   */
  private scoreMatch(product: Product, result: HsSearchResult): number {
    let score = 0;
    const dbName = (product.name_en || '').toLowerCase().trim();
    const hsName = (result.name || '').toLowerCase().trim();

    // ── Name similarity (0.45 weight) ──
    // Blend dice coefficient with keyword-overlap to handle length mismatch
    const dice = diceCoefficient(dbName, hsName);
    const keywordOverlap = this.keywordOverlapRatio(dbName, hsName);
    // Take the better of the two signals, with a 60/40 blend toward overlap
    const nameScore = (Math.max(dice, keywordOverlap) * 0.6 + Math.min(dice, keywordOverlap) * 0.4) * 0.45;
    score += nameScore;

    // ── Brand match (0.20 weight) ──
    let brandScore = 0;
    if (product.brand_normalized && hsName) {
      const brandLower = product.brand_normalized.toLowerCase();
      // Check if the HS result name contains the brand (most common case)
      if (hsName.includes(brandLower)) {
        brandScore = 0.20;
      } else {
        // Fall back to dice on just the brand portion
        const resultBrand = normalizeBrandStrict(result.name);
        if (product.brand_normalized === resultBrand) {
          brandScore = 0.20;
        } else if (diceCoefficient(product.brand_normalized, resultBrand) >= 0.6) {
          brandScore = 0.10;
        }
      }
    }
    score += brandScore;

    // ── Weight match (0.25 weight) ──
    let weightScore = 0.05; // neutral default when weight data is missing
    if (product.net_weight_value && result.weight) {
      const dbWeight = product.net_unit === 'kg' || product.net_unit === 'l'
        ? product.net_weight_value * 1000
        : product.net_weight_value;
      const resultWeight = normalizeWeightToGrams(result.weight);

      if (resultWeight !== null && dbWeight > 0) {
        const diff = Math.abs(dbWeight - resultWeight) / dbWeight;
        if (diff <= 0.05) {
          weightScore = 0.25;  // exact match
        } else if (diff <= 0.15) {
          weightScore = 0.15;  // close enough
        } else if (diff <= 0.30) {
          weightScore = 0.05;
        } else {
          weightScore = 0;     // weight mismatch is a strong negative signal
        }
      }
    }
    score += weightScore;

    // ── Image baseline (0.10 weight) — no image comparison yet ──
    score += 0.05;

    return score;
  }

  /**
   * Computes the ratio of overlapping keywords between two strings.
   * Strips common noise words (the, and, of, with, etc.) and digits/units.
   * Returns 0-1 where 1 means all keywords of the shorter string appear in the longer one.
   */
  private keywordOverlapRatio(a: string, b: string): number {
    const noise = new Set(['the', 'and', 'of', 'with', 'in', 'for', 'a', 'an', 'to', 'is', 'by', 'from']);
    const tokenize = (s: string) =>
      s.replace(/[^a-z0-9\s]/gi, ' ')
       .split(/\s+/)
       .filter(t => t.length > 1 && !noise.has(t));

    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;

    // Use the shorter set as the reference
    const [shorter, longer] = tokensA.length <= tokensB.length
      ? [tokensA, new Set(tokensB)]
      : [tokensB, new Set(tokensA)];

    let matches = 0;
    for (const token of shorter) {
      if (longer.has(token)) matches++;
    }

    return matches / shorter.length;
  }

  private createSummary(productsSearched: number, autoLinked: number, reviewFlagged: number, discarded: number, avgConfidence: number, startedAt: Date): PriceLinkingSummary {
    const completedAt = new Date();
    return {
      productsSearched,
      autoLinked,
      reviewFlagged,
      discarded,
      avgConfidence,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  private async writeSummaryReport(summary: PriceLinkingSummary) {
    const reportsDir = path.join(process.cwd(), 'uploads', 'price-linking-reports');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `summary-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    this.logger.log(`Summary report written to ${filepath}`);
  }
}
