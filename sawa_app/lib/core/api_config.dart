class ApiConfig {
  /// Base URL for the Sawa API.
  /// 
  /// To override this for Android emulators during development:
  /// flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000
  static const String baseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://192.168.8.114:3000',
  );
}
