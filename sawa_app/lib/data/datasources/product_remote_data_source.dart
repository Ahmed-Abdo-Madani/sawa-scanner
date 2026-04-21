import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import 'package:image_picker/image_picker.dart';
import '../../core/api_config.dart';
import '../../core/exceptions.dart';
import '../models/product_model.dart';

class ProductRemoteDataSource {
  final http.Client client;
  final String baseUrl;

  ProductRemoteDataSource({
    required this.client,
    this.baseUrl = ApiConfig.baseUrl,
  });

  Future<ProductModel> fetchProductByGtin(String gtin) async {
    ApiConfig.validate();
    try {

      final response = await client.get(
        Uri.parse('$baseUrl/products/$gtin'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        return ProductModel.fromJson(json.decode(response.body));
      } else if (response.statusCode == 404) {
        throw ProductNotFoundException();
      } else {
        throw ServerException('Failed to fetch product: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ProductNotFoundException || e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  Future<ProductModel> scanLabel(String base64Image, {String? gtin}) async {
    ApiConfig.validate();
    try {

      final response = await client.post(
        Uri.parse('$baseUrl/scan/label'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode({
          'image': base64Image,
          if (gtin != null) 'gtin': gtin,
        }),
      );

      if (response.statusCode == 201 || response.statusCode == 200) {
        return ProductModel.fromJson(json.decode(response.body));
      } else {
        String message = response.body;
        Map<String, dynamic> decoded = {};
        try {
          decoded = json.decode(response.body);
          if (decoded['message'] != null) {
            message = decoded['message'].toString();
          }
        } catch (_) {}
        
        if (response.statusCode == 422) {
          throw PartialScanException(
            message: message,
            rawOcrText: decoded['rawOcrText']?.toString(),
            failedStage: decoded['failedStage']?.toString(),
            retryable: decoded['retryable'] as bool? ?? true,
          );
        } else if (response.statusCode == 400) {
          throw ServerException('Invalid label data: $message');
        } else if (response.statusCode == 503) {
          throw ServerException(message);
        } else {
          throw ServerException('Failed to scan label: $message');
        }
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  Future<List<PriceInfoModel>> fetchLatestPrices(String gtin) async {
    ApiConfig.validate();
    try {

      final response = await client.get(
        Uri.parse('$baseUrl/products/$gtin/prices'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((e) => PriceInfoModel.fromJson(e)).toList();
      } else {
        throw ServerException('Failed to fetch prices: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  Future<List<PriceInfoModel>> fetchPriceHistory(String gtin) async {
    ApiConfig.validate();
    try {

      final response = await client.get(
        Uri.parse('$baseUrl/products/$gtin/prices/history'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.map((e) => PriceInfoModel.fromJson(e)).toList();
      } else {
        throw ServerException('Failed to fetch price history: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Step 1: Upload selected photo slots for a product report.
  ///
  /// Sends a `multipart/form-data` POST to `POST /products/:gtin/reports/images`.
  /// [photos] is a map of slot name (`'front'`, `'ingredients'`, `'nutrition'`)
  /// to the corresponding [XFile]. Returns a map of slot → server-side URL/data-URL
  /// written into the report payload. Throws [ServerException] on failure.
  Future<Map<String, String>> uploadReportImages(
    String gtin,
    Map<String, XFile> photos,
  ) async {
    ApiConfig.validate();
    try {

      final uri = Uri.parse('$baseUrl/products/$gtin/reports/images');
      final request = http.MultipartRequest('POST', uri);

      for (final entry in photos.entries) {
        final bytes = await entry.value.readAsBytes();
        final mimeType = entry.value.mimeType ?? 'image/jpeg';
        request.files.add(
          http.MultipartFile.fromBytes(
            entry.key, // field name: 'front' | 'ingredients' | 'nutrition'
            bytes,
            filename: '${entry.key}.jpg',
            contentType: MediaType.parse(mimeType),
          ),
        );
      }

      final streamed = await request.send();
      final response = await http.Response.fromStream(streamed);

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = json.decode(response.body) as Map<String, dynamic>;
        final images = data['images'] as Map<String, dynamic>? ?? {};
        return images.map((k, v) => MapEntry(k, v as String));
      } else {
        throw ServerException('Failed to upload images: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Step 2: Submit the product correction report.
  ///
  /// [payload] carries structured text fields (name_ar, name_en, brand,
  /// nutrition, ingredients_text). [imageUrls] is the optional map returned
  /// by [uploadReportImages] and is embedded under the `images` key so the
  /// backend's jsonb column stores only lightweight URL references, not raw
  /// binary data.
  Future<bool> submitProductReport(
    String gtin,
    Map<String, dynamic> payload, {
    Map<String, String>? imageUrls,
  }) async {
    ApiConfig.validate();
    try {

      final body = Map<String, dynamic>.from(payload);
      if (imageUrls != null && imageUrls.isNotEmpty) {
        body['images'] = imageUrls;
      }

      final response = await client.post(
        Uri.parse('$baseUrl/products/$gtin/reports'),
        headers: {'Content-Type': 'application/json'},
        body: json.encode(body),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return true;
      } else {
        throw ServerException('Failed to submit report: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Fetch store-scoped prices for a product in a specific city.
  Future<List<Map<String, dynamic>>> fetchPricesByStore(
    String gtin,
    String citySlug, {
    String? districtSlug,
  }) async {
    ApiConfig.validate();
    try {
      final queryParams = {
        'city': citySlug,
        if (districtSlug != null) 'district': districtSlug,
      };

      final uri = Uri.parse('$baseUrl/products/$gtin/prices/by-store')
          .replace(queryParameters: queryParams);

      final response = await client.get(
        uri,
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.cast<Map<String, dynamic>>();
      } else if (response.statusCode == 404) {
        return [];
      } else {
        throw ServerException(
            'Failed to fetch store prices: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Fetch full nutrition analysis for a product.
  Future<Map<String, dynamic>> fetchNutritionAnalysis(
    String gtin, {
    List<String>? userAllergens,
  }) async {
    ApiConfig.validate();
    try {
      final queryParams = <String, String>{};
      if (userAllergens != null && userAllergens.isNotEmpty) {
        queryParams['allergens'] = userAllergens.join(',');
      }

      final uri = Uri.parse('$baseUrl/products/$gtin/nutrition')
          .replace(queryParameters: queryParams.isNotEmpty ? queryParams : null);

      final response = await client.get(
        uri,
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        return json.decode(response.body) as Map<String, dynamic>;
      } else if (response.statusCode == 404) {
        throw ProductNotFoundException();
      } else {
        throw ServerException(
            'Failed to fetch nutrition: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Fetch similar products for comparison.
  Future<List<Map<String, dynamic>>> fetchSimilarProducts(
    String gtin, {
    int limit = 10,
  }) async {
    ApiConfig.validate();
    try {
      final uri = Uri.parse('$baseUrl/products/$gtin/similar')
          .replace(queryParameters: {'limit': limit.toString()});

      final response = await client.get(
        uri,
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        return data.cast<Map<String, dynamic>>();
      } else if (response.statusCode == 404) {
        return [];
      } else {
        throw ServerException(
            'Failed to fetch similar products: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  /// Fetch side-by-side comparison of two products.
  Future<Map<String, dynamic>> fetchComparison(
    String gtinA,
    String gtinB,
  ) async {
    ApiConfig.validate();
    try {
      final uri = Uri.parse('$baseUrl/comparison').replace(
        queryParameters: {'gtinA': gtinA, 'gtinB': gtinB},
      );

      final response = await client.get(
        uri,
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode == 200) {
        return json.decode(response.body) as Map<String, dynamic>;
      } else if (response.statusCode == 404) {
        throw ProductNotFoundException();
      } else {
        throw ServerException(
            'Failed to fetch comparison: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }
}
