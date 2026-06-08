import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:intl/intl.dart' as intl;

import '../../providers/price_comparison_provider.dart';
import '../../providers/nearby_prices_provider.dart';
import '../../../data/datasources/location_service.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/price_info.dart';

class PriceComparisonScreen extends ConsumerWidget {
  final String gtin;
  final String productName;

  const PriceComparisonScreen({
    super.key,
    required this.gtin,
    required this.productName,
  });

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
        .replaceAll(RegExp(r'\s*HungerStation\b', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*Hunger\s+Station\b', caseSensitive: false), '')
        .replaceAll(RegExp(r'\s*هنقرستيشن\b', caseSensitive: false), '')
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
        result.add(group.first);
      } else {
        PriceInfo best = group.first;
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
        result.add(best);
      }
    }

    // Sort: HungerStation first, then cheapest
    result.sort((a, b) {
      final aIsHs = a.storeId != null;
      final bIsHs = b.storeId != null;
      if (aIsHs && !bIsHs) return -1;
      if (!aIsHs && bIsHs) return 1;
      return a.priceSarInclVat.compareTo(b.priceSarInclVat);
    });

    return result;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pricesAsync = ref.watch(latestPricesProvider(gtin));
    final historyAsync = ref.watch(priceHistoryProvider(gtin));
    final isPlus = ref.watch(isSawaPlusProvider);
    final userLocation = ref.watch(userLocationProvider);
    
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(l10n.priceComparison, style: AppTypography.headline(locale)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(productName, style: AppTypography.display(locale).copyWith(fontSize: 22)),
            const SizedBox(height: 24),
            
            // Latest Prices List
            pricesAsync.when(
              data: (prices) => _buildPriceList(context, prices, userLocation, l10n, locale),
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.primary)),
              error: (err, _) => Center(child: Text(l10n.serverError)),
            ),
            
            const SizedBox(height: 32),
            Text(l10n.historicalPriceTrend, style: AppTypography.headline(locale)),
            const SizedBox(height: 16),
            
            // History Chart with Sawa Plus Gate
            _buildHistorySection(context, historyAsync, isPlus, l10n, locale),
          ],
        ),
      ),
    );
  }

  Widget _buildPriceList(
    BuildContext context,
    List<PriceInfo> prices,
    ({double lat, double lng})? userLocation,
    AppLocalizations l10n,
    Locale locale,
  ) {
    if (prices.isEmpty) return const SizedBox.shrink();

    final deduplicated = _deduplicatePrices(prices, userLocation);

    return Column(
      children: deduplicated.map((price) => _buildPriceCard(context, price, l10n, locale)).toList(),
    );
  }

  Widget _buildPriceCard(BuildContext context, PriceInfo price, AppLocalizations l10n, Locale locale) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        color: AppColors.surface,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              // Merchant Logo Placeholder or Icon
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: AppColors.onSurface.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: price.logoUrl != null 
                  ? ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        price.logoUrl!,
                        fit: BoxFit.cover,
                        cacheWidth: 150,
                      ),
                    )
                  : const Icon(Icons.store, color: AppColors.onSurface),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      locale.languageCode == 'ar' ? _cleanMerchantName(price.merchantAr) : _cleanMerchantName(price.merchant),
                      style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
                    ),
                    if (price.districtName != null && price.districtName!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        locale.languageCode == 'ar'
                            ? (price.districtNameAr ?? price.districtName!)
                            : price.districtName!,
                        style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.6)),
                      ),
                    ],
                    if (price.distanceKm != null) ...[
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          const Icon(Icons.near_me, size: 12, color: AppColors.primary),
                          const SizedBox(width: 4),
                          Text(
                            l10n.storeDistance(price.distanceKm!.toStringAsFixed(1)),
                            style: AppTypography.caption(locale).copyWith(
                              color: AppColors.primary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                    const SizedBox(height: 4),
                    Text(
                      intl.DateFormat.yMMMd(locale.languageCode).format(price.scrapedAt),
                      style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface),
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${price.priceSarInclVat.toStringAsFixed(2)} ${l10n.sar}',
                    style: AppTypography.body(locale).copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 18,
                    ),
                  ),
                  if (!price.inStock)
                    Text(
                      l10n.outOfStock,
                      style: AppTypography.caption(locale).copyWith(color: AppColors.error),
                    ),
                ],
              ),
              const SizedBox(width: 12),
              if (price.sourceUrl != null)
                IconButton(
                  icon: const Icon(Icons.add_shopping_cart, color: AppColors.primary),
                  onPressed: () => _launchUrl(price.sourceUrl!),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHistorySection(
    BuildContext context, 
    AsyncValue<List<PriceInfo>> historyAsync, 
    bool isPlus, 
    AppLocalizations l10n, 
    Locale locale
  ) {
    return historyAsync.when(
      data: (history) {
        if (history.isEmpty) return const SizedBox.shrink();
        
        return Stack(
          children: [
            // The Chart
            AspectRatio(
              aspectRatio: 1.7,
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: 18, start: 12, top: 24, bottom: 12),
                child: LineChart(
                  _buildChartData(history, isPlus),
                ),
              ),
            ),
            
            // Sawa Plus Gate Overlay
            if (!isPlus)
              Positioned.fill(
                child: Container(
                  decoration: BoxDecoration(
                    color: AppColors.background.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(16),
                  ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.lock_outline, color: AppColors.primary, size: 40),
                          const SizedBox(height: 12),
                          Text(
                            l10n.sawaPlusGated,
                            style: AppTypography.headline(locale).copyWith(fontSize: 18),
                          ),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 8),
                            child: Text(
                              l10n.unlockSawaPlus,
                              textAlign: TextAlign.center,
                              style: AppTypography.caption(locale),
                            ),
                          ),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: () {
                              // Link to subscription page
                            },
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.primary,
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                            ),
                            child: Text(l10n.upgradeNow, style: const TextStyle(color: Colors.white)),
                          ),
                        ],
                      ),
                    ),
                ),
            ],
          );

      },
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (err, _) => const SizedBox.shrink(),
    );
  }

  LineChartData _buildChartData(List<PriceInfo> history, bool isPlus) {
    // Group history by merchant for multi-line support
    final merchantGroups = <String, List<PriceInfo>>{};
    for (final p in history) {
      merchantGroups.putIfAbsent(p.merchant, () => []).add(p);
    }

    final lineBars = merchantGroups.entries.map((entry) {
      final merchant = entry.key;
      final points = entry.value;
      
      return LineChartBarData(
        spots: points.map((p) {
          final x = p.scrapedAt.millisecondsSinceEpoch.toDouble();
          return FlSpot(x, p.priceSarInclVat);
        }).toList(),
        isCurved: true,
        color: _getMerchantColor(merchant),
        barWidth: 3,
        isStrokeCapRound: true,
        dotData: const FlDotData(show: false),
        belowBarData: BarAreaData(
          show: true,
          color: _getMerchantColor(merchant).withOpacity(0.1),
        ),
      );
    }).toList();

    return LineChartData(
      gridData: const FlGridData(show: false),
      titlesData: const FlTitlesData(show: false), // Hide axes for cleaner look in detail view
      borderData: FlBorderData(show: false),
      lineBarsData: lineBars,
      lineTouchData: LineTouchData(
        enabled: isPlus,
      ),
    );
  }

  Color _getMerchantColor(String merchant) {
    switch (merchant.toLowerCase()) {
      case 'panda': return Colors.green;
      case 'carrefour': return Colors.blue;
      case 'othaim': return Colors.orange;
      case 'tamimi': return Colors.red;
      default: return AppColors.primary;
    }
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    if (!await launchUrl(uri)) {
      throw Exception('Could not launch $url');
    }
  }
}
