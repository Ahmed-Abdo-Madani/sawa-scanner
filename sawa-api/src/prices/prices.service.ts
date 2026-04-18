import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Between } from 'typeorm';

const PRICE_CACHE_TTL = 300; // 5 minutes

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

  async invalidateGtinCache(gtin: string): Promise<void> {
    // Delete the exact per-gtin key
    await this.redis.del(`prices:${gtin}`);

    // Delete all by-store keys for this gtin using SCAN (non-blocking)
    const pattern = `prices:by-store:${gtin}:*`;
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

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
    await this.redis.set(
      cacheKey,
      JSON.stringify(latestPrices),
      'EX',
      PRICE_CACHE_TTL,
    );

    return latestPrices;
  }

  async findPricesByStore(
    gtin: string,
    filters: { city: string; district?: string; vertical?: string },
  ) {
    const { city, district, vertical } = filters;
    const cacheKey = `prices:by-store:${gtin}:${city}:${district || '*'}:${vertical || '*'}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const product = await this.productRepository.findOne({ where: { gtin } });
    if (!product) {
      throw new NotFoundException(`Product with GTIN ${gtin} not found`);
    }

    const qb = this.priceRepository
      .createQueryBuilder('price')
      .innerJoinAndSelect('price.store', 'store')
      .innerJoinAndSelect('store.merchant', 'merchant')
      .where('price.product_id = :productId', { productId: product.id })
      .andWhere('price.store_id IS NOT NULL')
      .andWhere('store.city_slug = :city', { city })
      .andWhere('store.is_active = true');

    if (district) {
      qb.andWhere('store.district_slug = :district', { district });
    }
    if (vertical) {
      qb.andWhere('store.vertical = :vertical', { vertical });
    }

    const prices = await qb.getMany();

    // Reduce to latest per store_id
    const latestMap = new Map<string, ProductPrice>();
    for (const p of prices) {
      const storeId = p.store_id as string; // query guarantees store_id IS NOT NULL
      const existing = latestMap.get(storeId);
      if (!existing || p.scraped_at > existing.scraped_at) {
        latestMap.set(storeId, p);
      }
    }

    const latestPrices = Array.from(latestMap.values());
    latestPrices.sort((a, b) => a.price_sar_incl_vat - b.price_sar_incl_vat);

    await this.redis.set(
      cacheKey,
      JSON.stringify(latestPrices),
      'EX',
      PRICE_CACHE_TTL,
    );

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
