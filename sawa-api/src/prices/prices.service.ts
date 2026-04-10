import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Between } from 'typeorm';

@Injectable()
export class PricesService {
  constructor(
    @InjectRepository(ProductPrice)
    private readonly priceRepository: Repository<ProductPrice>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findPricesByGtin(gtin: string) {
    const cacheKey = `prices:${gtin}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

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

    // Cache with 5 minute TTL
    await this.redis.set(cacheKey, JSON.stringify(latestPrices), 'EX', 300);

    return latestPrices;
  }

  async findPriceHistory(gtin: string, days: number = 30) {
    const product = await this.productRepository.findOne({ where: { gtin } });
    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const history = await this.priceRepository.find({
      where: {
        product_id: product.id,
        scraped_at: Between(startDate, new Date()),
      },
      relations: ['merchant'],
      order: { scraped_at: 'ASC' },
    });

    return history;
  }
}
