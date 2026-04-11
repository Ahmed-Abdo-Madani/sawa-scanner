import '../../domain/entities/product.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/repositories/product_repository.dart';
import '../../core/exceptions.dart';
import '../datasources/product_remote_data_source.dart';
import '../datasources/openfoodfacts_data_source.dart';
import '../models/product_model.dart';

class ProductRepositoryImpl implements ProductRepository {
  final ProductRemoteDataSource remoteDataSource;
  final OpenFoodFactsDataSource openFoodFactsDataSource;

  ProductRepositoryImpl({
    required this.remoteDataSource,
    required this.openFoodFactsDataSource,
  });

  @override
  Future<Product> getProductByGtin(String gtin) async {
    try {
      return await remoteDataSource.fetchProductByGtin(gtin);
    } on ProductNotFoundException {
      final offProduct = await openFoodFactsDataSource.getProductByBarcode(gtin);
      if (offProduct != null) return offProduct;
      rethrow;
    }
  }

  @override
  Future<Product> scanLabel(String base64Image, {String? gtin}) async {
    return await remoteDataSource.scanLabel(base64Image, gtin: gtin);
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
}
