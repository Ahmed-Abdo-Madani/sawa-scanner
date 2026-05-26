import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../data/datasources/product_remote_data_source.dart';
import '../../data/datasources/openfoodfacts_data_source.dart';
import '../../data/datasources/product_local_data_source.dart';
import '../../data/repositories/product_repository_impl.dart';
import '../../domain/entities/product.dart';
import '../../domain/repositories/product_repository.dart';
import 'dart:io' show Platform, HttpClient, X509Certificate;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:http/io_client.dart' show IOClient;
import '../../data/datasources/firebase_ai_data_source.dart';

final httpClientProvider = Provider<http.Client>((ref) {
  if (kIsWeb) {
    return http.Client();
  }
  final ioClient = HttpClient()
    ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  return IOClient(ioClient);
});

final productRemoteDataSourceProvider = Provider((ref) {
  final client = ref.watch(httpClientProvider);
  return ProductRemoteDataSource(client: client);
});

final openFoodFactsDataSourceProvider = Provider((ref) => OpenFoodFactsDataSource());

final productLocalDataSourceProvider = Provider((ref) => ProductLocalDataSource());

final firebaseAiDataSourceProvider = Provider<FirebaseAiDataSource>((ref) {
  final isSupported = kIsWeb || Platform.isAndroid || Platform.isIOS || Platform.isMacOS;
  return isSupported ? FirebaseAiDataSource() : NoOpFirebaseAiDataSource();
});

final productRepositoryProvider = Provider<ProductRepository>((ref) {
  final remoteDataSource = ref.watch(productRemoteDataSourceProvider);
  final openFoodFactsDataSource = ref.watch(openFoodFactsDataSourceProvider);
  final localDataSource = ref.watch(productLocalDataSourceProvider);
  final firebaseAiDataSource = ref.watch(firebaseAiDataSourceProvider);
  return ProductRepositoryImpl(
    remoteDataSource: remoteDataSource,
    openFoodFactsDataSource: openFoodFactsDataSource,
    localDataSource: localDataSource,
    firebaseAiDataSource: firebaseAiDataSource,
  );
});

final productByGtinProvider = FutureProvider.family<Product, String>((ref, gtin) async {
  final repository = ref.watch(productRepositoryProvider);
  return repository.getProductByGtin(gtin);
});
