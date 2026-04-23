import 'exceptions.dart';

class ApiConfig {
  /// Base URL for the Sawa API.
  /// 
  /// To override this for Android emulators during development:
  /// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    // No default value here; forces explicit configuration for development
  );

  /// AI model to use for client-side recognition.
  static const String aiModel = String.fromEnvironment(
    'AI_MODEL',
    defaultValue: 'gemini-2.5-flash',
  );

  /// Validates that the API base URL is non-empty.
  /// Throws [ApiConfigurationException] if validation fails.
  static void validate() {
    if (baseUrl.trim().isEmpty) {
      throw ApiConfigurationException(
        'Sawa API base URL is not configured. '
        'Please build with --dart-define=API_BASE_URL=...'
      );
    }
  }
}
