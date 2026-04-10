import '../../domain/entities/product.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/repositories/product_repository.dart';
import '../datasources/product_remote_data_source.dart';
import '../models/product_model.dart';

class ProductRepositoryImpl implements ProductRepository {
  final ProductRemoteDataSource remoteDataSource;

  ProductRepositoryImpl({required this.remoteDataSource});

  @override
  Future<Product> getProductByGtin(String gtin) {
    return remoteDataSource.fetchProductByGtin(gtin);
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
}
