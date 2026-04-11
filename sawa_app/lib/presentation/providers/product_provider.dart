import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../data/datasources/product_remote_data_source.dart';
import '../../data/datasources/openfoodfacts_data_source.dart';
import '../../data/repositories/product_repository_impl.dart';
import '../../domain/entities/product.dart';
import '../../domain/repositories/product_repository.dart';

final httpClientProvider = Provider((ref) => http.Client());

final productRemoteDataSourceProvider = Provider((ref) {
  final client = ref.watch(httpClientProvider);
  return ProductRemoteDataSource(client: client);
});

final openFoodFactsDataSourceProvider = Provider((ref) => OpenFoodFactsDataSource());

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  final remoteDataSource = ref.watch(productRemoteDataSourceProvider);
  final openFoodFactsDataSource = ref.watch(openFoodFactsDataSourceProvider);
  return ProductRepositoryImpl(
    remoteDataSource: remoteDataSource,
    openFoodFactsDataSource: openFoodFactsDataSource,
  );
});

final productByGtinProvider = FutureProvider.family<Product, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getProductByGtin(gtin);
});
