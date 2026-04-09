import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import '../../providers/product_provider.dart';
import '../../widgets/glass_surface.dart';
import '../../widgets/nutri_score_badge.dart';
import '../../widgets/nova_group_badge.dart';
import '../../widgets/halal_badge.dart';
import '../../widgets/ingredient_chip.dart';
import '../../widgets/nutrient_row.dart';
import '../../widgets/price_preview_strip.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';
import '../../../core/exceptions.dart';

class ProductDetailScreen extends ConsumerWidget {
  final String gtin;
  final Product? initialProduct;

  const ProductDetailScreen({
    super.key, 
    required this.gtin,
    this.initialProduct,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productByGtinProvider(gtin));
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: productAsync.when(
        data: (product) => _buildContent(context, product ?? initialProduct!, l10n, locale),
        loading: () => initialProduct != null 
            ? _buildContent(context, initialProduct!, l10n, locale)
            : const Center(child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, stack) {
          if (initialProduct != null) {
            return _buildContent(context, initialProduct!, l10n, locale);
          }
          return _buildError(context, err, l10n, locale, ref);
        },
      ),
    );
  }

  Widget _buildContent(BuildContext context, Product product, AppLocalizations l10n, Locale locale) {
     return CustomScrollView(
      slivers: [
        SliverAppBar(
          expandedHeight: 320,
          backgroundColor: AppColors.background,
          pinned: true,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          flexibleSpace: FlexibleSpaceBar(
            background: _buildHero(context, product, l10n, locale),
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 40),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildGradeRow(product),
                const SizedBox(height: 32),
                _buildNutritionSection(product, l10n, locale),
                const SizedBox(height: 32),
                _buildIngredientsSection(product, l10n, locale),
                const SizedBox(height: 32),
                if (product.prices.isNotEmpty)
                   PricePreviewStrip(
                     merchantName: product.prices.first.merchant,
                     price: product.prices.first.priceSarInclVat,
                   ),
                const SizedBox(height: 48),
                _buildDisclaimer(l10n, locale),
                const SizedBox(height: 40),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHero(BuildContext context, Product product, AppLocalizations l10n, Locale locale) {
    return GlassSurface(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(32)),
      child: Stack(
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 120, top: 40),
              child: product.images.isNotEmpty 
                ? Image.network(product.images.first.url, fit: BoxFit.contain)
                : const Icon(Icons.inventory_2_outlined, size: 100, color: AppColors.onSurface),
            ),
          ),
          Positioned(
            bottom: 24,
            left: 20,
            right: 20,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.brand,
                  style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface),
                ),
                const SizedBox(height: 4),
                Text(
                  locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                  style: AppTypography.headline(locale).copyWith(
                    color: AppColors.onBackground,
                    fontSize: 26,
                  ),
                ),
                if (product.sfdaRegistrationStatus == 'registered' || product.sfdaRegistrationStatus == 'active') ...[
                  const SizedBox(height: 12),
                  _buildSfdaBadge(l10n, locale),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSfdaBadge(AppLocalizations l10n, Locale locale) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.secondary.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppColors.secondary.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.verified, size: 16, color: AppColors.secondary),
          const SizedBox(width: 6),
          Text(
            l10n.sfdaRegistered,
            style: AppTypography.caption(locale).copyWith(
              color: AppColors.secondary,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGradeRow(Product product) {
    return Row(
      children: [
        if (product.nutriScoreGrade != null) ...[
          NutriScoreBadge(grade: product.nutriScoreGrade!),
          const SizedBox(width: 12),
        ],
        if (product.novaGroup != null)
          NovaGroupBadge(group: product.novaGroup!),
        const Spacer(),
        if (product.halalCertified != null)
          HalalBadge(isCertified: product.halalCertified!),
      ],
    );
  }

  Widget _buildNutritionSection(Product product, AppLocalizations l10n, Locale locale) {
    final nutrition = product.nutritionFact;
    if (nutrition == null) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.nutritionFacts, style: AppTypography.headline(locale)),
        const SizedBox(height: 20),
        NutrientRow(
          label: l10n.calories,
          value: '${nutrition.energyKcal?.toInt() ?? 0} kcal',
          percentage: (nutrition.energyKcal ?? 0) / 2000,
          barColor: AppColors.primary,
        ),
        NutrientRow(
          label: l10n.fat,
          value: '${nutrition.fatG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.fatG ?? 0) / 70,
          barColor: AppColors.warning,
        ),
        NutrientRow(
          label: l10n.saturatedFat,
          value: '${nutrition.saturatedFatG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.saturatedFatG ?? 0) / 20,
          barColor: AppColors.error,
        ),
        NutrientRow(
          label: l10n.carbs,
          value: '${nutrition.carbsG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.carbsG ?? 0) / 260,
          barColor: AppColors.secondary,
        ),
        NutrientRow(
          label: l10n.sugars,
          value: '${nutrition.sugarsG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.sugarsG ?? 0) / 90,
          barColor: AppColors.warning,
        ),
        NutrientRow(
          label: l10n.fiber,
          value: '${nutrition.fiberG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.fiberG ?? 0) / 30,
          barColor: AppColors.secondary,
        ),
        NutrientRow(
          label: l10n.protein,
          value: '${nutrition.proteinG?.toStringAsFixed(1) ?? 0} g',
          percentage: (nutrition.proteinG ?? 0) / 50,
          barColor: AppColors.secondary,
        ),
        NutrientRow(
          label: l10n.sodium,
          value: '${nutrition.sodiumMg?.toInt() ?? 0} mg',
          percentage: (nutrition.sodiumMg ?? 0) / 2300,
          barColor: AppColors.warning,
        ),
      ],
    );
  }

  Widget _buildIngredientsSection(Product product, AppLocalizations l10n, Locale locale) {
    if (product.ingredients.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(l10n.ingredientsAndAdditives, style: AppTypography.headline(locale)),
        const SizedBox(height: 20),
        Wrap(
          spacing: 10,
          runSpacing: 14,
          children: product.ingredients
              .map((ing) => IngredientChip(ingredient: ing))
              .toList(),
        ),
      ],
    );
  }

  Widget _buildDisclaimer(AppLocalizations l10n, Locale locale) {
    return Text(
      l10n.sfdaDisclaimer,
      textAlign: TextAlign.center,
      style: AppTypography.caption(locale).copyWith(
        color: AppColors.onSurface,
        height: 1.6,
      ),
    );
  }

  Widget _buildError(BuildContext context, Object error, AppLocalizations l10n, Locale locale, WidgetRef ref) {
    final isNotFound = error is ProductNotFoundException;
    
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            isNotFound ? Icons.search_off_outlined : Icons.error_outline, 
            size: 80, 
            color: AppColors.onSurface,
          ),
          const SizedBox(height: 28),
          Text(
            isNotFound ? l10n.productNotFound : l10n.serverError,
            style: AppTypography.headline(locale).copyWith(color: AppColors.onBackground),
          ),
          const SizedBox(height: 16),
          Text(
            isNotFound 
              ? (locale.languageCode == 'ar' 
                  ? "لم نتمكن من العثور على هذا المنتج في قاعدة بياناتنا. يمكنك مساعدتنا بإضافته."
                  : "We couldn't find this product in our database. You can help us by contributing it.")
              : (locale.languageCode == 'ar'
                  ? "حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى."
                  : "An error occurred while connecting to the server. Please try again."),
            textAlign: TextAlign.center,
            style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
          ),
          const SizedBox(height: 48),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                if (isNotFound) {
                  Navigator.pop(context);
                } else {
                  // Invalidate provider to trigger a refresh
                  ref.invalidate(productByGtinProvider(gtin));
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: Text(
                isNotFound ? l10n.contributeProduct : l10n.retryButton,
                style: AppTypography.body(locale).copyWith(
                  fontWeight: FontWeight.bold, 
                  color: AppColors.background,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
