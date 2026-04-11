import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'package:sawa_app/core/theme/app_colors.dart';
import 'package:sawa_app/core/theme/app_typography.dart';
import 'package:sawa_app/presentation/providers/locale_provider.dart';
import 'package:sawa_app/presentation/providers/user_preferences_provider.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  final VoidCallback onComplete;

  const OnboardingScreen({super.key, required this.onComplete});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _nextPage() {
    if (_currentPage < 3) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
    } else {
      _complete();
    }
  }

  Future<void> _complete() async {
    await ref.read(userPreferencesProvider.notifier).completeOnboarding();
    widget.onComplete();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView(
                controller: _pageController,
                onPageChanged: (int page) {
                  setState(() {
                    _currentPage = page;
                  });
                },
                children: [
                  _WelcomePage(l10n: l10n, locale: locale),
                  _DietaryPage(l10n: l10n, locale: locale),
                  _AllergenPage(l10n: l10n, locale: locale),
                  _ConfirmationPage(l10n: l10n, locale: locale),
                ],
              ),
            ),
            _buildBottomBar(l10n, locale),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomBar(AppLocalizations l10n, Locale locale) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(4, (index) => _buildDot(index)),
          ),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: ElevatedButton(
              onPressed: _nextPage,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16),
                ),
                elevation: 0,
              ),
              child: Text(
                _currentPage == 3 ? l10n.getStarted : l10n.next,
                style: AppTypography.body(locale).copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          if (_currentPage < 3)
            TextButton(
              onPressed: _complete,
              child: Text(
                l10n.skipForNow,
                style: AppTypography.caption(locale).copyWith(
                  color: AppColors.onSurface.withOpacity(0.6),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildDot(int index) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      margin: const EdgeInsets.symmetric(horizontal: 4),
      height: 8,
      width: _currentPage == index ? 24 : 8,
      decoration: BoxDecoration(
        color: _currentPage == index
            ? AppColors.primary
            : AppColors.onSurface.withOpacity(0.2),
        borderRadius: BorderRadius.circular(4),
      ),
    );
  }
}

class _WelcomePage extends ConsumerWidget {
  final AppLocalizations l10n;
  final Locale locale;

  const _WelcomePage({required this.l10n, required this.locale});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.shopping_basket_rounded,
              size: 80,
              color: AppColors.primary,
            ),
          ),
          const SizedBox(height: 40),
          Text(
            l10n.welcomeTitle,
            textAlign: TextAlign.center,
            style: AppTypography.display(locale),
          ),
          const SizedBox(height: 16),
          Text(
            l10n.welcomeSubtitle,
            textAlign: TextAlign.center,
            style: AppTypography.body(locale).copyWith(
              color: AppColors.onSurface.withOpacity(0.8),
            ),
          ),
          const SizedBox(height: 48),
          Text(
            l10n.selectLanguage,
            style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              ChoiceChip(
                label: Text(l10n.english),
                selected: locale.languageCode == 'en',
                onSelected: (selected) {
                  if (selected && locale.languageCode != 'en') {
                    ref.read(localeProvider.notifier).toggleLocale();
                    ref.read(userPreferencesProvider.notifier).setPreferredLocale('en');
                  }
                },
              ),
              const SizedBox(width: 16),
              ChoiceChip(
                label: Text(l10n.arabic),
                selected: locale.languageCode == 'ar',
                onSelected: (selected) {
                  if (selected && locale.languageCode != 'ar') {
                    ref.read(localeProvider.notifier).toggleLocale();
                    ref.read(userPreferencesProvider.notifier).setPreferredLocale('ar');
                  }
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _DietaryPage extends ConsumerWidget {
  final AppLocalizations l10n;
  final Locale locale;

  const _DietaryPage({required this.l10n, required this.locale});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(userPreferencesProvider).dietaryPreferences;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          Text(l10n.dietaryPreferences, style: AppTypography.headline(locale).copyWith(fontSize: 28)),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: PreferenceOptions.dietary.map((option) =>
              _buildPrefChip(
                ref,
                option.id,
                option.labelOf(l10n),
                prefs.contains(option.id),
              ),
            ).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildPrefChip(WidgetRef ref, String key, String label, bool isSelected) {
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => ref.read(userPreferencesProvider.notifier).toggleDietaryPreference(key),
      selectedColor: AppColors.primary.withOpacity(0.2),
      checkmarkColor: AppColors.primary,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.primary : AppColors.onSurface,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }
}

class _AllergenPage extends ConsumerWidget {
  final AppLocalizations l10n;
  final Locale locale;

  const _AllergenPage({required this.l10n, required this.locale});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allergens = ref.watch(userPreferencesProvider).allergenFilters;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          Text(l10n.allergenFilters, style: AppTypography.headline(locale).copyWith(fontSize: 28)),
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: PreferenceOptions.allergens.map((option) =>
              _buildAllergenChip(
                ref,
                option.id,
                option.labelOf(l10n),
                allergens.contains(option.id),
              ),
            ).toList(),
          ),
        ],
      ),
    );
  }

  Widget _buildAllergenChip(WidgetRef ref, String key, String label, bool isSelected) {
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => ref.read(userPreferencesProvider.notifier).toggleAllergenFilter(key),
      selectedColor: AppColors.error.withOpacity(0.1),
      checkmarkColor: AppColors.error,
      labelStyle: TextStyle(
        color: isSelected ? AppColors.error : AppColors.onSurface,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }
}

class _ConfirmationPage extends ConsumerWidget {
  final AppLocalizations l10n;
  final Locale locale;

  const _ConfirmationPage({required this.l10n, required this.locale});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final userPrefs = ref.watch(userPreferencesProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 40),
          Text(l10n.confirmationTitle, style: AppTypography.headline(locale).copyWith(fontSize: 28)),
          const SizedBox(height: 16),
          Text(l10n.confirmationSubtitle, style: AppTypography.body(locale)),
          const SizedBox(height: 32),
          if (userPrefs.dietaryPreferences.isNotEmpty) ...[
            Text(l10n.yourPreferences, style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: userPrefs.dietaryPreferences.map((p) => Chip(
                label: Text(_getDietaryLabel(p, l10n)),
                backgroundColor: AppColors.primary.withOpacity(0.1),
              )).toList(),
            ),
            const SizedBox(height: 24),
          ],
          if (userPrefs.allergenFilters.isNotEmpty) ...[
            Text(l10n.yourAllergens, style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: userPrefs.allergenFilters.map((a) => Chip(
                label: Text(_getAllergenLabel(a, l10n)),
                backgroundColor: AppColors.error.withOpacity(0.1),
              )).toList(),
            ),
          ],
        ],
      ),
    );
  }

  String _getDietaryLabel(String key, AppLocalizations l10n) {
    return PreferenceOptions.dietary
        .firstWhere((o) => o.id == key,
            orElse: () => PreferenceOption(id: key, labelOf: (_) => key))
        .labelOf(l10n);
  }

  String _getAllergenLabel(String key, AppLocalizations l10n) {
    return PreferenceOptions.allergens
        .firstWhere((o) => o.id == key,
            orElse: () => PreferenceOption(id: key, labelOf: (_) => key))
        .labelOf(l10n);
  }
}
