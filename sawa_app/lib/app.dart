import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';

import 'core/theme/app_theme.dart';
import 'presentation/providers/locale_provider.dart';
import 'presentation/providers/user_preferences_provider.dart';
import 'presentation/screens/navigation_shell.dart';

import 'presentation/screens/onboarding/onboarding_screen.dart';
import 'presentation/screens/splash/splash_screen.dart';

class SawaApp extends ConsumerStatefulWidget {
  final bool isFirstLaunch;
  const SawaApp({super.key, required this.isFirstLaunch});

  @override
  ConsumerState<SawaApp> createState() => _SawaAppState();
}

class _SawaAppState extends ConsumerState<SawaApp> {
  late bool _showOnboarding;
  bool _showSplash = true;
  late final AppLifecycleListener _lifecycleListener;

  @override
  void initState() {
    super.initState();
    _lifecycleListener = AppLifecycleListener(
      onStateChange: (state) {
        if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
          _handleLifecyclePersistence();
        }
      },
    );
    _showOnboarding = widget.isFirstLaunch;
  }

  @override
  void dispose() {
    _lifecycleListener.dispose();
    super.dispose();
  }

  Future<void> _handleLifecyclePersistence() async {
    // NOTE: Flutter does not expose an API to block the OS from suspending
    // the process while this future is pending. This drain relies on the
    // platform giving the Dart VM enough time to complete in-flight Hive
    // writes after the inactive/paused signal — which is typical behavior
    // on both Android and iOS, but not guaranteed in extreme conditions.
    //
    // The durability guarantee comes from _persist() in UserPreferencesNotifier:
    // writes are serialized with a chained completer queue, and each write
    // captures a synchronous snapshot before any async gap, so the last
    // user action is always the last snapshot in the queue regardless of
    // how many mutations arrived concurrently.
    try {
      await ref.read(userPreferencesProvider.notifier).persistenceBarrier;
    } catch (e) {
      debugPrint('SawaApp: lifecycle persistence drain failed: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentLocale = ref.watch(localeProvider);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      onGenerateTitle: (context) => AppLocalizations.of(context)!.appTitle,
      theme: AppTheme.lightTheme(currentLocale),
      locale: currentLocale,
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      home: _showSplash
          ? SplashScreen(onComplete: () {
              setState(() {
                _showSplash = false;
              });
            })
          : (_showOnboarding 
              ? OnboardingScreen(onComplete: () {
                  setState(() {
                    _showOnboarding = false;
                  });
                })
              : const NavigationShell()),
    );
  }
}
