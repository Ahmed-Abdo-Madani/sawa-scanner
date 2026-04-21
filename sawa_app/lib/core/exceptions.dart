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

/// Thrown when the Sawa primary backend is unreachable or returns a 5xx error.
class BackendUnavailableException implements Exception {
  final String message;
  BackendUnavailableException([this.message = 'Sawa service is temporarily unavailable']);

  @override
  String toString() => 'BackendUnavailableException: $message';
}

/// Thrown when the OpenFoodFacts fallback API fails or returns an error.
class FallbackUnavailableException implements Exception {
  final String message;
  FallbackUnavailableException([this.message = 'Global database access failed']);

  @override
  String toString() => 'FallbackUnavailableException: $message';
}

/// Thrown when the client-side configuration (e.g. User-Agent) is missing or invalid.
class FallbackConfigurationException implements Exception {
  final String message;
  FallbackConfigurationException([this.message = 'App configuration error']);

  @override
  String toString() => 'FallbackConfigurationException: $message';
}
/// Thrown when the Sawa API base URL is missing or malformed.
class ApiConfigurationException implements Exception {
  final String message;
  ApiConfigurationException([this.message = 'Sawa API configuration error']);

  @override
  String toString() => 'ApiConfigurationException: $message';
}

/// Thrown when OCR succeeds but label structuring fails (HTTP 422).
class PartialScanException implements Exception {
  final String message;
  final String? rawOcrText;
  final String? failedStage;
  final bool retryable;

  PartialScanException({
    this.message = 'Failed to structure the label data',
    this.rawOcrText,
    this.failedStage,
    this.retryable = true,
  });

  @override
  String toString() => 'PartialScanException: $message';
}
