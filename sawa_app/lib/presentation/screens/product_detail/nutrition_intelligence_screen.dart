import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/nutrition_comparison_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

/// Deep-dive nutrition intelligence screen showing NutriScore,
/// traffic-light health summary, harmful substances, and allergen warnings.
class NutritionIntelligenceScreen extends ConsumerWidget {
  final String gtin;
  final String productName;

  const NutritionIntelligenceScreen({
    super.key,
    required this.gtin,
    required this.productName,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analysisAsync = ref.watch(nutritionAnalysisProvider(gtin));
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
          onPressed: () => Navigator.pop(context),
        ),
        title: Text(
          l10n.nutritionIntelligence,
          style: AppTypography.headline(locale).copyWith(
            color: AppColors.onBackground,
            fontSize: 20,
          ),
        ),
      ),
      body: analysisAsync.when(
        data: (data) => _buildContent(context, data, l10n, locale),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (err, _) => Center(
          child: Text(
            err.toString(),
            style: AppTypography.body(locale).copyWith(color: AppColors.error),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> data,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final grade = data['nutri_score_grade']?.toString();
    final score = data['nutri_score_numeric'];
    final healthSummary = data['health_summary'] as Map<String, dynamic>?;
    final harmful = data['harmful_substances'] as List<dynamic>? ?? [];
    final allergens = data['allergen_warnings'] as List<dynamic>? ?? [];
    final complete = data['nutrition_data_complete'] as bool? ?? false;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Product header
        Text(
          productName,
          style: AppTypography.headline(locale).copyWith(
            color: AppColors.onBackground,
            fontSize: 22,
          ),
        ),
        const SizedBox(height: 20),

        // NutriScore card
        if (grade != null) _buildNutriScoreCard(grade, score, l10n, locale),
        const SizedBox(height: 16),

        // Health Summary traffic lights
        if (healthSummary != null)
          _buildHealthSummaryCard(healthSummary, l10n, locale),
        const SizedBox(height: 16),

        // Harmful substances
        _buildHarmfulSubstancesCard(harmful, l10n, locale),
        const SizedBox(height: 16),

        // Allergen warnings
        _buildAllergenWarningsCard(allergens, l10n, locale),
        const SizedBox(height: 16),

        // Completeness indicator
        if (!complete)
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: AppColors.warning.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.warning, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    l10n.nutritionDataIncomplete,
                    style: AppTypography.caption(locale).copyWith(
                      color: AppColors.warning,
                    ),
                  ),
                ),
              ],
            ),
          ),

        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildNutriScoreCard(
    String grade,
    dynamic score,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final gradeColors = {
      'A': const Color(0xFF1B8539),
      'B': const Color(0xFF85BB2F),
      'C': const Color(0xFFFECB02),
      'D': const Color(0xFFEE8100),
      'E': const Color(0xFFE63E11),
    };
    final color = gradeColors[grade.toUpperCase()] ?? AppColors.onSurface;

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        children: [
          Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Text(
                    grade.toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.nutriScoreTitle,
                      style: AppTypography.headline(locale).copyWith(
                        color: AppColors.onBackground,
                        fontSize: 18,
                      ),
                    ),
                    if (score != null)
                      Text(
                        'Score: $score',
                        style: AppTypography.caption(locale).copyWith(
                          color: AppColors.onSurface,
                        ),
                      ),
                  ],
                ),
              ),
              // Grade scale
              Row(
                children: ['A', 'B', 'C', 'D', 'E'].map((g) {
                  final c = gradeColors[g]!;
                  final isActive = g == grade.toUpperCase();
                  return Container(
                    width: isActive ? 28 : 20,
                    height: isActive ? 28 : 20,
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(
                      color: isActive ? c : c.withValues(alpha: 0.25),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Center(
                      child: Text(
                        g,
                        style: TextStyle(
                          color: isActive ? Colors.white : c,
                          fontSize: isActive ? 14 : 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            l10n.nutriScoreExplanation,
            style: AppTypography.caption(locale).copyWith(
              color: AppColors.onSurface,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHealthSummaryCard(
    Map<String, dynamic> summary,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.traffic, color: AppColors.warning, size: 22),
              const SizedBox(width: 8),
              Text(
                l10n.healthSummary,
                style: AppTypography.headline(locale).copyWith(
                  color: AppColors.onBackground,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _buildTrafficRow(l10n.fat, summary['fat'], l10n, locale),
          _buildTrafficRow(l10n.saturatedFat, summary['saturatedFat'], l10n, locale),
          _buildTrafficRow(l10n.sugars, summary['sugars'], l10n, locale),
          _buildTrafficRow(l10n.sodium, summary['sodium'], l10n, locale),
        ],
      ),
    );
  }

  Widget _buildTrafficRow(
    String label,
    dynamic data,
    AppLocalizations l10n,
    Locale locale,
  ) {
    if (data == null || data is! Map) return const SizedBox.shrink();
    final level = data['level']?.toString() ?? 'medium';
    final value = data['value'];

    final levelColors = {
      'low': const Color(0xFF1B8539),
      'medium': const Color(0xFFFECB02),
      'high': const Color(0xFFE63E11),
    };
    final levelLabels = {
      'low': l10n.lowLevel,
      'medium': l10n.mediumLevel,
      'high': l10n.highLevel,
    };
    final color = levelColors[level] ?? AppColors.onSurface;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 12,
            height: 12,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: AppTypography.body(locale).copyWith(
                color: AppColors.onBackground,
              ),
            ),
          ),
          if (value != null)
            Text(
              value is num ? value.toStringAsFixed(1) : value.toString(),
              style: AppTypography.body(locale).copyWith(
                color: AppColors.onSurface,
                fontWeight: FontWeight.w500,
              ),
            ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              levelLabels[level] ?? level,
              style: AppTypography.caption(locale).copyWith(
                color: color,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHarmfulSubstancesCard(
    List<dynamic> harmful,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.shield_outlined,
                  color: harmful.isEmpty ? AppColors.secondary : AppColors.error,
                  size: 22),
              const SizedBox(width: 8),
              Text(
                l10n.harmfulSubstances,
                style: AppTypography.headline(locale).copyWith(
                  color: AppColors.onBackground,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (harmful.isEmpty)
            Row(
              children: [
                Icon(Icons.check_circle, color: AppColors.secondary, size: 18),
                const SizedBox(width: 8),
                Text(
                  l10n.noHarmfulSubstances,
                  style: AppTypography.body(locale).copyWith(
                    color: AppColors.secondary,
                  ),
                ),
              ],
            )
          else
            ...harmful.map((h) {
              final item = h as Map<String, dynamic>;
              final isAr = locale.languageCode == 'ar';
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: AppColors.error.withValues(alpha: 0.06),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: AppColors.error.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(Icons.warning_amber, color: AppColors.error, size: 18),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              isAr
                                  ? (item['ingredient_name_ar'] ?? '')
                                  : (item['ingredient_name_en'] ?? ''),
                              style: AppTypography.body(locale).copyWith(
                                fontWeight: FontWeight.w600,
                                color: AppColors.onBackground,
                              ),
                            ),
                            if (item['restriction_note'] != null)
                              Text(
                                item['restriction_note'],
                                style: AppTypography.caption(locale).copyWith(
                                  color: AppColors.onSurface,
                                ),
                              ),
                          ],
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: AppColors.error,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          (item['sfda_status'] ?? '').toString().toUpperCase(),
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }

  Widget _buildAllergenWarningsCard(
    List<dynamic> allergens,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber,
                  color: allergens.isEmpty
                      ? AppColors.secondary
                      : AppColors.warning,
                  size: 22),
              const SizedBox(width: 8),
              Text(
                l10n.allergenWarnings,
                style: AppTypography.headline(locale).copyWith(
                  color: AppColors.onBackground,
                  fontSize: 18,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (allergens.isEmpty)
            Row(
              children: [
                Icon(Icons.check_circle, color: AppColors.secondary, size: 18),
                const SizedBox(width: 8),
                Text(
                  l10n.noAllergenWarnings,
                  style: AppTypography.body(locale).copyWith(
                    color: AppColors.secondary,
                  ),
                ),
              ],
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: allergens.map((a) {
                final item = a as Map<String, dynamic>;
                final isAr = locale.languageCode == 'ar';
                return Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                  decoration: BoxDecoration(
                    color: AppColors.warning.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                      color: AppColors.warning.withValues(alpha: 0.4),
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.do_not_disturb_alt,
                          color: AppColors.warning, size: 16),
                      const SizedBox(width: 6),
                      Text(
                        isAr
                            ? (item['name_ar'] ?? '')
                            : (item['name_en'] ?? ''),
                        style: AppTypography.caption(locale).copyWith(
                          color: AppColors.warning,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            ),
        ],
      ),
    );
  }
}
