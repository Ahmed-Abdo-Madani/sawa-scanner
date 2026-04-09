import 'package:flutter/material.dart';
import '../../core/theme/app_typography.dart';
import '../../core/utils/grade_colors.dart';
import '../../domain/entities/ingredient.dart';

class IngredientChip extends StatelessWidget {
  final Ingredient ingredient;

  const IngredientChip({super.key, required this.ingredient});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final baseColor = ingredientStatusColor(ingredient.sfdaStatus);
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: baseColor.withOpacity(0.15),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        locale.languageCode == 'ar' ? ingredient.nameAr : ingredient.nameEn,
        style: AppTypography.body(locale).copyWith(
          color: baseColor,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
