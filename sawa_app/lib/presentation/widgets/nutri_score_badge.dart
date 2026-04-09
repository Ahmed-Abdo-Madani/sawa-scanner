import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/grade_colors.dart';

class NutriScoreBadge extends StatelessWidget {
  final String grade;

  const NutriScoreBadge({super.key, required this.grade});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: nutriScoreColor(grade),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        grade.toUpperCase(),
        style: AppTypography.headline(locale).copyWith(
          color: AppColors.background,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
