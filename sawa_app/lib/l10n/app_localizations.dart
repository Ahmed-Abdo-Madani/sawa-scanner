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
    Locale('en'),
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

  /// No description provided for @surfacePreview.
  ///
  /// In en, this message translates to:
  /// **'Surface Preview'**
  String get surfacePreview;

  /// No description provided for @gradeBadgesPreview.
  ///
  /// In en, this message translates to:
  /// **'Grade Badges Preview'**
  String get gradeBadgesPreview;

  /// No description provided for @cardSurface.
  ///
  /// In en, this message translates to:
  /// **'Card Surface'**
  String get cardSurface;

  /// No description provided for @surfaceTest.
  ///
  /// In en, this message translates to:
  /// **'Surface test'**
  String get surfaceTest;

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

  /// No description provided for @ecoScore.
  ///
  /// In en, this message translates to:
  /// **'Eco-Score'**
  String get ecoScore;

  /// No description provided for @ecoScoreDescription.
  ///
  /// In en, this message translates to:
  /// **'Environmental impact'**
  String get ecoScoreDescription;

  /// No description provided for @allergensTitle.
  ///
  /// In en, this message translates to:
  /// **'Allergens'**
  String get allergensTitle;

  /// No description provided for @noAllergens.
  ///
  /// In en, this message translates to:
  /// **'No allergens detected'**
  String get noAllergens;

  /// No description provided for @sfdaSafety.
  ///
  /// In en, this message translates to:
  /// **'SFDA Safety'**
  String get sfdaSafety;

  /// No description provided for @nutriScoreTitle.
  ///
  /// In en, this message translates to:
  /// **'Nutri-Score'**
  String get nutriScoreTitle;

  /// No description provided for @novaGroupTitle.
  ///
  /// In en, this message translates to:
  /// **'NOVA Group'**
  String get novaGroupTitle;

  /// No description provided for @nutritionFactsTitle.
  ///
  /// In en, this message translates to:
  /// **'Nutrition Facts'**
  String get nutritionFactsTitle;

  /// No description provided for @ingredientsTitle.
  ///
  /// In en, this message translates to:
  /// **'Ingredients'**
  String get ingredientsTitle;

  /// No description provided for @processingLevel1.
  ///
  /// In en, this message translates to:
  /// **'Unprocessed or minimally processed'**
  String get processingLevel1;

  /// No description provided for @processingLevel2.
  ///
  /// In en, this message translates to:
  /// **'Processed culinary ingredients'**
  String get processingLevel2;

  /// No description provided for @processingLevel3.
  ///
  /// In en, this message translates to:
  /// **'Processed foods'**
  String get processingLevel3;

  /// No description provided for @processingLevel4.
  ///
  /// In en, this message translates to:
  /// **'Ultra-processed products'**
  String get processingLevel4;

  /// No description provided for @environmentalImpact.
  ///
  /// In en, this message translates to:
  /// **'Environmental Impact'**
  String get environmentalImpact;

  /// No description provided for @gradeSummary.
  ///
  /// In en, this message translates to:
  /// **'Grade {grade}'**
  String gradeSummary(String grade);

  /// No description provided for @novaGroupSummary.
  ///
  /// In en, this message translates to:
  /// **'Group {group}'**
  String novaGroupSummary(int group);

  /// No description provided for @per100g.
  ///
  /// In en, this message translates to:
  /// **'per 100g'**
  String get per100g;

  /// No description provided for @ingredientsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 ingredient} other{{count} ingredients}}'**
  String ingredientsCount(int count);

  /// No description provided for @flaggedItemsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 flagged item} other{{count} flagged items}}'**
  String flaggedItemsCount(int count);

  /// No description provided for @scanTab.
  ///
  /// In en, this message translates to:
  /// **'Scan'**
  String get scanTab;

  /// No description provided for @searchTab.
  ///
  /// In en, this message translates to:
  /// **'Search'**
  String get searchTab;

  /// No description provided for @historyTab.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get historyTab;

  /// No description provided for @profileTab.
  ///
  /// In en, this message translates to:
  /// **'Profile'**
  String get profileTab;

  /// No description provided for @searchProducts.
  ///
  /// In en, this message translates to:
  /// **'Search Products'**
  String get searchProducts;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search by product name...'**
  String get searchHint;

  /// No description provided for @noResults.
  ///
  /// In en, this message translates to:
  /// **'No results found'**
  String get noResults;

  /// No description provided for @scanHistory.
  ///
  /// In en, this message translates to:
  /// **'Scan History'**
  String get scanHistory;

  /// No description provided for @clearHistory.
  ///
  /// In en, this message translates to:
  /// **'Clear History'**
  String get clearHistory;

  /// No description provided for @scannedOn.
  ///
  /// In en, this message translates to:
  /// **'Scanned on {date}'**
  String scannedOn(String date);

  /// No description provided for @noHistory.
  ///
  /// In en, this message translates to:
  /// **'No scan history yet'**
  String get noHistory;

  /// No description provided for @clearHistoryConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to clear all your scan history?'**
  String get clearHistoryConfirm;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @clear.
  ///
  /// In en, this message translates to:
  /// **'Clear'**
  String get clear;

  /// No description provided for @today.
  ///
  /// In en, this message translates to:
  /// **'Today'**
  String get today;

  /// No description provided for @yesterday.
  ///
  /// In en, this message translates to:
  /// **'Yesterday'**
  String get yesterday;

  /// No description provided for @language.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get language;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @arabic.
  ///
  /// In en, this message translates to:
  /// **'Arabic'**
  String get arabic;

  /// No description provided for @notifications.
  ///
  /// In en, this message translates to:
  /// **'Notifications'**
  String get notifications;

  /// No description provided for @privacyAndSecurity.
  ///
  /// In en, this message translates to:
  /// **'Privacy & Security'**
  String get privacyAndSecurity;

  /// No description provided for @sawaPlus.
  ///
  /// In en, this message translates to:
  /// **'Sawa Plus'**
  String get sawaPlus;

  /// No description provided for @manageSubscription.
  ///
  /// In en, this message translates to:
  /// **'Manage Subscription'**
  String get manageSubscription;

  /// No description provided for @freePlan.
  ///
  /// In en, this message translates to:
  /// **'Free'**
  String get freePlan;

  /// No description provided for @userName.
  ///
  /// In en, this message translates to:
  /// **'User Name'**
  String get userName;

  /// No description provided for @welcomeTitle.
  ///
  /// In en, this message translates to:
  /// **'Welcome to Sawa'**
  String get welcomeTitle;

  /// No description provided for @welcomeSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Scan products to check nutrition, safety, and find the best prices'**
  String get welcomeSubtitle;

  /// No description provided for @dietaryPreferences.
  ///
  /// In en, this message translates to:
  /// **'Dietary Preferences'**
  String get dietaryPreferences;

  /// No description provided for @allergenFilters.
  ///
  /// In en, this message translates to:
  /// **'Allergen Alerts'**
  String get allergenFilters;

  /// No description provided for @getStarted.
  ///
  /// In en, this message translates to:
  /// **'Get Started'**
  String get getStarted;

  /// No description provided for @skipForNow.
  ///
  /// In en, this message translates to:
  /// **'Skip for now'**
  String get skipForNow;

  /// No description provided for @next.
  ///
  /// In en, this message translates to:
  /// **'Next'**
  String get next;

  /// No description provided for @back.
  ///
  /// In en, this message translates to:
  /// **'Back'**
  String get back;

  /// No description provided for @vegan.
  ///
  /// In en, this message translates to:
  /// **'Vegan'**
  String get vegan;

  /// No description provided for @vegetarian.
  ///
  /// In en, this message translates to:
  /// **'Vegetarian'**
  String get vegetarian;

  /// No description provided for @halalOnly.
  ///
  /// In en, this message translates to:
  /// **'Halal Only'**
  String get halalOnly;

  /// No description provided for @glutenFree.
  ///
  /// In en, this message translates to:
  /// **'Gluten Free'**
  String get glutenFree;

  /// No description provided for @peanuts.
  ///
  /// In en, this message translates to:
  /// **'Peanuts'**
  String get peanuts;

  /// No description provided for @dairy.
  ///
  /// In en, this message translates to:
  /// **'Dairy'**
  String get dairy;

  /// No description provided for @soy.
  ///
  /// In en, this message translates to:
  /// **'Soy'**
  String get soy;

  /// No description provided for @eggs.
  ///
  /// In en, this message translates to:
  /// **'Eggs'**
  String get eggs;

  /// No description provided for @wheat.
  ///
  /// In en, this message translates to:
  /// **'Wheat'**
  String get wheat;

  /// No description provided for @fish.
  ///
  /// In en, this message translates to:
  /// **'Fish'**
  String get fish;

  /// No description provided for @shellfish.
  ///
  /// In en, this message translates to:
  /// **'Shellfish'**
  String get shellfish;

  /// No description provided for @treeNuts.
  ///
  /// In en, this message translates to:
  /// **'Tree Nuts'**
  String get treeNuts;

  /// No description provided for @editPreferences.
  ///
  /// In en, this message translates to:
  /// **'Edit Preferences'**
  String get editPreferences;

  /// No description provided for @yourPreferences.
  ///
  /// In en, this message translates to:
  /// **'Your Preferences'**
  String get yourPreferences;

  /// No description provided for @yourAllergens.
  ///
  /// In en, this message translates to:
  /// **'Your Allergens'**
  String get yourAllergens;

  /// No description provided for @confirmationTitle.
  ///
  /// In en, this message translates to:
  /// **'You\'re All Set!'**
  String get confirmationTitle;

  /// No description provided for @confirmationSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Here\'s a summary of your preferences'**
  String get confirmationSubtitle;

  /// No description provided for @selectLanguage.
  ///
  /// In en, this message translates to:
  /// **'Select Language'**
  String get selectLanguage;

  /// No description provided for @editProduct.
  ///
  /// In en, this message translates to:
  /// **'Edit Product'**
  String get editProduct;

  /// No description provided for @addProduct.
  ///
  /// In en, this message translates to:
  /// **'Add Product'**
  String get addProduct;

  /// No description provided for @basicInfo.
  ///
  /// In en, this message translates to:
  /// **'Basic Info'**
  String get basicInfo;

  /// No description provided for @nutritionFacts_tab.
  ///
  /// In en, this message translates to:
  /// **'Nutrition'**
  String get nutritionFacts_tab;

  /// No description provided for @ingredients_tab.
  ///
  /// In en, this message translates to:
  /// **'Ingredients'**
  String get ingredients_tab;

  /// No description provided for @photos.
  ///
  /// In en, this message translates to:
  /// **'Photos'**
  String get photos;

  /// No description provided for @submitProduct.
  ///
  /// In en, this message translates to:
  /// **'Submit'**
  String get submitProduct;

  /// No description provided for @productSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Product submitted successfully!'**
  String get productSubmitted;

  /// No description provided for @nameAr.
  ///
  /// In en, this message translates to:
  /// **'Name (Arabic)'**
  String get nameAr;

  /// No description provided for @nameEn.
  ///
  /// In en, this message translates to:
  /// **'Name (English)'**
  String get nameEn;

  /// No description provided for @brand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get brand;

  /// No description provided for @frontPhoto.
  ///
  /// In en, this message translates to:
  /// **'Front Photo'**
  String get frontPhoto;

  /// No description provided for @ingredientsPhoto.
  ///
  /// In en, this message translates to:
  /// **'Ingredients Photo'**
  String get ingredientsPhoto;

  /// No description provided for @nutritionPhoto.
  ///
  /// In en, this message translates to:
  /// **'Nutrition Photo'**
  String get nutritionPhoto;

  /// No description provided for @takePhoto.
  ///
  /// In en, this message translates to:
  /// **'Take Photo'**
  String get takePhoto;

  /// No description provided for @chooseFromGallery.
  ///
  /// In en, this message translates to:
  /// **'Choose from Gallery'**
  String get chooseFromGallery;

  /// No description provided for @productNotFoundDescription.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t find this product in our database. You can help us by contributing it.'**
  String get productNotFoundDescription;

  /// No description provided for @serverErrorDescription.
  ///
  /// In en, this message translates to:
  /// **'An error occurred while connecting to the server. Please try again.'**
  String get serverErrorDescription;

  /// No description provided for @gtinBarcode.
  ///
  /// In en, this message translates to:
  /// **'GTIN / Barcode'**
  String get gtinBarcode;

  /// No description provided for @enterIngredientsList.
  ///
  /// In en, this message translates to:
  /// **'Enter ingredients list...'**
  String get enterIngredientsList;

  /// No description provided for @upgradeNow.
  ///
  /// In en, this message translates to:
  /// **'Upgrade Now'**
  String get upgradeNow;

  /// No description provided for @backendUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Sawa service unavailable'**
  String get backendUnavailable;

  /// No description provided for @backendUnavailableDescription.
  ///
  /// In en, this message translates to:
  /// **'Our primary servers are currently unreachable. We are working to restore access.'**
  String get backendUnavailableDescription;

  /// No description provided for @fallbackUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Global database error'**
  String get fallbackUnavailable;

  /// No description provided for @fallbackUnavailableDescription.
  ///
  /// In en, this message translates to:
  /// **'We couldn\'t reach the global product database (OpenFoodFacts).'**
  String get fallbackUnavailableDescription;

  /// No description provided for @fallbackConfiguration.
  ///
  /// In en, this message translates to:
  /// **'App configuration error'**
  String get fallbackConfiguration;

  /// No description provided for @fallbackConfigurationDescription.
  ///
  /// In en, this message translates to:
  /// **'The application is misconfigured (User-Agent missing). Please contact support.'**
  String get fallbackConfigurationDescription;

  /// No description provided for @apiConfiguration.
  ///
  /// In en, this message translates to:
  /// **'Sawa API Not Configured'**
  String get apiConfiguration;

  /// No description provided for @apiConfigurationDescription.
  ///
  /// In en, this message translates to:
  /// **'The backend URL is missing. Developers must build with --dart-define=API_BASE_URL=...'**
  String get apiConfigurationDescription;

  /// No description provided for @scanOrSearchPrompt.
  ///
  /// In en, this message translates to:
  /// **'Scan a barcode or search for a product'**
  String get scanOrSearchPrompt;

  /// No description provided for @nearbyStores.
  ///
  /// In en, this message translates to:
  /// **'Nearby Stores'**
  String get nearbyStores;

  /// No description provided for @nearbyStoresSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Prices from stores near you'**
  String get nearbyStoresSubtitle;

  /// No description provided for @storeDistance.
  ///
  /// In en, this message translates to:
  /// **'{distance} km away'**
  String storeDistance(String distance);

  /// No description provided for @promoPrice.
  ///
  /// In en, this message translates to:
  /// **'Promo'**
  String get promoPrice;

  /// No description provided for @unitPrice.
  ///
  /// In en, this message translates to:
  /// **'Unit Price'**
  String get unitPrice;

  /// No description provided for @perUnit.
  ///
  /// In en, this message translates to:
  /// **'per {unit}'**
  String perUnit(String unit);

  /// No description provided for @locationPermissionRequired.
  ///
  /// In en, this message translates to:
  /// **'Location permission is required to show nearby stores'**
  String get locationPermissionRequired;

  /// No description provided for @enableLocation.
  ///
  /// In en, this message translates to:
  /// **'Enable Location'**
  String get enableLocation;

  /// No description provided for @noNearbyStores.
  ///
  /// In en, this message translates to:
  /// **'No stores found nearby for this product'**
  String get noNearbyStores;

  /// No description provided for @nutritionIntelligence.
  ///
  /// In en, this message translates to:
  /// **'Nutrition Intelligence'**
  String get nutritionIntelligence;

  /// No description provided for @healthSummary.
  ///
  /// In en, this message translates to:
  /// **'Health Summary'**
  String get healthSummary;

  /// No description provided for @harmfulSubstances.
  ///
  /// In en, this message translates to:
  /// **'Harmful Substances'**
  String get harmfulSubstances;

  /// No description provided for @allergenWarnings.
  ///
  /// In en, this message translates to:
  /// **'Allergen Warnings'**
  String get allergenWarnings;

  /// No description provided for @noHarmfulSubstances.
  ///
  /// In en, this message translates to:
  /// **'No harmful substances detected'**
  String get noHarmfulSubstances;

  /// No description provided for @noAllergenWarnings.
  ///
  /// In en, this message translates to:
  /// **'No allergen warnings'**
  String get noAllergenWarnings;

  /// No description provided for @lowLevel.
  ///
  /// In en, this message translates to:
  /// **'Low'**
  String get lowLevel;

  /// No description provided for @mediumLevel.
  ///
  /// In en, this message translates to:
  /// **'Medium'**
  String get mediumLevel;

  /// No description provided for @highLevel.
  ///
  /// In en, this message translates to:
  /// **'High'**
  String get highLevel;

  /// No description provided for @nutriScoreExplanation.
  ///
  /// In en, this message translates to:
  /// **'NutriScore rates nutritional quality from A (best) to E (least favorable)'**
  String get nutriScoreExplanation;

  /// No description provided for @nutritionDataIncomplete.
  ///
  /// In en, this message translates to:
  /// **'Nutrition data is incomplete for this product'**
  String get nutritionDataIncomplete;

  /// No description provided for @compareProducts.
  ///
  /// In en, this message translates to:
  /// **'Compare Products'**
  String get compareProducts;

  /// No description provided for @similarProducts.
  ///
  /// In en, this message translates to:
  /// **'Similar Products'**
  String get similarProducts;

  /// No description provided for @noSimilarProducts.
  ///
  /// In en, this message translates to:
  /// **'No similar products found'**
  String get noSimilarProducts;

  /// No description provided for @selectToCompare.
  ///
  /// In en, this message translates to:
  /// **'Select to compare'**
  String get selectToCompare;

  /// No description provided for @nutritionComparison.
  ///
  /// In en, this message translates to:
  /// **'Nutrition Comparison'**
  String get nutritionComparison;

  /// No description provided for @allergenComparison.
  ///
  /// In en, this message translates to:
  /// **'Allergen Comparison'**
  String get allergenComparison;

  /// No description provided for @recommendation.
  ///
  /// In en, this message translates to:
  /// **'Recommendation'**
  String get recommendation;

  /// No description provided for @betterChoice.
  ///
  /// In en, this message translates to:
  /// **'Better Choice'**
  String get betterChoice;

  /// No description provided for @tieResult.
  ///
  /// In en, this message translates to:
  /// **'Tie'**
  String get tieResult;

  /// No description provided for @onlyInA.
  ///
  /// In en, this message translates to:
  /// **'Only in Product A'**
  String get onlyInA;

  /// No description provided for @onlyInB.
  ///
  /// In en, this message translates to:
  /// **'Only in Product B'**
  String get onlyInB;

  /// No description provided for @shared.
  ///
  /// In en, this message translates to:
  /// **'Shared'**
  String get shared;

  /// No description provided for @vsLabel.
  ///
  /// In en, this message translates to:
  /// **'VS'**
  String get vsLabel;

  /// No description provided for @lower.
  ///
  /// In en, this message translates to:
  /// **'Lower'**
  String get lower;

  /// No description provided for @higher.
  ///
  /// In en, this message translates to:
  /// **'Higher'**
  String get higher;

  /// No description provided for @equal.
  ///
  /// In en, this message translates to:
  /// **'Equal'**
  String get equal;

  /// No description provided for @unknown.
  ///
  /// In en, this message translates to:
  /// **'Unknown'**
  String get unknown;

  /// No description provided for @scanPartialTitle.
  ///
  /// In en, this message translates to:
  /// **'Partial Scan'**
  String get scanPartialTitle;

  /// No description provided for @extractedText.
  ///
  /// In en, this message translates to:
  /// **'Extracted Text:'**
  String get extractedText;

  /// No description provided for @close.
  ///
  /// In en, this message translates to:
  /// **'Close'**
  String get close;

  /// No description provided for @recognizingWithAi.
  ///
  /// In en, this message translates to:
  /// **'Recognizing product on-device...'**
  String get recognizingWithAi;

  /// No description provided for @recognizedByAiBadge.
  ///
  /// In en, this message translates to:
  /// **'AI Recognized'**
  String get recognizedByAiBadge;

  /// No description provided for @aiRecognitionFailed.
  ///
  /// In en, this message translates to:
  /// **'Could not recognize product. Please try again.'**
  String get aiRecognitionFailed;

  /// No description provided for @adminSignIn.
  ///
  /// In en, this message translates to:
  /// **'Admin Sign In'**
  String get adminSignIn;

  /// No description provided for @email.
  ///
  /// In en, this message translates to:
  /// **'Email'**
  String get email;

  /// No description provided for @password.
  ///
  /// In en, this message translates to:
  /// **'Password'**
  String get password;

  /// No description provided for @signIn.
  ///
  /// In en, this message translates to:
  /// **'Sign In'**
  String get signIn;

  /// No description provided for @adminTools.
  ///
  /// In en, this message translates to:
  /// **'Admin Tools'**
  String get adminTools;

  /// No description provided for @quickEntry.
  ///
  /// In en, this message translates to:
  /// **'Quick Entry'**
  String get quickEntry;

  /// No description provided for @missingGtinList.
  ///
  /// In en, this message translates to:
  /// **'Missing GTIN List'**
  String get missingGtinList;

  /// No description provided for @submitAndNext.
  ///
  /// In en, this message translates to:
  /// **'Submit & Next'**
  String get submitAndNext;

  /// No description provided for @scanningForQuickEntry.
  ///
  /// In en, this message translates to:
  /// **'Scanning for Quick Entry...'**
  String get scanningForQuickEntry;

  /// No description provided for @fetchingProduct.
  ///
  /// In en, this message translates to:
  /// **'Fetching product data...'**
  String get fetchingProduct;

  /// No description provided for @allergens_tab.
  ///
  /// In en, this message translates to:
  /// **'Allergens'**
  String get allergens_tab;

  /// No description provided for @productExistsBanner.
  ///
  /// In en, this message translates to:
  /// **'Product already exists in database'**
  String get productExistsBanner;

  /// No description provided for @productNewBanner.
  ///
  /// In en, this message translates to:
  /// **'New product detected'**
  String get productNewBanner;

  /// No description provided for @gtinAssignedBanner.
  ///
  /// In en, this message translates to:
  /// **'GTIN successfully assigned'**
  String get gtinAssignedBanner;

  /// No description provided for @submitAndStay.
  ///
  /// In en, this message translates to:
  /// **'Submit & Stay'**
  String get submitAndStay;

  /// No description provided for @signOut.
  ///
  /// In en, this message translates to:
  /// **'Sign Out'**
  String get signOut;

  /// No description provided for @notAuthorized.
  ///
  /// In en, this message translates to:
  /// **'You are not authorized to access admin tools.'**
  String get notAuthorized;

  /// No description provided for @reportsCount.
  ///
  /// In en, this message translates to:
  /// **'Reports'**
  String get reportsCount;

  /// No description provided for @browseHsProducts.
  ///
  /// In en, this message translates to:
  /// **'Browse Products'**
  String get browseHsProducts;

  /// No description provided for @needsGtinTitle.
  ///
  /// In en, this message translates to:
  /// **'Products Needing GTIN'**
  String get needsGtinTitle;

  /// No description provided for @needsGtinSubtitle.
  ///
  /// In en, this message translates to:
  /// **'Tap a product to scan its barcode'**
  String get needsGtinSubtitle;

  /// No description provided for @scanGtinButton.
  ///
  /// In en, this message translates to:
  /// **'Scan GTIN'**
  String get scanGtinButton;

  /// No description provided for @assignGtinTitle.
  ///
  /// In en, this message translates to:
  /// **'Assign GTIN'**
  String get assignGtinTitle;

  /// No description provided for @gtinAssignedSuccess.
  ///
  /// In en, this message translates to:
  /// **'GTIN assigned successfully!'**
  String get gtinAssignedSuccess;

  /// No description provided for @nextProduct.
  ///
  /// In en, this message translates to:
  /// **'Next Product'**
  String get nextProduct;

  /// No description provided for @noProductsNeedGtin.
  ///
  /// In en, this message translates to:
  /// **'All products have GTINs assigned'**
  String get noProductsNeedGtin;

  /// No description provided for @gtinScannerTitle.
  ///
  /// In en, this message translates to:
  /// **'GTIN Scanner'**
  String get gtinScannerTitle;

  /// No description provided for @filterByCategory.
  ///
  /// In en, this message translates to:
  /// **'Filter by category'**
  String get filterByCategory;

  /// No description provided for @productsCount.
  ///
  /// In en, this message translates to:
  /// **'{count} products'**
  String productsCount(int count);

  /// No description provided for @hsProductId.
  ///
  /// In en, this message translates to:
  /// **'HS Product ID'**
  String get hsProductId;

  /// No description provided for @confirmGtinAssignment.
  ///
  /// In en, this message translates to:
  /// **'Assign GTIN {gtin} to this product?'**
  String confirmGtinAssignment(String gtin);

  /// No description provided for @confirm.
  ///
  /// In en, this message translates to:
  /// **'Confirm'**
  String get confirm;

  /// No description provided for @gtinAlreadyAssigned.
  ///
  /// In en, this message translates to:
  /// **'This GTIN is already assigned to another product'**
  String get gtinAlreadyAssigned;

  /// No description provided for @toggleGridView.
  ///
  /// In en, this message translates to:
  /// **'Switch to grid view'**
  String get toggleGridView;

  /// No description provided for @toggleListView.
  ///
  /// In en, this message translates to:
  /// **'Switch to list view'**
  String get toggleListView;

  /// No description provided for @viewMode.
  ///
  /// In en, this message translates to:
  /// **'View Mode'**
  String get viewMode;

  /// No description provided for @productsGtinEditTitle.
  ///
  /// In en, this message translates to:
  /// **'Products GTIN Edit'**
  String get productsGtinEditTitle;

  /// No description provided for @gtinStatusAll.
  ///
  /// In en, this message translates to:
  /// **'All'**
  String get gtinStatusAll;

  /// No description provided for @gtinStatusNeedsGtin.
  ///
  /// In en, this message translates to:
  /// **'Needs GTIN'**
  String get gtinStatusNeedsGtin;

  /// No description provided for @gtinStatusWithGtin.
  ///
  /// In en, this message translates to:
  /// **'With GTIN'**
  String get gtinStatusWithGtin;

  /// No description provided for @filterBrand.
  ///
  /// In en, this message translates to:
  /// **'Brand'**
  String get filterBrand;

  /// No description provided for @filterCategory.
  ///
  /// In en, this message translates to:
  /// **'Category'**
  String get filterCategory;

  /// No description provided for @correctGtin.
  ///
  /// In en, this message translates to:
  /// **'Correct GTIN'**
  String get correctGtin;

  /// No description provided for @gtinValue.
  ///
  /// In en, this message translates to:
  /// **'GTIN: {gtin}'**
  String gtinValue(String gtin);

  /// No description provided for @allBrands.
  ///
  /// In en, this message translates to:
  /// **'All Brands'**
  String get allBrands;

  /// No description provided for @allCategories.
  ///
  /// In en, this message translates to:
  /// **'All Categories'**
  String get allCategories;

  /// No description provided for @enterGtinManually.
  ///
  /// In en, this message translates to:
  /// **'Enter GTIN Manually'**
  String get enterGtinManually;

  /// No description provided for @lowestPrice.
  ///
  /// In en, this message translates to:
  /// **'Lowest Price'**
  String get lowestPrice;

  /// No description provided for @averagePrice.
  ///
  /// In en, this message translates to:
  /// **'Average Price'**
  String get averagePrice;

  /// No description provided for @highestPrice.
  ///
  /// In en, this message translates to:
  /// **'Highest Price'**
  String get highestPrice;

  /// No description provided for @scannedProductNotFoundTitle.
  ///
  /// In en, this message translates to:
  /// **'Product Not Found'**
  String get scannedProductNotFoundTitle;

  /// No description provided for @scannedProductNotFoundDesc.
  ///
  /// In en, this message translates to:
  /// **'We searched 6 major local stores in real-time but couldn\'t find this barcode. Would you like to try again, enter the details manually, or report it?'**
  String get scannedProductNotFoundDesc;

  /// No description provided for @retryScan.
  ///
  /// In en, this message translates to:
  /// **'Scan Again'**
  String get retryScan;

  /// No description provided for @manualCorrectionPlaceholder.
  ///
  /// In en, this message translates to:
  /// **'Enter correct barcode...'**
  String get manualCorrectionPlaceholder;

  /// No description provided for @reportMissingProduct.
  ///
  /// In en, this message translates to:
  /// **'Report Missing Product'**
  String get reportMissingProduct;

  /// No description provided for @searchByText.
  ///
  /// In en, this message translates to:
  /// **'Search by Text'**
  String get searchByText;

  /// No description provided for @submittingReport.
  ///
  /// In en, this message translates to:
  /// **'Submitting report...'**
  String get submittingReport;

  /// No description provided for @reportSubmitted.
  ///
  /// In en, this message translates to:
  /// **'Report submitted successfully!'**
  String get reportSubmitted;

  /// No description provided for @searchingLiveStores.
  ///
  /// In en, this message translates to:
  /// **'Searching local stores in real-time...'**
  String get searchingLiveStores;

  /// No description provided for @cartTab.
  ///
  /// In en, this message translates to:
  /// **'Cart'**
  String get cartTab;

  /// No description provided for @addedToCart.
  ///
  /// In en, this message translates to:
  /// **'Product added to cart'**
  String get addedToCart;

  /// No description provided for @cartTotal.
  ///
  /// In en, this message translates to:
  /// **'Cart Total'**
  String get cartTotal;

  /// No description provided for @emptyCart.
  ///
  /// In en, this message translates to:
  /// **'Your cart is empty'**
  String get emptyCart;

  /// No description provided for @checkout.
  ///
  /// In en, this message translates to:
  /// **'Checkout'**
  String get checkout;

  /// No description provided for @quantity.
  ///
  /// In en, this message translates to:
  /// **'Quantity'**
  String get quantity;

  /// No description provided for @totalAmount.
  ///
  /// In en, this message translates to:
  /// **'Total Amount'**
  String get totalAmount;

  /// No description provided for @lowestPriceTotal.
  ///
  /// In en, this message translates to:
  /// **'Total (Lowest)'**
  String get lowestPriceTotal;

  /// No description provided for @highestPriceTotal.
  ///
  /// In en, this message translates to:
  /// **'Total (Highest)'**
  String get highestPriceTotal;

  /// No description provided for @potentialSavings.
  ///
  /// In en, this message translates to:
  /// **'Potential Savings'**
  String get potentialSavings;

  /// No description provided for @startScanning.
  ///
  /// In en, this message translates to:
  /// **'Start Scanning'**
  String get startScanning;

  /// No description provided for @clearCart.
  ///
  /// In en, this message translates to:
  /// **'Clear Cart'**
  String get clearCart;

  /// No description provided for @itemsCount.
  ///
  /// In en, this message translates to:
  /// **'{count, plural, =1{1 item} other{{count} items}}'**
  String itemsCount(int count);

  /// No description provided for @priceSummary.
  ///
  /// In en, this message translates to:
  /// **'Price Summary'**
  String get priceSummary;

  /// No description provided for @authTitle.
  ///
  /// In en, this message translates to:
  /// **'Sign In or Register'**
  String get authTitle;

  /// No description provided for @registerButton.
  ///
  /// In en, this message translates to:
  /// **'Register'**
  String get registerButton;

  /// No description provided for @signUpSuccess.
  ///
  /// In en, this message translates to:
  /// **'Account registered successfully!'**
  String get signUpSuccess;

  /// No description provided for @alreadyHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Already have an account? Sign In'**
  String get alreadyHaveAccount;

  /// No description provided for @dontHaveAccount.
  ///
  /// In en, this message translates to:
  /// **'Don\'t have an account? Register'**
  String get dontHaveAccount;

  /// No description provided for @passwordsDoNotMatch.
  ///
  /// In en, this message translates to:
  /// **'Passwords do not match'**
  String get passwordsDoNotMatch;

  /// No description provided for @confirmPasswordLabel.
  ///
  /// In en, this message translates to:
  /// **'Confirm Password'**
  String get confirmPasswordLabel;

  /// No description provided for @scanLimitTitle.
  ///
  /// In en, this message translates to:
  /// **'Daily Scan Limit Reached'**
  String get scanLimitTitle;

  /// No description provided for @scanLimitMessage.
  ///
  /// In en, this message translates to:
  /// **'Free users are limited to 5 scans per day. Upgrade to Sawa Plus for unlimited scans!'**
  String get scanLimitMessage;

  /// No description provided for @scanLimitMessageFirstDay.
  ///
  /// In en, this message translates to:
  /// **'Free users are limited to 15 scans on their first day. Upgrade to Sawa Plus for unlimited scans!'**
  String get scanLimitMessageFirstDay;

  /// No description provided for @upgradeSawaPlusButton.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to Sawa Plus'**
  String get upgradeSawaPlusButton;

  /// No description provided for @unlimitedScans.
  ///
  /// In en, this message translates to:
  /// **'Unlimited Real-Time Scans'**
  String get unlimitedScans;

  /// No description provided for @cartOptimizations.
  ///
  /// In en, this message translates to:
  /// **'Smart Cart Price Range'**
  String get cartOptimizations;

  /// No description provided for @historicTrends.
  ///
  /// In en, this message translates to:
  /// **'Historic Price Trends & Analytics'**
  String get historicTrends;

  /// No description provided for @subscriptionExplanationTitle.
  ///
  /// In en, this message translates to:
  /// **'App Store Billing Integration'**
  String get subscriptionExplanationTitle;

  /// No description provided for @subscriptionExplanationText.
  ///
  /// In en, this message translates to:
  /// **'Subscriptions are billed monthly (4.99 SAR/month) securely through your App Store account. The subscription auto-renews monthly unless cancelled in your account settings at least 24 hours before the end of the current period. Verification is handled securely on our servers.'**
  String get subscriptionExplanationText;

  /// No description provided for @privacyPolicy.
  ///
  /// In en, this message translates to:
  /// **'Privacy Policy'**
  String get privacyPolicy;

  /// No description provided for @termsOfUse.
  ///
  /// In en, this message translates to:
  /// **'Terms of Use (EULA)'**
  String get termsOfUse;

  /// No description provided for @monthly.
  ///
  /// In en, this message translates to:
  /// **'Monthly'**
  String get monthly;

  /// No description provided for @subscriptionPeriod.
  ///
  /// In en, this message translates to:
  /// **'Period'**
  String get subscriptionPeriod;

  /// No description provided for @oneMonth.
  ///
  /// In en, this message translates to:
  /// **'1 Month'**
  String get oneMonth;

  /// No description provided for @autoRenewable.
  ///
  /// In en, this message translates to:
  /// **'Auto-Renewable'**
  String get autoRenewable;

  /// No description provided for @upgradeButtonWithPrice.
  ///
  /// In en, this message translates to:
  /// **'Upgrade to Sawa Plus ({price} / Monthly)'**
  String upgradeButtonWithPrice(String price);

  /// No description provided for @subscribeMockSuccess.
  ///
  /// In en, this message translates to:
  /// **'Purchase simulated! You are now subscribed to Sawa Plus.'**
  String get subscribeMockSuccess;

  /// No description provided for @priceDropAlerts.
  ///
  /// In en, this message translates to:
  /// **'Price Drop Alerts'**
  String get priceDropAlerts;

  /// No description provided for @priceDropAlertsDesc.
  ///
  /// In en, this message translates to:
  /// **'Get notified when items in your cart go on sale.'**
  String get priceDropAlertsDesc;

  /// No description provided for @cartReminders.
  ///
  /// In en, this message translates to:
  /// **'Cart Reminders'**
  String get cartReminders;

  /// No description provided for @cartRemindersDesc.
  ///
  /// In en, this message translates to:
  /// **'Remind you of pending items in your shopping cart.'**
  String get cartRemindersDesc;

  /// No description provided for @newStoresAlerts.
  ///
  /// In en, this message translates to:
  /// **'New Stores & Offers'**
  String get newStoresAlerts;

  /// No description provided for @newStoresAlertsDesc.
  ///
  /// In en, this message translates to:
  /// **'Alert you when new stores are added in your region.'**
  String get newStoresAlertsDesc;

  /// No description provided for @notificationSettingsTitle.
  ///
  /// In en, this message translates to:
  /// **'Notification Settings'**
  String get notificationSettingsTitle;

  /// No description provided for @privacyCommitmentTitle.
  ///
  /// In en, this message translates to:
  /// **'Privacy & Security'**
  String get privacyCommitmentTitle;

  /// No description provided for @privacyCommitmentText.
  ///
  /// In en, this message translates to:
  /// **'Sawa is built with privacy in mind. We do not sell your personal data or scan history. Your scans are stored securely on your device.'**
  String get privacyCommitmentText;

  /// No description provided for @deleteAccount.
  ///
  /// In en, this message translates to:
  /// **'Delete Account'**
  String get deleteAccount;

  /// No description provided for @deleteAccountConfirm.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to permanently delete your account? This action cannot be undone.'**
  String get deleteAccountConfirm;

  /// No description provided for @deleteAccountSuccess.
  ///
  /// In en, this message translates to:
  /// **'Account deleted successfully'**
  String get deleteAccountSuccess;

  /// No description provided for @sawaPlusSubscriber.
  ///
  /// In en, this message translates to:
  /// **'Sawa Plus Subscriber'**
  String get sawaPlusSubscriber;

  /// No description provided for @searchingStore.
  ///
  /// In en, this message translates to:
  /// **'Checking {store}...'**
  String searchingStore(String store);

  /// No description provided for @storeNotFound.
  ///
  /// In en, this message translates to:
  /// **'{store}: Not found'**
  String storeNotFound(String store);

  /// No description provided for @featuresTitle.
  ///
  /// In en, this message translates to:
  /// **'Discover Sawa\'s Features'**
  String get featuresTitle;

  /// No description provided for @featureScanTitle.
  ///
  /// In en, this message translates to:
  /// **'Real-Time Price Scanning'**
  String get featureScanTitle;

  /// No description provided for @featureScanDesc.
  ///
  /// In en, this message translates to:
  /// **'Scan any grocery barcode to compare prices across 20+ local e-commerce stores instantly.'**
  String get featureScanDesc;

  /// No description provided for @featureCartTitle.
  ///
  /// In en, this message translates to:
  /// **'Smart Shopping Cart'**
  String get featureCartTitle;

  /// No description provided for @featureCartDesc.
  ///
  /// In en, this message translates to:
  /// **'Add items to your cart and check both Lowest Total and Highest Total to see how much you save.'**
  String get featureCartDesc;

  /// No description provided for @signInPrompt.
  ///
  /// In en, this message translates to:
  /// **'Sign in to Sawa to access your history and sync your smart shopping cart across devices.'**
  String get signInPrompt;

  /// No description provided for @signInOrRegister.
  ///
  /// In en, this message translates to:
  /// **'Sign In / Register'**
  String get signInOrRegister;

  /// No description provided for @confirmDelete.
  ///
  /// In en, this message translates to:
  /// **'Confirm Delete'**
  String get confirmDelete;

  /// No description provided for @yesDelete.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get yesDelete;

  /// No description provided for @keepAccount.
  ///
  /// In en, this message translates to:
  /// **'Keep Account'**
  String get keepAccount;

  /// No description provided for @visitStore.
  ///
  /// In en, this message translates to:
  /// **'Visit Store'**
  String get visitStore;

  /// No description provided for @lowPrice.
  ///
  /// In en, this message translates to:
  /// **'Low Price'**
  String get lowPrice;

  /// No description provided for @highPrice.
  ///
  /// In en, this message translates to:
  /// **'High Price'**
  String get highPrice;

  /// No description provided for @commonPrice.
  ///
  /// In en, this message translates to:
  /// **'Common Price'**
  String get commonPrice;

  /// No description provided for @inCart.
  ///
  /// In en, this message translates to:
  /// **'Added to Cart'**
  String get inCart;

  /// No description provided for @iapLoadingProducts.
  ///
  /// In en, this message translates to:
  /// **'Loading subscription details...'**
  String get iapLoadingProducts;

  /// No description provided for @iapPurchaseFailed.
  ///
  /// In en, this message translates to:
  /// **'Purchase failed. Please try again.'**
  String get iapPurchaseFailed;

  /// No description provided for @iapRestoreSuccess.
  ///
  /// In en, this message translates to:
  /// **'Subscription successfully restored!'**
  String get iapRestoreSuccess;

  /// No description provided for @iapRestoreNotFound.
  ///
  /// In en, this message translates to:
  /// **'No active subscription found to restore.'**
  String get iapRestoreNotFound;

  /// No description provided for @iapStoreUnavailable.
  ///
  /// In en, this message translates to:
  /// **'In-App Store is currently unavailable.'**
  String get iapStoreUnavailable;

  /// No description provided for @restorePurchaseButton.
  ///
  /// In en, this message translates to:
  /// **'Restore Purchase'**
  String get restorePurchaseButton;

  /// No description provided for @sawaPlusPopupTitle.
  ///
  /// In en, this message translates to:
  /// **'Join Sawa Plus'**
  String get sawaPlusPopupTitle;

  /// No description provided for @sawaPlusPopupMessage.
  ///
  /// In en, this message translates to:
  /// **'Join Sawa Plus for unlimited scans & features'**
  String get sawaPlusPopupMessage;

  /// No description provided for @continueButton.
  ///
  /// In en, this message translates to:
  /// **'Continue'**
  String get continueButton;
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
    'that was used.',
  );
}
