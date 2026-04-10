import 'dart:convert';
import 'package:http/http.dart' as http;
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
      } else if (response.statusCode == 400) {
        throw ServerException('Invalid label data: ${response.body}');
      } else {
        throw ServerException('Failed to scan label: ${response.statusCode}');
      }
    } catch (e) {
      if (e is ServerException) rethrow;
      throw ServerException(e.toString());
    }
  }

  Future<List<PriceInfoModel>> fetchLatestPrices(String gtin) async {
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
}
