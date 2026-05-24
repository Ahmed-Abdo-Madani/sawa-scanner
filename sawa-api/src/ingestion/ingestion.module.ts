import { Logger, Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { IngestionService } from './ingestion.service';
import { IngestionController } from './ingestion.controller';
import { IngestionProcessor } from './ingestion.processor';
import { ProductClusteringService } from './product-clustering.service';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { ScanModule } from '../scan/scan.module';
import { PriceScrapingProcessor } from './price-scraping.processor';
import { PriceScrapingRetailer } from './dto/price-scraping-job.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PricesModule } from '../prices/prices.module';
import { StoresModule } from '../stores/stores.module';
import { ProductsModule } from '../products/products.module';
import { IngestionJobMode, IngestionPlatform } from './dto/ingestion-job.dto';
import { GtinBackfillService } from './gtin-backfill.service';
import { VertexGeminiGtinMatchProvider } from './ai-match/vertex-gemini-gtin-match.provider';
import { GoogleAiGeminiGtinMatchProvider } from './ai-match/google-ai-gemini-gtin-match.provider';
import { OllamaGtinMatchProvider } from './ai-match/ollama-gtin-match.provider';
import { GeminiEmbeddingProvider } from './ai-match/gemini-embedding.provider';
import { OllamaEmbeddingProvider } from './ai-match/ollama-embedding.provider';
import { EMBEDDING_PROVIDER_TOKEN } from './ai-match/embedding-provider.interface';
import { GtinMatchService } from './ai-match/gtin-match.service';
import { CandidateShortlister } from './ai-match/candidate-shortlister';
import { EmbeddingShortlister } from './ai-match/embedding-shortlister';
import { AiVerdictCache } from './ai-match/ai-verdict-cache';
import { BrandAliasCache } from './ai-match/brand-alias-cache';
import { EmbeddingCache } from './ai-match/embedding-cache';
import { ImageHashService } from './image-hash.service';

// Entities
import { Product } from '../entities/product.entity';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { Merchant } from '../entities/merchant.entity';
import { Store } from '../entities/store.entity';
import { ProductAlternativeName } from '../entities/product-alternative-name.entity';

import { OpenFoodFactsService } from './open-food-facts.service';
import { OpenFoodFactsDumpService } from './open-food-facts-dump.service';
import { OffImportService } from './off-import.service';
import { OffEnrichmentService } from './off-enrichment.service';
import { OffPriceLinkerService } from './off-price-linker.service';
import { BarcodeListScraperService } from './barcode-list-scraper.service';
import { HsCatalogScraperService } from './hs-catalog-scraper.service';
import { ParkCenterCatalogScraperService } from './parkcenter-catalog-scraper.service';
import { EtaamGtinService } from './etaam-gtin.service';
import { EtaamGtinProcessor } from './etaam-gtin.processor';
import { EtaamGtinScraper } from './scraper/etaam-gtin-scraper';
import { EtaamGtinArService } from './etaam-gtin-ar.service';
import { EtaamGtinArProcessor } from './etaam-gtin-ar.processor';
import { EtaamGtinArScraper } from './scraper/etaam-gtin-ar-scraper';
import { SallaGtinArScraper } from './scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from './scraper/zid-gtin-ar-scraper';
import { ShonaksaGtinArScraper } from './scraper/shonaksa-gtin-ar-scraper';
import { YasminGtinArScraper } from './scraper/yasmin-gtin-ar-scraper';
import { MrLogmanGtinArScraper } from './scraper/mrlogman-gtin-ar-scraper';
import { ParkCenterGtinArScraper } from './scraper/parkcenter-gtin-ar-scraper';
import { MenhalGtinArScraper } from './scraper/menhal-gtin-ar-scraper';
import { HsdShGtinArScraper } from './scraper/hsd-sh-gtin-ar-scraper';
import { NwshaGtinArScraper } from './scraper/nwsha-gtin-ar-scraper';
import { AlaqialMarketsGtinArScraper } from './scraper/alaqialmarkets-gtin-ar-scraper';
import { ShamlGtinArScraper } from './scraper/shaml-gtin-ar-scraper';
import { AliaqtisadiaGtinArScraper } from './scraper/aliaqtisadia-gtin-ar-scraper';
import { Mo3enGtinArScraper } from './scraper/mo3en-gtin-ar-scraper';
import { Mo0o0natGtinArScraper } from './scraper/mo0o0nat-gtin-ar-scraper';
import { NarjsGtinArScraper } from './scraper/narjs-gtin-ar-scraper';
import { TalbatukGtinArScraper } from './scraper/talbatuk-gtin-ar-scraper';
import { DukanExpressGtinArScraper } from './scraper/dukanexpress-gtin-ar-scraper';
import { EanaabGtinArScraper } from './scraper/eanaab-gtin-ar-scraper';
import { AtayibGtinArScraper } from './scraper/atayib-gtin-ar-scraper';
import { MubarkiyahGtinArScraper } from './scraper/mubarkiyah-gtin-ar-scraper';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      NutritionFact,
      Ingredient,
      ProductPrice,
      ProductImage,
      ProductAllergen,
      Merchant,
      Store,
      ProductAlternativeName,
    ]),
    BullModule.registerQueue({
      name: 'ingestion-queue',
    }),
    BullModule.registerQueue({
      name: 'price-scraping-queue',
    }),
    BullModule.registerQueue({
      name: 'etaam-gtin-queue',
    }),
    BullModule.registerQueue({
      name: 'etaam-gtin-ar-queue',
    }),
    ScanModule,
    PricesModule,
    StoresModule,
    forwardRef(() => ProductsModule),
  ],
  controllers: [IngestionController],
  providers: [
    IngestionService,
    IngestionProcessor,
    PriceScrapingProcessor,
    ProductClusteringService,
    RobotsTxtService,
    OpenFoodFactsService,
    OpenFoodFactsDumpService,
    OffImportService,
    OffEnrichmentService,
    OffPriceLinkerService,
    BarcodeListScraperService,
    HsCatalogScraperService,
    ParkCenterCatalogScraperService,
    EtaamGtinService,
    EtaamGtinProcessor,
    EtaamGtinScraper,
    EtaamGtinArService,
    EtaamGtinArProcessor,
    EtaamGtinArScraper,
    SallaGtinArScraper,
    ZidGtinArScraper,
    ShonaksaGtinArScraper,
    YasminGtinArScraper,
    MrLogmanGtinArScraper,
    ParkCenterGtinArScraper,
    MenhalGtinArScraper,
    HsdShGtinArScraper,
    NwshaGtinArScraper,
    AlaqialMarketsGtinArScraper,
    ShamlGtinArScraper,
    AliaqtisadiaGtinArScraper,
    Mo3enGtinArScraper,
    Mo0o0natGtinArScraper,
    NarjsGtinArScraper,
    TalbatukGtinArScraper,
    DukanExpressGtinArScraper,
    EanaabGtinArScraper,
    AtayibGtinArScraper,
    MubarkiyahGtinArScraper,
    GtinBackfillService,
    VertexGeminiGtinMatchProvider,
    OllamaGtinMatchProvider,
    GoogleAiGeminiGtinMatchProvider,
    GeminiEmbeddingProvider,
    OllamaEmbeddingProvider,
    ImageHashService,
    {
      provide: EMBEDDING_PROVIDER_TOKEN,
      useFactory: (config: ConfigService, gemini: GeminiEmbeddingProvider, ollama: OllamaEmbeddingProvider) => {
        const provider = config.get<string>('GTIN_EMBEDDING_PROVIDER') ?? 'google';
        return provider === 'ollama' ? ollama : gemini;
      },
      inject: [ConfigService, GeminiEmbeddingProvider, OllamaEmbeddingProvider],
    },
    GtinMatchService,
    CandidateShortlister,
    EmbeddingShortlister,
    AiVerdictCache,
    BrandAliasCache,
    EmbeddingCache,
  ],
  exports: [
    IngestionService,
    OpenFoodFactsDumpService,
    ImageHashService,
    SallaGtinArScraper,
    ZidGtinArScraper,
    ShonaksaGtinArScraper,
    YasminGtinArScraper,
    MrLogmanGtinArScraper,
    ParkCenterGtinArScraper,
    ParkCenterCatalogScraperService,
    MenhalGtinArScraper,
    HsdShGtinArScraper,
    NwshaGtinArScraper,
    AlaqialMarketsGtinArScraper,
    ShamlGtinArScraper,
    AliaqtisadiaGtinArScraper,
    Mo3enGtinArScraper,
    Mo0o0natGtinArScraper,
    NarjsGtinArScraper,
    TalbatukGtinArScraper,
    DukanExpressGtinArScraper,
    EanaabGtinArScraper,
    AtayibGtinArScraper,
    MubarkiyahGtinArScraper,
    EtaamGtinArScraper,
    OpenFoodFactsService,
  ],
})
export class IngestionModule implements OnModuleInit {
  private readonly logger = new Logger(IngestionModule.name);

  private parseBoolFlag(value?: string): boolean {
    if (!value) return false;
    return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
  }

  constructor(
    private readonly configService: ConfigService,
    private readonly ingestionService: IngestionService,
    @InjectQueue('ingestion-queue')
    private readonly ingestionQueue: Queue,
    @InjectQueue('price-scraping-queue')
    private readonly priceScrapingQueue: Queue,
  ) {}

  async onModuleInit() {
    this.logger.log('Cleaning stale jobs on module init...');
    
    const staleJobsToClean = [
      'barcode-list-names',
      'gtin-backfill-off',
      'off-import',
      'off-enrichment',
      'off-price-linking',
      'hs-catalog-scrape',
      'hs-catalog-scrape-category',
      'parkcenter-catalog-scrape',
    ];

    for (const jobName of staleJobsToClean) {
      try {
        const res = await this.ingestionService.cleanStaleJobs(jobName);
        if (res.removed > 0) {
          this.logger.log(`Cleaned ${res.removed} stale ${jobName} jobs on startup.`);
        }
      } catch (err: any) {
        this.logger.warn(`Failed to clean stale ${jobName} jobs: ${err.message}`);
      }
    }
    // Schedule Daily Price Scraping Cron Jobs
    // Panda: Daily 2:00 AM KSA (23:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'panda-daily',
      { pattern: '0 23 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.PANDA },
      },
    );

    // Carrefour: Daily 2:30 AM KSA (23:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'carrefour-daily',
      { pattern: '30 23 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.CARREFOUR },
      },
    );

    // Othaim: Daily 3:00 AM KSA (00:00 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'othaim-daily',
      { pattern: '0 0 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.OTHAIM },
      },
    );

    // Tamimi: Daily 3:30 AM KSA (00:30 UTC)
    await this.priceScrapingQueue.upsertJobScheduler(
      'tamimi-daily',
      { pattern: '30 0 * * *' },
      {
        name: 'sync-prices',
        data: { retailer: PriceScrapingRetailer.TAMIMI },
      },
    );

    if (
      this.parseBoolFlag(
        this.configService.get<string>('HUNGERSTATION_DISCOVERY_ENABLED'),
      )
    ) {
      await this.ingestionQueue.upsertJobScheduler(
        'hungerstation-weekly-discovery',
        { pattern: '0 22 * * 0' },
        {
          name: 'discover-cities',
          data: {
            platform: IngestionPlatform.HUNGERSTATION,
            mode: IngestionJobMode.DISCOVER_CITIES,
          },
        },
      );
    } else {
      try {
        await this.ingestionQueue.removeJobScheduler(
          'hungerstation-weekly-discovery',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to remove scheduler hungerstation-weekly-discovery: ${error.message}`,
        );
      }
    }

    if (
      this.parseBoolFlag(
        this.configService.get<string>('HUNGERSTATION_DAILY_ENABLED'),
      )
    ) {
      await this.ingestionQueue.upsertJobScheduler(
        'hungerstation-daily-prices',
        { pattern: '0 1 * * *' },
        {
          name: 'daily-refresh-hungerstation',
          data: {
            platform: IngestionPlatform.HUNGERSTATION,
            mode: IngestionJobMode.DAILY_REFRESH_HUNGERSTATION,
          },
        },
      );
    } else {
      try {
        await this.ingestionQueue.removeJobScheduler(
          'hungerstation-daily-prices',
        );
      } catch (error) {
        this.logger.warn(
          `Failed to remove scheduler hungerstation-daily-prices: ${error.message}`,
        );
      }
    }
  }
}
