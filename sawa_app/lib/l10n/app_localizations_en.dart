// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'Sawa';

  @override
  String get scanNow => 'Scan Now';

  @override
  String greeting(Object name) {
    return 'Hello, $name 👋';
  }

  @override
  String get nearbyOffers => 'Nearby Offers';

  @override
  String get recentScans => 'Recent Scans';

  @override
  String get home => 'Home';

  @override
  String get search => 'Search';

  @override
  String get compare => 'Compare';

  @override
  String get profile => 'Profile';

  @override
  String get themeShowcaseTitle => 'Theme Showcase & Debug';

  @override
  String get colorSwatches => 'Color Swatches';

  @override
  String get typographyScaleEn => 'Typography Scale (EN)';

  @override
  String get typographyScaleAr => 'Typography Scale (AR)';

  @override
  String get glassmorphismPreview => 'Glassmorphism Preview';

  @override
  String get gradeBadgesPreview => 'Grade Badges Preview';

  @override
  String get glassSurface => 'Glass Surface';

  @override
  String get blurredBackdropTest => 'Blurred backdrop test';

  @override
  String get colorBackground => 'Background';

  @override
  String get colorSurface => 'Surface';

  @override
  String get colorSurfaceGlass => 'SurfaceGlass';

  @override
  String get colorPrimary => 'Primary';

  @override
  String get colorSecondary => 'Secondary';

  @override
  String get colorError => 'Error';

  @override
  String get colorWarning => 'Warning';

  @override
  String get colorOnBackground => 'OnBackground';

  @override
  String get colorOnSurface => 'OnSurface';

  @override
  String get labelDisplay => 'Display';

  @override
  String get labelHeadline => 'Headline';

  @override
  String get labelBody => 'Body';

  @override
  String get labelCaption => 'Caption';

  @override
  String fontMeta(String fontFamily, String fontWeight, String fontSize) {
    return '$fontFamily, $fontWeight, $fontSize';
  }

  @override
  String get scannerTitle => 'Scanner';

  @override
  String get barcodeMode => 'Barcode';

  @override
  String get labelMode => 'Label';

  @override
  String get manualMode => 'Manual';

  @override
  String get pointCameraAtBarcode => 'Point camera at barcode';

  @override
  String get enterBarcodeNumber => 'Enter barcode number...';

  @override
  String get searchButton => 'Search';

  @override
  String get nutritionFacts => 'Nutrition Facts (per 100g)';

  @override
  String get ingredientsAndAdditives => 'Ingredients & Additives';

  @override
  String get comparePrices => 'Compare Prices';

  @override
  String get bestPrice => 'Best Price';

  @override
  String get productNotFound => 'Product not found';

  @override
  String get contributeProduct => 'Contribute Product';

  @override
  String get sfdaDisclaimer =>
      'Nutrition information provided by SFDA for informational purposes only.';

  @override
  String get calories => 'Calories';

  @override
  String get fat => 'Fat';

  @override
  String get saturatedFat => 'Saturated Fat';

  @override
  String get carbs => 'Carbs';

  @override
  String get sugars => 'Sugars';

  @override
  String get fiber => 'Fiber';

  @override
  String get protein => 'Protein';

  @override
  String get sodium => 'Sodium';

  @override
  String get sfdaRegistered => 'SFDA Registered ✓';

  @override
  String get halalCertified => 'Halal ✓';

  @override
  String get labelScanComingSoon => 'Label scanning mode is ready!';

  @override
  String get sar => 'SAR';

  @override
  String get serverError => 'Connection Error';

  @override
  String get retryButton => 'Retry';

  @override
  String get pointCameraAtLabel => 'Point camera at nutrition label';

  @override
  String get analyzingLabel => 'Analyzing label with AI...';

  @override
  String get priceComparison => 'Price Comparison';

  @override
  String get viewHistory => 'View History';

  @override
  String get addToCart => 'Add to Cart';

  @override
  String get historicalPriceTrend => 'Historical Price Trend';

  @override
  String get outOfStock => 'Out of Stock';

  @override
  String get sawaPlusGated => 'Exclusive for Sawa Plus';

  @override
  String get unlockSawaPlus =>
      'Unlock Sawa Plus to view detailed price history and trends.';
}
