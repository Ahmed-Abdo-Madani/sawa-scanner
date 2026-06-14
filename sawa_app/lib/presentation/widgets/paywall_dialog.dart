import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../l10n/app_localizations.dart';
import '../../../core/iap_config.dart';
import '../providers/iap_provider.dart';

class SawaPlusPaywallDialog extends ConsumerStatefulWidget {
  const SawaPlusPaywallDialog({super.key});

  @override
  ConsumerState<SawaPlusPaywallDialog> createState() => _SawaPlusPaywallDialogState();
}

class _SawaPlusPaywallDialogState extends ConsumerState<SawaPlusPaywallDialog> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(iapProvider.notifier).loadProducts();
    });
  }

  Future<void> _launchURL(String urlString) async {
    final Uri url = Uri.parse(urlString);
    try {
      if (await canLaunchUrl(url)) {
        await launchUrl(url, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final isRtl = locale.languageCode == 'ar';
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

    return Dialog(
      backgroundColor: const Color(0xFF121216),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
      clipBehavior: Clip.antiAlias,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 24.0),
      child: Container(
        constraints: const BoxConstraints(maxWidth: 400),
        child: Stack(
          children: [
            SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Top header bar (Close & Restore)
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white70, size: 24),
                          onPressed: () => Navigator.of(context).pop(),
                          padding: EdgeInsets.zero,
                          constraints: const BoxConstraints(),
                        ),
                        TextButton(
                          onPressed: () => ref.read(iapProvider.notifier).restorePurchases(),
                          style: TextButton.styleFrom(
                            minimumSize: Size.zero,
                            padding: EdgeInsets.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(
                            l10n.restorePurchaseButton,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.6),
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    // Paywall Illustration
                    Center(
                      child: Container(
                        height: 110,
                        width: 110,
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E1E24),
                          borderRadius: BorderRadius.circular(24),
                        ),
                        child: Center(
                          child: Image.asset(
                            'assets/images/app_logo.png',
                            height: 76,
                            width: 76,
                            fit: BoxFit.contain,
                            errorBuilder: (context, error, stackTrace) => const Icon(
                              Icons.qr_code_scanner,
                              size: 50,
                              color: AppColors.primary,
                            ),
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Title with highlight
                    RichText(
                      textAlign: TextAlign.center,
                      text: TextSpan(
                        style: AppTypography.display(locale).copyWith(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.w900,
                          height: 1.25,
                        ),
                        children: isRtl
                            ? [
                                const TextSpan(text: 'اضغط على '),
                                TextSpan(
                                  text: 'متابعة',
                                  style: TextStyle(color: Colors.blue.shade600),
                                ),
                                const TextSpan(text: ' لبدء مسح ومقارنة الأسعار.'),
                              ]
                            : [
                                const TextSpan(text: 'Tap '),
                                TextSpan(
                                  text: 'Continue',
                                  style: TextStyle(color: Colors.blue.shade600),
                                ),
                                const TextSpan(text: ' to start scanning & comparing prices.'),
                              ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Subtitle
                    Text(
                      l10n.paywallSubtitle,
                      textAlign: TextAlign.center,
                      style: AppTypography.body(locale).copyWith(
                        color: Colors.white70,
                        fontSize: 13,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 24),
                    // Continue CTA
                    ElevatedButton(
                      onPressed: plusProduct != null
                          ? () => ref.read(iapProvider.notifier).buySubscription(plusProduct!)
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue.shade600,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(24),
                        ),
                        elevation: 0,
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const SizedBox(width: 24),
                          Expanded(
                            child: Center(
                              child: Text(
                                plusProduct != null
                                    ? l10n.continueButton
                                    : l10n.iapLoadingProducts,
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.bold,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                          const Icon(Icons.arrow_forward, color: Colors.white, size: 20),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // EULA & Privacy Policy Footer
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        TextButton(
                          onPressed: () => _launchURL('https://ahmed-abdo-madani.github.io/sawa-scanner/privacy.html'),
                          style: TextButton.styleFrom(
                            minimumSize: Size.zero,
                            padding: EdgeInsets.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(
                            l10n.privacyPolicy,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.5),
                              fontSize: 11,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                        Text(
                          '  and  ',
                          style: TextStyle(
                            color: Colors.white.withOpacity(0.3),
                            fontSize: 11,
                          ),
                        ),
                        TextButton(
                          onPressed: () => _launchURL('https://ahmed-abdo-madani.github.io/sawa-scanner/terms.html'),
                          style: TextButton.styleFrom(
                            minimumSize: Size.zero,
                            padding: EdgeInsets.zero,
                            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                          ),
                          child: Text(
                            l10n.termsOfUse,
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.5),
                              fontSize: 11,
                              decoration: TextDecoration.underline,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            // Loading spinner overlay
            if (iapState.isLoading)
              Positioned.fill(
                child: Container(
                  color: Colors.black.withOpacity(0.6),
                  child: const Center(
                    child: CircularProgressIndicator(
                      valueColor: AlwaysStoppedAnimation<Color>(Colors.blue),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
