import 'package:flutter/material.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/grade_colors.dart';

class EcoScoreBadge extends StatelessWidget {
  final String grade;

  const EcoScoreBadge({super.key, required this.grade});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final grades = ['A', 'B', 'C', 'D', 'E'];
    final currentGrade = grade.toUpperCase();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: grades.map((g) {
            final isActive = g == currentGrade;
            final color = ecoScoreSegmentColor(g);

            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Opacity(
                  opacity: isActive ? 1.0 : 0.4,
                  child: Transform.scale(
                    scaleY: isActive ? 1.15 : 1.0,
                    child: Container(
                      height: 28,
                      decoration: BoxDecoration(
                        color: color,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      alignment: Alignment.center,
                      child: Text(
                        g,
                        style: AppTypography.body(locale).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        Text(
          l10n.ecoScoreDescription,
          style: AppTypography.caption(locale).copyWith(
            color: AppColors.onSurface,
          ),
        ),
      ],
    );
  }
}
