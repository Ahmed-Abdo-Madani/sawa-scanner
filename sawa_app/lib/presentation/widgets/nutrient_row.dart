import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

class NutrientRow extends StatelessWidget {
  final String label;
  final String value;
  final double percentage; // 0.0 to 1.0
  final Color barColor;

  const NutrientRow({
    super.key,
    required this.label,
    required this.value,
    required this.percentage,
    required this.barColor,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                label,
                style: AppTypography.body(locale).copyWith(
                  color: AppColors.onBackground,
                  fontWeight: FontWeight.w500,
                ),
              ),
              Text(
                value,
                style: AppTypography.body(locale).copyWith(
                  color: AppColors.onBackground,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: Stack(
              children: [
                Container(
                  height: 6,
                  width: double.infinity,
                  color: AppColors.surfaceGlass,
                ),
                FractionallySizedBox(
                  widthFactor: percentage.clamp(0.0, 1.0),
                  child: Container(
                    height: 6,
                    color: barColor,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
