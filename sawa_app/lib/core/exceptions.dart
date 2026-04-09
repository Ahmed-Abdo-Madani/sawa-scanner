class ServerException implements Exception {
  final String message;
  ServerException([this.message = 'An unexpected server error occurred']);

  @override
  String toString() => 'ServerException: $message';
}

class ProductNotFoundException implements Exception {
  final String message;
  ProductNotFoundException([this.message = 'Product not found']);

  @override
  String toString() => 'ProductNotFoundException: $message';
}
