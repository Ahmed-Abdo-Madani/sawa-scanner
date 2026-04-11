import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'app.dart';

import 'presentation/providers/locale_provider.dart';
import 'presentation/providers/user_preferences_provider.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Hive.initFlutter();
  await Hive.openBox('scanHistoryBox');
  final prefBox = await Hive.openBox(UserPreferencesKeys.boxName);
  final settings = prefBox.get(UserPreferencesKeys.settingsRecord);
  
  bool isFirstLaunch = true;
  String initialLocale = UserPreferencesKeys.defaultLocale;
  
  if (settings != null && settings is Map) {
    isFirstLaunch = settings[UserPreferencesKeys.fieldIsFirstLaunch] ?? true;
    initialLocale  = settings[UserPreferencesKeys.fieldPreferredLocale]
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
