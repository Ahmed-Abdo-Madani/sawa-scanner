import '../entities/product.dart';
import '../entities/price_info.dart';
import 'package:image_picker/image_picker.dart';

abstract class ProductRepository {
  Future<Product> getProductByGtin(String gtin);
  Future<Product> scanLabel(List<int> imageBytes, {String? gtin, String? imagePath});
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

  /// Fetch nutrition analysis for a product.
  Future<Map<String, dynamic>> getNutritionAnalysis(
    String gtin, {
    List<String>? userAllergens,
  });

  /// Fetch similar products for comparison.
  Future<List<Map<String, dynamic>>> getSimilarProducts(
    String gtin, {
    int limit = 10,
  });

  /// Side-by-side comparison of two products.
  Future<Map<String, dynamic>> getComparison(String gtinA, String gtinB);

  /// Fetch store-scoped prices for a product in a city.
  Future<List<PriceInfo>> getPricesByStore(
    String gtin,
    String citySlug, {
    String? districtSlug,
  });
}

