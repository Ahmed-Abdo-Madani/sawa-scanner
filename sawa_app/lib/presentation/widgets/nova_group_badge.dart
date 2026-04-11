import 'package:flutter/material.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/grade_colors.dart';

class NovaGroupBadge extends StatelessWidget {
  final int group;

  const NovaGroupBadge({super.key, required this.group});

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final groups = [1, 2, 3, 4];

    String getDescription() {
      switch (group) {
        case 1:
          return l10n.processingLevel1;
        case 2:
          return l10n.processingLevel2;
        case 3:
          return l10n.processingLevel3;
        case 4:
          return l10n.processingLevel4;
        default:
          return '';
      }
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: groups.map((g) {
            final isActive = g == group;
            final color = novaGroupColor(g);

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
                        g.toString(),
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
          getDescription(),
          style: AppTypography.caption(locale).copyWith(
            color: AppColors.onSurface,
          ),
        ),
      ],
    );
  }
}
