import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'app.dart';
import 'package:openfoodfacts/openfoodfacts.dart' show OpenFoodAPIConfiguration, UserAgent;
import 'firebase_options.dart';



import 'data/datasources/product_local_data_source.dart';
import 'domain/entities/product.dart';
import 'presentation/providers/locale_provider.dart';
import 'presentation/providers/user_preferences_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize Firebase
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  
  // Authenticate anonymously on startup if not already logged in
  try {
    final auth = FirebaseAuth.instance;
    if (auth.currentUser == null) {
      await auth.signInAnonymously();
      debugPrint('Signed in anonymously: ${auth.currentUser?.uid}');
    }
  } catch (e) {
    debugPrint('Firebase anonymous authentication failed on startup: $e');
  }
  
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
  await Hive.openBox('cartBox');
  await Hive.openBox<Product>(ProductLocalDataSource.productsBoxName);
  await Hive.openBox<DateTime>(ProductLocalDataSource.timestampsBoxName);
  await Hive.openBox<int>(ProductLocalDataSource.cacheVersionBoxName);
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
