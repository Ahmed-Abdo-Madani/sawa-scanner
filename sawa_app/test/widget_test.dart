import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/app.dart';
import 'package:sawa_app/presentation/screens/onboarding/onboarding_screen.dart';

void main() {
  testWidgets('App smoke test - verifies SawaApp loads with onboarding screen', (WidgetTester tester) async {
    // Build our app and trigger a frame inside a ProviderScope
    await tester.pumpWidget(
      const ProviderScope(
        child: SawaApp(isFirstLaunch: true),
      ),
    );

    // Verify that OnboardingScreen is present since isFirstLaunch is true
    expect(find.byType(OnboardingScreen), findsOneWidget);
  });
}
