import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { ProductReport } from '../entities/product-report.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductPrice)
    private readonly productPriceRepository: Repository<ProductPrice>,
    @InjectRepository(ProductReport)
    private readonly productReportRepository: Repository<ProductReport>,
  ) {}

  async findByGtin(gtin: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { gtin },
      relations: [
        'nutritionFact',
        'ingredients',
        'allergens',
        'images',
      ],
    });

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
