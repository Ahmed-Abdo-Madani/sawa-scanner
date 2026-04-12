import 'package:flutter/material.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/grade_colors.dart';

class NutriScoreBadge extends StatelessWidget {
  final String grade;
  final bool isMini;
  const NutriScoreBadge({super.key, required this.grade, this.isMini = false});



  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final grades = ['A', 'B', 'C', 'D', 'E'];
    final currentGrade = grade.toUpperCase();

    return Row(
      children: grades.map((g) {
        final isActive = g == currentGrade;
        final color = nutriScoreSegmentColor(g);

        return Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 2),
            child: Opacity(
              opacity: isActive ? 1.0 : 0.4,
              child: Transform.scale(
                scaleY: isActive ? 1.15 : 1.0,
                child: Container(
                  height: isMini ? 20 : 28,
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(isMini ? 4 : 6),
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    g,
                    style: AppTypography.body(locale).copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: isMini ? 10 : 14,
                    ),
                  ),
                ),

              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
