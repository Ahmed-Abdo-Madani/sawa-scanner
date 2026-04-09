import { Test, TestingModule } from '@nestjs/testing';
import { PricesService } from './prices.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductPrice } from '../entities/product-price.entity';
import { Product } from '../entities/product.entity';
import { NotFoundException } from '@nestjs/common';

const mockProductPriceRepository = {
  find: jest.fn(),
};

const mockProductRepository = {
  findOne: jest.fn(),
};

describe('PricesService', () => {
  let service: PricesService;

  beforeEach(async () => {
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
      ],
    }).compile();

    service = module.get<PricesService>(PricesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findPricesByGtin', () => {
    it('should return only the newest price per merchant, sorted by price', async () => {
      mockProductRepository.findOne.mockResolvedValue({ id: 'product-1', gtin: '123' });

      const dateOld = new Date('2023-01-01');
      const dateNew = new Date('2023-01-02');

      const prices = [
        { merchant_id: 'merchant-a', price_sar_incl_vat: 20, scraped_at: dateOld, product_id: 'product-1', merchant: { name_en: 'A' } },
        { merchant_id: 'merchant-a', price_sar_incl_vat: 15, scraped_at: dateNew, product_id: 'product-1', merchant: { name_en: 'A' } }, // Newest for A
        { merchant_id: 'merchant-b', price_sar_incl_vat: 10, scraped_at: dateOld, product_id: 'product-1', merchant: { name_en: 'B' } }, // Newest for B
      ] as ProductPrice[];

      mockProductPriceRepository.find.mockResolvedValue(prices);

      const result = await service.findPricesByGtin('123');

      expect(result).toHaveLength(2);
      // It should sort by price ascending: 10 then 15
      expect(result[0].price_sar_incl_vat).toBe(10);
      expect(result[0].merchant_id).toBe('merchant-b');
      expect(result[1].price_sar_incl_vat).toBe(15);
      expect(result[1].merchant_id).toBe('merchant-a');
    });

    it('should throw NotFoundException if product is not found', async () => {
      mockProductRepository.findOne.mockResolvedValue(null);
      await expect(service.findPricesByGtin('000')).rejects.toThrow(NotFoundException);
    });
  });
});
