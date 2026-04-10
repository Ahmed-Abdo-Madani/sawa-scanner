import 'package:flutter/material.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

class HalalBadge extends StatelessWidget {
  final bool isCertified;

  const HalalBadge({super.key, required this.isCertified});

  @override
  Widget build(BuildContext context) {
    if (!isCertified) return const SizedBox.shrink();
    
    final locale = Localizations.localeOf(context);
    final l10n = AppLocalizations.of(context)!;
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.secondary,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        l10n.halalCertified,
        style: AppTypography.headline(locale).copyWith(
          color: AppColors.background,
          fontWeight: FontWeight.w900,
          fontSize: 16,
        ),
      ),
    );
  }
}
