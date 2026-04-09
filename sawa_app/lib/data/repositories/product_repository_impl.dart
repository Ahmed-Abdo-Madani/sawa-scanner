import '../../domain/entities/product.dart';
import '../../domain/repositories/product_repository.dart';
import '../datasources/product_remote_data_source.dart';

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
}
