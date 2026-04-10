import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/price_info.dart';
import 'product_provider.dart';

final isSawaPlusProvider = StateProvider<bool>((ref) => false);

final latestPricesProvider = FutureProvider.family<List<PriceInfo>, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getLatestPrices(gtin);
});

final priceHistoryProvider = FutureProvider.family<List<PriceInfo>, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getPriceHistory(gtin);
});
