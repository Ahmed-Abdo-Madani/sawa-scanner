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
    if (_currentPage < 1) {
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
                  _FeaturesPage(l10n: l10n, locale: locale),
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
            children: List.generate(2, (index) => _buildDot(index)),
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
                _currentPage == 1 ? l10n.getStarted : l10n.next,
                style: AppTypography.body(locale).copyWith(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          if (_currentPage < 1)
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

class _FeaturesPage extends StatelessWidget {
  final AppLocalizations l10n;
  final Locale locale;

  const _FeaturesPage({required this.l10n, required this.locale});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 40.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 20),
          Text(
            l10n.featuresTitle,
            style: AppTypography.headline(locale).copyWith(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.onSurface,
            ),
          ),
          const SizedBox(height: 40),
          _buildFeatureCard(
            icon: Icons.qr_code_scanner_rounded,
            iconColor: AppColors.primary,
            title: l10n.featureScanTitle,
            description: l10n.featureScanDesc,
          ),
          const SizedBox(height: 24),
          _buildFeatureCard(
            icon: Icons.shopping_cart_rounded,
            iconColor: Colors.blueAccent,
            title: l10n.featureCartTitle,
            description: l10n.featureCartDesc,
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required String description,
  }) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: AppColors.onSurface.withOpacity(0.08),
          width: 1,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: iconColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              icon,
              size: 32,
              color: iconColor,
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.body(locale).copyWith(
                    fontWeight: FontWeight.bold,
                    fontSize: 18,
                    color: AppColors.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  description,
                  style: AppTypography.caption(locale).copyWith(
                    color: AppColors.onSurface.withOpacity(0.7),
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

