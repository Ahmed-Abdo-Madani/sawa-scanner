import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../core/api_config.dart';
import '../../core/exceptions.dart';

class AuthedHttpClient {
  final http.Client _client;
  final Future<String?> Function() _tokenProvider;
  final Duration _timeout;

  AuthedHttpClient({
    required http.Client client,
    required Future<String?> Function() tokenProvider,
    Duration timeout = const Duration(seconds: 15),
  })  : _client = client,
        _tokenProvider = tokenProvider,
        _timeout = timeout;

  Future<Map<String, String>> _getHeaders(Map<String, String>? baseHeaders) async {
    final token = await _tokenProvider();
    final headers = <String, String>{
      'Content-Type': 'application/json',
      'bypass-tunnel-reminder': 'true',
      'ngrok-skip-browser-warning': 'true',
      ...?baseHeaders,
    };
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    // Add dev admin secret header if configured
    if (ApiConfig.devAdminSecret != null) {
      headers['x-dev-admin-secret'] = ApiConfig.devAdminSecret!;
    }
    return headers;
  }

  Future<http.Response> get(Uri url, {Map<String, String>? headers}) async {
    final finalHeaders = await _getHeaders(headers);
    try {
      return await _client.get(url, headers: finalHeaders).timeout(_timeout);
    } on TimeoutException {
      throw NetworkTimeoutException();
    }
  }

  Future<http.Response> post(Uri url, {Map<String, String>? headers, Object? body}) async {
    final finalHeaders = await _getHeaders(headers);
    try {
      return await _client.post(url, headers: finalHeaders, body: jsonEncode(body)).timeout(_timeout);
    } on TimeoutException {
      throw NetworkTimeoutException();
    }
  }

  Future<http.Response> patch(Uri url, {Map<String, String>? headers, Object? body}) async {
    final finalHeaders = await _getHeaders(headers);
    try {
      return await _client.patch(url, headers: finalHeaders, body: jsonEncode(body)).timeout(_timeout);
    } on TimeoutException {
      throw NetworkTimeoutException();
    }
  }

  Future<http.StreamedResponse> multipartSend(http.MultipartRequest request) async {
    final token = await _tokenProvider();
    request.headers['bypass-tunnel-reminder'] = 'true';
    request.headers['ngrok-skip-browser-warning'] = 'true';
    if (token != null) {
      request.headers['Authorization'] = 'Bearer $token';
    }
    // Add dev admin secret header for multipart requests if configured
    if (ApiConfig.devAdminSecret != null) {
      request.headers['x-dev-admin-secret'] = ApiConfig.devAdminSecret!;
    }
    try {
      return await _client.send(request).timeout(_timeout);
    } on TimeoutException {
      throw NetworkTimeoutException();
    }
  }
}
