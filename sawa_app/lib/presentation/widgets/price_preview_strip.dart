import 'package:flutter/material.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../screens/product_detail/price_comparison_screen.dart';
import 'glass_surface.dart';

class PricePreviewStrip extends StatelessWidget {
  final String gtin;
  final String productName;
  final String merchantName;
  final double price;

  const PricePreviewStrip({
    super.key,
    required this.gtin,
    required this.productName,
    required this.merchantName,
    required this.price,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final l10n = AppLocalizations.of(context)!;
    
    return GlassSurface(
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.bestPrice,
                    style: AppTypography.caption(locale).copyWith(
                      color: AppColors.onSurface,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        price.toStringAsFixed(2),
                        style: AppTypography.display(locale).copyWith(
                          color: AppColors.primary,
                          fontSize: 28,
                        ),
                      ),
                      const SizedBox(width: 4),
                      Text(
                        l10n.sar,
                        style: AppTypography.caption(locale).copyWith(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    merchantName,
                    style: AppTypography.body(locale).copyWith(
                      color: AppColors.onBackground,
                    ),
                  ),
                ],
              ),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.push(
                  context,
                  MaterialPageRoute(
                    builder: (context) => PriceComparisonScreen(
                      gtin: gtin,
                      productName: productName,
                    ),
                  ),
                );
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: AppColors.background,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              ),
              child: Text(
                l10n.comparePrices,
                style: AppTypography.body(locale).copyWith(
                  fontWeight: FontWeight.bold,
                  color: AppColors.background,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
