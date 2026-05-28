import 'dart:convert';
import '../../core/api_config.dart';
import '../../core/exceptions.dart';
import 'authed_http_client.dart';

class BillingRemoteDataSource {
  final AuthedHttpClient authedClient;
  final String baseUrl;

  BillingRemoteDataSource({
    required this.authedClient,
    this.baseUrl = ApiConfig.baseUrl,
  });

  /// Requests the unique subscription UUID account token for the authenticated user.
  Future<String> getOrCreateAccountToken() async {
    final url = Uri.parse('$baseUrl/billing/account-token');
    final response = await authedClient.post(url);

    if (response.statusCode == 201 || response.statusCode == 200) {
      final data = jsonDecode(response.body);
      return data['accountToken'] as String;
    } else {
      throw ServerException('Failed to retrieve billing account token: ${response.statusCode}');
    }
  }
}
