import { Controller, Get, Param, Query } from '@nestjs/common';
import { StoresService } from './stores.service';
import { Store } from '../entities/store.entity';

function mapStore(store: Store) {
  return {
    id: store.id,
    merchant: {
      name_en: store.merchant?.name_en,
      name_ar: store.merchant?.name_ar,
      logo_url: store.merchant?.logo_url,
    },
    vertical: store.vertical,
    city: {
      slug: store.city_slug,
      name_ar: store.city_name_ar,
      name_en: store.city_name_en,
    },
    district: {
      slug: store.district_slug,
      name_ar: store.district_name_ar,
      name_en: store.district_name_en,
    },
    lat: store.lat,
    lng: store.lng,
    source_url: store.source_url,
    last_seen_at: store.last_seen_at,
  };
}

@Controller('stores')
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @Get()
  async getStores(
    @Query('city') city: string,
    @Query('district') district?: string,
    @Query('vertical') vertical?: string,
    @Query('platform') platform?: string,
  ) {
    const stores = district
      ? await this.storesService.findByDistrict(
          city,
          district,
          vertical,
          platform,
        )
      : await this.storesService.findByCity(city, vertical, platform);
    return stores.map(mapStore);
  }

  @Get(':id')
  async getStore(@Param('id') id: string) {
    const store = await this.storesService.findById(id);
    return mapStore(store);
  }
}
