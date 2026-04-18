import { Injectable, BadRequestException } from '@nestjs/common';
import { StructuredLabelDto } from './dto/structured-label.dto';

@Injectable()
export class LabelValidationService {
  /**
   * Validates structured label data using common-sense nutrition heuristics.
   */
  validate(label: StructuredLabelDto): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 1. At least one name
    if (!label.name_ar && !label.name_en) {
      errors.push('Product must have at least an Arabic or English name');
    }

    const n = label.nutrition;
    if (!n) {
      errors.push('Nutrition facts are missing or could not be structured');
      throw new BadRequestException({
        message: 'Nutrition label validation failed',
        errors,
      });
    }

    // 2. Non-negative values
    const numericFields = [
      'energy_kcal',
      'fat_g',
      'saturated_fat_g',
      'carbs_g',
      'sugars_g',
      'fiber_g',
      'protein_g',
      'sodium_mg',
      'serving_size_g',
    ];

    for (const field of numericFields) {
      if (n[field] < 0) {
        errors.push(`Nutrient ${field} cannot be negative`);
      }
    }

    // 3. Macro sum check (fat + carbs + protein <= 100g per 100g)
    if ((n.fat_g || 0) > 100) errors.push('Fat cannot exceed 100g');
    if ((n.carbs_g || 0) > 100) errors.push('Carbs cannot exceed 100g');
    if ((n.protein_g || 0) > 100) errors.push('Protein cannot exceed 100g');

    const macroSum = (n.fat_g || 0) + (n.carbs_g || 0) + (n.protein_g || 0);
    if (macroSum > 100) {
      errors.push(
        `Sum of macros (${macroSum.toFixed(1)}g) exceeds 100g per 100g`,
      );
    }

    // 4. Individual caps
    if ((n.energy_kcal || 0) > 900) {
      errors.push('Energy exceeds theoretical maximum (900 kcal/100g)');
    }
    if ((n.sugars_g || 0) > (n.carbs_g || 0)) {
      errors.push('Sugars cannot exceed total carbohydrates');
    }
    if ((n.saturated_fat_g || 0) > (n.fat_g || 0)) {
      errors.push('Saturated fat cannot exceed total fat');
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Nutrition label validation failed',
        errors,
      });
    }

    return { valid: true, errors: [] };
  }
}
