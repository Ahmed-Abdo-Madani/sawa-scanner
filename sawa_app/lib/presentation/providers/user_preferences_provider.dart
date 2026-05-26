import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:sawa_app/l10n/app_localizations.dart';

/// Hive storage key constants shared by [UserPreferencesNotifier] and [main].
/// Using these instead of raw strings prevents silent mismatch if a key
/// is renamed in one place but not the other.
class UserPreferencesKeys {
  UserPreferencesKeys._();

  /// Name of the Hive box that stores user preferences.
  static const String boxName = 'userPreferencesBox';

  /// Key under which the canonical settings map is stored in [boxName].
  static const String settingsRecord = 'settings';

  // ── Field keys inside the settings map ──────────────────────────────────
  static const String fieldDietaryPreferences = 'dietaryPreferences';
  static const String fieldAllergenFilters = 'allergenFilters';
  static const String fieldPreferredLocale = 'preferredLocale';
  static const String fieldIsFirstLaunch = 'isFirstLaunch';
  static const String fieldRecentScanTimestamps = 'recentScanTimestamps';
  static const String fieldIsSubscribed = 'isSubscribed';

  /// Default locale used when no preference has been stored yet.
  static const String defaultLocale = 'ar';
}

/// Descriptor for a single dietary or allergen option.
///
/// [id] is the stable Hive-persisted key (never change these once shipped).
/// [labelOf] resolves the localised display string at call time.
class PreferenceOption {
  final String id;
  final String Function(AppLocalizations l10n) labelOf;

  const PreferenceOption({required this.id, required this.labelOf});
}

/// Canonical lists of supported dietary and allergen options.
/// Add new options here — UI files consume these lists instead of
/// repeating string IDs independently.
class PreferenceOptions {
  PreferenceOptions._();

  static const List<PreferenceOption> dietary = [
    PreferenceOption(id: 'halalOnly',   labelOf: _halalOnly),
    PreferenceOption(id: 'vegan',       labelOf: _vegan),
    PreferenceOption(id: 'vegetarian',  labelOf: _vegetarian),
    PreferenceOption(id: 'glutenFree',  labelOf: _glutenFree),
  ];

  static const List<PreferenceOption> allergens = [
    PreferenceOption(id: 'peanuts',   labelOf: _peanuts),
    PreferenceOption(id: 'dairy',     labelOf: _dairy),
    PreferenceOption(id: 'soy',       labelOf: _soy),
    PreferenceOption(id: 'eggs',      labelOf: _eggs),
    PreferenceOption(id: 'wheat',     labelOf: _wheat),
    PreferenceOption(id: 'fish',      labelOf: _fish),
    PreferenceOption(id: 'shellfish', labelOf: _shellfish),
    PreferenceOption(id: 'treeNuts',  labelOf: _treeNuts),
  ];

  // ── Label resolver statics (must be top-level or static to be const) ────
  static String _halalOnly(AppLocalizations l)  => l.halalOnly;
  static String _vegan(AppLocalizations l)       => l.vegan;
  static String _vegetarian(AppLocalizations l)  => l.vegetarian;
  static String _glutenFree(AppLocalizations l)  => l.glutenFree;
  static String _peanuts(AppLocalizations l)     => l.peanuts;
  static String _dairy(AppLocalizations l)       => l.dairy;
  static String _soy(AppLocalizations l)         => l.soy;
  static String _eggs(AppLocalizations l)        => l.eggs;
  static String _wheat(AppLocalizations l)       => l.wheat;
  static String _fish(AppLocalizations l)        => l.fish;
  static String _shellfish(AppLocalizations l)   => l.shellfish;
  static String _treeNuts(AppLocalizations l)    => l.treeNuts;
}

class UserPreferences {
  final Set<String> dietaryPreferences;
  final Set<String> allergenFilters;
  final String preferredLocale;
  final bool isFirstLaunch;
  final List<String> recentScanTimestamps;
  final bool isSubscribed;

  UserPreferences({
    required this.dietaryPreferences,
    required this.allergenFilters,
    required this.preferredLocale,
    required this.isFirstLaunch,
    required this.recentScanTimestamps,
    required this.isSubscribed,
  });

  UserPreferences copyWith({
    Set<String>? dietaryPreferences,
    Set<String>? allergenFilters,
    String? preferredLocale,
    bool? isFirstLaunch,
    List<String>? recentScanTimestamps,
    bool? isSubscribed,
  }) {
    return UserPreferences(
      dietaryPreferences: dietaryPreferences ?? this.dietaryPreferences,
      allergenFilters: allergenFilters ?? this.allergenFilters,
      preferredLocale: preferredLocale ?? this.preferredLocale,
      isFirstLaunch: isFirstLaunch ?? this.isFirstLaunch,
      recentScanTimestamps: recentScanTimestamps ?? this.recentScanTimestamps,
      isSubscribed: isSubscribed ?? this.isSubscribed,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      UserPreferencesKeys.fieldDietaryPreferences: dietaryPreferences.toList(),
      UserPreferencesKeys.fieldAllergenFilters: allergenFilters.toList(),
      UserPreferencesKeys.fieldPreferredLocale: preferredLocale,
      UserPreferencesKeys.fieldIsFirstLaunch: isFirstLaunch,
      UserPreferencesKeys.fieldRecentScanTimestamps: recentScanTimestamps,
      UserPreferencesKeys.fieldIsSubscribed: isSubscribed,
    };
  }

  factory UserPreferences.fromMap(Map<dynamic, dynamic> map) {
    return UserPreferences(
      dietaryPreferences: Set<String>.from(
          map[UserPreferencesKeys.fieldDietaryPreferences] ?? []),
      allergenFilters: Set<String>.from(
          map[UserPreferencesKeys.fieldAllergenFilters] ?? []),
      preferredLocale:
          map[UserPreferencesKeys.fieldPreferredLocale] as String? ??
          UserPreferencesKeys.defaultLocale,
      isFirstLaunch:
          map[UserPreferencesKeys.fieldIsFirstLaunch] as bool? ?? true,
      recentScanTimestamps: List<String>.from(
          map[UserPreferencesKeys.fieldRecentScanTimestamps] ?? []),
      isSubscribed:
          map[UserPreferencesKeys.fieldIsSubscribed] as bool? ?? false,
    );
  }
}

class UserPreferencesNotifier extends StateNotifier<UserPreferences> {
  final Box _box = Hive.box(UserPreferencesKeys.boxName);
  Future<void>? _pendingWrite;

  UserPreferencesNotifier() : super(
    UserPreferences(
      dietaryPreferences: {},
      allergenFilters: {},
      preferredLocale: UserPreferencesKeys.defaultLocale,
      isFirstLaunch: true,
      recentScanTimestamps: [],
      isSubscribed: false,
    )
  ) {
    _loadFromHive();
  }

  void _loadFromHive() {
    final data = _box.get(UserPreferencesKeys.settingsRecord);
    if (data != null) {
      state = UserPreferences.fromMap(Map<dynamic, dynamic>.from(data as Map));
    }
  }

  bool canScan() {
    if (state.isSubscribed) return true;
    final now = DateTime.now();
    final oneDayAgo = now.subtract(const Duration(days: 1));
    final activeScans = state.recentScanTimestamps
        .where((t) {
          try {
            return DateTime.parse(t).isAfter(oneDayAgo);
          } catch (_) {
            return false;
          }
        })
        .toList();
    return activeScans.length < 5;
  }

  Future<void> incrementScanCount() async {
    if (state.isSubscribed) return;
    final now = DateTime.now();
    final oneDayAgo = now.subtract(const Duration(days: 1));
    final activeScans = state.recentScanTimestamps
        .where((t) {
          try {
            return DateTime.parse(t).isAfter(oneDayAgo);
          } catch (_) {
            return false;
          }
        })
        .toList();
    activeScans.add(now.toIso8601String());
    state = state.copyWith(recentScanTimestamps: activeScans);
    await _persist();
  }

  Future<void> setSubscribed(bool subscribed) async {
    state = state.copyWith(isSubscribed: subscribed);
    await _persist();
  }

  Future<void> toggleDietaryPreference(String pref) async {
    final newPrefs = Set<String>.from(state.dietaryPreferences);
    if (newPrefs.contains(pref)) {
      newPrefs.remove(pref);
    } else {
      newPrefs.add(pref);
    }
    state = state.copyWith(dietaryPreferences: newPrefs);
    await _persist();
  }

  Future<void> toggleAllergenFilter(String allergen) async {
    final newAllergens = Set<String>.from(state.allergenFilters);
    if (newAllergens.contains(allergen)) {
      newAllergens.remove(allergen);
    } else {
      newAllergens.add(allergen);
    }
    state = state.copyWith(allergenFilters: newAllergens);
    await _persist();
  }

  Future<void> setPreferredLocale(String locale) async {
    state = state.copyWith(preferredLocale: locale);
    await _persist();
  }

  Future<void> completeOnboarding() async {
    state = state.copyWith(isFirstLaunch: false);
    await _persist();
  }

  /// A future that completes when the entire persistence queue has been drained.
  /// If new writes are added while this is being awaited, it will continue
  /// to wait until the newest queued snapshot is flushed to disk.
  Future<void> get persistenceBarrier async {
    while (true) {
      final capture = _pendingWrite;
      if (capture == null) break;
      await capture;
      // If a new write was queued while we were awaiting the previous one, 
      // loop again to ensure the tail is truly reached.
      if (capture == _pendingWrite) break;
    }
  }

  Future<void> _persist() async {
    // Capture the snapshot synchronously, before any async gap.
    // This ensures each queued write carries the state that was current
    // when the mutation was requested, not a later state observed after
    // a previous write completed.
    final snapshot = state.toMap();
    final previousWrite = _pendingWrite;
    final completer = Completer<void>();
    _pendingWrite = completer.future;

    try {
      if (previousWrite != null) await previousWrite;
      await _box.put(UserPreferencesKeys.settingsRecord, snapshot);
      await _box.flush(); // Force Hive to commit to disk
    } catch (e, st) {
      // Log the error so write failures are visible; do not rethrow
      // so that the completer always resolves and the queue never deadlocks.
      debugPrint('UserPreferencesNotifier: persistence write failed: $e\n$st');
    } finally {
      completer.complete();
    }
  }
}

final userPreferencesProvider = StateNotifierProvider<UserPreferencesNotifier, UserPreferences>((ref) {
  return UserPreferencesNotifier();
});
