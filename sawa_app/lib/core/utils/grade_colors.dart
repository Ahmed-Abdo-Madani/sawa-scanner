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

Color nutriScoreSegmentColor(String letter) {
  switch (letter.toUpperCase()) {
    case 'A':
      return const Color(0xFF4CAF50);
    case 'B':
      return const Color(0xFF8BC34A);
    case 'C':
      return const Color(0xFFFFC107);
    case 'D':
      return const Color(0xFFFF9800);
    case 'E':
      return const Color(0xFFF44336);
    default:
      return Colors.grey;
  }
}

Color novaGroupColor(int group) {
  switch (group) {
    case 1:
      return const Color(0xFF4CAF50);
    case 2:
      return const Color(0xFFFFC107);
    case 3:
      return const Color(0xFFFF9800);
    case 4:
      return const Color(0xFFF44336);
    default:
      return Colors.grey;
  }
}

Color ecoScoreSegmentColor(String letter) {
  switch (letter.toUpperCase()) {
    case 'A':
      return const Color(0xFF1B5E20);
    case 'B':
      return const Color(0xFF4CAF50);
    case 'C':
      return const Color(0xFFFFC107);
    case 'D':
      return const Color(0xFFFF9800);
    case 'E':
      return const Color(0xFFF44336);
    default:
      return Colors.grey;
  }
}
