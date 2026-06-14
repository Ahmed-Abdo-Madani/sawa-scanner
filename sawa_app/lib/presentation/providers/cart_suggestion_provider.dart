import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../data/datasources/location_service.dart';
import '../../domain/entities/price_info.dart';
import 'cart_provider.dart';
import 'nearby_prices_provider.dart';

class CartStoreSuggestion {
  final String storeKey;
  final String merchant;
  final String merchantAr;
  final String? storeName;
  final String? storeNameAr;
  final String? districtName;
  final String? districtNameAr;
  final String? logoUrl;
  final double totalPrice;
  final int matchedItemsCount;
  final double? distanceKm;
  final List<String> missingProductNames;

  CartStoreSuggestion({
    required this.storeKey,
    required this.merchant,
    required this.merchantAr,
    this.storeName,
    this.storeNameAr,
    this.districtName,
    this.districtNameAr,
    this.logoUrl,
    required this.totalPrice,
    required this.matchedItemsCount,
    this.distanceKm,
    this.missingProductNames = const [],
  });
}

class CartSuggestionResult {
  final CartStoreSuggestion? bestCheapestStore;
  final CartStoreSuggestion? nearestStore;
  final int totalCartItems;
  final bool hasFullCoverage;

  CartSuggestionResult({
    this.bestCheapestStore,
    this.nearestStore,
    required this.totalCartItems,
    required this.hasFullCoverage,
  });
}

final cartSuggestionProvider = Provider<CartSuggestionResult?>((ref) {
  final cartItems = ref.watch(cartProvider);
  if (cartItems.isEmpty) return null;

  final userLoc = ref.watch(userLocationProvider);

  // Map of storeKey -> Map of productKey -> PriceInfo
  final storeMap = <String, Map<String, PriceInfo>>{};

  // Keep track of store details by storeKey
  final storeInfoMap = <String, PriceInfo>{};

  for (final item in cartItems) {
    final productKey = item.product.id;
    final validPrices = item.product.prices
        .where((p) => p.priceSarInclVat > 0 && p.inStock)
        .toList();

    for (final price in validPrices) {
      final storeKey = price.storeId ?? price.merchant;
      
      storeMap.putIfAbsent(storeKey, () => {})[productKey] = price;
      
      // Store the most complete details we have for this branch
      if (!storeInfoMap.containsKey(storeKey) || 
          (price.storeName != null && storeInfoMap[storeKey]?.storeName == null)) {
        storeInfoMap[storeKey] = price;
      }
    }
  }

  if (storeMap.isEmpty) return null;

  final candidates = <CartStoreSuggestion>[];

  for (final entry in storeMap.entries) {
    final storeKey = entry.key;
    final productPriceMap = entry.value;

    final info = storeInfoMap[storeKey]!;
    
    double totalPrice = 0.0;
    for (final item in cartItems) {
      final productKey = item.product.id;
      final priceInfo = productPriceMap[productKey];
      if (priceInfo != null) {
        totalPrice += priceInfo.priceSarInclVat * item.quantity;
      }
    }

    final matchedCount = productPriceMap.length;
    
    // Determine missing products
    final missingProductNames = <String>[];
    for (final item in cartItems) {
      if (!productPriceMap.containsKey(item.product.id)) {
        missingProductNames.add(item.product.nameAr.isNotEmpty ? item.product.nameAr : item.product.nameEn);
      }
    }

    // Calculate distance if coordinates are available
    double? distance;
    if (userLoc != null && info.storeLat != null && info.storeLng != null) {
      distance = LocationService.distanceKm(
        userLoc.lat,
        userLoc.lng,
        info.storeLat!,
        info.storeLng!,
      );
    }

    candidates.add(
      CartStoreSuggestion(
        storeKey: storeKey,
        merchant: info.merchant,
        merchantAr: info.merchantAr,
        storeName: info.storeName,
        storeNameAr: info.storeNameAr,
        districtName: info.districtName,
        districtNameAr: info.districtNameAr,
        logoUrl: info.logoUrl,
        totalPrice: totalPrice,
        matchedItemsCount: matchedCount,
        distanceKm: distance,
        missingProductNames: missingProductNames,
      ),
    );
  }

  // Find the maximum coverage among all candidates
  int maxMatched = 0;
  for (final c in candidates) {
    if (c.matchedItemsCount > maxMatched) {
      maxMatched = c.matchedItemsCount;
    }
  }

  final maxCoverageCandidates = candidates
      .where((c) => c.matchedItemsCount == maxMatched)
      .toList();

  if (maxCoverageCandidates.isEmpty) return null;

  // Find the cheapest store with maximum coverage
  maxCoverageCandidates.sort((a, b) => a.totalPrice.compareTo(b.totalPrice));
  final bestCheapest = maxCoverageCandidates.first;

  // Find the nearest store with maximum coverage (if location exists)
  CartStoreSuggestion? nearest;
  if (userLoc != null) {
    final withDistance = maxCoverageCandidates
        .where((c) => c.distanceKm != null)
        .toList();
    if (withDistance.isNotEmpty) {
      withDistance.sort((a, b) => a.distanceKm!.compareTo(b.distanceKm!));
      nearest = withDistance.first;
    }
  }

  return CartSuggestionResult(
    bestCheapestStore: bestCheapest,
    nearestStore: nearest,
    totalCartItems: cartItems.length,
    hasFullCoverage: maxMatched == cartItems.length,
  );
});
