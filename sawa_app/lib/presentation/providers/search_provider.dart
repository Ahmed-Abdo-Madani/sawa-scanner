import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../domain/entities/product.dart';
import './product_provider.dart';

final searchQueryProvider = StateProvider<String>((ref) => '');

final searchResultsProvider = FutureProvider<List<Product>>((ref) async {
  final query = ref.watch(searchQueryProvider);
  if (query.isEmpty) {
    return [];
  }
  
  // Wait for a short debounce period if needed, 
  // but usually Riverpod handles this better via query changes.
  // The UI will handle the actual debounce timer for the provider update.
  
  final repository = ref.watch(productRepositoryProvider);
  return await repository.searchProducts(query);
});
