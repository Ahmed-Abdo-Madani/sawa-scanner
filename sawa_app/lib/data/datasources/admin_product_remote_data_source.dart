import 'dart:convert';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../../core/api_config.dart';
import '../../core/exceptions.dart';
import '../models/admin_product_dto.dart';
import 'authed_http_client.dart';

class AdminProductRemoteDataSource {
  final AuthedHttpClient _authedClient;
  final String _baseUrl;

  AdminProductRemoteDataSource({
    required AuthedHttpClient authedClient,
    String? baseUrl,
  })  : _authedClient = authedClient,
        _baseUrl = baseUrl ?? ApiConfig.baseUrl;

  Future<AdminProductDto?> getByGtin(String gtin) async {
    final response = await _authedClient.get(Uri.parse('$_baseUrl/admin/products/$gtin'));
    if (response.statusCode == 404) return null;
    if (response.statusCode != 200) throw ServerException('Failed to fetch product');
    return AdminProductDto.fromJson(jsonDecode(response.body));
  }

  Future<AdminProductDto> upsert(AdminUpsertProductDto dto) async {
    final response = await _authedClient.post(
      Uri.parse('$_baseUrl/admin/products/upsert'),
      body: dto.toJson(),
    );
    if (response.statusCode != 200 && response.statusCode != 201) {
      throw ServerException('Failed to upsert product');
    }
    return AdminProductDto.fromJson(jsonDecode(response.body));
  }

  Future<void> assignGtin(String productId, String newGtin) async {
    final response = await _authedClient.patch(
      Uri.parse('$_baseUrl/admin/products/$productId/assign-gtin'),
      body: {'gtin': newGtin},
    );
    if (response.statusCode != 200) throw ServerException('Failed to assign GTIN');
  }

  Future<AdminProductDto> uploadProductImages(String productId, Map<String, XFile> photos) async {
    final uri = Uri.parse('$_baseUrl/admin/products/$productId/images');
    final request = http.MultipartRequest('POST', uri);

    for (final entry in photos.entries) {
      final bytes = await entry.value.readAsBytes();
      request.files.add(http.MultipartFile.fromBytes(
        entry.key,
        bytes,
        filename: entry.value.name,
        contentType: MediaType('image', 'jpeg'),
      ));
    }

    final response = await _authedClient.multipartSend(request);
    final responseBody = await response.stream.bytesToString();

    if (response.statusCode != 200) throw ServerException('Failed to upload images');
    return AdminProductDto.fromJson(jsonDecode(responseBody));
  }

  Future<List<AdminMissingGtinSummary>> listMissingGtin({
    int page = 1,
    int pageSize = 20,
    String? search,
  }) async {
    final queryParams = {
      'missingGtin': 'true',
      'page': page.toString(),
      'pageSize': pageSize.toString(),
      if (search != null && search.isNotEmpty) 'search': search,
    };
    final uri = Uri.parse('$_baseUrl/admin/products').replace(queryParameters: queryParams);
    final response = await _authedClient.get(uri);

    if (response.statusCode != 200) throw ServerException('Failed to list missing GTINs');
    final List list = jsonDecode(response.body);
    return list.map((e) => AdminMissingGtinSummary.fromJson(e)).toList();
  }
}
