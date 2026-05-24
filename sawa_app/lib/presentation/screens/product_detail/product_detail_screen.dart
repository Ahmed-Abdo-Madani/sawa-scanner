import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../providers/product_provider.dart';
import '../../providers/scan_history_provider.dart';
import '../../providers/cart_provider.dart';
import '../../widgets/halal_badge.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';
import '../../../core/exceptions.dart';
import 'nearby_prices_screen.dart';

class ProductDetailScreen extends ConsumerStatefulWidget {
  final String gtin;
  final Product? initialProduct;
  /// When `true` the caller has already written a [ScanHistoryEntry] for this
  /// product (e.g. the label-scan path in [ScannerScreen]).  The detail screen
  /// skips its own history write to prevent duplicate entries.
  final bool historyAlreadyRecorded;
  /// Captured image bytes from label scan, used as fallback image in hero.
  final Uint8List? capturedImageBytes;

  const ProductDetailScreen({
    super.key,
    required this.gtin,
    this.initialProduct,
    this.historyAlreadyRecorded = false,
    this.capturedImageBytes,
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
    try {
      await ref.read(productByGtinProvider(widget.gtin).future);
    } catch (_) {}
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



    return Scaffold(
      backgroundColor: AppColors.background,
      floatingActionButton: null,
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
              _buildPriceDashboard(context, product, l10n, locale),
              const SizedBox(height: 24),
              _buildDisclaimer(l10n, locale),
              const SizedBox(height: 48),
            ]),
          ),
        ],
      ),
    );
  }

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
                  ? CachedNetworkImage(
                      imageUrl: product.images.first.url,
                      fit: BoxFit.contain,
                      placeholder: (context, url) => const Center(
                          child: CircularProgressIndicator(color: AppColors.primary)),
                      errorWidget: (context, url, error) => const Icon(
                          Icons.broken_image_outlined,
                          size: 40,
                          color: Colors.grey),
                    )
                  : widget.capturedImageBytes != null
                      ? Image.memory(
                          widget.capturedImageBytes!,
                          fit: BoxFit.contain,
                        )
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

  Widget _buildPriceDashboard(
    BuildContext context,
    Product product,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final validPrices = product.prices
        .where((p) => p.priceSarInclVat > 0)
        .toList();

    double? lowest;
    double? average;
    double? highest;

    if (validPrices.isNotEmpty) {
      final numericalPrices = validPrices.map((p) => p.priceSarInclVat).toList();
      lowest = numericalPrices.reduce((a, b) => a < b ? a : b);
      highest = numericalPrices.reduce((a, b) => a > b ? a : b);
      average = numericalPrices.reduce((a, b) => a + b) / numericalPrices.length;
    }

    if (lowest == null || average == null || highest == null) {
      return Padding(
        padding: const EdgeInsets.all(16.0),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.onSurface.withOpacity(0.06)),
          ),
          child: Column(
            children: [
              const Icon(Icons.store_outlined, color: AppColors.onSurface, size: 48),
              const SizedBox(height: 16),
              Text(
                locale.languageCode == 'ar'
                    ? "لا توجد أسعار متاحة لهذا المنتج حالياً."
                    : "No price information available for this product.",
                textAlign: TextAlign.center,
                style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
              ),
            ],
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.onSurface.withOpacity(0.06)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.priceSummary,
                  style: AppTypography.headline(locale).copyWith(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.onBackground,
                  ),
                ),
                const SizedBox(height: 16),
                Row(
                  children: [
                    Expanded(
                      child: _buildDetailPriceCard(
                        title: l10n.lowestPrice,
                        price: lowest,
                        color: Colors.green,
                        locale: locale,
                        l10n: l10n,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildDetailPriceCard(
                        title: l10n.averagePrice,
                        price: average,
                        color: Colors.blue,
                        locale: locale,
                        l10n: l10n,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _buildDetailPriceCard(
                        title: l10n.highestPrice,
                        price: highest,
                        color: Colors.red,
                        locale: locale,
                        l10n: l10n,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => NearbyPricesScreen(
                    gtin: product.gtin,
                    productName: locale.languageCode == 'ar'
                        ? product.nameAr
                        : product.nameEn,
                  ),
                ),
              );
            },
            icon: const Icon(Icons.compare_arrows, color: Colors.white),
            label: Text(
              l10n.comparePrices,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
                fontSize: 16,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
              elevation: 0,
            ),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              ref.read(cartProvider.notifier).addProduct(product);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(l10n.addedToCart),
                  duration: const Duration(seconds: 2),
                  backgroundColor: AppColors.primary,
                  behavior: SnackBarBehavior.floating,
                ),
              );
            },
            icon: const Icon(Icons.add_shopping_cart, color: AppColors.primary),
            label: Text(
              l10n.addToCart,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: AppColors.primary,
                fontSize: 15,
              ),
            ),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              side: const BorderSide(color: AppColors.primary, width: 1.5),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailPriceCard({
    required String title,
    required double price,
    required Color color,
    required Locale locale,
    required AppLocalizations l10n,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.12), width: 1),
      ),
      child: Column(
        children: [
          Text(
            title,
            textAlign: TextAlign.center,
            style: AppTypography.caption(locale).copyWith(
              color: AppColors.onSurface,
              fontWeight: FontWeight.bold,
              fontSize: 10,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            price.toStringAsFixed(2),
            style: TextStyle(
              color: color.withOpacity(0.9),
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            l10n.sar,
            style: AppTypography.caption(locale).copyWith(
              color: color.withOpacity(0.6),
              fontSize: 9,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
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
                  Navigator.pop(context);
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
                isNotFound ? l10n.close : l10n.retryButton,
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
