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

  async run(opts: OffPriceLinkingJobDto): Promise<PriceLinkingSummary> {
    const startedAt = new Date();
    const dryRun = opts.dryRun ?? false;
    const maxProducts = opts.maxProducts ?? 0;
    const dailyBudget =
      opts.dailyBudget ??
      Number.parseInt(this.configService.get<string>('HS_PRICE_LINKING_DAILY_BUDGET') || '5000', 10);
    const minConfidence =
      opts.minConfidence ??
      Number.parseFloat(this.configService.get<string>('HS_PRICE_LINKING_MIN_CONFIDENCE') || '0.80');

    this.logger.log(`Starting OFF Price Linking (dryRun=${dryRun}, budget=${dailyBudget}, minConf=${minConfidence})`);

    const stores = await this.storeRepo
      .createQueryBuilder('store')
      .where('store.vertical IN (:...verticals)', { verticals: ['hypermarket', 'grocery', 'pharmacy'] })
      .andWhere('store.is_active = true')
      .orderBy('store.vertical', 'ASC')
      .getMany();

    if (stores.length === 0) {
      this.logger.warn('No active stores found for price linking.');
      return this.createSummary(0, 0, 0, 0, 0, startedAt);
    }

    const qb = this.productRepo
      .createQueryBuilder('product')
      .orderBy('product.data_completeness_score', 'DESC');
    
    if (maxProducts > 0) {
      qb.limit(maxProducts);
    }

    const products = await qb.getMany();
    const processLimit = Math.min(products.length, dailyBudget);
    
    let productsSearched = 0;
    let autoLinked = 0;
    let reviewFlagged = 0;
    let discarded = 0;
    let totalConfidence = 0;
    let confidencesCount = 0;

    const scraper = new HungerStationScraper(this.robotsTxtService, {
      headless: true,
      cookieSessionPath: './scraper-sessions/hungerstation',
    });

    try {
      await scraper.launch();

      let storeIndex = 0;

      for (let i = 0; i < processLimit; i++) {
        const product = products[i];
        if (!product.name_en) continue;

        const store = stores[storeIndex % stores.length];
        storeIndex++;

        const baseUrl = store.source_url || `${HS_BASE_URL}/sa-en/restaurant/store/${store.platform_branch_uuid}`;
        const searchUrl = baseUrl.includes('?') 
          ? `${baseUrl}&query=${encodeURIComponent(product.name_en)}`
          : `${baseUrl}?query=${encodeURIComponent(product.name_en)}`;

        const allowed = await this.robotsTxtService.isAllowed(searchUrl);
        if (!allowed) {
          this.logger.debug(`Skipping ${searchUrl} due to robots.txt`);
          continue;
        }

        try {
          productsSearched++;
          const results = await scraper.searchProducts(
            product.name_en,
            store.source_url,
            store.platform_branch_uuid,
          );
          
          let bestMatch: HsSearchResult | null = null;
          let bestScore = 0;

          for (const result of results) {
            const score = this.scoreMatch(product, result);
            if (score > bestScore) {
              bestScore = score;
              bestMatch = result;
            }
          }

          if (bestMatch) {
            totalConfidence += bestScore;
            confidencesCount++;

            if (bestScore >= minConfidence) {
              if (!dryRun) {
                await this.productPriceRepo.save({
                  product_id: product.id,
                  store_id: store.id,
                  price: bestMatch.price,
                  in_stock: true,
                  source_url: bestMatch.productPageUrl,
                  scraped_at: new Date(),
                });
              }
              autoLinked++;
              this.logger.debug(`[LINKED] ${product.name_en} -> ${bestMatch.name} (score=${bestScore.toFixed(2)})`);
            } else if (bestScore >= 0.60) {
              reviewFlagged++;
              this.logger.debug(`[REVIEW] ${product.name_en} -> ${bestMatch.name} (score=${bestScore.toFixed(2)})`);
            } else {
              discarded++;
            }
          } else {
            discarded++;
          }

          if (productsSearched % 100 === 0) {
            this.logger.log(`Progress: ${productsSearched}/${processLimit} products searched...`);
          }

          await applyJitter(2000, 2000);
        } catch (error: any) {
          this.logger.warn(`Search failed for product ${product.name_en} at store ${store.platform_branch_uuid}: ${error.message}`);
        }
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

  private scoreMatch(product: Product, result: HsSearchResult): number {
    let score = 0;

    // Name similarity (0.40 weight)
    const nameScore = diceCoefficient(product.name_en || '', result.name) * 0.40;
    score += nameScore;

    // Brand match (0.25 weight)
    let brandScore = 0;
    if (product.brand_normalized && result.name) {
      const resultBrand = normalizeBrandStrict(result.name);
      if (product.brand_normalized === resultBrand) {
        brandScore = 0.25;
      } else if (diceCoefficient(product.brand_normalized, resultBrand) >= 0.7) {
        brandScore = 0.125;
      }
    }
    score += brandScore;

    // Weight match (0.20 weight)
    let weightScore = 0.10; // default 0.5 * 0.20
    if (product.net_weight_value && result.weight) {
      const dbWeight = product.net_unit === 'kg' || product.net_unit === 'l' ? product.net_weight_value * 1000 : product.net_weight_value;
      const resultWeight = normalizeWeightToGrams(result.weight);
      
      if (resultWeight !== null) {
        const diff = Math.abs(dbWeight - resultWeight) / dbWeight;
        if (diff <= 0.10) {
          weightScore = 0.20;
        } else if (diff <= 0.20) {
          weightScore = 0.10;
        } else {
          weightScore = 0;
        }
      }
    }
    score += weightScore;

    // Image similarity (0.15 weight) - default 0.5
    score += 0.075;

    return score;
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
