import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:firebase_auth/firebase_auth.dart';
import '../../data/datasources/auth_data_source.dart';

import 'package:http/http.dart' as http;
import '../../data/datasources/authed_http_client.dart';
import '../../data/datasources/admin_product_remote_data_source.dart';
import 'product_provider.dart';

final authDataSourceProvider = Provider<AuthDataSource>((ref) {
  return AuthDataSource();
});

final currentUserProvider = StreamProvider<User?>((ref) {
  return ref.watch(authDataSourceProvider).userChanges();
});

final isAdminProvider = FutureProvider<bool>((ref) async {
  final user = ref.watch(currentUserProvider).value;
  if (user == null) return false;
  
  final authDataSource = ref.watch(authDataSourceProvider);
  return await authDataSource.isAdmin(forceRefresh: true);
});

final authedHttpClientProvider = Provider<AuthedHttpClient>((ref) {
  final authDataSource = ref.watch(authDataSourceProvider);
  final client = ref.watch(httpClientProvider);
  return AuthedHttpClient(
    client: client,
    tokenProvider: () => authDataSource.getIdToken(),
  );
});

final adminProductDataSourceProvider = Provider<AdminProductRemoteDataSource>((ref) {
  final authedClient = ref.watch(authedHttpClientProvider);
  return AdminProductRemoteDataSource(authedClient: authedClient);
});
