import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:sawa_app/l10n/app_localizations.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/price_info.dart';
import '../../providers/nearby_prices_provider.dart';

/// Shows store-scoped prices for a product sorted by distance from the user.
/// Handles the full location permission flow using geolocator.
class NearbyPricesScreen extends ConsumerStatefulWidget {
  final String gtin;
  final String productName;

  const NearbyPricesScreen({
    super.key,
    required this.gtin,
    required this.productName,
  });

  @override
  ConsumerState<NearbyPricesScreen> createState() => _NearbyPricesScreenState();
}

class _NearbyPricesScreenState extends ConsumerState<NearbyPricesScreen> {
  _LocationState _locationState = _LocationState.loading;
  Position? _position;

  @override
  void initState() {
    super.initState();
    _resolveLocation();
  }

  Future<void> _resolveLocation() async {
    setState(() => _locationState = _LocationState.loading);

    bool serviceEnabled;
    LocationPermission permission;

    serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      setState(() => _locationState = _LocationState.serviceDisabled);
      return;
    }

    permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        setState(() => _locationState = _LocationState.denied);
        return;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      setState(() => _locationState = _LocationState.deniedForever);
      return;
    }

    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
          timeLimit: Duration(seconds: 10),
        ),
      );
      ref.read(userLocationProvider.notifier).state = (
        lat: pos.latitude,
        lng: pos.longitude,
      );
      setState(() {
        _position = pos;
        _locationState = _LocationState.ready;
      });
    } catch (_) {
      setState(() => _locationState = _LocationState.error);
    }
  }

  @override
  Widget build(BuildContext context) {
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
          l10n.nearbyStores,
          style: AppTypography.headline(locale).copyWith(
            color: AppColors.onBackground,
            fontSize: 20,
          ),
        ),
      ),
      body: _buildBody(l10n, locale),
    );
  }

  Widget _buildBody(AppLocalizations l10n, Locale locale) {
    switch (_locationState) {
      case _LocationState.loading:
        return const Center(
          child: CircularProgressIndicator(color: AppColors.primary),
        );
      case _LocationState.serviceDisabled:
        return _buildPermissionPrompt(
          icon: Icons.location_off,
          title: l10n.locationPermissionRequired,
          subtitle: l10n.enableLocation,
          onAction: () async {
            await Geolocator.openLocationSettings();
            await _resolveLocation();
          },
          l10n: l10n,
          locale: locale,
        );
      case _LocationState.denied:
        return _buildPermissionPrompt(
          icon: Icons.location_disabled,
          title: l10n.locationPermissionRequired,
          subtitle: l10n.enableLocation,
          onAction: _resolveLocation,
          l10n: l10n,
          locale: locale,
        );
      case _LocationState.deniedForever:
        return _buildPermissionPrompt(
          icon: Icons.location_off,
          title: l10n.locationPermissionRequired,
          subtitle: l10n.enableLocation,
          onAction: () async {
            await Geolocator.openAppSettings();
          },
          l10n: l10n,
          locale: locale,
        );
      case _LocationState.error:
        return _buildPermissionPrompt(
          icon: Icons.error_outline,
          title: l10n.serverError,
          subtitle: l10n.enableLocation,
          onAction: _resolveLocation,
          l10n: l10n,
          locale: locale,
        );
      case _LocationState.ready:
        return _buildPricesList(l10n, locale);
    }
  }

  Widget _buildPermissionPrompt({
    required IconData icon,
    required String title,
    required String subtitle,
    required VoidCallback onAction,
    required AppLocalizations l10n,
    required Locale locale,
  }) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: AppColors.primary, size: 40),
            ),
            const SizedBox(height: 20),
            Text(
              title,
              textAlign: TextAlign.center,
              style: AppTypography.headline(locale).copyWith(
                color: AppColors.onBackground,
                fontSize: 18,
              ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: onAction,
                icon: const Icon(Icons.my_location, size: 20),
                label: Text(
                  subtitle,
                  style: AppTypography.body(locale).copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPricesList(AppLocalizations l10n, Locale locale) {
    if (_position == null) return const SizedBox.shrink();

    final pricesAsync = ref.watch(
      nearbyPricesProvider((
        gtin: widget.gtin,
        lat: _position!.latitude,
        lng: _position!.longitude,
      )),
    );

    return pricesAsync.when(
      data: (prices) {
        if (prices.isEmpty) {
          return Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.store_outlined,
                    color: AppColors.onSurface, size: 56),
                const SizedBox(height: 16),
                Text(
                  l10n.noNearbyStores,
                  textAlign: TextAlign.center,
                  style: AppTypography.body(locale)
                      .copyWith(color: AppColors.onSurface),
                ),
              ],
            ),
          );
        }
        return Column(
          children: [
            // Product name header
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  Icon(Icons.store, color: AppColors.primary, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      widget.productName,
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.onBackground,
                        fontWeight: FontWeight.w600,
                        fontSize: 15,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${prices.length}',
                      style: TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                itemCount: prices.length,
                itemBuilder: (ctx, i) =>
                    _buildStoreCard(prices[i], i == 0, l10n, locale),
              ),
            ),
          ],
        );
      },
      loading: () => const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      ),
      error: (err, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            err.toString(),
            textAlign: TextAlign.center,
            style: AppTypography.body(locale).copyWith(color: AppColors.error),
          ),
        ),
      ),
    );
  }

  Widget _buildStoreCard(
    PriceInfo price,
    bool isBest,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final isAr = locale.languageCode == 'ar';
    final storeName = isAr
        ? (price.storeNameAr ?? price.storeName ?? price.merchantAr)
        : (price.storeName ?? price.merchant);
    final districtName = isAr
        ? (price.districtNameAr ?? price.districtName ?? '')
        : (price.districtName ?? '');
    final hasPromo =
        price.promoPriceSar != null && price.promoPriceSar! < price.priceSarInclVat;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: isBest
              ? Border.all(color: AppColors.primary.withValues(alpha: 0.4), width: 1.5)
              : null,
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              // Store icon
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isBest
                      ? AppColors.primary.withValues(alpha: 0.1)
                      : AppColors.onSurface.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  Icons.storefront,
                  color: isBest ? AppColors.primary : AppColors.onSurface,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              // Store info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            storeName,
                            style: AppTypography.body(locale).copyWith(
                              fontWeight: FontWeight.w600,
                              color: AppColors.onBackground,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        if (isBest)
                          Container(
                            margin: const EdgeInsetsDirectional.only(start: 6),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.primary,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              l10n.bestPrice,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 10,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                    if (districtName.isNotEmpty)
                      Text(
                        districtName,
                        style: AppTypography.caption(locale)
                            .copyWith(color: AppColors.onSurface),
                      ),
                    if (price.distanceKm != null)
                      Row(
                        children: [
                          Icon(Icons.near_me,
                              size: 13, color: AppColors.onSurface),
                          const SizedBox(width: 4),
                          Text(
                            l10n.storeDistance(
                                price.distanceKm!.toStringAsFixed(1)),
                            style: AppTypography.caption(locale).copyWith(
                              color: AppColors.onSurface,
                            ),
                          ),
                        ],
                      ),
                    if (price.unitPriceSar != null &&
                        price.unitPriceUnit != null)
                      Row(
                        children: [
                          Icon(Icons.straighten,
                              size: 13, color: AppColors.onSurface),
                          const SizedBox(width: 4),
                          Text(
                            '${price.unitPriceSar!.toStringAsFixed(2)} ${l10n.sar} ${l10n.perUnit(price.unitPriceUnit!)}',
                            style: AppTypography.caption(locale).copyWith(
                              color: AppColors.onSurface,
                            ),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Price column
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (hasPromo) ...[
                    Text(
                      '${price.priceSarInclVat.toStringAsFixed(2)}',
                      style: AppTypography.caption(locale).copyWith(
                        color: AppColors.onSurface,
                        decoration: TextDecoration.lineThrough,
                      ),
                    ),
                    Text(
                      '${price.promoPriceSar!.toStringAsFixed(2)} ${l10n.sar}',
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.error,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.error.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        l10n.promoPrice,
                        style: TextStyle(
                          color: AppColors.error,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ] else
                    Text(
                      '${price.priceSarInclVat.toStringAsFixed(2)} ${l10n.sar}',
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                      ),
                    ),
                  if (!price.inStock)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        l10n.outOfStock,
                        style: AppTypography.caption(locale)
                            .copyWith(color: AppColors.error),
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

enum _LocationState {
  loading,
  serviceDisabled,
  denied,
  deniedForever,
  error,
  ready,
}
