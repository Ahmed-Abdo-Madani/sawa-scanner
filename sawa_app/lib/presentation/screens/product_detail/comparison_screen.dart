import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/nutrition_comparison_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/exceptions.dart';

/// Side-by-side product comparison screen showing nutrition deltas,
/// allergen diff, and the rule-based recommendation.
class ComparisonScreen extends ConsumerWidget {
  final String gtinA;
  final String gtinB;
  final String nameA;
  final String nameB;

  const ComparisonScreen({
    super.key,
    required this.gtinA,
    required this.gtinB,
    required this.nameA,
    required this.nameB,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final compAsync = ref.watch(
        comparisonProvider((gtinA: gtinA, gtinB: gtinB)));
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
          l10n.compareProducts,
          style: AppTypography.headline(locale).copyWith(
            color: AppColors.onBackground,
            fontSize: 20,
          ),
        ),
      ),
      body: compAsync.when(
        data: (data) => _buildContent(context, data, l10n, locale),
        loading: () => const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        ),
        error: (err, _) {
          final isNotFound = err is ProductNotFoundException ||
              err.toString().contains('ProductNotFoundException');
          final message = isNotFound ? l10n.productNotFound : err.toString();
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text(
                message,
                textAlign: TextAlign.center,
                style: AppTypography.body(locale)
                    .copyWith(color: AppColors.error),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildContent(
    BuildContext context,
    Map<String, dynamic> data,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final productA = data['product_a'] as Map<String, dynamic>? ?? {};
    final productB = data['product_b'] as Map<String, dynamic>? ?? {};
    final deltas = data['nutrition_deltas'] as List<dynamic>? ?? [];
    final allergenDiff = data['allergen_diff'] as Map<String, dynamic>? ?? {};
    final rec = data['recommendation'] as Map<String, dynamic>? ?? {};
    final isAr = locale.languageCode == 'ar';

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // VS Header
        _buildVsHeader(productA, productB, l10n, locale),
        const SizedBox(height: 20),

        // Recommendation card
        _buildRecommendationCard(rec, l10n, locale),
        const SizedBox(height: 16),

        // Nutrition Comparison
        _buildNutritionComparisonCard(deltas, l10n, locale, isAr),
        const SizedBox(height: 16),

        // Allergen Comparison
        _buildAllergenComparisonCard(allergenDiff, l10n, locale),
        const SizedBox(height: 32),
      ],
    );
  }

  Widget _buildVsHeader(
    Map<String, dynamic> a,
    Map<String, dynamic> b,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final isAr = locale.languageCode == 'ar';

    Widget productCard(Map<String, dynamic> p) {
      final name = isAr ? (p['name_ar'] ?? '') : (p['name_en'] ?? '');
      final brand = p['brand'] ?? '';
      final grade = p['nutri_score_grade']?.toString();
      final price = p['lowest_price'];
      final imageUrl = p['image_front_url'];

      final gradeColors = {
        'A': const Color(0xFF1B8539),
        'B': const Color(0xFF85BB2F),
        'C': const Color(0xFFFECB02),
        'D': const Color(0xFFEE8100),
        'E': const Color(0xFFE63E11),
      };

      return Expanded(
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            children: [
              if (imageUrl != null)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    imageUrl.toString(),
                    height: 80,
                    width: 80,
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.image_not_supported, size: 40),
                  ),
                )
              else
                const Icon(Icons.inventory_2_outlined,
                    size: 40, color: AppColors.onSurface),
              const SizedBox(height: 8),
              Text(
                name.toString(),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: AppTypography.body(locale).copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.onBackground,
                  fontSize: 13,
                ),
              ),
              Text(
                brand.toString(),
                style: AppTypography.caption(locale).copyWith(
                  color: AppColors.onSurface,
                ),
              ),
              const SizedBox(height: 6),
              if (grade != null)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: (gradeColors[grade.toUpperCase()] ?? AppColors.onSurface),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(
                    grade.toUpperCase(),
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              if (price != null)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '${(price as num).toStringAsFixed(2)} ${l10n.sar}',
                    style: AppTypography.body(locale).copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    }

    return Row(
      children: [
        productCard(a),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.15),
              shape: BoxShape.circle,
            ),
            child: Center(
              child: Text(
                l10n.vsLabel,
                style: TextStyle(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ),
          ),
        ),
        productCard(b),
      ],
    );
  }

  Widget _buildRecommendationCard(
    Map<String, dynamic> rec,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final winner = rec['winner']?.toString() ?? 'tie';
    final isAr = locale.languageCode == 'ar';
    final reason = isAr
        ? (rec['reason_ar'] ?? '')
        : (rec['reason_en'] ?? '');
    final isTie = winner == 'tie';

    final color = isTie ? AppColors.secondary : AppColors.primary;
    final icon = isTie ? Icons.balance : Icons.emoji_events;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            color.withValues(alpha: 0.08),
            color.withValues(alpha: 0.02),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, color: color, size: 32),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  isTie ? l10n.tieResult : l10n.recommendation,
                  style: AppTypography.headline(locale).copyWith(
                    color: color,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  reason.toString(),
                  style: AppTypography.body(locale).copyWith(
                    color: AppColors.onBackground,
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

  Widget _buildNutritionComparisonCard(
    List<dynamic> deltas,
    AppLocalizations l10n,
    Locale locale,
    bool isAr,
  ) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.restaurant, color: AppColors.primary, size: 20),
              const SizedBox(width: 8),
              Text(
                l10n.nutritionComparison,
                style: AppTypography.headline(locale).copyWith(
                  color: AppColors.onBackground,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          ...deltas.map((d) {
            final delta = d as Map<String, dynamic>;
            final label = isAr
                ? (delta['label_ar'] ?? '')
                : (delta['label_en'] ?? '');
            final valA = delta['value_a'];
            final valB = delta['value_b'];
            final better = delta['better']?.toString() ?? 'unknown';

            IconData betterIcon;
            Color betterColor;
            switch (better) {
              case 'a':
                betterIcon = Icons.arrow_back;
                betterColor = AppColors.secondary;
                break;
              case 'b':
                betterIcon = Icons.arrow_forward;
                betterColor = AppColors.secondary;
                break;
              case 'equal':
                betterIcon = Icons.drag_handle;
                betterColor = AppColors.onSurface;
                break;
              default:
                betterIcon = Icons.help_outline;
                betterColor = AppColors.onSurface;
            }

            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Row(
                children: [
                  SizedBox(
                    width: 60,
                    child: Text(
                      _formatValue(valA),
                      textAlign: TextAlign.center,
                      style: AppTypography.body(locale).copyWith(
                        color: better == 'a'
                            ? AppColors.secondary
                            : AppColors.onBackground,
                        fontWeight:
                            better == 'a' ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(
                      children: [
                        Icon(betterIcon, color: betterColor, size: 16),
                        Text(
                          label.toString(),
                          textAlign: TextAlign.center,
                          style: AppTypography.caption(locale).copyWith(
                            color: AppColors.onSurface,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  SizedBox(
                    width: 60,
                    child: Text(
                      _formatValue(valB),
                      textAlign: TextAlign.center,
                      style: AppTypography.body(locale).copyWith(
                        color: better == 'b'
                            ? AppColors.secondary
                            : AppColors.onBackground,
                        fontWeight:
                            better == 'b' ? FontWeight.bold : FontWeight.normal,
                      ),
                    ),
                  ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildAllergenComparisonCard(
    Map<String, dynamic> diff,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final onlyA = (diff['only_in_a'] as List<dynamic>?) ?? [];
    final onlyB = (diff['only_in_b'] as List<dynamic>?) ?? [];
    final shared = (diff['shared'] as List<dynamic>?) ?? [];

    if (onlyA.isEmpty && onlyB.isEmpty && shared.isEmpty) {
      return const SizedBox.shrink();
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber,
                  color: AppColors.warning, size: 20),
              const SizedBox(width: 8),
              Text(
                l10n.allergenComparison,
                style: AppTypography.headline(locale).copyWith(
                  color: AppColors.onBackground,
                  fontSize: 16,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (onlyA.isNotEmpty) ...[
            Text(l10n.onlyInA,
                style: AppTypography.caption(locale)
                    .copyWith(color: AppColors.error)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children:
                  onlyA.map((a) => _allergenChip(a.toString(), AppColors.error)).toList(),
            ),
            const SizedBox(height: 10),
          ],
          if (onlyB.isNotEmpty) ...[
            Text(l10n.onlyInB,
                style: AppTypography.caption(locale)
                    .copyWith(color: AppColors.warning)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: onlyB
                  .map((a) => _allergenChip(a.toString(), AppColors.warning))
                  .toList(),
            ),
            const SizedBox(height: 10),
          ],
          if (shared.isNotEmpty) ...[
            Text(l10n.shared,
                style: AppTypography.caption(locale)
                    .copyWith(color: AppColors.onSurface)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: shared
                  .map((a) => _allergenChip(a.toString(), AppColors.onSurface))
                  .toList(),
            ),
          ],
        ],
      ),
    );
  }

  Widget _allergenChip(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _formatValue(dynamic val) {
    if (val == null) return '—';
    if (val is num) return val.toStringAsFixed(1);
    return val.toString();
  }
}
