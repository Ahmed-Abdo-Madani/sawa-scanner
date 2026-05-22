import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductReport } from '../entities/product-report.entity';
import { Merchant } from '../entities/merchant.entity';
import { ProductImage } from '../entities/product-image.entity';
import { SallaGtinArScraper } from '../ingestion/scraper/salla-gtin-ar-scraper';
import { ZidGtinArScraper } from '../ingestion/scraper/zid-gtin-ar-scraper';
import { OpenFoodFactsService } from '../ingestion/open-food-facts.service';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly productPriceRepository: Repository<ProductPrice>,
    @InjectRepository(ProductReport)
    private readonly productReportRepository: Repository<ProductReport>,
    @InjectRepository(Merchant)
    private readonly merchantRepository: Repository<Merchant>,
    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,
    private readonly sallaScraper: SallaGtinArScraper,
    private readonly zidScraper: ZidGtinArScraper,
    private readonly openFoodFactsService: OpenFoodFactsService,
  ) {}

  compareGtins(a: string, b: string): boolean {
    if (!a || !b) return false;
    const cleanA = a.replace(/\D/g, '').replace(/^0+/, '');
    const cleanB = b.replace(/\D/g, '').replace(/^0+/, '');
    return cleanA === cleanB && cleanA.length > 0;
  }

  async findByGtin(gtin: string): Promise<Product> {
    let product = await this.productRepository.findOne({
      where: { gtin },
      relations: [
        'nutritionFact',
        'ingredients',
        'allergens',
        'images',
      ],
    });

    if (!product) {
      this.logger.log(`Product with GTIN ${gtin} not found in database. Starting parallel live seeding...`);
      
      const storeConfigs = [
        { url: 'https://store.shonaksa.com', platform: 'salla', nameAr: 'شوناكسا', nameEn: 'Shonaksa' },
        { url: 'https://yasminstore.com', platform: 'salla', nameAr: 'متجر ياسمين', nameEn: 'Yasmin Store' },
        { url: 'https://mrlogman.com', platform: 'salla', nameAr: 'مستر لوقمان', nameEn: 'Mr Logman' },
        { url: 'https://etaamexpress.com', platform: 'salla', nameAr: 'إطعام إكسبريس', nameEn: 'Etaam Express' },
        { url: 'https://parkcentersa.com', platform: 'zid', nameAr: 'بارك سنتر', nameEn: 'Park Center' },
        { url: 'https://menhal.sa', platform: 'zid', nameAr: 'منهل', nameEn: 'Menhal' },
      ];

      // Pre-resolve GTIN via OpenFoodFacts if it is a pure barcode
      let resolvedName: string | null = null;
      let offLabel: any = null;

      const isPureBarcode = /^\d{8,14}$/.test(gtin);
      if (isPureBarcode) {
        try {
          this.logger.log(`Pre-resolving barcode ${gtin} via OpenFoodFacts...`);
          const offRes = await this.openFoodFactsService.findProductByGtin(gtin);
          if (offRes && offRes.label) {
            offLabel = offRes.label;
            const queryName = offLabel.name_ar || offLabel.name_en;
            if (queryName && queryName.trim().length > 0) {
              resolvedName = queryName.trim();
              this.logger.log(`Pre-resolved barcode ${gtin} to name: "${resolvedName}" (Arabic: "${offLabel.name_ar}", English: "${offLabel.name_en}")`);
            } else {
              this.logger.log(`OpenFoodFacts returned empty names for barcode ${gtin}`);
            }
          } else {
            this.logger.log(`OpenFoodFacts did not find barcode ${gtin}`);
          }
        } catch (offErr: any) {
          this.logger.warn(`Failed to pre-resolve barcode ${gtin} via OpenFoodFacts: ${offErr.message}`);
        }
      }

      const promises = storeConfigs.map(async (store) => {
        try {
          const scraper = store.platform === 'zid' ? this.zidScraper : this.sallaScraper;
          await scraper.ensureLaunched();

          // Phase 1: Direct Barcode Search
          this.logger.log(`[Direct Barcode Search] Querying ${store.url} with raw GTIN "${gtin}"...`);
          const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
          
          if (barcodeCandidates && barcodeCandidates.length > 0) {
            const topCandidates = barcodeCandidates.slice(0, 3);
            this.logger.log(`[Direct Barcode Search] Scraping top ${topCandidates.length} detail pages from ${store.url} for GTIN/SKU verification...`);
            
            const detailScrapes = await Promise.allSettled(
              topCandidates.map(async (cand) => {
                const details = await scraper.scrapeProductDetails(cand.url);
                return { details, cand };
              })
            );

            for (const scrapeRes of detailScrapes) {
              if (scrapeRes.status === 'fulfilled' && scrapeRes.value && scrapeRes.value.details) {
                const { details, cand } = scrapeRes.value;
                const scrapedSkuOrGtin = details.gtin || '';

                if (isPureBarcode) {
                  if (scrapedSkuOrGtin && this.compareGtins(scrapedSkuOrGtin, gtin)) {
                    this.logger.log(`[Direct Barcode Search] Deterministic match found on ${store.url}! Scraped GTIN/SKU: ${scrapedSkuOrGtin} matches scanned barcode: ${gtin}. Product: "${details.name}"`);
                    return { store, details, matchUrl: cand.url };
                  }
                } else {
                  if (details.price !== null) {
                    this.logger.log(`[Direct Barcode Search] Text match accepted on ${store.url} for query "${gtin}". Product: "${details.name}"`);
                    return { store, details, matchUrl: cand.url };
                  }
                }
              }
            }
          }

          this.logger.log(`[Direct Barcode Search] No verified barcode match for raw GTIN on ${store.url}`);

          // Phase 2: Fallback Name Search (if Direct Barcode Search failed/empty, and we have a resolved name)
          if (isPureBarcode && resolvedName) {
            this.logger.log(`[Fallback Name Search] Querying ${store.url} with resolved name "${resolvedName}"...`);
            const nameCandidates = await scraper.searchAndGetCandidates(resolvedName, 0.5, undefined, store.url);
            
            if (nameCandidates && nameCandidates.length > 0) {
              const topCandidates = nameCandidates.slice(0, 3);
              this.logger.log(`[Fallback Name Search] Scraping top ${topCandidates.length} detail pages from ${store.url} for GTIN/SKU verification...`);
              
              const detailScrapes = await Promise.allSettled(
                topCandidates.map(async (cand) => {
                  const details = await scraper.scrapeProductDetails(cand.url);
                  return { details, cand };
                })
              );

              for (const scrapeRes of detailScrapes) {
                if (scrapeRes.status === 'fulfilled' && scrapeRes.value && scrapeRes.value.details) {
                  const { details, cand } = scrapeRes.value;
                  const scrapedSkuOrGtin = details.gtin || '';

                  if (scrapedSkuOrGtin && this.compareGtins(scrapedSkuOrGtin, gtin)) {
                    this.logger.log(`[Fallback Name Search] Deterministic match found on ${store.url}! Scraped GTIN/SKU: ${scrapedSkuOrGtin} matches scanned barcode: ${gtin}. Product: "${details.name}"`);
                    return { store, details, matchUrl: cand.url };
                  }
                }
              }
            }
            this.logger.log(`[Fallback Name Search] No verified barcode match for name "${resolvedName}" on ${store.url}`);
          }

          this.logger.log(`No verified barcode/price match found for query on ${store.url}`);
          return null;
        } catch (e: any) {
          this.logger.warn(`Error querying ${store.url} for GTIN ${gtin}: ${e.message}`);
          return null;
        }
      });

      const results = await Promise.allSettled(promises);
      const successfulMatches = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
        .map(r => r.value);

      if (successfulMatches.length === 0) {
        this.logger.log(`No live store returned a match for GTIN ${gtin}. Seeding failed.`);
        throw new NotFoundException(`Product with GTIN ${gtin} not found`);
      }

      this.logger.log(`Live seeding succeeded with ${successfulMatches.length} matching stores! Creating Product entity...`);
      
      const firstMatch = successfulMatches[0];
      
      // If we got offLabel (OpenFoodFacts description), we can enrich our database product with it!
      const finalNameAr = firstMatch.details.name || (offLabel ? offLabel.name_ar : undefined);
      const finalNameEn = firstMatch.details.name || (offLabel ? offLabel.name_en : undefined);

      const newProduct = this.productRepository.create({
        gtin,
        name_ar: finalNameAr || undefined,
        name_en: finalNameEn || undefined,
        image_front_url: firstMatch.details.image || undefined,
        data_source: 'scraped_live',
        data_completeness_score: 0.1,
      });

      const savedProduct = await this.productRepository.save(newProduct);

      if (firstMatch.details.image) {
        const pImage = this.productImageRepository.create({
          url: firstMatch.details.image,
          source: 'scraped_live',
          product: savedProduct,
        });
        await this.productImageRepository.save(pImage);
      }

      for (const match of successfulMatches) {
        let merchant = await this.merchantRepository.findOne({
          where: { name_en: match.store.nameEn },
        });

        if (!merchant) {
          merchant = this.merchantRepository.create({
            name_en: match.store.nameEn,
            name_ar: match.store.nameAr,
            base_url: match.store.url,
            data_source_type: 'scraped_live',
          });
          merchant = await this.merchantRepository.save(merchant);
        }

        const price = this.productPriceRepository.create({
          price_sar_incl_vat: match.details.price,
          currency: 'SAR',
          in_stock: true,
          source_url: match.matchUrl,
          scraped_at: new Date(),
          product: savedProduct,
          merchant: merchant,
        });
        await this.productPriceRepository.save(price);
      }

      product = await this.productRepository.findOne({
        where: { id: savedProduct.id },
        relations: [
          'nutritionFact',
          'ingredients',
          'allergens',
          'images',
        ],
      });
    }

    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    // Optimized: Only fetch the latest price per merchant for this product
    // Uses PostgreSQL "DISTINCT ON" to avoid loading full history rows
    product.prices = await this.productPriceRepository
      .createQueryBuilder('pp')
      .leftJoinAndSelect('pp.merchant', 'merchant')
      .where('pp.product_id = :productId', { productId: product.id })
      .distinctOn(['pp.merchant_id'])
      .orderBy('pp.merchant_id')
      .addOrderBy('pp.scraped_at', 'DESC')
      .getMany();

    // Secondary sort: lowest price first for the UI carousel
    if (product.prices && product.prices.length > 0) {
      product.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
    }

    return product;
  }

  async createReport(
    gtin: string,
    payload: Record<string, any>,
    reporterUid?: string,
  ): Promise<ProductReport> {
    const report = this.productReportRepository.create({
      gtin,
      payload,
      reporter_uid: reporterUid ?? null,
      status: 'pending',
    });
    return this.productReportRepository.save(report);
  }
}
