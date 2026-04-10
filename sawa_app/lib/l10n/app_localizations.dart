import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_ar.dart';
import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
      : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('ar'),
    Locale('en')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'Sawa'**
  String get appTitle;

  /// No description provided for @scanNow.
  ///
  /// In en, this message translates to:
  /// **'Scan Now'**
  String get scanNow;

  /// No description provided for @greeting.
  ///
  /// In en, this message translates to:
  /// **'Hello, {name} 👋'**
  String greeting(Object name);

  /// No description provided for @nearbyOffers.
  ///
  /// In en, this message translates to:
  /// **'Nearby Offers'**
  String get nearbyOffers;

  /// No description provided for @recentScans.
  ///
  /// In en, this message translates to:
  /// **'Recent Scans'**
  String get recentScans;

  /// No description provided for @home.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get home;

  /// No description provided for @search.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get search;

  /// No description provided for @compare.
  ///
  /// In en, this message translates to:
  /// **'Compare'**
  String get compare;

  /// No description provided for @profile.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profile;

  /// No description provided for @themeShowcaseTitle.
  ///
  /// In en, this message translates to:
  /// **'Theme Showcase & Debug'**
  String get themeShowcaseTitle;

  /// No description provided for @colorSwatches.
  ///
  /// In en, this message translates to:
  /// **'Color Swatches'**
  String get colorSwatches;

  /// No description provided for @typographyScaleEn.
  ///
  /// In en, this message translates to:
  /// **'Typography Scale (EN)'**
  String get typographyScaleEn;

  /// No description provided for @typographyScaleAr.
  ///
  /// In en, this message translates to:
  /// **'Typography Scale (AR)'**
  String get typographyScaleAr;

  /// No description provided for @glassmorphismPreview.
  ///
  /// In en, this message translates to:
  /// **'Glassmorphism Preview'**
  String get glassmorphismPreview;

  /// No description provided for @gradeBadgesPreview.
  ///
  /// In en, this message translates to:
  /// **'Grade Badges Preview'**
  String get gradeBadgesPreview;

  /// No description provided for @glassSurface.
  ///
  /// In en, this message translates to:
  /// **'Glass Surface'**
  String get glassSurface;

  /// No description provided for @blurredBackdropTest.
  ///
  /// In en, this message translates to:
  /// **'Blurred backdrop test'**
  String get blurredBackdropTest;

  /// No description provided for @colorBackground.
  ///
  /// In en, this message translates to:
  /// **'Background'**
  String get colorBackground;

  /// No description provided for @colorSurface.
  ///
  /// In en, this message translates to:
  /// **'Surface'**
  String get colorSurface;

  /// No description provided for @colorSurfaceGlass.
  ///
  /// In en, this message translates to:
  /// **'SurfaceGlass'**
  String get colorSurfaceGlass;

  /// No description provided for @colorPrimary.
  ///
  /// In en, this message translates to:
  /// **'Primary'**
  String get colorPrimary;

  /// No description provided for @colorSecondary.
  ///
  /// In en, this message translates to:
  /// **'Secondary'**
  String get colorSecondary;

  /// No description provided for @colorError.
  ///
  /// In en, this message translates to:
  /// **'Error'**
  String get colorError;

  /// No description provided for @colorWarning.
  ///
  /// In en, this message translates to:
  /// **'Warning'**
  String get colorWarning;

  /// No description provided for @colorOnBackground.
  ///
  /// In en, this message translates to:
  /// **'OnBackground'**
  String get colorOnBackground;

  /// No description provided for @colorOnSurface.
  ///
  /// In en, this message translates to:
  /// **'OnSurface'**
  String get colorOnSurface;

  /// No description provided for @labelDisplay.
  ///
  /// In en, this message translates to:
  /// **'Display'**
  String get labelDisplay;

  /// No description provided for @labelHeadline.
  ///
  /// In en, this message translates to:
  /// **'Headline'**
  String get labelHeadline;

  /// No description provided for @labelBody.
  ///
  /// In en, this message translates to:
  /// **'Body'**
  String get labelBody;

  /// No description provided for @labelCaption.
  ///
  /// In en, this message translates to:
  /// **'Caption'**
  String get labelCaption;

  /// No description provided for @fontMeta.
  ///
  /// In en, this message translates to:
  /// **'{fontFamily}, {fontWeight}, {fontSize}'**
  String fontMeta(String fontFamily, String fontWeight, String fontSize);

  /// No description provided for @scannerTitle.
  ///
  /// In en, this message translates to:
  /// **'Scanner'**
  String get scannerTitle;

  /// No description provided for @barcodeMode.
  ///
  /// In en, this message translates to:
  /// **'Barcode'**
  String get barcodeMode;

  /// No description provided for @labelMode.
  ///
  /// In en, this message translates to:
  /// **'Label'**
  String get labelMode;

  /// No description provided for @manualMode.
  ///
  /// In en, this message translates to:
  /// **'Manual'**
  String get manualMode;

  /// No description provided for @pointCameraAtBarcode.
  ///
  /// In en, this message translates to:
  /// **'Point camera at barcode'**
  String get pointCameraAtBarcode;

  /// No description provided for @enterBarcodeNumber.
  ///
  /// In en, this message translates to:
  /// **'Enter barcode number...'**
  String get enterBarcodeNumber;

  /// No description provided for @searchButton.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get searchButton;

  /// No description provided for @nutritionFacts.
  ///
  /// In en, this message translates to:
  /// **'Nutrition Facts (per 100g)'**
  String get nutritionFacts;

  /// No description provided for @ingredientsAndAdditives.
  ///
  /// In en, this message translates to:
  /// **'Ingredients & Additives'**
  String get ingredientsAndAdditives;

  /// No description provided for @comparePrices.
  ///
  /// In en, this message translates to:
  /// **'Compare Prices'**
  String get comparePrices;

  /// No description provided for @bestPrice.
  ///
  /// In en, this message translates to:
  /// **'Best Price'**
  String get bestPrice;

  /// No description provided for @productNotFound.
  ///
  /// In en, this message translates to:
  /// **'Product not found'**
  String get productNotFound;

  /// No description provided for @contributeProduct.
  ///
  /// In en, this message translates to:
  /// **'Contribute Product'**
  String get contributeProduct;

  /// No description provided for @sfdaDisclaimer.
  ///
  /// In en, this message translates to:
  /// **'Nutrition information provided by SFDA for informational purposes only.'**
  String get sfdaDisclaimer;

  /// No description provided for @calories.
  ///
  /// In en, this message translates to:
  /// **'Calories'**
  String get calories;

  /// No description provided for @fat.
  ///
  /// In en, this message translates to:
  /// **'Fat'**
  String get fat;

  /// No description provided for @saturatedFat.
  ///
  /// In en, this message translates to:
  /// **'Saturated Fat'**
  String get saturatedFat;

  /// No description provided for @carbs.
  ///
  /// In en, this message translates to:
  /// **'Carbs'**
  String get carbs;

  /// No description provided for @sugars.
  ///
  /// In en, this message translates to:
  /// **'Sugars'**
  String get sugars;

  /// No description provided for @fiber.
  ///
  /// In en, this message translates to:
  /// **'Fiber'**
  String get fiber;

  /// No description provided for @protein.
  ///
  /// In en, this message translates to:
  /// **'Protein'**
  String get protein;

  /// No description provided for @sodium.
  ///
  /// In en, this message translates to:
  /// **'Sodium'**
  String get sodium;

  /// No description provided for @sfdaRegistered.
  ///
  /// In en, this message translates to:
  /// **'SFDA Registered ✓'**
  String get sfdaRegistered;

  /// No description provided for @halalCertified.
  ///
  /// In en, this message translates to:
  /// **'Halal ✓'**
  String get halalCertified;

  /// No description provided for @labelScanComingSoon.
  ///
  /// In en, this message translates to:
  /// **'Label scanning mode is ready!'**
  String get labelScanComingSoon;

  /// No description provided for @sar.
  ///
  /// In en, this message translates to:
  /// **'SAR'**
  String get sar;

  /// No description provided for @serverError.
  ///
  /// In en, this message translates to:
  /// **'Connection Error'**
  String get serverError;

  /// No description provided for @retryButton.
  ///
  /// In en, this message translates to:
  /// **'Retry'**
  String get retryButton;

  /// No description provided for @pointCameraAtLabel.
  ///
  /// In en, this message translates to:
  /// **'Point camera at nutrition label'**
  String get pointCameraAtLabel;

  /// No description provided for @analyzingLabel.
  ///
  /// In en, this message translates to:
  /// **'Analyzing label with AI...'**
  String get analyzingLabel;

  /// No description provided for @priceComparison.
  ///
  /// In en, this message translates to:
  /// **'Price Comparison'**
  String get priceComparison;

  /// No description provided for @viewHistory.
  ///
  /// In en, this message translates to:
  /// **'View History'**
  String get viewHistory;

  /// No description provided for @addToCart.
  ///
  /// In en, this message translates to:
  /// **'Add to Cart'**
  String get addToCart;

  /// No description provided for @historicalPriceTrend.
  ///
  /// In en, this message translates to:
  /// **'Historical Price Trend'**
  String get historicalPriceTrend;

  /// No description provided for @outOfStock.
  ///
  /// In en, this message translates to:
  /// **'Out of Stock'**
  String get outOfStock;

  /// No description provided for @sawaPlusGated.
  ///
  /// In en, this message translates to:
  /// **'Exclusive for Sawa Plus'**
  String get sawaPlusGated;

  /// No description provided for @unlockSawaPlus.
  ///
  /// In en, this message translates to:
  /// **'Unlock Sawa Plus to view detailed price history and trends.'**
  String get unlockSawaPlus;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['ar', 'en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'ar':
      return AppLocalizationsAr();
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
      'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
      'an issue with the localizations generation tool. Please file an issue '
      'on GitHub with a reproducible sample app and the gen-l10n configuration '
      'that was used.');
}
