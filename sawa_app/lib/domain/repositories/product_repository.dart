import '../entities/product.dart';
import '../entities/price_info.dart';

abstract class ProductRepository {
  Future<Product> getProductByGtin(String gtin);
  Future<Product> scanLabel(String base64Image, {String? gtin});
  Future<List<PriceInfo>> getLatestPrices(String gtin);
  Future<List<PriceInfo>> getPriceHistory(String gtin);
  Future<List<Product>> searchProducts(String query);
}
