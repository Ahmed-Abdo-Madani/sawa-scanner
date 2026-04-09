import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../../domain/entities/ingredient.dart';

Color nutriScoreColor(String grade) {
  switch (grade.toUpperCase()) {
    case 'A':
      return AppColors.secondary;
    case 'B':
      return const Color(0xFFA8F0A0);
    case 'C':
      return AppColors.warning;
    case 'D':
      return AppColors.primary;
    case 'E':
      return AppColors.error;
    default:
      return AppColors.error;
  }
}

Color ingredientStatusColor(IngredientSfdaStatus status) {
  switch (status) {
    case IngredientSfdaStatus.safe:
      return AppColors.secondary;
    case IngredientSfdaStatus.restricted:
      return AppColors.warning;
    case IngredientSfdaStatus.prohibited:
      return AppColors.error;
  }
}
