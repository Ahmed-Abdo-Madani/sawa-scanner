import { Test, TestingModule } from '@nestjs/testing';
import { PricesService } from './prices.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';
import { NotFoundException, BadRequestException } from '@nestjs/common';

const mockProductPriceRepository = {
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockProductRepository = {
  findOne: jest.fn(),
};

const mockRedis = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  del: jest.fn().mockResolvedValue(1),
  scan: jest.fn().mockResolvedValue(['0', []]),
};

describe('PricesService', () => {
  let service: PricesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
    mockRedis.scan.mockResolvedValue(['0', []]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricesService,
        {
          provide: getRepositoryToken(ProductPrice),
          useValue: mockProductPriceRepository,
        },
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPricesByGtin', () => {
    it('should return only the newest price per merchant, sorted by price', async () => {
      mockProductRepository.findOne.mockResolvedValue({
        id: 'product-1',
        gtin: '123',
      });

      const dateOld = new Date('2023-01-01');
      const dateNew = new Date('2023-01-02');

      const prices = [
        {
          merchant_id: 'merchant-a',
          price_sar_incl_vat: 20,
          scraped_at: dateOld,
          product_id: 'product-1',
          merchant: { name_en: 'A' },
        },
        {
          merchant_id: 'merchant-a',
          price_sar_incl_vat: 15,
          scraped_at: dateNew,
          product_id: 'product-1',
          merchant: { name_en: 'A' },
        }, // Newest for A
        {
          merchant_id: 'merchant-b',
          price_sar_incl_vat: 10,
          scraped_at: dateOld,
          product_id: 'product-1',
          merchant: { name_en: 'B' },
        }, // Newest for B
      ] as ProductPrice[];

      mockProductPriceRepository.find.mockResolvedValue(prices);

      const result = await service.findPricesByGtin('123');

      expect(result).toHaveLength(2);
      // It should sort by price ascending: 10 then 15
      expect(result[0].price_sar_incl_vat).toBe(10);
      expect(result[0].merchant_id).toBe('merchant-b');
      expect(result[1].price_sar_incl_vat).toBe(15);
      expect(result[1].merchant_id).toBe('merchant-a');
      // Cache should be written
      expect(mockRedis.set).toHaveBeenCalledWith(
        'prices:123',
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should throw NotFoundException if product is not found', async () => {
      mockProductRepository.findOne.mockResolvedValue(null);
      await expect(service.findPricesByGtin('000')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('invalidateGtinCache', () => {
    it('should delete the exact key and scan for by-store keys', async () => {
      await service.invalidateGtinCache('456');
      expect(mockRedis.del).toHaveBeenCalledWith('prices:456');
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        'prices:by-store:456:*',
        'COUNT',
        100,
      );
    });

    it('should delete scanned by-store keys when found', async () => {
      mockRedis.scan.mockResolvedValueOnce([
        '0',
        ['prices:by-store:456:riyadh:*:*', 'prices:by-store:456:jeddah:*:*'],
      ]);

      await service.invalidateGtinCache('456');

      expect(mockRedis.del).toHaveBeenCalledWith(
        'prices:by-store:456:riyadh:*:*',
        'prices:by-store:456:jeddah:*:*',
      );
    });
  });

  describe('findPricesByStore', () => {
    const buildQb = (prices: ProductPrice[]) => ({
      innerJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(prices),
    });

    it('should return latest price per store_id sorted by price ascending', async () => {
      mockProductRepository.findOne.mockResolvedValue({
        id: 'product-1',
        gtin: '789',
      });

      const dateOld = new Date('2023-01-01');
      const dateNew = new Date('2023-01-02');

      const prices = [
        {
          store_id: 'store-a',
          price_sar_incl_vat: 20,
          scraped_at: dateOld,
          store: { city_slug: 'riyadh', merchant: {} },
        },
        {
          store_id: 'store-a',
          price_sar_incl_vat: 12,
          scraped_at: dateNew,
          store: { city_slug: 'riyadh', merchant: {} },
        },
        {
          store_id: 'store-b',
          price_sar_incl_vat: 8,
          scraped_at: dateOld,
          store: { city_slug: 'riyadh', merchant: {} },
        },
      ] as unknown as ProductPrice[];

      mockProductPriceRepository.createQueryBuilder.mockReturnValue(
        buildQb(prices),
      );

      const result = await service.findPricesByStore('789', { city: 'riyadh' });

      expect(result).toHaveLength(2);
      expect(result[0].price_sar_incl_vat).toBe(8); // store-b
      expect(result[1].price_sar_incl_vat).toBe(12); // store-a newest
    });

    it('should throw NotFoundException if product not found', async () => {
      mockProductRepository.findOne.mockResolvedValue(null);
      await expect(
        service.findPricesByStore('000', { city: 'riyadh' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should cache results with a composite key', async () => {
      mockProductRepository.findOne.mockResolvedValue({
        id: 'product-1',
        gtin: '789',
      });
      mockProductPriceRepository.createQueryBuilder.mockReturnValue(
        buildQb([]),
      );

      await service.findPricesByStore('789', {
        city: 'riyadh',
        district: 'olaya',
        vertical: 'grocery',
      });

      expect(mockRedis.set).toHaveBeenCalledWith(
        'prices:by-store:789:riyadh:olaya:grocery',
        expect.any(String),
        'EX',
        300,
      );
    });
  });
});
