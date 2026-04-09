import '../entities/product.dart';

abstract class ProductRepository {
  Future<Product> getProductByGtin(String gtin);
  Future<Product> scanLabel(String base64Image, {String? gtin});
}
