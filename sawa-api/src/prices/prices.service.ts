import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';

@Injectable()
export class PricesService {
  constructor(
    @InjectRepository(ProductPrice)
    private readonly priceRepository: Repository<ProductPrice>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findPricesByGtin(gtin: string) {
    const product = await this.productRepository.findOne({ where: { gtin } });
    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    const prices = await this.priceRepository.find({
      where: { product_id: product.id },
      relations: ['merchant'],
    });

    const latestPricesMap = new Map<string, ProductPrice>();
    for (const p of prices) {
      const existing = latestPricesMap.get(p.merchant_id);
      if (!existing || p.scraped_at > existing.scraped_at) {
        latestPricesMap.set(p.merchant_id, p);
      }
    }

    const latestPrices = Array.from(latestPricesMap.values());
    latestPrices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);

    return latestPrices;
  }
}
