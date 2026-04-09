import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

class NovaGroupBadge extends StatelessWidget {
  final int group;

  const NovaGroupBadge({super.key, required this.group});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.warning,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        'NOVA $group',
        style: AppTypography.headline(locale).copyWith(
          color: AppColors.background,
          fontWeight: FontWeight.w900,
          fontSize: 16,
        ),
      ),
    );
  }
}
