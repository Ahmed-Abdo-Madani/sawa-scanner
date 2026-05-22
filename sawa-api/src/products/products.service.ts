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
  ) {}

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

      const promises = storeConfigs.map(async (store) => {
        try {
          const scraper = store.platform === 'zid' ? this.zidScraper : this.sallaScraper;
          await scraper.ensureLaunched();
          
          this.logger.log(`Querying ${store.url} for GTIN ${gtin}...`);
          const bestMatch = await scraper.searchAndGetBestMatch(gtin, 0.7, undefined, store.url);
          if (!bestMatch) {
            this.logger.log(`No match for GTIN ${gtin} on ${store.url}`);
            return null;
          }

          this.logger.log(`Found match on ${store.url}: ${bestMatch.name}. Scraping details...`);
          const details = await scraper.scrapeProductDetails(bestMatch.url);
          if (!details || details.price === null) {
            this.logger.log(`Failed to scrape details or price is empty on ${store.url}`);
            return null;
          }

          return { store, details, matchUrl: bestMatch.url };
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
      const newProduct = this.productRepository.create({
        gtin,
        name_ar: firstMatch.details.name || undefined,
        name_en: firstMatch.details.name || undefined,
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
