import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/price_info.dart';
import '../../data/datasources/location_service.dart';
import 'product_provider.dart';

/// Holds the user's current position for distance calculations.
final userLocationProvider =
    StateProvider<({double lat, double lng})?>((ref) => null);

/// Input record for the nearby prices provider.
typedef NearbyPricesInput = ({String gtin, double lat, double lng});

/// Fetches store-scoped prices for a product based on user's GPS,
/// resolves city from static boundaries, and computes distances.
final nearbyPricesProvider = FutureProvider.family<List<PriceInfo>,
    NearbyPricesInput>((ref, input) async {
  final repository = ref.watch(productRepositoryProvider);
  final citySlug = LocationService.resolveCitySlug(input.lat, input.lng);

  final prices = await repository.getPricesByStore(input.gtin, citySlug);

  // Compute distances and sort by distance (nearest first)
  final enriched = prices.map((p) {
    if (p.storeLat != null && p.storeLng != null) {
      final dist = LocationService.distanceKm(
        input.lat,
        input.lng,
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

  enriched.sort((a, b) {
    // Promo first, then by distance, then by price
    if (a.distanceKm != null && b.distanceKm != null) {
      return a.distanceKm!.compareTo(b.distanceKm!);
    }
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return a.priceSarInclVat.compareTo(b.priceSarInclVat);
  });

  return enriched;
});
