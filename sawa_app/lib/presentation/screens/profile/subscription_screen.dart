import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/iap_config.dart';
import '../../providers/user_preferences_provider.dart';
import '../../providers/iap_provider.dart';

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> {

  @override
  void initState() {
    super.initState();

    // Load App Store/Play Store products on screen initialization
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(iapProvider.notifier).loadProducts();
    });
  }

  Future<void> _manageSubscription() async {
    final String urlString = kIsWeb 
        ? 'https://apps.apple.com/account/subscriptions' 
        : Platform.isAndroid 
            ? 'https://play.google.com/store/account/subscriptions'
            : 'https://apps.apple.com/account/subscriptions';
    final Uri url = Uri.parse(urlString);

    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      } else {
        throw 'Could not launch store subscription manager.';
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(e.toString()),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final isSubscribed = ref.watch(userPreferencesProvider).isSubscribed;
    final iapState = ref.watch(iapProvider);

    // Watch IAP Provider state updates for transaction errors/success
    ref.listen<IapState>(iapProvider, (previous, next) {
      if (next.errorMessage != null) {
        String message = next.errorMessage!;
        if (message == 'store_unavailable') {
          message = l10n.iapStoreUnavailable;
        } else if (message == 'products_not_found') {
          message = l10n.iapLoadingProducts;
        } else if (message == 'restore_not_found') {
          message = l10n.iapRestoreNotFound;
        } else {
          message = '${l10n.iapPurchaseFailed} (${next.errorMessage})';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(message),
            backgroundColor: AppColors.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
        ref.read(iapProvider.notifier).clearError();
      }

      if (next.hasRestored && previous?.hasRestored != true) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(l10n.iapRestoreSuccess),
            backgroundColor: Colors.green,
            behavior: SnackBarBehavior.floating,
          ),
        );
        ref.read(iapProvider.notifier).resetRestoreFlag();
        Navigator.of(context).pop();
      }
    });

    // Locate the Sawa Plus monthly subscription product
    ProductDetails? plusProduct;
    for (final p in iapState.products) {
      if (p.id == IapConfig.subscriptionProductId) {
        plusProduct = p;
        break;
      }
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          l10n.sawaPlus,
          style: AppTypography.headline(locale),
        ),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Premium Badge Header
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.amber.shade400,
                        Colors.amber.shade700,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.amber.withOpacity(0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.star, size: 64, color: Colors.white),
                      const SizedBox(height: 16),
                      Text(
                        l10n.sawaPlus,
                        style: AppTypography.display(locale).copyWith(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        isSubscribed ? l10n.sawaPlusSubscriber : l10n.upgradeSawaPlusButton,
                        style: AppTypography.body(locale).copyWith(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),

                // Features Title
                Text(
                  l10n.featuresTitle,
                  style: AppTypography.headline(locale).copyWith(fontSize: 20),
                ),
                const SizedBox(height: 16),

                // Feature Items
                _buildFeatureRow(
                  icon: Icons.flash_on,
                  title: l10n.unlimitedScans,
                  description: l10n.scanLimitMessage,
                  locale: locale,
                ),
                _buildFeatureRow(
                  icon: Icons.shopping_cart_outlined,
                  title: l10n.cartOptimizations,
                  description: l10n.featureCartDesc,
                  locale: locale,
                ),
                _buildFeatureRow(
                  icon: Icons.show_chart,
                  title: l10n.historicTrends,
                  description: l10n.unlockSawaPlus,
                  locale: locale,
                ),
                const Divider(height: 48, color: Colors.white10),

                // Technical Explanation Card
                Card(
                  color: AppColors.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.info_outline, color: AppColors.primary),
                            const SizedBox(width: 8),
                            Text(
                              l10n.subscriptionExplanationTitle,
                              style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          l10n.subscriptionExplanationText,
                          style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.7), height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 40),

                // Action Button
                if (isSubscribed)
                  OutlinedButton(
                    onPressed: _manageSubscription,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.primary),
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: Text(
                      l10n.manageSubscription,
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  )
                else ...[
                  ElevatedButton(
                    onPressed: plusProduct != null
                        ? () => ref.read(iapProvider.notifier).buySubscription(plusProduct!)
                        : null,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                    child: Text(
                      plusProduct != null
                          ? "${l10n.upgradeSawaPlusButton} (${plusProduct.price})"
                          : l10n.iapLoadingProducts,
                      style: AppTypography.body(locale).copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  TextButton(
                    onPressed: () => ref.read(iapProvider.notifier).restorePurchases(),
                    child: Text(
                      l10n.restorePurchaseButton,
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
              ],
            ),
          ),
          
          // Loading Indicator Overlay
          if (iapState.isLoading)
            Container(
              color: Colors.black.withOpacity(0.5),
              child: const Center(
                child: CircularProgressIndicator(
                  valueColor: AlwaysStoppedAnimation<Color>(AppColors.primary),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFeatureRow({
    required IconData icon,
    required String title,
    required String description,
    required Locale locale,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: Colors.amber.shade700, size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.6), height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
