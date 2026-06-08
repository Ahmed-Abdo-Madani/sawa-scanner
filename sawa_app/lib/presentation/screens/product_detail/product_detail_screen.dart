import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/utils/store_logo_helper.dart';
import '../../providers/product_provider.dart';
import '../../providers/scan_history_provider.dart';
import '../../providers/cart_provider.dart';
import '../../widgets/halal_badge.dart';
import '../../widgets/fallback_image_network.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';
import '../../../domain/entities/price_info.dart';
import '../../../core/exceptions.dart';


class ProductDetailScreen extends ConsumerStatefulWidget {
  final String gtin;
  final Product? initialProduct;
  /// When `true` the caller has already written a [ScanHistoryEntry] for this
  /// product (e.g. the label-scan path in [ScannerScreen]).  The detail screen
  /// skips its own history write to prevent duplicate entries.
  final bool historyAlreadyRecorded;
  /// Captured image bytes from label scan, used as fallback image in hero.
  final Uint8List? capturedImageBytes;
  final String? selectedMerchant;

  const ProductDetailScreen({
    super.key,
    required this.gtin,
    this.initialProduct,
    this.historyAlreadyRecorded = false,
    this.capturedImageBytes,
    this.selectedMerchant,
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
      barcode: product.gtin.isNotEmpty ? product.gtin : product.id,
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
              child: widget.capturedImageBytes != null
                  ? Image.memory(
                      widget.capturedImageBytes!,
                      fit: BoxFit.contain,
                    )
                  : FallbackImageNetwork(
                      imageUrls: FallbackImageNetwork.getPrioritizedImageUrls(
                        product,
                        selectedMerchant: widget.selectedMerchant,
                      ),
                      fit: BoxFit.contain,
                      fallback: const Icon(
                        Icons.inventory_2_outlined,
                        size: 100,
                        color: AppColors.onSurface,
                      ),
                    ),
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
    if (product.prices.isEmpty) {
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

    final validPrices = product.prices
        .where((p) => p.priceSarInclVat > 0)
        .toList();

    double? lowest;
    double? highest;

    if (validPrices.isNotEmpty) {
      final numericalPrices = validPrices.map((p) => p.priceSarInclVat).toList();
      lowest = numericalPrices.reduce((a, b) => a < b ? a : b);
      highest = numericalPrices.reduce((a, b) => a > b ? a : b);
    }

    final cartItems = ref.watch(cartProvider);
    final productKey = product.gtin.isNotEmpty ? product.gtin : product.id;
    final cartItem = cartItems.where((item) {
      final itemKey = item.product.gtin.isNotEmpty ? item.product.gtin : item.product.id;
      return itemKey == productKey;
    }).firstOrNull;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ...validPrices.map((price) {
            final isLow = lowest != null && highest != null && lowest != highest && price.priceSarInclVat == lowest;
            final isHigh = lowest != null && highest != null && lowest != highest && price.priceSarInclVat == highest;

            final storeName = locale.languageCode == 'ar'
                ? (price.merchantAr.isNotEmpty ? price.merchantAr : price.merchant)
                : price.merchant;

            return Card(
              margin: const EdgeInsets.only(bottom: 12),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
                side: BorderSide(color: AppColors.onSurface.withOpacity(0.06)),
              ),
              color: AppColors.surface,
              elevation: 0,
              child: Padding(
                padding: const EdgeInsets.all(14.0),
                child: Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: StoreLogoHelper.buildStoreLogo(
                        price.merchant,
                        size: 44,
                        networkFallbackUrl: price.logoUrl,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            storeName,
                            style: AppTypography.body(locale).copyWith(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                              color: AppColors.onBackground,
                            ),
                          ),
                          const SizedBox(height: 4),
                          if (isLow)
                            _buildPriceTierBadge(
                              label: l10n.lowPrice,
                              color: Colors.green,
                              icon: Icons.arrow_downward,
                              locale: locale,
                            )
                          else if (isHigh)
                            _buildPriceTierBadge(
                              label: l10n.highPrice,
                              color: Colors.red,
                              icon: Icons.arrow_upward,
                              locale: locale,
                            )
                          else
                            _buildPriceTierBadge(
                              label: l10n.commonPrice,
                              color: Colors.blueGrey,
                              icon: Icons.label,
                              locale: locale,
                            ),
                        ],
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          crossAxisAlignment: CrossAxisAlignment.baseline,
                          textBaseline: TextBaseline.alphabetic,
                          children: [
                            Text(
                              price.priceSarInclVat.toStringAsFixed(2),
                              style: TextStyle(
                                color: isLow
                                    ? Colors.green.shade700
                                    : (isHigh ? Colors.red.shade700 : AppColors.onBackground),
                                fontSize: 20,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(width: 2),
                            Text(
                              l10n.sar,
                              style: AppTypography.caption(locale).copyWith(
                                color: AppColors.onSurface.withOpacity(0.8),
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        if (price.sourceUrl != null && price.sourceUrl!.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          GestureDetector(
                            onTap: () async {
                              final uri = Uri.tryParse(price.sourceUrl!);
                              if (uri != null) {
                                try {
                                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                                } catch (e) {
                                  debugPrint("Could not launch store URL: $e");
                                }
                              }
                            },
                            child: Row(
                              children: [
                                Text(
                                  l10n.visitStore,
                                  style: const TextStyle(
                                    color: AppColors.primary,
                                    fontSize: 12,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                                const SizedBox(width: 2),
                                const Icon(
                                  Icons.open_in_new,
                                  size: 12,
                                  color: AppColors.primary,
                                ),
                              ],
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            );
          }),
          const SizedBox(height: 16),
          cartItem != null
              ? Container(
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.remove, color: AppColors.primary),
                        onPressed: () {
                          ref.read(cartProvider.notifier).updateQuantity(productKey, cartItem.quantity - 1);
                        },
                      ),
                      Text(
                        '${cartItem.quantity} ${locale.languageCode == 'ar' ? 'في السلة' : 'in Cart'}',
                        style: AppTypography.body(locale).copyWith(
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          color: AppColors.primary,
                        ),
                      ),
                      IconButton(
                        icon: const Icon(Icons.add, color: AppColors.primary),
                        onPressed: () {
                          ref.read(cartProvider.notifier).updateQuantity(productKey, cartItem.quantity + 1);
                        },
                      ),
                    ],
                  ),
                )
              : ElevatedButton.icon(
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
                  icon: const Icon(Icons.add_shopping_cart, color: Colors.white, size: 18),
                  label: Text(
                    l10n.addToCart,
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
        ],
      ),
    );
  }

  Widget _buildPriceTierBadge({
    required String label,
    required Color color,
    required IconData icon,
    required Locale locale,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            label,
            style: AppTypography.caption(locale).copyWith(
              color: color,
              fontWeight: FontWeight.bold,
              fontSize: 11,
            ),
          ),
        ],
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
