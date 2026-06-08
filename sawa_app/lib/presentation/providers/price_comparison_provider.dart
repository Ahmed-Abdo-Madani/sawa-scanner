import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/price_info.dart';
import '../../data/datasources/location_service.dart';
import 'product_provider.dart';
import 'nearby_prices_provider.dart';

final isSawaPlusProvider = StateProvider<bool>((ref) => false);

final latestPricesProvider = FutureProvider.family<List<PriceInfo>, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  final prices = await repository.getLatestPrices(gtin);
  final userLocation = ref.watch(userLocationProvider);

  if (userLocation != null) {
    return prices.map((p) {
      if (p.storeLat != null && p.storeLng != null) {
        final dist = LocationService.distanceKm(
          userLocation.lat,
          userLocation.lng,
          p.storeLat!,
          p.storeLng!,
        );
        return PriceInfo(
          merchant: p.merchant,
          merchantAr: p.merchantAr,
          logoUrl: p.logoUrl,
          sourceUrl: p.sourceUrl,
          priceSarInclVat: p.priceSarInclVat,
          promoPriceSar: p.promoPriceSar,
          unitPriceSar: p.unitPriceSar,
          unitPriceUnit: p.unitPriceUnit,
          inStock: p.inStock,
          scrapedAt: p.scrapedAt,
          storeId: p.storeId,
          storeName: p.storeName,
          storeNameAr: p.storeNameAr,
          districtName: p.districtName,
          districtNameAr: p.districtNameAr,
          storeLat: p.storeLat,
          storeLng: p.storeLng,
          distanceKm: dist,
        );
      }
      return p;
    }).toList();
  }

  return prices;
});

final priceHistoryProvider = FutureProvider.family<List<PriceInfo>, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getPriceHistory(gtin);
});
