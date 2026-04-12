import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'app.dart';
import 'package:openfoodfacts/openfoodfacts.dart' show OpenFoodAPIConfiguration, UserAgent;



import 'data/datasources/product_local_data_source.dart';
import 'domain/entities/product.dart';
import 'presentation/providers/locale_provider.dart';
import 'presentation/providers/user_preferences_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Configure OpenFoodFacts globally
  OpenFoodAPIConfiguration.userAgent = UserAgent(
    name: 'Sawa-Scanner',
    url: 'https://github.com/Ahmed-Abdo-Madani/sawa-scanner',
  );

  await Hive.initFlutter();


  // Register TypeAdapters before opening boxes.
  Hive.registerAdapter(IngredientSfdaStatusAdapter());
  Hive.registerAdapter(NutritionFactAdapter());
  Hive.registerAdapter(IngredientAdapter());
  Hive.registerAdapter(PriceInfoAdapter());
  Hive.registerAdapter(ProductImageAdapter());
  Hive.registerAdapter(ProductAdapter());

  // Open all boxes.
  await Hive.openBox('scanHistoryBox');
  await Hive.openBox<Product>(ProductLocalDataSource.productsBoxName);
  await Hive.openBox<DateTime>(ProductLocalDataSource.timestampsBoxName);
  final prefBox = await Hive.openBox(UserPreferencesKeys.boxName);
  final settings = prefBox.get(UserPreferencesKeys.settingsRecord);

  bool isFirstLaunch = true;
  String initialLocale = UserPreferencesKeys.defaultLocale;

  if (settings != null && settings is Map) {
    isFirstLaunch = settings[UserPreferencesKeys.fieldIsFirstLaunch] ?? true;
    initialLocale = settings[UserPreferencesKeys.fieldPreferredLocale]
        ?? UserPreferencesKeys.defaultLocale;
  }

  runApp(
    ProviderScope(
      overrides: [
        localeProvider.overrideWith((ref) => LocaleNotifier(initialLocale)),
      ],
      child: SawaApp(isFirstLaunch: isFirstLaunch),
    ),
  );
}
