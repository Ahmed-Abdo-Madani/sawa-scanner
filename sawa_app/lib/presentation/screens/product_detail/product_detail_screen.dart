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
import '../../providers/nearby_prices_provider.dart';
import '../../../data/datasources/location_service.dart';


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

  String _cleanMerchantName(String name) {
    if (name.isEmpty) return '';
    String cleaned = name.replaceAll(
      RegExp(
        r'(?:[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?\s*-?\s*[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?|[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?)\s*(?:mins|min|hours|hour|hour-min|hours-mins|دقيقة|دقيقه|د|ساعة|ساعه|س).*$',
        caseSensitive: false,
      ),
      '',
    ).trim();

    cleaned = cleaned
        .replaceAll(RegExp(r'\s*\(HungerStation\)', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*\(هنقرستيشن\)', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*\(Hunger\s+Station\)', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*HungerStation$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*Hunger\s+Station$', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*هنقرستيشن$', caseSensitive: false), '')
        .trim();

    return cleaned;
  }

  List<PriceInfo> _deduplicatePrices(List<PriceInfo> prices, ({double lat, double lng})? userLocation) {
    final groups = <String, List<PriceInfo>>{};
    for (final p in prices) {
      final key = _cleanMerchantName(p.merchant).toLowerCase().trim();
      groups.putIfAbsent(key, () => []).add(p);
    }

    final List<PriceInfo> result = [];
    for (final group in groups.values) {
      if (group.length == 1) {
        final p = group.first;
        if (userLocation != null && p.storeLat != null && p.storeLng != null) {
          final dist = LocationService.distanceKm(
            userLocation.lat,
            userLocation.lng,
            p.storeLat!,
            p.storeLng!,
          );
          result.add(PriceInfo(
            merchant: p.merchant,
            merchantAr: p.merchantAr,
            logoUrl: p.logoUrl,
            sourceUrl: p.sourceUrl,
            priceSarInclVat: p.priceSarInclVat,
            promoPriceSar: p.promoPriceSar,
            unitPriceSar: p.unitPriceSar,
            unitPriceUnit: p.unitPriceUnit,
            inStock: p.inStock,
            scrapedAt: p.scrapedAt,
            storeId: p.storeId,
            storeName: p.storeName,
            storeNameAr: p.storeNameAr,
            districtName: p.districtName,
            districtNameAr: p.districtNameAr,
            storeLat: p.storeLat,
            storeLng: p.storeLng,
            distanceKm: dist,
          ));
        } else {
          result.add(p);
        }
      } else {
        PriceInfo best = group.first;
        double? bestDist;
        if (userLocation != null) {
          double minDistance = double.infinity;
          for (final p in group) {
            if (p.storeLat != null && p.storeLng != null) {
              final dist = LocationService.distanceKm(
                userLocation.lat,
                userLocation.lng,
                p.storeLat!,
                p.storeLng!,
              );
              if (dist < minDistance) {
                minDistance = dist;
                best = p;
                bestDist = dist;
              }
            }
          }
        } else {
          // Fallback: cheapest price
          double minPrice = double.infinity;
          for (final p in group) {
            if (p.priceSarInclVat < minPrice) {
              minPrice = p.priceSarInclVat;
              best = p;
            }
          }
        }

        result.add(PriceInfo(
          merchant: best.merchant,
          merchantAr: best.merchantAr,
          logoUrl: best.logoUrl,
          sourceUrl: best.sourceUrl,
          priceSarInclVat: best.priceSarInclVat,
          promoPriceSar: best.promoPriceSar,
          unitPriceSar: best.unitPriceSar,
          unitPriceUnit: best.unitPriceUnit,
          inStock: best.inStock,
          scrapedAt: best.scrapedAt,
          storeId: best.storeId,
          storeName: best.storeName,
          storeNameAr: best.storeNameAr,
          districtName: best.districtName,
          districtNameAr: best.districtNameAr,
          storeLat: best.storeLat,
          storeLng: best.storeLng,
          distanceKm: bestDist,
        ));
      }
    }

    // Sort: if userLocation != null, sort by distanceKm ascending.
    // If distanceKm is null, it goes to the end.
    // If both have distance, sort by distance.
    // If both don't have distance (or userLocation is null), sort by: HungerStation first, then cheapest.
    result.sort((a, b) {
      if (userLocation != null) {
        final distA = a.distanceKm;
        final distB = b.distanceKm;
        if (distA != null && distB != null) {
          return distA.compareTo(distB);
        } else if (distA != null) {
          return -1;
        } else if (distB != null) {
          return 1;
        }
      }
      // Fallback sorting: HungerStation first, then cheapest
      final aIsHs = a.storeId != null;
      final bIsHs = b.storeId != null;
      if (aIsHs && !bIsHs) return -1;
      if (!aIsHs && bIsHs) return 1;
      return a.priceSarInclVat.compareTo(b.priceSarInclVat);
    });

    return result;
  }

  Map<double, String> _classifyPrices(List<PriceInfo> prices) {
    if (prices.isEmpty) return {};
    final uniquePrices = prices.map((p) => p.priceSarInclVat).toSet().toList();
    if (uniquePrices.length == 1) {
      return {uniquePrices.first: 'common'};
    }

    // Count frequencies
    final counts = <double, int>{};
    for (final p in prices) {
      counts[p.priceSarInclVat] = (counts[p.priceSarInclVat] ?? 0) + 1;
    }

    // Find the max frequency
    int maxCount = 0;
    for (final count in counts.values) {
      if (count > maxCount) {
        maxCount = count;
      }
    }

    // Find all prices that have this max frequency
    final modes = counts.entries
        .where((e) => e.value == maxCount)
        .map((e) => e.key)
        .toList();

    // If all unique prices have same frequency, we use lowest as low, highest as high, and others as common.
    final allSameFrequency = counts.values.toSet().length == 1;

    if (allSameFrequency) {
      final lowest = uniquePrices.reduce((a, b) => a < b ? a : b);
      final highest = uniquePrices.reduce((a, b) => a > b ? a : b);
      final classification = <double, String>{};
      for (final pr in uniquePrices) {
        if (pr == lowest) {
          classification[pr] = 'low';
        } else if (pr == highest) {
          classification[pr] = 'high';
        } else {
          classification[pr] = 'common';
        }
      }
      return classification;
    }

    // Otherwise, we have a clear mode (common price)
    final commonPrice = modes.first;
    final classification = <double, String>{};
    for (final pr in uniquePrices) {
      if (pr == commonPrice) {
        classification[pr] = 'common';
      } else if (pr < commonPrice) {
        classification[pr] = 'low';
      } else {
        classification[pr] = 'high';
      }
    }
    return classification;
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
    final userLocation = ref.watch(userLocationProvider);

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
            _buildContent(context, product, l10n, locale, userLocation),
        loading: () => widget.initialProduct != null
            ? _buildContent(context, widget.initialProduct!, l10n, locale, userLocation)
            : const Center(
                child: CircularProgressIndicator(color: AppColors.primary)),
        error: (err, stack) {
          if (widget.initialProduct != null) {
            return _buildContent(
                context, widget.initialProduct!, l10n, locale, userLocation);
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
    ({double lat, double lng})? userLocation,
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
              _buildPriceDashboard(context, product, l10n, locale, userLocation),
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
    ({double lat, double lng})? userLocation,
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

    final deduplicatedPrices = _deduplicatePrices(validPrices, userLocation);
    final classifications = _classifyPrices(validPrices);

    double? minDistance;
    for (final p in deduplicatedPrices) {
      if (p.distanceKm != null) {
        if (minDistance == null || p.distanceKm! < minDistance) {
          minDistance = p.distanceKm;
        }
      }
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
          ...deduplicatedPrices.map((price) {
            final priceClass = classifications[price.priceSarInclVat] ?? 'common';
            final isLow = priceClass == 'low';
            final isHigh = priceClass == 'high';
            final isNearest = price.distanceKm != null && price.distanceKm == minDistance;

            final rawStoreName = locale.languageCode == 'ar'
                ? (price.merchantAr.isNotEmpty ? price.merchantAr : price.merchant)
                : price.merchant;
            final storeName = _cleanMerchantName(rawStoreName);

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
                          if (price.districtName != null && price.districtName!.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              locale.languageCode == 'ar'
                                  ? (price.districtNameAr ?? price.districtName!)
                                  : price.districtName!,
                              style: AppTypography.caption(locale).copyWith(
                                color: AppColors.onSurface.withOpacity(0.6),
                                fontSize: 12,
                              ),
                            ),
                          ],
                          if (price.distanceKm != null) ...[
                            const SizedBox(height: 2),
                            Row(
                              children: [
                                const Icon(Icons.near_me, size: 10, color: AppColors.primary),
                                const SizedBox(width: 4),
                                Text(
                                  l10n.storeDistance(price.distanceKm!.toStringAsFixed(1)),
                                  style: AppTypography.caption(locale).copyWith(
                                    color: AppColors.primary,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 11,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 6,
                            runSpacing: 4,
                            children: [
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
                              if (isNearest)
                                _buildPriceTierBadge(
                                  label: l10n.nearestStore,
                                  color: Colors.blue,
                                  icon: Icons.near_me,
                                  locale: locale,
                                ),
                            ],
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
