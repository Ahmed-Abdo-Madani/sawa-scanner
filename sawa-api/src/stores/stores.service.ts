import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Store } from '../entities/store.entity';
import { Merchant } from '../entities/merchant.entity';

export interface UpsertStoreDto {
  platform: string;
  platform_branch_id?: string;
  platform_branch_uuid: string;
  merchant_name_en: string;
  merchant_name_ar?: string;
  vertical?: string;
  city_slug: string;
  city_name_ar?: string;
  city_name_en?: string;
  district_slug?: string;
  district_name_ar?: string;
  district_name_en?: string;
  lat?: number | null;
  lng?: number | null;
  source_url?: string;
}

@Injectable()
export class StoresService {
  private readonly logger = new Logger(StoresService.name);

  constructor(
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
  ) { }

  async upsertByPlatformUuid(dto: UpsertStoreDto): Promise<Store> {
    // 1. Look up the existing store first so we can detect merchant corrections
    const existing = await this.storeRepo.findOne({
      where: {
        platform: dto.platform,
        platform_branch_uuid: dto.platform_branch_uuid,
      },
    });

    // 2. Find or create the merchant
    let merchant = await this.merchantRepo.findOne({
      where: { name_en: dto.merchant_name_en },
    });

    if (!merchant) {
      // Create new merchant dynamically if it doesn't exist
      merchant = this.merchantRepo.create({
        name_en: dto.merchant_name_en,
        name_ar: dto.merchant_name_ar,
        base_url: dto.platform === 'hungerstation' ? 'https://hungerstation.com' : undefined,
        data_source_type: 'scrape',
      });
      merchant = await this.merchantRepo.save(merchant);
      this.logger.log(`Created NEW merchant: "${merchant.name_en}" (id=${merchant.id})`);
    }

    // 3. Log merchant correction if the store already had a different merchant
    if (existing && existing.merchant_id !== merchant.id) {
       this.logger.log(`Correcting merchant for store ${dto.platform_branch_uuid}: ${existing.merchant_id} -> ${merchant.id} (${merchant.name_en})`);
    }

    this.logger.log(`Upserting store ${dto.platform_branch_uuid} for merchant "${merchant.name_en}"`);

    if (existing) {
      Object.assign(existing, {
        merchant_id: merchant.id,
        city_slug: dto.city_slug,
        ...(dto.platform_branch_id !== undefined
          ? { platform_branch_id: dto.platform_branch_id }
          : {}),
        vertical: dto.vertical,
        city_name_ar: dto.city_name_ar,
        city_name_en: dto.city_name_en,
        district_slug: dto.district_slug,
        district_name_ar: dto.district_name_ar,
        district_name_en: dto.district_name_en,
        lat: dto.lat ?? null,
        lng: dto.lng ?? null,
        source_url: dto.source_url,
        is_active: true,
        last_seen_at: new Date(),
      });
      return this.storeRepo.save(existing);
    }

    const store = this.storeRepo.create({
      merchant_id: merchant.id,
      platform: dto.platform,
      platform_branch_id: dto.platform_branch_id,
      platform_branch_uuid: dto.platform_branch_uuid,
      vertical: dto.vertical,
      city_slug: dto.city_slug,
      city_name_ar: dto.city_name_ar,
      city_name_en: dto.city_name_en,
      district_slug: dto.district_slug,
      district_name_ar: dto.district_name_ar,
      district_name_en: dto.district_name_en,
      lat: dto.lat ?? null,
      lng: dto.lng ?? null,
      source_url: dto.source_url,
      last_seen_at: new Date(),
      is_active: true,
    });
    return this.storeRepo.save(store);
  }

  async findByCity(
    citySlug: string,
    vertical?: string,
    platform?: string,
  ): Promise<Store[]> {
    return this.storeRepo.find({
      where: {
        city_slug: citySlug,
        ...(vertical ? { vertical } : {}),
        ...(platform ? { platform } : {}),
        is_active: true,
      },
      relations: ['merchant'],
    });
  }

  async findByDistrict(
    citySlug: string,
    districtSlug: string,
    vertical?: string,
    platform?: string,
  ): Promise<Store[]> {
    return this.storeRepo.find({
      where: {
        city_slug: citySlug,
        district_slug: districtSlug,
        ...(vertical ? { vertical } : {}),
        ...(platform ? { platform } : {}),
        is_active: true,
      },
      relations: ['merchant'],
    });
  }

  async findActiveByPlatform(platform: string): Promise<Store[]> {
    return this.storeRepo.find({
      where: {
        platform,
        is_active: true,
      },
      relations: ['merchant'],
    });
  }

  async findById(id: string): Promise<Store> {
    const store = await this.storeRepo.findOne({
      where: { id },
      relations: ['merchant'],
    });
    if (!store) {
      throw new NotFoundException(`Store with id "${id}" not found`);
    }
    return store;
  }
}
