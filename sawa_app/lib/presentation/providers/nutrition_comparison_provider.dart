import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'product_provider.dart';

/// Provider for nutrition analysis data.
final nutritionAnalysisProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getNutritionAnalysis(gtin);
});

/// Provider for similar products.
final similarProductsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>(
        (ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getSimilarProducts(gtin, limit: 10);
});

/// Provider for comparison result between two products.
/// Input is a record of two GTINs: (gtinA, gtinB)
final comparisonProvider = FutureProvider.family<Map<String, dynamic>,
    ({String gtinA, String gtinB})>((ref, params) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getComparison(params.gtinA, params.gtinB);
});
