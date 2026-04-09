import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async findByGtin(gtin: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { gtin },
      relations: ['nutritionFact', 'ingredients', 'prices', 'prices.merchant', 'images'],
    });

    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    if (product.prices && product.prices.length > 0) {
      const latestPricesMap = new Map<string, typeof product.prices[0]>();
      for (const p of product.prices) {
        const existing = latestPricesMap.get(p.merchant_id);
        if (!existing || p.scraped_at > existing.scraped_at) {
          latestPricesMap.set(p.merchant_id, p);
        }
      }
      product.prices = Array.from(latestPricesMap.values()).sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);
    }

    return product;
  }
}
