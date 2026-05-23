import { Injectable, NotFoundException, Logger, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductReport } from '../entities/product-report.entity';
import { Merchant } from '../entities/merchant.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ShonaksaGtinArScraper } from '../ingestion/scraper/shonaksa-gtin-ar-scraper';
import { YasminGtinArScraper } from '../ingestion/scraper/yasmin-gtin-ar-scraper';
import { MrLogmanGtinArScraper } from '../ingestion/scraper/mrlogman-gtin-ar-scraper';
import { EtaamGtinArScraper } from '../ingestion/scraper/etaam-gtin-ar-scraper';
import { ParkCenterGtinArScraper } from '../ingestion/scraper/parkcenter-gtin-ar-scraper';
import { MenhalGtinArScraper } from '../ingestion/scraper/menhal-gtin-ar-scraper';
import { OpenFoodFactsService } from '../ingestion/open-food-facts.service';
import { Observable } from 'rxjs';

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
    private readonly shonaksaScraper: ShonaksaGtinArScraper,
    private readonly yasminScraper: YasminGtinArScraper,
    private readonly mrLogmanScraper: MrLogmanGtinArScraper,
    private readonly etaamArScraper: EtaamGtinArScraper,
    private readonly parkCenterScraper: ParkCenterGtinArScraper,
    private readonly menhalScraper: MenhalGtinArScraper,
    private readonly openFoodFactsService: OpenFoodFactsService,
  ) {}

  compareGtins(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    const cleanA = a.replace(/\D/g, '').replace(/^0+/, '');
    const cleanB = b.replace(/\D/g, '').replace(/^0+/, '');
    return cleanA === cleanB && cleanA.length > 0;
  }

  private getScraperForStore(url: string) {
    if (url.includes('store.shonaksa.com')) return this.shonaksaScraper;
    if (url.includes('yasminstore.com')) return this.yasminScraper;
    if (url.includes('mrlogman.com')) return this.mrLogmanScraper;
    if (url.includes('etaamexpress.com')) return this.etaamArScraper;
    if (url.includes('parkcentersa.com')) return this.parkCenterScraper;
    if (url.includes('menhal.sa')) return this.menhalScraper;
    throw new Error(`No dedicated scraper found for store URL: ${url}`);
  }

  async findByGtin(gtin: string): Promise<Product> {
    gtin = gtin.trim().replace(/\D/g, '');
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



      const promises = storeConfigs.map(async (store) => {
        try {
          const scraper = this.getScraperForStore(store.url);
          await scraper.ensureLaunched();

          this.logger.log(`[Direct Barcode Search] Querying ${store.url} with raw GTIN "${gtin}"...`);
          const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
          
          if (barcodeCandidates && barcodeCandidates.length > 0) {
            if (barcodeCandidates.length >= 10) {
               this.logger.log(`[Direct Barcode Search] Store ${store.url} returned ${barcodeCandidates.length} products for a GTIN search. This indicates a fallback generic catalog response. Rejecting as not found.`);
            } else {
              // Loop through the top 3 candidates to find a verified GTIN match
              const candidatesToCheck = barcodeCandidates.slice(0, 3);
              for (const cand of candidatesToCheck) {
                this.logger.log(`[Direct Barcode Search] Candidate found on ${store.url}: "${cand.name}". Scraping details...`);
                try {
                  const details = await scraper.scrapeProductDetails(cand.url);

                  if (details && details.price !== null && this.compareGtins(details.gtin, gtin)) {
                    this.logger.log(`[Direct Barcode Search] Match accepted on ${store.url} for GTIN ${gtin}. Product: "${cand.name}"`);
                    return { store, details, matchUrl: cand.url };
                  } else {
                    this.logger.log(`[Direct Barcode Search] Details, price missing, or GTIN mismatch ("${details?.gtin}" vs "${gtin}") for "${cand.name}" on ${store.url}`);
                  }
                } catch (err: any) {
                  this.logger.warn(`Failed to scrape details for candidate "${cand.name}" on ${store.url}: ${err.message}`);
                }
              }
            }
          }

          this.logger.log(`[Direct Barcode Search] No verified match for GTIN on ${store.url}`);
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

      this.logger.log(`Live seeding succeeded with ${successfulMatches.length} matching stores! Creating and persisting Product entity...`);
      
      const firstMatch = successfulMatches[0];
      const finalNameAr = firstMatch.details.name;
      const finalNameEn = firstMatch.details.name;

      const ephemeralProduct = this.productRepository.create({
        gtin,
        name_ar: finalNameAr || undefined,
        name_en: finalNameEn || undefined,
        image_front_url: firstMatch.details.image || undefined,
        data_source: 'scraped_live',
        data_completeness_score: 0.1,
      });

      const savedProduct = await this.productRepository.save(ephemeralProduct);
      savedProduct.images = [];
      savedProduct.prices = [];

      if (firstMatch.details.image) {
        const pImage = this.productImageRepository.create({
          url: firstMatch.details.image,
          source: 'scraped_live',
          product: savedProduct,
        });
        const savedImage = await this.productImageRepository.save(pImage);
        savedProduct.images.push(savedImage);
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
          merchant: merchant,
          product: savedProduct,
        });
        const savedPrice = await this.productPriceRepository.save(price);
        savedProduct.prices.push(savedPrice);
      }

      savedProduct.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
      
      return savedProduct;
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

  streamFindByGtin(gtin: string): Observable<MessageEvent> {
    gtin = gtin.trim().replace(/\D/g, '');
    return new Observable<MessageEvent>((subscriber) => {
      (async () => {
        try {
          let product = await this.productRepository.findOne({
            where: { gtin },
            relations: [
              'nutritionFact',
              'ingredients',
              'allergens',
              'images',
            ],
          });

          if (product) {
            // Fetch prices
            product.prices = await this.productPriceRepository
              .createQueryBuilder('pp')
              .leftJoinAndSelect('pp.merchant', 'merchant')
              .where('pp.product_id = :productId', { productId: product.id })
              .distinctOn(['pp.merchant_id'])
              .orderBy('pp.merchant_id')
              .addOrderBy('pp.scraped_at', 'DESC')
              .getMany();

            if (product.prices && product.prices.length > 0) {
              product.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
            }

            subscriber.next({ data: { type: 'product', payload: product } });
            subscriber.next({ data: { type: 'done', payload: product } });
            subscriber.complete();
            return;
          }

          // If product is not in database, we start parallel live seeding!
          this.logger.log(`[Stream Seeding] Product with GTIN ${gtin} not found. Starting streaming live seeding...`);
          
          const storeConfigs = [
            { url: 'https://store.shonaksa.com', platform: 'salla', nameAr: 'شوناكسا', nameEn: 'Shonaksa' },
            { url: 'https://yasminstore.com', platform: 'salla', nameAr: 'متجر ياسمين', nameEn: 'Yasmin Store' },
            { url: 'https://mrlogman.com', platform: 'salla', nameAr: 'مستر لوقمان', nameEn: 'Mr Logman' },
            { url: 'https://etaamexpress.com', platform: 'salla', nameAr: 'إطعام إكسبريس', nameEn: 'Etaam Express' },
            { url: 'https://parkcentersa.com', platform: 'zid', nameAr: 'بارك سنتر', nameEn: 'Park Center' },
            { url: 'https://menhal.sa', platform: 'zid', nameAr: 'منهل', nameEn: 'Menhal' },
          ];

          const successfulMatches: any[] = [];
          let firstMatchFound = false;

          const promises = storeConfigs.map(async (store) => {
            try {
              const scraper = this.getScraperForStore(store.url);
              await scraper.ensureLaunched();

              this.logger.log(`[Stream Search] Querying ${store.url} with raw GTIN "${gtin}"...`);
              const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
              
              if (barcodeCandidates && barcodeCandidates.length > 0) {
                if (barcodeCandidates.length >= 10) {
                  this.logger.log(`[Stream Search] Store ${store.url} returned ${barcodeCandidates.length} products. Rejecting as generic response.`);
                } else {
                  const candidatesToCheck = barcodeCandidates.slice(0, 3);
                  for (const cand of candidatesToCheck) {
                    this.logger.log(`[Stream Search] Candidate found on ${store.url}: "${cand.name}". Scraping details...`);
                    try {
                      const details = await scraper.scrapeProductDetails(cand.url);

                      if (details && details.price !== null && this.compareGtins(details.gtin, gtin)) {
                        this.logger.log(`[Stream Search] Match accepted on ${store.url} for GTIN ${gtin}. Product: "${cand.name}"`);
                        
                        const matchData = {
                          merchant: store.nameEn,
                          merchantAr: store.nameAr,
                          price: details.price,
                          url: cand.url,
                        };

                        // Emit price_match event immediately!
                        subscriber.next({
                          data: {
                            type: 'price_match',
                            payload: matchData,
                          },
                        });

                        // If first match, emit details immediately so loading card gets name & image!
                        if (!firstMatchFound) {
                          firstMatchFound = true;
                          subscriber.next({
                            data: {
                              type: 'product_details',
                              payload: {
                                name_ar: details.name,
                                name_en: details.name,
                                image_front_url: details.image || null,
                              },
                            },
                          });
                        }

                        const match = { store, details, matchUrl: cand.url };
                        successfulMatches.push(match);
                        return match;
                      }
                    } catch (err: any) {
                      this.logger.warn(`[Stream Search] Failed to scrape details for candidate "${cand.name}" on ${store.url}: ${err.message}`);
                    }
                  }
                }
              }

              this.logger.log(`[Stream Search] No verified match for GTIN on ${store.url}`);
              subscriber.next({
                data: {
                  type: 'store_failed',
                  payload: {
                    merchant: store.nameEn,
                    merchantAr: store.nameAr,
                  },
                },
              });
              return null;
            } catch (e: any) {
              this.logger.warn(`[Stream Search] Error querying ${store.url} for GTIN ${gtin}: ${e.message}`);
              subscriber.next({
                data: {
                  type: 'store_failed',
                  payload: {
                    merchant: store.nameEn,
                    merchantAr: store.nameAr,
                    error: e.message,
                  },
                },
              });
              return null;
            }
          });

          await Promise.allSettled(promises);

          if (successfulMatches.length === 0) {
            this.logger.log(`[Stream Seeding] No live store returned a match for GTIN ${gtin}.`);
            subscriber.next({
              data: {
                type: 'error',
                payload: {
                  message: `Product with GTIN ${gtin} not found`,
                },
              },
            });
            subscriber.complete();
            return;
          }

          this.logger.log(`[Stream Seeding] Live seeding succeeded with ${successfulMatches.length} matching stores! Creating and persisting product...`);
          
          const firstMatch = successfulMatches[0];
          const finalNameAr = firstMatch.details.name;
          const finalNameEn = firstMatch.details.name;

          const ephemeralProduct = this.productRepository.create({
            gtin,
            name_ar: finalNameAr || undefined,
            name_en: finalNameEn || undefined,
            image_front_url: firstMatch.details.image || undefined,
            data_source: 'scraped_live',
            data_completeness_score: 0.1,
          });
          ephemeralProduct.images = [];
          ephemeralProduct.prices = [];

          // Save the product first
          const savedProduct = await this.productRepository.save(ephemeralProduct);

          if (firstMatch.details.image) {
            const pImage = this.productImageRepository.create({
              url: firstMatch.details.image,
              source: 'scraped_live',
              product: savedProduct,
            });
            const savedImage = await this.productImageRepository.save(pImage);
            savedProduct.images.push(savedImage);
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
              merchant: merchant,
              product: savedProduct,
            });
            const savedPrice = await this.productPriceRepository.save(price);
            savedProduct.prices.push(savedPrice);
          }

          savedProduct.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);

          // Stream the completed, persisted product as 'done'!
          subscriber.next({
            data: {
              type: 'done',
              payload: savedProduct,
            },
          });
          subscriber.complete();
        } catch (err: any) {
          this.logger.error(`[Stream Seeding] Fatal stream error: ${err.message}`, err.stack);
          subscriber.next({
            data: {
              type: 'error',
              payload: {
                message: err.message || 'Internal server error',
              },
            },
          });
          subscriber.complete();
        }
      })();
    });
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
