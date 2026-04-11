import 'package:flutter/material.dart';
import '../../core/theme/app_colors.dart';
import '../../core/theme/app_typography.dart';

class KnowledgePanelCard extends StatelessWidget {
  final IconData leadingIcon;
  final Color iconColor;
  final String title;
  final String? summary;
  final bool initiallyExpanded;
  final Widget content;

  const KnowledgePanelCard({
    super.key,
    required this.leadingIcon,
    required this.iconColor,
    required this.title,
    this.summary,
    this.initiallyExpanded = false,
    required this.content,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: Theme.of(context).colorScheme.outlineVariant,
        ),
      ),
      clipBehavior: Clip.antiAlias,
      child: ExpansionTile(
        initiallyExpanded: initiallyExpanded,
        tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
        leading: Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            color: iconColor,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            leadingIcon,
            color: Colors.white,
            size: 20,
          ),
        ),
        title: Text(
          title,
          style: AppTypography.body(locale).copyWith(
            fontWeight: FontWeight.w600,
            color: AppColors.onBackground,
          ),
        ),
        subtitle: summary != null
            ? Text(
                summary!,
                style: AppTypography.caption(locale).copyWith(
                  color: AppColors.onSurface,
                ),
              )
            : null,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: content,
          ),
        ],
      ),
    );
  }
}
