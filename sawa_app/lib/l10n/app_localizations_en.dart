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
  String get surfacePreview => 'Surface Preview';

  @override
  String get gradeBadgesPreview => 'Grade Badges Preview';

  @override
  String get cardSurface => 'Card Surface';

  @override
  String get surfaceTest => 'Surface test';

  @override
  String get colorBackground => 'Background';

  @override
  String get colorSurface => 'Surface';

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

  @override
  String get ecoScore => 'Eco-Score';

  @override
  String get ecoScoreDescription => 'Environmental impact';

  @override
  String get allergensTitle => 'Allergens';

  @override
  String get noAllergens => 'No allergens detected';

  @override
  String get sfdaSafety => 'SFDA Safety';

  @override
  String get nutriScoreTitle => 'Nutri-Score';

  @override
  String get novaGroupTitle => 'NOVA Group';

  @override
  String get nutritionFactsTitle => 'Nutrition Facts';

  @override
  String get ingredientsTitle => 'Ingredients';

  @override
  String get processingLevel1 => 'Unprocessed or minimally processed';

  @override
  String get processingLevel2 => 'Processed culinary ingredients';

  @override
  String get processingLevel3 => 'Processed foods';

  @override
  String get processingLevel4 => 'Ultra-processed products';

  @override
  String get environmentalImpact => 'Environmental Impact';

  @override
  String gradeSummary(String grade) {
    return 'Grade $grade';
  }

  @override
  String novaGroupSummary(int group) {
    return 'Group $group';
  }

  @override
  String get per100g => 'per 100g';

  @override
  String ingredientsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ingredients',
      one: '1 ingredient',
    );
    return '$_temp0';
  }

  @override
  String flaggedItemsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count flagged items',
      one: '1 flagged item',
    );
    return '$_temp0';
  }

  @override
  String get scanTab => 'Scan';

  @override
  String get searchTab => 'Search';

  @override
  String get historyTab => 'History';

  @override
  String get profileTab => 'Profile';

  @override
  String get searchProducts => 'Search Products';

  @override
  String get searchHint => 'Search by product name...';

  @override
  String get noResults => 'No results found';

  @override
  String get scanHistory => 'Scan History';

  @override
  String get clearHistory => 'Clear History';

  @override
  String scannedOn(String date) {
    return 'Scanned on $date';
  }

  @override
  String get noHistory => 'No scan history yet';

  @override
  String get clearHistoryConfirm =>
      'Are you sure you want to clear all your scan history?';

  @override
  String get cancel => 'Cancel';

  @override
  String get clear => 'Clear';

  @override
  String get today => 'Today';

  @override
  String get yesterday => 'Yesterday';

  @override
  String get language => 'Language';

  @override
  String get english => 'English';

  @override
  String get arabic => 'Arabic';

  @override
  String get notifications => 'Notifications';

  @override
  String get privacyAndSecurity => 'Privacy & Security';

  @override
  String get sawaPlus => 'Sawa Plus';

  @override
  String get manageSubscription => 'Manage Subscription';

  @override
  String get freePlan => 'Free';

  @override
  String get userName => 'User Name';

  @override
  String get welcomeTitle => 'Welcome to Sawa';

  @override
  String get welcomeSubtitle =>
      'Scan products to check nutrition, safety, and find the best prices';

  @override
  String get dietaryPreferences => 'Dietary Preferences';

  @override
  String get allergenFilters => 'Allergen Alerts';

  @override
  String get getStarted => 'Get Started';

  @override
  String get skipForNow => 'Skip for now';

  @override
  String get next => 'Next';

  @override
  String get back => 'Back';

  @override
  String get vegan => 'Vegan';

  @override
  String get vegetarian => 'Vegetarian';

  @override
  String get halalOnly => 'Halal Only';

  @override
  String get glutenFree => 'Gluten Free';

  @override
  String get peanuts => 'Peanuts';

  @override
  String get dairy => 'Dairy';

  @override
  String get soy => 'Soy';

  @override
  String get eggs => 'Eggs';

  @override
  String get wheat => 'Wheat';

  @override
  String get fish => 'Fish';

  @override
  String get shellfish => 'Shellfish';

  @override
  String get treeNuts => 'Tree Nuts';

  @override
  String get editPreferences => 'Edit Preferences';

  @override
  String get yourPreferences => 'Your Preferences';

  @override
  String get yourAllergens => 'Your Allergens';

  @override
  String get confirmationTitle => 'You\'re All Set!';

  @override
  String get confirmationSubtitle => 'Here\'s a summary of your preferences';

  @override
  String get selectLanguage => 'Select Language';

  @override
  String get editProduct => 'Edit Product';

  @override
  String get addProduct => 'Add Product';

  @override
  String get basicInfo => 'Basic Info';

  @override
  String get nutritionFacts_tab => 'Nutrition';

  @override
  String get ingredients_tab => 'Ingredients';

  @override
  String get photos => 'Photos';

  @override
  String get submitProduct => 'Submit';

  @override
  String get productSubmitted => 'Product submitted successfully!';

  @override
  String get nameAr => 'Name (Arabic)';

  @override
  String get nameEn => 'Name (English)';

  @override
  String get brand => 'Brand';

  @override
  String get frontPhoto => 'Front Photo';

  @override
  String get ingredientsPhoto => 'Ingredients Photo';

  @override
  String get nutritionPhoto => 'Nutrition Photo';

  @override
  String get takePhoto => 'Take Photo';

  @override
  String get chooseFromGallery => 'Choose from Gallery';

  @override
  String get productNotFoundDescription =>
      'We couldn\'t find this product in our database. You can help us by contributing it.';

  @override
  String get serverErrorDescription =>
      'An error occurred while connecting to the server. Please try again.';

  @override
  String get gtinBarcode => 'GTIN / Barcode';

  @override
  String get enterIngredientsList => 'Enter ingredients list...';

  @override
  String get upgradeNow => 'Upgrade Now';

  @override
  String get backendUnavailable => 'Sawa service unavailable';

  @override
  String get backendUnavailableDescription =>
      'Our primary servers are currently unreachable. We are working to restore access.';

  @override
  String get fallbackUnavailable => 'Global database error';

  @override
  String get fallbackUnavailableDescription =>
      'We couldn\'t reach the global product database (OpenFoodFacts).';

  @override
  String get fallbackConfiguration => 'App configuration error';

  @override
  String get fallbackConfigurationDescription =>
      'The application is misconfigured (User-Agent missing). Please contact support.';

  @override
  String get apiConfiguration => 'Sawa API Not Configured';

  @override
  String get apiConfigurationDescription =>
      'The backend URL is missing. Developers must build with --dart-define=API_BASE_URL=...';

  @override
  String get scanOrSearchPrompt => 'Scan a barcode or search for a product';

  @override
  String get nearbyStores => 'Nearby Stores';

  @override
  String get nearbyStoresSubtitle => 'Prices from stores near you';

  @override
  String storeDistance(String distance) {
    return '$distance km away';
  }

  @override
  String get promoPrice => 'Promo';

  @override
  String get unitPrice => 'Unit Price';

  @override
  String perUnit(String unit) {
    return 'per $unit';
  }

  @override
  String get locationPermissionRequired =>
      'Location permission is required to show nearby stores';

  @override
  String get enableLocation => 'Enable Location';

  @override
  String get noNearbyStores => 'No stores found nearby for this product';

  @override
  String get nutritionIntelligence => 'Nutrition Intelligence';

  @override
  String get healthSummary => 'Health Summary';

  @override
  String get harmfulSubstances => 'Harmful Substances';

  @override
  String get allergenWarnings => 'Allergen Warnings';

  @override
  String get noHarmfulSubstances => 'No harmful substances detected';

  @override
  String get noAllergenWarnings => 'No allergen warnings';

  @override
  String get lowLevel => 'Low';

  @override
  String get mediumLevel => 'Medium';

  @override
  String get highLevel => 'High';

  @override
  String get nutriScoreExplanation =>
      'NutriScore rates nutritional quality from A (best) to E (least favorable)';

  @override
  String get nutritionDataIncomplete =>
      'Nutrition data is incomplete for this product';

  @override
  String get compareProducts => 'Compare Products';

  @override
  String get similarProducts => 'Similar Products';

  @override
  String get noSimilarProducts => 'No similar products found';

  @override
  String get selectToCompare => 'Select to compare';

  @override
  String get nutritionComparison => 'Nutrition Comparison';

  @override
  String get allergenComparison => 'Allergen Comparison';

  @override
  String get recommendation => 'Recommendation';

  @override
  String get betterChoice => 'Better Choice';

  @override
  String get tieResult => 'Tie';

  @override
  String get onlyInA => 'Only in Product A';

  @override
  String get onlyInB => 'Only in Product B';

  @override
  String get shared => 'Shared';

  @override
  String get vsLabel => 'VS';

  @override
  String get lower => 'Lower';

  @override
  String get higher => 'Higher';

  @override
  String get equal => 'Equal';

  @override
  String get unknown => 'Unknown';

  @override
  String get scanPartialTitle => 'Partial Scan';

  @override
  String get extractedText => 'Extracted Text:';

  @override
  String get close => 'Close';

  @override
  String get recognizingWithAi => 'Recognizing product on-device...';

  @override
  String get recognizedByAiBadge => 'AI Recognized';

  @override
  String get aiRecognitionFailed =>
      'Could not recognize product. Please try again.';
}
