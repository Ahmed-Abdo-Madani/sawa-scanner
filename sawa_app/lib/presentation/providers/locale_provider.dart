import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

class LocaleNotifier extends StateNotifier<Locale> {
  LocaleNotifier(String initialLocale) : super(Locale(initialLocale));

  void toggleLocale() {
    state = state.languageCode == 'ar' ? const Locale('en') : const Locale('ar');
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, Locale>((ref) {
  return LocaleNotifier('ar');
});
