import 'exceptions.dart';

class ApiConfig {
  /// Base URL for the Sawa API.
  /// 
  /// To override this for Android emulators during development:
  /// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://above-sidonnie-madnaloyalty-71f491c4.koyeb.app',
  );

  /// AI model to use for client-side recognition.
  static const String aiModel = String.fromEnvironment(
    'AI_MODEL',
    defaultValue: 'gemini-2.5-flash',
  );

  /// Raw development admin secret from environment.
  /// Use [devAdminSecret] for the normalized nullable value.
  static const String _rawDevAdminSecret = String.fromEnvironment(
    'DEV_ADMIN_SECRET',
  );

  /// Development admin secret for local bypass of Firebase auth.
  /// 
  /// To enable: flutter run --dart-define=DEV_ADMIN_SECRET=your-secret
  /// When set, the app will send the secret via x-dev-admin-secret header.
  static String? get devAdminSecret {
    final s = _rawDevAdminSecret;
    if (s.isEmpty) return null;
    return s;
  }

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
