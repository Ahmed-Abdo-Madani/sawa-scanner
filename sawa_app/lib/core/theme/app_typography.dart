import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTypography {
  static bool _isArabic(Locale locale) => locale.languageCode == 'ar';

  static TextStyle display(Locale locale) {
    if (_isArabic(locale)) {
      return GoogleFonts.ibmPlexSansArabic(
        fontWeight: FontWeight.w700,
        fontSize: 32,
      );
    }
    return GoogleFonts.plusJakartaSans(
      fontWeight: FontWeight.w800,
      fontSize: 32,
    );
  }

  static TextStyle headline(Locale locale) {
    if (_isArabic(locale)) {
      return GoogleFonts.ibmPlexSansArabic(
        fontWeight: FontWeight.w600,
        fontSize: 22,
      );
    }
    return GoogleFonts.plusJakartaSans(
      fontWeight: FontWeight.w700,
      fontSize: 22,
    );
  }

  static TextStyle body(Locale locale) {
    if (_isArabic(locale)) {
      return GoogleFonts.ibmPlexSansArabic(
        fontWeight: FontWeight.w400,
        fontSize: 15,
      );
    }
    return GoogleFonts.plusJakartaSans(
      fontWeight: FontWeight.w400,
      fontSize: 15,
    );
  }

  static TextStyle caption(Locale locale) {
    if (_isArabic(locale)) {
      return GoogleFonts.ibmPlexSansArabic(
        fontWeight: FontWeight.w400,
        fontSize: 12,
      );
    }
    return GoogleFonts.plusJakartaSans(
      fontWeight: FontWeight.w400,
      fontSize: 12,
    );
  }

  static TextTheme textTheme(Locale locale) {
    return TextTheme(
      displayLarge: display(locale),
      headlineMedium: headline(locale),
      bodyMedium: body(locale),
      bodySmall: caption(locale),
    );
  }
}
