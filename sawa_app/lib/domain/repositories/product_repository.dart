import '../entities/product.dart';
import '../entities/price_info.dart';
import 'package:image_picker/image_picker.dart';

abstract class ProductRepository {
  Future<Product> getProductByGtin(String gtin);
  Future<Product> scanLabel(String base64Image, {String? gtin});
  Future<List<PriceInfo>> getLatestPrices(String gtin);
  Future<List<PriceInfo>> getPriceHistory(String gtin);
  Future<List<Product>> searchProducts(String query);
  Future<Map<String, String>> uploadReportImages(
    String gtin,
    Map<String, XFile> photos,
  );
  Future<bool> submitProductReport(
    String gtin,
    Map<String, dynamic> payload, {
    Map<String, String>? imageUrls,
    Map<String, XFile>? photos,
  });

  Future<void> clearProductCache(String gtin);
}

