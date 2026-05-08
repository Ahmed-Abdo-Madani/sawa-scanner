import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

Widget buildProductLabel(String text, Locale locale) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 8),
    child: Text(
      text,
      style: AppTypography.caption(locale).copyWith(
        color: AppColors.onSurface,
        fontWeight: FontWeight.bold,
      ),
    ),
  );
}

Widget buildProductTextField(
  BuildContext context,
  TextEditingController ctrl, {
  TextInputType keyboardType = TextInputType.text,
  bool readOnly = false,
  TextDirection? textDirection,
  String? hintText,
}) {
  final locale = Localizations.localeOf(context);
  return TextFormField(
    controller: ctrl,
    keyboardType: keyboardType,
    readOnly: readOnly,
    textDirection: textDirection,
    style: AppTypography.body(locale).copyWith(
      color: readOnly ? AppColors.onSurface : AppColors.onBackground,
    ),
    decoration: InputDecoration(
      filled: true,
      fillColor: readOnly ? AppColors.surface.withOpacity(0.6) : AppColors.surface,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintText: hintText,
      hintStyle: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
    ),
  );
}

Widget buildPhotoSlot(
  BuildContext context,
  String label,
  String slot,
  XFile? file,
  Uint8List? bytes,
  Locale locale,
  void Function(String slot) onTap,
) {
  return Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      buildProductLabel(label, locale),
      const SizedBox(height: 8),
      GestureDetector(
        onTap: () => onTap(slot),
        child: Container(
          height: 160,
          width: double.infinity,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: file != null
                  ? AppColors.primary
                  : AppColors.onSurface.withOpacity(0.2),
            ),
          ),
          child: file != null && bytes != null
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(15),
                  child: Image.memory(bytes, fit: BoxFit.cover),
                )
              : Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.add_photo_alternate_outlined,
                        size: 40, color: AppColors.primary),
                    const SizedBox(height: 8),
                    Text(label,
                        style: AppTypography.caption(locale)
                            .copyWith(color: AppColors.onSurface)),
                  ],
                ),
        ),
      ),
    ],
  );
}

Widget buildNutritionFields(
  BuildContext context,
  List<(String, TextEditingController, String)> fields,
  Locale locale,
) {
  return ListView(
    padding: const EdgeInsets.all(20),
    children: fields.map((f) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            buildProductLabel('${f.$1} (${f.$3})', locale),
            buildProductTextField(
              context,
              f.$2,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
          ],
        ),
      );
    }).toList(),
  );
}
