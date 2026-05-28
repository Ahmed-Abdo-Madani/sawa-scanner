class IapConfig {
  IapConfig._();

  /// Product ID for the Sawa Plus monthly subscription.
  static const String subscriptionProductId = String.fromEnvironment(
    'SawaPlusProductId',
    defaultValue: 'sawaplus',
  );
}
