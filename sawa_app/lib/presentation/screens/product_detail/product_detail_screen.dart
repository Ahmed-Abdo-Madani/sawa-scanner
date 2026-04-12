import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/product_provider.dart';
import '../../providers/scan_history_provider.dart';
import '../../widgets/nutri_score_badge.dart';
import '../../widgets/nova_group_badge.dart';
import '../../widgets/eco_score_badge.dart';
import '../../widgets/knowledge_panel_card.dart';
import '../../widgets/halal_badge.dart';
import '../../widgets/ingredient_chip.dart';
import '../../widgets/nutrient_row.dart';
import '../../widgets/price_preview_strip.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';
import '../../../core/exceptions.dart';
import '../../../domain/entities/ingredient.dart';
import '../product_edit/product_edit_screen.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String gtin;
  final Product? initialProduct;
  /// When `true` the caller has already written a [ScanHistoryEntry] for this
  /// product (e.g. the label-scan path in [ScannerScreen]).  The detail screen
  /// skips its own history write to prevent duplicate entries.
  final bool historyAlreadyRecorded;

  const ProductDetailScreen({
    super.key,
    required this.gtin,
    this.initialProduct,
    this.historyAlreadyRecorded = false,
  });

  @override
  ConsumerState<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends ConsumerState<ProductDetailScreen> {
  /// Guards against adding a history entry on every rebuild.
  /// Pre-armed to `true` when the caller already recorded history (label-scan).
  late bool _hasRecordedHistory;

  @override
  void initState() {
    super.initState();
    _hasRecordedHistory = widget.historyAlreadyRecorded;
  }

  void _maybeSaveHistory(Product product, Locale locale) {
    if (_hasRecordedHistory) return;
    _hasRecordedHistory = true;

    final entry = ScanHistoryEntry(
      barcode: product.gtin,
      productName: locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
      brand: product.brand,
      nutriScore: product.nutriScoreGrade,
      imageUrl: product.images.isNotEmpty ? product.images.first.url : null,
      scannedAt: DateTime.now(),
    );

    // Fire-and-forget; the notifier handles deduplication and persistence.
    ref.read(scanHistoryProvider.notifier).addEntry(entry);
  }

  Future<void> _onRefresh() async {
    await ref.read(productRepositoryProvider).clearProductCache(widget.gtin);
    ref.invalidate(productByGtinProvider(widget.gtin));
    // Allow the FutureProvider to rebuild.
    await ref.read(productByGtinProvider(widget.gtin).future).catchError((_) {});
  }

  @override
  Widget build(BuildContext context) {
    final productAsync = ref.watch(productByGtinProvider(widget.gtin));
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    // Record history once when a product loads successfully.
    ref.listen<AsyncValue<Product>>(productByGtinProvider(widget.gtin),
        (previous, next) {
      next.whenData((product) => _maybeSaveHistory(product, locale));
    });

    // Determine the product we are *actually displaying* so the FAB is
    // available in all branches where content is shown (data, loading with
    // initialProduct, or error with initialProduct).
    final Product? effectiveProduct = productAsync.when(
      data: (p) => p,
      loading: () => widget.initialProduct,
      error: (_, __) => widget.initialProduct,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: effectiveProduct != null
          ? FloatingActionButton(
              backgroundColor: AppColors.primary,
              onPressed: () => Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => ProductEditScreen(product: effectiveProduct),
                ),
              ),
              child: const Icon(Icons.edit, color: Colors.white),
            )
          : null,
      body: productAsync.when(
        data: (product) =>
            _buildContent(context, product, l10n, locale),
        loading: () => widget.initialProduct != null
            ? _buildContent(context, widget.initialProduct!, l10n, locale)
            : const Center(
                child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, stack) {
          if (widget.initialProduct != null) {
            return _buildContent(
                context, widget.initialProduct!, l10n, locale);
          }
          return _buildError(context, err, l10n, locale);
        },
      ),
    );
  }

  // --------------------------------------------------------------------------
  // Content
  // --------------------------------------------------------------------------

  Widget _buildContent(
    BuildContext context,
    Product product,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _onRefresh,
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppBar(
            expandedHeight: 320,
            backgroundColor: AppColors.background,
            pinned: true,
            elevation: 0,
            scrolledUnderElevation: 0,
            leading: IconButton(
              icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
              onPressed: () => Navigator.pop(context),
            ),
            flexibleSpace: FlexibleSpaceBar(
              background: _buildHero(context, product, l10n, locale),
            ),
          ),
          SliverList(
            delegate: SliverChildListDelegate([
              const SizedBox(height: 16),

              // 1. Nutri-Score Panel
              if (product.nutriScoreGrade != null)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.restaurant_menu,
                    iconColor: Colors.green.shade600,
                    title: l10n.nutriScoreTitle,
                    summary:
                        l10n.gradeSummary(product.nutriScoreGrade!.toUpperCase()),
                    initiallyExpanded: true,
                    content: NutriScoreBadge(grade: product.nutriScoreGrade!),
                  ),
                ),

              // 2. NOVA Group Panel
              if (product.novaGroup != null)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.science,
                    iconColor: Colors.orange.shade700,
                    title: l10n.novaGroupTitle,
                    summary: l10n.novaGroupSummary(product.novaGroup!),
                    content: NovaGroupBadge(group: product.novaGroup!),
                  ),
                ),

              // 3. Eco-Score Panel
              if (product.ecoScore != null)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.eco,
                    iconColor: Colors.teal.shade700,
                    title: l10n.ecoScore,
                    summary:
                        l10n.gradeSummary(product.ecoScore!.toUpperCase()),
                    content: EcoScoreBadge(grade: product.ecoScore!),
                  ),
                ),

              // 4. Nutrition Facts Panel
              if (product.nutritionFact != null)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.restaurant,
                    iconColor: Colors.orange.shade600,
                    title: l10n.nutritionFactsTitle,
                    summary: l10n.per100g,
                    content:
                        _buildNutritionContent(product, l10n, locale),
                  ),
                ),

              // 5. Ingredients Panel
              if (product.ingredients.isNotEmpty ||
                  product.ingredientsText != null)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.science_outlined,
                    iconColor: Colors.teal.shade600,
                    title: l10n.ingredientsTitle,
                    summary: l10n.ingredientsCount(
                        product.ingredients.length),
                    content:
                        _buildIngredientsContent(product, l10n, locale),
                  ),
                ),

              // 6. Allergens Panel
              if (product.allergensDataAvailable)
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.warning_amber,
                    iconColor: Colors.red.shade700,
                    title: l10n.allergensTitle,
                    summary: product.allergens.isNotEmpty
                        ? product.allergens.join(', ')
                        : l10n.noAllergens,
                    content:
                        _buildAllergensContent(product, l10n, locale),
                  ),
                ),

              // 7. SFDA Safety Panel (Conditional)
              if (product.ingredients
                  .any((i) => i.sfdaStatus != IngredientSfdaStatus.safe))
                Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                  child: KnowledgePanelCard(
                    leadingIcon: Icons.shield,
                    iconColor: Colors.red.shade800,
                    title: l10n.sfdaSafety,
                    summary: l10n.flaggedItemsCount(product.ingredients
                        .where(
                            (i) => i.sfdaStatus != IngredientSfdaStatus.safe)
                        .length),
                    content:
                        _buildSfdaSafetyContent(product, l10n, locale),
                  ),
                ),

              // 8. Price Comparison
              if (product.prices.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 16, vertical: 12),
                  child: PricePreviewStrip(
                    gtin: product.gtin,
                    productName: locale.languageCode == 'ar'
                        ? product.nameAr
                        : product.nameEn,
                    merchantName: product.prices.first.merchant,
                    price: product.prices.first.priceSarInclVat,
                  ),
                ),

              const SizedBox(height: 24),
              _buildDisclaimer(l10n, locale),
              const SizedBox(height: 48),
            ]),
          ),
        ],
      ),
    );
  }

  // --------------------------------------------------------------------------
  // Hero section
  // --------------------------------------------------------------------------

  Widget _buildHero(
    BuildContext context,
    Product product,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(bottom: Radius.circular(32)),
      ),
      child: Stack(
        children: [
          Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 120, top: 40),
              child: product.images.isNotEmpty
                  ? Image.network(product.images.first.url,
                      fit: BoxFit.contain)
                  : const Icon(Icons.inventory_2_outlined,
                      size: 100, color: AppColors.onSurface),
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
                  style: AppTypography.caption(locale)
                      .copyWith(color: AppColors.onSurface),
                ),
                const SizedBox(height: 4),
                Text(
                  locale.languageCode == 'ar'
                      ? product.nameAr
                      : product.nameEn,
                  style: AppTypography.headline(locale).copyWith(
                    color: AppColors.onBackground,
                    fontSize: 26,
                  ),
                ),
                if (product.sfdaRegistrationStatus == 'registered' ||
                    product.sfdaRegistrationStatus == 'active' ||
                    product.halalCertified == true) ...[
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (product.sfdaRegistrationStatus == 'registered' ||
                          product.sfdaRegistrationStatus == 'active')
                        _buildSfdaBadge(l10n, locale),
                      if (product.halalCertified == true)
                        const HalalBadge(isCertified: true),
                    ],
                  ),
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

  // --------------------------------------------------------------------------
  // Knowledge-panel content builders
  // --------------------------------------------------------------------------

  Widget _buildNutritionContent(
      Product product, AppLocalizations l10n, Locale locale) {
    final nutrition = product.nutritionFact;
    if (nutrition == null) return const SizedBox.shrink();

    return Column(
      children: [
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

  Widget _buildIngredientsContent(
      Product product, AppLocalizations l10n, Locale locale) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (product.ingredients.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 10,
            children: product.ingredients
                .map((ing) => IngredientChip(ingredient: ing))
                .toList(),
          ),
        if (product.ingredientsText != null) ...[
          if (product.ingredients.isNotEmpty) const SizedBox(height: 16),
          Text(
            product.ingredientsText!,
            style: AppTypography.caption(locale).copyWith(
              color: AppColors.onSurface,
              height: 1.5,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildAllergensContent(
      Product product, AppLocalizations l10n, Locale locale) {
    if (product.allergens.isEmpty) {
      return Text(l10n.noAllergens, style: AppTypography.body(locale));
    }

    final cs = Theme.of(context).colorScheme;
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: product.allergens.map((allergen) {
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: cs.errorContainer,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: cs.errorContainer.withOpacity(0.6)),
          ),
          child: Text(
            allergen,
            style: AppTypography.caption(locale).copyWith(
              color: cs.error,
              fontWeight: FontWeight.bold,
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildSfdaSafetyContent(
      Product product, AppLocalizations l10n, Locale locale) {
    final flagged = product.ingredients
        .where((i) => i.sfdaStatus != IngredientSfdaStatus.safe)
        .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: flagged.map((ing) {
        return Padding(
          padding: const EdgeInsets.only(bottom: 8.0),
          child: IngredientChip(ingredient: ing),
        );
      }).toList(),
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

  // --------------------------------------------------------------------------
  // Error state
  // --------------------------------------------------------------------------

  Widget _buildError(
    BuildContext context,
    Object error,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final isNotFound = error is ProductNotFoundException;
    final isBackendUnavailable = error is BackendUnavailableException;
    final isFallbackUnavailable = error is FallbackUnavailableException;
    final isConfigError = error is FallbackConfigurationException;
    final isApiConfigError = error is ApiConfigurationException;

    String title;
    String description;
    IconData icon;

    if (isNotFound) {
      title = l10n.productNotFound;
      description = l10n.productNotFoundDescription;
      icon = Icons.search_off_outlined;
    } else if (isBackendUnavailable) {
      title = l10n.backendUnavailable;
      description = l10n.backendUnavailableDescription;
      icon = Icons.cloud_off_outlined;
    } else if (isFallbackUnavailable) {
      title = l10n.fallbackUnavailable;
      description = l10n.fallbackUnavailableDescription;
      icon = Icons.error_outline;
    } else if (isConfigError) {
      title = l10n.fallbackConfiguration;
      description = l10n.fallbackConfigurationDescription;
      icon = Icons.settings_applications_outlined;
    } else if (isApiConfigError) {
      title = l10n.apiConfiguration;
      description = l10n.apiConfigurationDescription;
      icon = Icons.settings_suggest;
    } else {
      title = l10n.serverError;
      description = l10n.serverErrorDescription;
      icon = Icons.error_outline;
    }

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            icon,
            size: 80,
            color: AppColors.onSurface,
          ),
          const SizedBox(height: 28),
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.headline(locale)
                .copyWith(color: AppColors.onBackground),
          ),
          const SizedBox(height: 16),
          Text(
            description,
            textAlign: TextAlign.center,
            style: AppTypography.body(locale)
                .copyWith(color: AppColors.onSurface),
          ),
          const SizedBox(height: 48),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                if (isNotFound) {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) =>
                          ProductEditScreen(barcode: widget.gtin),
                    ),
                  );
                } else {
                  ref.invalidate(productByGtinProvider(widget.gtin));
                }
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
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
