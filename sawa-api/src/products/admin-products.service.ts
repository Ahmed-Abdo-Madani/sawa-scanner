import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Like } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ProductReport } from '../entities/product-report.entity';
import { ProductMergeLog } from '../entities/product-merge-log.entity';
import { ProductMergeService } from './product-merge.service';
import { AdminUpsertProductDto } from './dto/admin-upsert-product.dto';
import { NutritionFact } from '../entities/nutrition-fact.entity';
import { Ingredient } from '../entities/ingredient.entity';
import { ProductAllergen } from '../entities/product-allergen.entity';
import { ProductImage } from '../entities/product-image.entity';
import { ProductPrice } from '../entities/product-price.entity';
import { normalizeBrandStrict, normalizeProductName, gtinPrefix } from '../utils/normalization';

@Injectable()
export class AdminProductsService {
  constructor(
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ProductReport) private reportRepo: Repository<ProductReport>,
    @InjectRepository(ProductMergeLog) private logRepo: Repository<ProductMergeLog>,
    private mergeService: ProductMergeService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async listMissingGtin(query: { page?: any; pageSize?: any; search?: string }) {
    const page = query.page ? parseInt(query.page.toString(), 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize.toString(), 10) : 50;
    const offset = (page - 1) * pageSize;

    const qb = this.reportRepo
      .createQueryBuilder('report')
      .select('report.gtin', 'gtin')
      .addSelect('COUNT(*)', 'count')
      .addSelect("COALESCE(MAX(report.payload->>'name_en'), MAX(report.payload->>'name_ar'), '')", 'name')
      .addSelect("COALESCE(MAX(report.payload->'images'->>'front'), '')", 'image_url')
      .leftJoin(Product, 'product', 'product.gtin = report.gtin')
      .where('product.id IS NULL');

    if (query.search) {
      qb.andWhere(
        "(report.gtin LIKE :search OR report.payload->>'name_en' ILIKE :search OR report.payload->>'name_ar' ILIKE :search)",
        { search: `%${query.search}%` },
      );
    }

    return qb
      .groupBy('report.gtin')
      .orderBy('count', 'DESC')
      .offset(offset)
      .limit(pageSize)
      .getRawMany();
  }

  async listProductsNeedingGtin(query: {
    page?: any;
    pageSize?: any;
    search?: string;
    category?: string;
    brand?: string;
    gtinStatus?: string;
    onlyMultiStore?: string;
  }) {
    const page = query.page ? parseInt(query.page.toString(), 10) : 1;
    const pageSize = query.pageSize ? parseInt(query.pageSize.toString(), 10) : 20;
    const offset = (page - 1) * pageSize;

    const qb = this.productRepo
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.images', 'images');

    // Handle gtinStatus: 'assigned' (with GTIN), 'unassigned' (needs GTIN), or 'all'
    const status = query.gtinStatus || 'unassigned';
    if (status === 'assigned') {
      qb.where('product.gtin IS NOT NULL');
    } else if (status === 'unassigned') {
      qb.where('product.gtin IS NULL');
    } else {
      qb.where('1=1');
    }

    qb.andWhere('product.hs_product_id IS NOT NULL');

    if (query.search) {
      qb.andWhere(
        '(product.name_en ILIKE :search OR product.name_ar ILIKE :search OR product.gtin ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.category) {
      qb.andWhere('product.category = :category', {
        category: query.category,
      });
    }

    if (query.brand) {
      qb.andWhere('product.brand = :brand', {
        brand: query.brand,
      });
    }

    if (query.onlyMultiStore === 'true') {
      qb.andWhere((subQuery) => {
        const sub = subQuery
          .subQuery()
          .select('pp.product_id')
          .from('product_price', 'pp')
          .groupBy('pp.product_id')
          .having('COUNT(pp.id) > 1')
          .getQuery();
        return 'product.id IN ' + sub;
      });
    }

    const [items, total] = await qb
      .orderBy('product.created_at', 'DESC')
      .skip(offset)
      .take(pageSize)
      .getManyAndCount();

    // Map store price count for each product
    if (items.length > 0) {
      const itemIds = items.map(item => item.id);
      const priceCounts = await this.dataSource.getRepository(ProductPrice)
        .createQueryBuilder('price')
        .select('price.product_id', 'productId')
        .addSelect('COUNT(*)', 'count')
        .where('price.product_id IN (:...itemIds)', { itemIds })
        .groupBy('price.product_id')
        .getRawMany();

      const countsMap = new Map(priceCounts.map(c => [c.productId, parseInt(c.count)]));
      items.forEach((item: any) => {
        item.priceCount = countsMap.get(item.id) || 0;
      });
    }

    return { items, total, page, pageSize };
  }

  async getFilterOptions() {
    const categories = await this.productRepo
      .createQueryBuilder('product')
      .select('DISTINCT(product.category)', 'category')
      .where('product.category IS NOT NULL AND product.category != :empty AND product.hs_product_id IS NOT NULL', { empty: '' })
      .orderBy('category', 'ASC')
      .getRawMany();

    const brands = await this.productRepo
      .createQueryBuilder('product')
      .select('DISTINCT(product.brand)', 'brand')
      .where('product.brand IS NOT NULL AND product.brand != :empty AND product.hs_product_id IS NOT NULL', { empty: '' })
      .orderBy('brand', 'ASC')
      .getRawMany();

    return {
      categories: categories.map((c) => c.category),
      brands: brands.map((b) => b.brand),
    };
  }

  async searchByGtinPrefix(prefix: string) {
    return this.productRepo.find({
      where: { gtin: Like(`${prefix}%`) },
      take: 20,
    });
  }

  async getOne(idOrGtin: string) {
    const product = await this.productRepo.findOne({
      where: [{ id: idOrGtin }, { gtin: idOrGtin }],
      relations: ['nutritionFact', 'ingredients', 'allergens', 'images'],
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async upsertByGtin(dto: AdminUpsertProductDto, adminId: string) {
    const { nutrition, ingredients, allergens, gtin, ...rest } = dto;

    return await this.dataSource.transaction(async (manager) => {
      let product = await manager.findOne(Product, { 
        where: { gtin },
        relations: ['nutritionFact']
      });

      // Track if we absorbed a twin, and capture its identity before Object.assign
      let twinMerged = false;
      let twinId: string | null = null;
      let twinGtin: string | null = null;

      if (!product) {
        // Check for twin SCAN product
        const twin = await this.mergeService.findSyntheticTwinFor(rest as any);
        if (twin) {
          // Capture twin's identity BEFORE Object.assign overwrites product
          twinMerged = true;
          twinId = twin.id;
          twinGtin = twin.gtin;
          
          product = twin;
          product.gtin = gtin;
        } else {
          product = manager.create(Product, { gtin });
        }
      }

      Object.assign(product, rest);
      
      // Wire normalized fields
      product.brand_normalized = normalizeBrandStrict(product.brand ?? '');
      product.name_normalized = normalizeProductName(product.name_en ?? product.name_ar ?? '');
      product.gtin_prefix = product.gtin ? gtinPrefix(product.gtin) : null;
      
      await manager.save(product);

      if (nutrition) {
        let nFact = product.nutritionFact;
        if (!nFact) {
          nFact = manager.create(NutritionFact, { product_id: product.id });
        }
        Object.assign(nFact, nutrition);
        await manager.save(nFact);
      }

      if (ingredients) {
        await manager.delete(Ingredient, { product_id: product.id });
        const newIngs = ingredients.map(i => manager.create(Ingredient, { ...i, product_id: product.id }));
        await manager.save(newIngs);
      }

      if (allergens) {
        await manager.delete(ProductAllergen, { product_id: product.id });
        const newAlgs = allergens.map(a => manager.create(ProductAllergen, { ...a, product_id: product.id }));
        await manager.save(newAlgs);
      }

      // Write semantically correct audit log
      let logEntry: any;
      if (twinMerged) {
        // Twin was absorbed — log as a merge
        logEntry = {
          winner_product_id: product.id,
          winner_gtin: gtin,
          loser_product_id: twinId,
          loser_gtin: twinGtin,
          reason: 'scan_twin_merge',
          triggered_by: adminId === 'off_backfill_job' ? 'off_backfill_job' : 'admin',
          actor_uid: adminId,
          payload: { action: 'UPSERT' },
        };
      } else {
        // Plain upsert (no twin) — loser fields are null
        logEntry = {
          winner_product_id: product.id,
          winner_gtin: gtin,
          loser_product_id: null,
          loser_gtin: null,
          reason: 'admin_upsert',
          triggered_by: adminId === 'off_backfill_job' ? 'off_backfill_job' : 'admin',
          actor_uid: adminId,
          payload: { action: 'UPSERT' },
        };
      }

      const log = manager.create(ProductMergeLog, logEntry);
      await manager.save(log);

      return product;
    });
  }

  async assignGtin(productId: string, gtin: string, adminId: string) {
    return this.mergeService.assignGtin(productId, gtin, adminId, 'Admin Manual Assign');
  }

  async mergeProducts(winnerId: string, loserId: string, adminId: string) {
    if (winnerId === loserId) throw new BadRequestException('Cannot merge a product into itself');
    return this.mergeService.mergeProducts(winnerId, loserId, adminId, 'Admin Manual Merge');
  }

  async attachImages(productId: string, files: any, adminId: string) {
    const product = await this.productRepo.findOneBy({ id: productId });
    if (!product) throw new NotFoundException('Product not found');

    const imageRepo = this.dataSource.getRepository(ProductImage);
    const baseUrl = '/uploads/products/'; // Should ideally come from config

    if (files.front?.[0]) {
      const url = baseUrl + files.front[0].filename;
      product.image_front_url = url;
      await imageRepo.save(imageRepo.create({ product_id: productId, url, image_type: 'front' }));
    }
    if (files.ingredients?.[0]) {
      const url = baseUrl + files.ingredients[0].filename;
      await imageRepo.save(imageRepo.create({ product_id: productId, url, image_type: 'ingredients' }));
    }
    if (files.nutrition?.[0]) {
      const url = baseUrl + files.nutrition[0].filename;
      product.image_nutrition_url = url;
      await imageRepo.save(imageRepo.create({ product_id: productId, url, image_type: 'nutrition' }));
    }

    await this.productRepo.save(product);
    return product;
  }

  async listMergeLogs(query: { productId?: string; limit?: number }) {
    const qb = this.logRepo.createQueryBuilder('log');
    
    if (query.productId) {
      qb.where('log.winner_product_id = :pid OR log.loser_product_id = :pid', { pid: query.productId });
    }

    return qb
      .orderBy('log.created_at', 'DESC')
      .limit(query.limit || 50)
      .getMany();
  }
}
