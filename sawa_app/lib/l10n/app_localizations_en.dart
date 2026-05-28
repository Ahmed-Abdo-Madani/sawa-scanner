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

  @override
  String get adminSignIn => 'Admin Sign In';

  @override
  String get email => 'Email';

  @override
  String get password => 'Password';

  @override
  String get signIn => 'Sign In';

  @override
  String get adminTools => 'Admin Tools';

  @override
  String get quickEntry => 'Quick Entry';

  @override
  String get missingGtinList => 'Missing GTIN List';

  @override
  String get submitAndNext => 'Submit & Next';

  @override
  String get scanningForQuickEntry => 'Scanning for Quick Entry...';

  @override
  String get fetchingProduct => 'Fetching product data...';

  @override
  String get allergens_tab => 'Allergens';

  @override
  String get productExistsBanner => 'Product already exists in database';

  @override
  String get productNewBanner => 'New product detected';

  @override
  String get gtinAssignedBanner => 'GTIN successfully assigned';

  @override
  String get submitAndStay => 'Submit & Stay';

  @override
  String get signOut => 'Sign Out';

  @override
  String get notAuthorized => 'You are not authorized to access admin tools.';

  @override
  String get reportsCount => 'Reports';

  @override
  String get browseHsProducts => 'Browse Products';

  @override
  String get needsGtinTitle => 'Products Needing GTIN';

  @override
  String get needsGtinSubtitle => 'Tap a product to scan its barcode';

  @override
  String get scanGtinButton => 'Scan GTIN';

  @override
  String get assignGtinTitle => 'Assign GTIN';

  @override
  String get gtinAssignedSuccess => 'GTIN assigned successfully!';

  @override
  String get nextProduct => 'Next Product';

  @override
  String get noProductsNeedGtin => 'All products have GTINs assigned';

  @override
  String get gtinScannerTitle => 'GTIN Scanner';

  @override
  String get filterByCategory => 'Filter by category';

  @override
  String productsCount(int count) {
    return '$count products';
  }

  @override
  String get hsProductId => 'HS Product ID';

  @override
  String confirmGtinAssignment(String gtin) {
    return 'Assign GTIN $gtin to this product?';
  }

  @override
  String get confirm => 'Confirm';

  @override
  String get gtinAlreadyAssigned =>
      'This GTIN is already assigned to another product';

  @override
  String get toggleGridView => 'Switch to grid view';

  @override
  String get toggleListView => 'Switch to list view';

  @override
  String get viewMode => 'View Mode';

  @override
  String get productsGtinEditTitle => 'Products GTIN Edit';

  @override
  String get gtinStatusAll => 'All';

  @override
  String get gtinStatusNeedsGtin => 'Needs GTIN';

  @override
  String get gtinStatusWithGtin => 'With GTIN';

  @override
  String get filterBrand => 'Brand';

  @override
  String get filterCategory => 'Category';

  @override
  String get correctGtin => 'Correct GTIN';

  @override
  String gtinValue(String gtin) {
    return 'GTIN: $gtin';
  }

  @override
  String get allBrands => 'All Brands';

  @override
  String get allCategories => 'All Categories';

  @override
  String get enterGtinManually => 'Enter GTIN Manually';

  @override
  String get lowestPrice => 'Lowest Price';

  @override
  String get averagePrice => 'Average Price';

  @override
  String get highestPrice => 'Highest Price';

  @override
  String get scannedProductNotFoundTitle => 'Product Not Found';

  @override
  String get scannedProductNotFoundDesc =>
      'We searched 6 major local stores in real-time but couldn\'t find this barcode. Would you like to try again, enter the details manually, or report it?';

  @override
  String get retryScan => 'Scan Again';

  @override
  String get manualCorrectionPlaceholder => 'Enter correct barcode...';

  @override
  String get reportMissingProduct => 'Report Missing Product';

  @override
  String get searchByText => 'Search by Text';

  @override
  String get submittingReport => 'Submitting report...';

  @override
  String get reportSubmitted => 'Report submitted successfully!';

  @override
  String get searchingLiveStores => 'Searching local stores in real-time...';

  @override
  String get cartTab => 'Cart';

  @override
  String get addedToCart => 'Product added to cart';

  @override
  String get cartTotal => 'Cart Total';

  @override
  String get emptyCart => 'Your cart is empty';

  @override
  String get checkout => 'Checkout';

  @override
  String get quantity => 'Quantity';

  @override
  String get totalAmount => 'Total Amount';

  @override
  String get lowestPriceTotal => 'Total (Lowest)';

  @override
  String get highestPriceTotal => 'Total (Highest)';

  @override
  String get potentialSavings => 'Potential Savings';

  @override
  String get startScanning => 'Start Scanning';

  @override
  String get clearCart => 'Clear Cart';

  @override
  String itemsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count items',
      one: '1 item',
    );
    return '$_temp0';
  }

  @override
  String get priceSummary => 'Price Summary';

  @override
  String get authTitle => 'Sign In or Register';

  @override
  String get registerButton => 'Register';

  @override
  String get signUpSuccess => 'Account registered successfully!';

  @override
  String get alreadyHaveAccount => 'Already have an account? Sign In';

  @override
  String get dontHaveAccount => 'Don\'t have an account? Register';

  @override
  String get passwordsDoNotMatch => 'Passwords do not match';

  @override
  String get confirmPasswordLabel => 'Confirm Password';

  @override
  String get scanLimitTitle => 'Daily Scan Limit Reached';

  @override
  String get scanLimitMessage =>
      'Free users are limited to 5 scans per day. Upgrade to Sawa Plus for unlimited scans!';

  @override
  String get upgradeSawaPlusButton => 'Upgrade to Sawa Plus';

  @override
  String get unlimitedScans => 'Unlimited Real-Time Scans';

  @override
  String get cartOptimizations => 'Smart Cart Price Range';

  @override
  String get historicTrends => 'Historic Price Trends & Analytics';

  @override
  String get subscriptionExplanationTitle => 'App Store Billing Integration';

  @override
  String get subscriptionExplanationText =>
      'Subscriptions are billed securely through your Google Play Store or Apple App Store account. Verification is handled by verifying cryptographic purchase tokens on our servers.';

  @override
  String get subscribeMockSuccess =>
      'Purchase simulated! You are now subscribed to Sawa Plus.';

  @override
  String get priceDropAlerts => 'Price Drop Alerts';

  @override
  String get priceDropAlertsDesc =>
      'Get notified when items in your cart go on sale.';

  @override
  String get cartReminders => 'Cart Reminders';

  @override
  String get cartRemindersDesc =>
      'Remind you of pending items in your shopping cart.';

  @override
  String get newStoresAlerts => 'New Stores & Offers';

  @override
  String get newStoresAlertsDesc =>
      'Alert you when new stores are added in your region.';

  @override
  String get notificationSettingsTitle => 'Notification Settings';

  @override
  String get privacyCommitmentTitle => 'Privacy & Security';

  @override
  String get privacyCommitmentText =>
      'Sawa is built with privacy in mind. We do not sell your personal data or scan history. Your scans are stored securely on your device.';

  @override
  String get deleteAccount => 'Delete Account';

  @override
  String get deleteAccountConfirm =>
      'Are you sure you want to permanently delete your account? This action cannot be undone.';

  @override
  String get deleteAccountSuccess => 'Account deleted successfully';

  @override
  String get sawaPlusSubscriber => 'Sawa Plus Subscriber';

  @override
  String searchingStore(String store) {
    return 'Checking $store...';
  }

  @override
  String storeNotFound(String store) {
    return '$store: Not found';
  }

  @override
  String get featuresTitle => 'Discover Sawa\'s Features';

  @override
  String get featureScanTitle => 'Real-Time Price Scanning';

  @override
  String get featureScanDesc =>
      'Scan any grocery barcode to compare prices across 20+ local e-commerce stores instantly.';

  @override
  String get featureCartTitle => 'Smart Shopping Cart';

  @override
  String get featureCartDesc =>
      'Add items to your cart and check both Lowest Total and Highest Total to see how much you save.';

  @override
  String get signInPrompt =>
      'Sign in to Sawa to access your history and sync your smart shopping cart across devices.';

  @override
  String get signInOrRegister => 'Sign In / Register';

  @override
  String get confirmDelete => 'Confirm Delete';

  @override
  String get yesDelete => 'Delete';

  @override
  String get keepAccount => 'Keep Account';

  @override
  String get visitStore => 'Visit Store';

  @override
  String get lowPrice => 'Low Price';

  @override
  String get highPrice => 'High Price';

  @override
  String get commonPrice => 'Common Price';

  @override
  String get inCart => 'Added to Cart';

  @override
  String get iapLoadingProducts => 'Loading subscription details...';

  @override
  String get iapPurchaseFailed => 'Purchase failed. Please try again.';

  @override
  String get iapRestoreSuccess => 'Subscription successfully restored!';

  @override
  String get iapRestoreNotFound => 'No active subscription found to restore.';

  @override
  String get iapStoreUnavailable => 'In-App Store is currently unavailable.';

  @override
  String get restorePurchaseButton => 'Restore Purchase';
}
