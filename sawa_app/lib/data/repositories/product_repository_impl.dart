import '../../domain/entities/product.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/repositories/product_repository.dart';
import '../../core/exceptions.dart';
import '../datasources/product_remote_data_source.dart';
import '../datasources/openfoodfacts_data_source.dart';
import '../datasources/product_local_data_source.dart';
import '../models/product_model.dart';
import 'package:image_picker/image_picker.dart';

class ProductRepositoryImpl implements ProductRepository {
  final ProductRemoteDataSource remoteDataSource;
  final OpenFoodFactsDataSource openFoodFactsDataSource;
  final ProductLocalDataSource localDataSource;

  static const Duration _cacheTtl = Duration(hours: 24);

  ProductRepositoryImpl({
    required this.remoteDataSource,
    required this.openFoodFactsDataSource,
    required this.localDataSource,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: normalise any ProductModel (and its nested models) into plain
  // base entities before writing to Hive.  Hive's registered adapters cover
  // only the base types, so writing a subtype raises an unregistered adapter
  // error at runtime.
  // ─────────────────────────────────────────────────────────────────────────
  Product _toEntity(Product product) {
    return product is ProductModel ? product.toEntity() : product;
  }

  @override
  Future<Product> getProductByGtin(String gtin) async {
    // Tier 1 ── Hive cache (fresh).
    final cached = localDataSource.getCachedProduct(gtin);
    if (cached != null && !localDataSource.isExpired(gtin, _cacheTtl)) {
      return cached;
    }

    // Track whether each remote definitively said "not found".
    bool sawaNotFound = false;
    bool offNotFound = false;

    // Track specific failures to provide granular diagnostic feedback.
    Object? sawaError;
    Object? offError;


    // Tier 2 ── Sawa remote API.
    try {
      final product = await remoteDataSource.fetchProductByGtin(gtin);
      final entity = _toEntity(product);
      await localDataSource.cacheProduct(entity);
      return entity;
    } on ProductNotFoundException {
      sawaNotFound = true;
    } catch (e) {
      // Record the primary failure (likely a BackendUnavailableException-equivalent)
      sawaError = e;
    }

    // Tier 3 ── OpenFoodFacts fallback.
    try {
      final offProduct =
          await openFoodFactsDataSource.getProductByBarcode(gtin);
      if (offProduct != null) {
        final entity = _toEntity(offProduct);
        await localDataSource.cacheProduct(entity);
        return entity;
      }
      offNotFound = true;
    } on FallbackConfigurationException catch (e) {
      offError = e;
    } catch (e) {
      offError = FallbackUnavailableException(e.toString());
    }

    // Tier 4 ── Stale cache (graceful degradation).
    if (cached != null) {
      return cached;
    }

    // Reachable if both failed or were not found.
    if (sawaNotFound && offNotFound) {
      throw ProductNotFoundException('Product not found for GTIN: $gtin');
    }

    // If we're here, we failed to fulfill the request. Distinguish why.
    if (offError is FallbackConfigurationException) {
      throw offError;
    }
    
    // If the primary failed but the fallback didn't have the product (offNotFound),
    // then the ultimate reason the user didn't get results was the backend failure.
    if (sawaError != null) {
      throw BackendUnavailableException(sawaError.toString());
    }

    if (offError != null) {
      throw FallbackUnavailableException(offError.toString());
    }

    throw ServerException('Unable to retrieve product for GTIN: $gtin');

  }


  @override
  Future<void> clearProductCache(String gtin) async {
    await localDataSource.clearProduct(gtin);
  }

  @override
  Future<Product> scanLabel(String base64Image, {String? gtin}) async {
    final product = await remoteDataSource.scanLabel(base64Image, gtin: gtin);
    // Cache the scan result so it is available offline later.
    final entity = _toEntity(product);
    await localDataSource.cacheProduct(entity);
    return entity;
  }

  @override
  Future<List<PriceInfoModel>> getLatestPrices(String gtin) {
    return remoteDataSource.fetchLatestPrices(gtin);
  }

  @override
  Future<List<PriceInfoModel>> getPriceHistory(String gtin) {
    return remoteDataSource.fetchPriceHistory(gtin);
  }

  @override
  Future<List<Product>> searchProducts(String query) {
    return openFoodFactsDataSource.searchProducts(query);
  }

  @override
  Future<Map<String, String>> uploadReportImages(
    String gtin,
    Map<String, XFile> photos,
  ) {
    return remoteDataSource.uploadReportImages(gtin, photos);
  }

  @override
  Future<bool> submitProductReport(
    String gtin,
    Map<String, dynamic> payload, {
    Map<String, String>? imageUrls,
    Map<String, XFile>? photos,
  }) async {
    // 1. Submit to Sawa (Primary)
    final success = await remoteDataSource.submitProductReport(
      gtin,
      payload,
      imageUrls: imageUrls,
    );

    // 2. Submit to OpenFoodFacts (Secondary/Sync)
    // If Sawa succeeds, sync to OFF global database (metadata always, images if present).
    if (success) {
      // photos may be null or empty; contributeProduct handles empty maps gracefully.
      await openFoodFactsDataSource.contributeProduct(
          gtin, payload, photos ?? {});
    }


    return success;
  }

}
