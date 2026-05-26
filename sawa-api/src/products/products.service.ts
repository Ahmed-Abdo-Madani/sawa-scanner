import { Injectable, NotFoundException, Logger, MessageEvent, Inject } from '@nestjs/common';
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
import { HsdShGtinArScraper } from '../ingestion/scraper/hsd-sh-gtin-ar-scraper';
import { NwshaGtinArScraper } from '../ingestion/scraper/nwsha-gtin-ar-scraper';
import { AlaqialMarketsGtinArScraper } from '../ingestion/scraper/alaqialmarkets-gtin-ar-scraper';
import { ShamlGtinArScraper } from '../ingestion/scraper/shaml-gtin-ar-scraper';
import { AliaqtisadiaGtinArScraper } from '../ingestion/scraper/aliaqtisadia-gtin-ar-scraper';
import { Mo3enGtinArScraper } from '../ingestion/scraper/mo3en-gtin-ar-scraper';
import { Mo0o0natGtinArScraper } from '../ingestion/scraper/mo0o0nat-gtin-ar-scraper';
import { NarjsGtinArScraper } from '../ingestion/scraper/narjs-gtin-ar-scraper';
import { TalbatukGtinArScraper } from '../ingestion/scraper/talbatuk-gtin-ar-scraper';
import { DukanExpressGtinArScraper } from '../ingestion/scraper/dukanexpress-gtin-ar-scraper';
import { EanaabGtinArScraper } from '../ingestion/scraper/eanaab-gtin-ar-scraper';
import { AtayibGtinArScraper } from '../ingestion/scraper/atayib-gtin-ar-scraper';
import { MubarkiyahGtinArScraper } from '../ingestion/scraper/mubarkiyah-gtin-ar-scraper';
import { OpenFoodFactsService } from '../ingestion/open-food-facts.service';
import { Observable } from 'rxjs';
import Redis from 'ioredis';

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
    private readonly hsdShScraper: HsdShGtinArScraper,
    private readonly nwshaScraper: NwshaGtinArScraper,
    private readonly alaqialMarketsScraper: AlaqialMarketsGtinArScraper,
    private readonly shamlScraper: ShamlGtinArScraper,
    private readonly aliaqtisadiaScraper: AliaqtisadiaGtinArScraper,
    private readonly mo3enScraper: Mo3enGtinArScraper,
    private readonly mo0o0natScraper: Mo0o0natGtinArScraper,
    private readonly narjsScraper: NarjsGtinArScraper,
    private readonly talbatukScraper: TalbatukGtinArScraper,
    private readonly dukanExpressScraper: DukanExpressGtinArScraper,
    private readonly eanaabScraper: EanaabGtinArScraper,
    private readonly atayibScraper: AtayibGtinArScraper,
    private readonly mubarkiyahScraper: MubarkiyahGtinArScraper,
    private readonly openFoodFactsService: OpenFoodFactsService,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
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
    if (url.includes('hsd-sh.com')) return this.hsdShScraper;
    if (url.includes('nwsha.com')) return this.nwshaScraper;
    if (url.includes('alaqialmarkets.net')) return this.alaqialMarketsScraper;
    if (url.includes('shaml.sa')) return this.shamlScraper;
    if (url.includes('aliaqtisadia.sa')) return this.aliaqtisadiaScraper;
    if (url.includes('mo3en.com')) return this.mo3enScraper;
    if (url.includes('mo0o0nat.com')) return this.mo0o0natScraper;
    if (url.includes('narjs.store')) return this.narjsScraper;
    if (url.includes('talbatuk.com')) return this.talbatukScraper;
    if (url.includes('dukanexpress.com')) return this.dukanExpressScraper;
    if (url.includes('eanaab.com')) return this.eanaabScraper;
    if (url.includes('atayib.com')) return this.atayibScraper;
    if (url.includes('mubarkiyah.com')) return this.mubarkiyahScraper;
    throw new Error(`No dedicated scraper found for store URL: ${url}`);
  }

  async findByGtin(gtin: string): Promise<Product> {
    const trimmed = gtin.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
    if (isUuid) {
      const product = await this.productRepository.findOne({
        where: { id: trimmed },
        relations: [
          'nutritionFact',
          'ingredients',
          'allergens',
          'images',
        ],
      });
      if (!product) {
        throw new NotFoundException(`Product with ID ${trimmed} not found`);
      }
      const existingPrices = await this.productPriceRepository
        .createQueryBuilder('pp')
        .leftJoinAndSelect('pp.merchant', 'merchant')
        .where('pp.product_id = :productId', { productId: product.id })
        .distinctOn(['pp.merchant_id'])
        .orderBy('pp.merchant_id')
        .addOrderBy('pp.scraped_at', 'DESC')
        .getMany();
      product.prices = existingPrices;
      product.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
      return product;
    }

    gtin = trimmed.replace(/\D/g, '');
    let product = await this.productRepository.findOne({
      where: { gtin },
      relations: [
        'nutritionFact',
        'ingredients',
        'allergens',
        'images',
      ],
    });

    const storeConfigs = [
      { url: 'https://store.shonaksa.com', platform: 'salla', nameAr: 'شوناكسا', nameEn: 'Shonaksa' },
      { url: 'https://yasminstore.com', platform: 'salla', nameAr: 'متجر ياسمين', nameEn: 'Yasmin Store' },
      { url: 'https://mrlogman.com', platform: 'salla', nameAr: 'مستر لوقمان', nameEn: 'Mr Logman' },
      { url: 'https://etaamexpress.com', platform: 'salla', nameAr: 'إطعام إكسبريس', nameEn: 'Etaam Express' },
      { url: 'https://parkcentersa.com', platform: 'zid', nameAr: 'بارك سنتر', nameEn: 'Park Center' },
      { url: 'https://menhal.sa', platform: 'zid', nameAr: 'منهل', nameEn: 'Menhal' },
      { url: 'https://hsd-sh.com', platform: 'salla', nameAr: 'حصاد نجد', nameEn: 'Hsd-Sh' },
      { url: 'https://nwsha.com', platform: 'salla', nameAr: 'نوشا', nameEn: 'Nwsha' },
      { url: 'https://alaqialmarkets.net', platform: 'salla', nameAr: 'أسواق العقيل', nameEn: 'Alaqial Markets' },
      { url: 'https://shaml.sa', platform: 'salla', nameAr: 'نجمة الشمال', nameEn: 'Shaml' },
      { url: 'https://aliaqtisadia.sa', platform: 'salla', nameAr: 'صالة تبوك الاقتصادية', nameEn: 'Aliaqtisadia' },
      { url: 'https://mo3en.com', platform: 'salla', nameAr: 'معينكم', nameEn: 'Mo3en' },
      { url: 'https://mo0o0nat.com', platform: 'zid', nameAr: 'مونة سكر', nameEn: 'Mo0o0nat' },
      { url: 'https://narjs.store', platform: 'salla', nameAr: 'متجر نرجس', nameEn: 'Narjs Store' },
      { url: 'https://talbatuk.com', platform: 'zid', nameAr: 'طلباتك', nameEn: 'Talbatuk' },
      { url: 'https://dukanexpress.com', platform: 'zid', nameAr: 'الدكان المريح', nameEn: 'Dukan Express' },
      { url: 'https://eanaab.com', platform: 'salla', nameAr: 'متجر عناب', nameEn: 'Eanaab' },
      { url: 'https://www.atayib.com', platform: 'custom', nameAr: 'أطايب', nameEn: 'Atayib' },
      { url: 'https://mubarkiyah.com', platform: 'custom', nameAr: 'المباركية', nameEn: 'Mubarkiyah' },
    ];

    if (!product) {
      this.logger.log(`Product with GTIN ${gtin} not found in database. Starting parallel live seeding...`);
      
      const promises = storeConfigs.map(async (store) => {
        try {
          const cacheKey = `missing:${store.url}:${gtin}`;
          const isNegativeCached = await this.redis.get(cacheKey);
          if (isNegativeCached) {
            this.logger.log(`[Direct Barcode Search] Skipping negative cached empty store ${store.url} for GTIN ${gtin}`);
            return null;
          }

          const scraper = this.getScraperForStore(store.url);
          await scraper.ensureLaunched();

          this.logger.log(`[Direct Barcode Search] Querying ${store.url} with raw GTIN "${gtin}"...`);
          const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
          
          if (barcodeCandidates && barcodeCandidates.length > 0) {
            if (barcodeCandidates.length >= 25) {
               this.logger.log(`[Direct Barcode Search] Store ${store.url} returned ${barcodeCandidates.length} products for a GTIN search. This indicates a fallback generic catalog response. Rejecting as not found.`);
            } else {
              // Loop through the top 10 candidates to find a verified GTIN match
              const candidatesToCheck = barcodeCandidates.slice(0, 10);
              for (const cand of candidatesToCheck) {
                this.logger.log(`[Direct Barcode Search] Candidate found on ${store.url}: "${cand.name}". Scraping details...`);
                try {
                  const details = await scraper.scrapeProductDetails(cand.url);

                  if (details && details.price !== null && this.compareGtins(details.gtin, gtin)) {
                    this.logger.log(`[Direct Barcode Search] Match accepted on ${store.url} for GTIN ${gtin}. Product: "${cand.name}"`);
                    await this.redis.del(cacheKey);
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

          this.logger.log(`[Direct Barcode Search] No verified match for GTIN on ${store.url}. Writing negative cache.`);
          await this.redis.set(cacheKey, 'true', 'EX', 86400); // 24 hours
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
          let logoUrl: string | undefined = undefined;
          if (match.store.url) {
            try {
              const hostname = new URL(match.store.url).hostname;
              logoUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
            } catch (e) {}
          }
          merchant = this.merchantRepository.create({
            name_en: match.store.nameEn,
            name_ar: match.store.nameAr,
            base_url: match.store.url,
            logo_url: logoUrl,
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

    // Optimized: Only fetch the latest price per merchant for this product
    // Uses PostgreSQL "DISTINCT ON" to avoid loading full history rows
    const existingPrices = await this.productPriceRepository
      .createQueryBuilder('pp')
      .leftJoinAndSelect('pp.merchant', 'merchant')
      .where('pp.product_id = :productId', { productId: product.id })
      .distinctOn(['pp.merchant_id'])
      .orderBy('pp.merchant_id')
      .addOrderBy('pp.scraped_at', 'DESC')
      .getMany();

    const existingMerchantNames = new Set(existingPrices.map(p => p.merchant?.name_en));
    const missingStores = storeConfigs.filter(store => !existingMerchantNames.has(store.nameEn));

    if (missingStores.length > 0) {
      this.logger.log(`Product with GTIN ${gtin} found in database, but missing prices from ${missingStores.length} stores. Gathering missing prices dynamically...`);
      
      const promises = missingStores.map(async (store) => {
        try {
          const cacheKey = `missing:${store.url}:${gtin}`;
          const isNegativeCached = await this.redis.get(cacheKey);
          if (isNegativeCached) {
            return null;
          }

          const scraper = this.getScraperForStore(store.url);
          await scraper.ensureLaunched();

          const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
          if (barcodeCandidates && barcodeCandidates.length > 0 && barcodeCandidates.length < 25) {
            const candidatesToCheck = barcodeCandidates.slice(0, 10);
            for (const cand of candidatesToCheck) {
              try {
                const details = await scraper.scrapeProductDetails(cand.url);
                if (details && details.price !== null && this.compareGtins(details.gtin, gtin)) {
                  await this.redis.del(cacheKey);
                  return { store, details, matchUrl: cand.url };
                }
              } catch (err: any) {
                this.logger.warn(`Failed to scrape details for candidate "${cand.name}" on ${store.url}: ${err.message}`);
              }
            }
          }

          await this.redis.set(cacheKey, 'true', 'EX', 86400); // 24 hours
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

      for (const match of successfulMatches) {
        let merchant = await this.merchantRepository.findOne({
          where: { name_en: match.store.nameEn },
        });

        if (!merchant) {
          let logoUrl: string | undefined = undefined;
          if (match.store.url) {
            try {
              const hostname = new URL(match.store.url).hostname;
              logoUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
            } catch (e) {}
          }
          merchant = this.merchantRepository.create({
            name_en: match.store.nameEn,
            name_ar: match.store.nameAr,
            base_url: match.store.url,
            logo_url: logoUrl,
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
          product: product,
        });
        const savedPrice = await this.productPriceRepository.save(price);
        existingPrices.push(savedPrice);
      }
    }

    // Secondary sort: lowest price first for the UI carousel
    if (existingPrices && existingPrices.length > 0) {
      existingPrices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
    }

    product.prices = existingPrices;
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

          const storeConfigs = [
            { url: 'https://store.shonaksa.com', platform: 'salla', nameAr: 'شوناكسا', nameEn: 'Shonaksa' },
            { url: 'https://yasminstore.com', platform: 'salla', nameAr: 'متجر ياسمين', nameEn: 'Yasmin Store' },
            { url: 'https://mrlogman.com', platform: 'salla', nameAr: 'مستر لوقمان', nameEn: 'Mr Logman' },
            { url: 'https://etaamexpress.com', platform: 'salla', nameAr: 'إطعام إكسبريس', nameEn: 'Etaam Express' },
            { url: 'https://parkcentersa.com', platform: 'zid', nameAr: 'بارك سنتر', nameEn: 'Park Center' },
            { url: 'https://menhal.sa', platform: 'zid', nameAr: 'منهل', nameEn: 'Menhal' },
            { url: 'https://hsd-sh.com', platform: 'salla', nameAr: 'حصاد نجد', nameEn: 'Hsd-Sh' },
            { url: 'https://nwsha.com', platform: 'salla', nameAr: 'نوشا', nameEn: 'Nwsha' },
            { url: 'https://alaqialmarkets.net', platform: 'salla', nameAr: 'أسواق العقيل', nameEn: 'Alaqial Markets' },
            { url: 'https://shaml.sa', platform: 'salla', nameAr: 'نجمة الشمال', nameEn: 'Shaml' },
            { url: 'https://aliaqtisadia.sa', platform: 'salla', nameAr: 'صالة تبوك الاقتصادية', nameEn: 'Aliaqtisadia' },
            { url: 'https://mo3en.com', platform: 'salla', nameAr: 'معينكم', nameEn: 'Mo3en' },
            { url: 'https://mo0o0nat.com', platform: 'zid', nameAr: 'مونة سكر', nameEn: 'Mo0o0nat' },
            { url: 'https://narjs.store', platform: 'salla', nameAr: 'متجر نرجس', nameEn: 'Narjs Store' },
            { url: 'https://talbatuk.com', platform: 'zid', nameAr: 'طلباتك', nameEn: 'Talbatuk' },
            { url: 'https://dukanexpress.com', platform: 'zid', nameAr: 'الدكان المريح', nameEn: 'Dukan Express' },
            { url: 'https://eanaab.com', platform: 'salla', nameAr: 'متجر عناب', nameEn: 'Eanaab' },
            { url: 'https://www.atayib.com', platform: 'custom', nameAr: 'أطايب', nameEn: 'Atayib' },
            { url: 'https://mubarkiyah.com', platform: 'custom', nameAr: 'المباركية', nameEn: 'Mubarkiyah' },
          ];

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

            // Immediately emit existing product state
            subscriber.next({ data: { type: 'product', payload: product } });

            const existingMerchantNames = new Set(product.prices.map(p => p.merchant?.name_en));
            const missingStores = storeConfigs.filter(store => !existingMerchantNames.has(store.nameEn));

            if (missingStores.length === 0) {
              subscriber.next({ data: { type: 'done', payload: product } });
              subscriber.complete();
              return;
            }

            this.logger.log(`[Stream Seeding] Product found but missing prices from ${missingStores.length} stores. Initiating live background scraping...`);

            const successfulMatches: any[] = [];
            const promises = missingStores.map(async (store) => {
              try {
                const cacheKey = `missing:${store.url}:${gtin}`;
                const isNegativeCached = await this.redis.get(cacheKey);
                if (isNegativeCached) {
                  subscriber.next({
                    data: {
                      type: 'store_failed',
                      payload: { merchant: store.nameEn, merchantAr: store.nameAr },
                    },
                  });
                  return null;
                }

                const scraper = this.getScraperForStore(store.url);
                await scraper.ensureLaunched();

                const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
                if (barcodeCandidates && barcodeCandidates.length > 0 && barcodeCandidates.length < 25) {
                  const candidatesToCheck = barcodeCandidates.slice(0, 10);
                  for (const cand of candidatesToCheck) {
                    try {
                      const details = await scraper.scrapeProductDetails(cand.url);
                      if (details && details.price !== null && this.compareGtins(details.gtin, gtin)) {
                        const matchData = {
                          merchant: store.nameEn,
                          merchantAr: store.nameAr,
                          price: details.price,
                          url: cand.url,
                        };

                        // Emit price_match event immediately!
                        subscriber.next({
                          data: { type: 'price_match', payload: matchData },
                        });

                        const match = { store, details, matchUrl: cand.url };
                        successfulMatches.push(match);
                        await this.redis.del(cacheKey);
                        return match;
                      }
                    } catch (err: any) {
                      this.logger.warn(`Failed to scrape details for candidate "${cand.name}" on ${store.url}: ${err.message}`);
                    }
                  }
                }

                await this.redis.set(cacheKey, 'true', 'EX', 86400); // 24 hours
                subscriber.next({
                  data: {
                    type: 'store_failed',
                    payload: { merchant: store.nameEn, merchantAr: store.nameAr },
                  },
                });
                return null;
              } catch (e: any) {
                subscriber.next({
                  data: {
                    type: 'store_failed',
                    payload: { merchant: store.nameEn, merchantAr: store.nameAr, error: e.message },
                  },
                });
                return null;
              }
            });

            await Promise.allSettled(promises);

            // Save and append successful matches
            for (const match of successfulMatches) {
              let merchant = await this.merchantRepository.findOne({
                where: { name_en: match.store.nameEn },
              });

              if (!merchant) {
                let logoUrl: string | undefined = undefined;
                if (match.store.url) {
                  try {
                    const hostname = new URL(match.store.url).hostname;
                    logoUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
                  } catch (e) {}
                }
                merchant = this.merchantRepository.create({
                  name_en: match.store.nameEn,
                  name_ar: match.store.nameAr,
                  base_url: match.store.url,
                  logo_url: logoUrl,
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
                product: product,
              });
              const savedPrice = await this.productPriceRepository.save(price);
              product.prices.push(savedPrice);
            }

            product.prices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
            subscriber.next({ data: { type: 'done', payload: product } });
            subscriber.complete();
            return;
          }

          // If product is not in database, we start parallel live seeding!
          this.logger.log(`[Stream Seeding] Product with GTIN ${gtin} not found. Starting streaming live seeding...`);

          const successfulMatches: any[] = [];
          let firstMatchFound = false;

          const promises = storeConfigs.map(async (store) => {
            try {
              const cacheKey = `missing:${store.url}:${gtin}`;
              const isNegativeCached = await this.redis.get(cacheKey);
              if (isNegativeCached) {
                this.logger.log(`[Stream Search] Skipping negative cached empty store ${store.url} for GTIN ${gtin}`);
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
              }

              const scraper = this.getScraperForStore(store.url);
              await scraper.ensureLaunched();

              this.logger.log(`[Stream Search] Querying ${store.url} with raw GTIN "${gtin}"...`);
              const barcodeCandidates = await scraper.searchAndGetCandidates(gtin, 0.5, undefined, store.url);
              
              if (barcodeCandidates && barcodeCandidates.length > 0) {
                if (barcodeCandidates.length >= 25) {
                  this.logger.log(`[Stream Search] Store ${store.url} returned ${barcodeCandidates.length} products. Rejecting as generic response.`);
                } else {
                  const candidatesToCheck = barcodeCandidates.slice(0, 10);
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
                        await this.redis.del(cacheKey);
                        return match;
                      }
                    } catch (err: any) {
                      this.logger.warn(`[Stream Search] Failed to scrape details for candidate "${cand.name}" on ${store.url}: ${err.message}`);
                    }
                  }
                }
              }

              this.logger.log(`[Stream Search] No verified match for GTIN on ${store.url}. Writing negative cache.`);
              await this.redis.set(cacheKey, 'true', 'EX', 86400); // 24 hours
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
              let logoUrl: string | undefined = undefined;
              if (match.store.url) {
                try {
                  const hostname = new URL(match.store.url).hostname;
                  logoUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
                } catch (e) {}
              }
              merchant = this.merchantRepository.create({
                name_en: match.store.nameEn,
                name_ar: match.store.nameAr,
                base_url: match.store.url,
                logo_url: logoUrl,
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

  async search(q: string): Promise<Product[]> {
    if (!q || q.trim() === '') return [];
    const query = q.trim();
    return await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images')
      .leftJoinAndSelect('product.prices', 'prices')
      .leftJoinAndSelect('prices.merchant', 'merchant')
      .where(
        '(product.name_en ILIKE :q OR product.name_ar ILIKE :q OR product.brand ILIKE :q OR product.gtin = :gtin)',
        { q: `%${query}%`, gtin: query },
      )
      .limit(50)
      .getMany();
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
