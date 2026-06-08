// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'سوا';

  @override
  String get scanNow => 'امسح الآن';

  @override
  String greeting(Object name) {
    return 'مرحباً، $name 👋';
  }

  @override
  String get nearbyOffers => 'عروض قريبة';

  @override
  String get recentScans => 'مسحات حديثة';

  @override
  String get home => 'الرئيسية';

  @override
  String get search => 'بحث';

  @override
  String get compare => 'مقارنة';

  @override
  String get profile => 'الحساب';

  @override
  String get themeShowcaseTitle => 'معاينة المظهر وتصحيح الأخطاء';

  @override
  String get colorSwatches => 'لوحات الألوان';

  @override
  String get typographyScaleEn => 'حجم الخط (إنجليزي)';

  @override
  String get typographyScaleAr => 'حجم الخط (عربي)';

  @override
  String get surfacePreview => 'معاينة السطح';

  @override
  String get gradeBadgesPreview => 'معاينة شارات التقييم';

  @override
  String get cardSurface => 'سطح البطاقة';

  @override
  String get surfaceTest => 'اختبار السطح';

  @override
  String get colorBackground => 'الخلفية';

  @override
  String get colorSurface => 'السطح';

  @override
  String get colorPrimary => 'الأساسي';

  @override
  String get colorSecondary => 'الثانوي';

  @override
  String get colorError => 'خطأ';

  @override
  String get colorWarning => 'تحذير';

  @override
  String get colorOnBackground => 'على الخلفية';

  @override
  String get colorOnSurface => 'على السطح';

  @override
  String get labelDisplay => 'عرض';

  @override
  String get labelHeadline => 'عنوان';

  @override
  String get labelBody => 'نص';

  @override
  String get labelCaption => 'تسمية توضيحية';

  @override
  String fontMeta(String fontFamily, String fontWeight, String fontSize) {
    return '$fontFamily، $fontWeight، $fontSize';
  }

  @override
  String get scannerTitle => 'الماسح';

  @override
  String get barcodeMode => 'باركود';

  @override
  String get labelMode => 'ملصق';

  @override
  String get manualMode => 'يدوي';

  @override
  String get pointCameraAtBarcode => 'وجّه الكاميرا نحو الباركود';

  @override
  String get enterBarcodeNumber => 'أدخل رقم الباركود...';

  @override
  String get searchButton => 'بحث';

  @override
  String get nutritionFacts => 'القيم الغذائية (لكل ١٠٠ غ)';

  @override
  String get ingredientsAndAdditives => 'المكونات والإضافات';

  @override
  String get comparePrices => 'مقارنة الأسعار';

  @override
  String get bestPrice => 'أفضل سعر';

  @override
  String get productNotFound => 'المنتج غير موجود';

  @override
  String get contributeProduct => 'ساهم بإضافة المنتج';

  @override
  String get sfdaDisclaimer =>
      'المعلومات الغذائية مقدمة من هيئة الغذاء والدواء السعودية (SFDA) للأغراض المعلوماتية فقط.';

  @override
  String get calories => 'السعرات الحرارية';

  @override
  String get fat => 'الدهون';

  @override
  String get saturatedFat => 'الدهون المشبعة';

  @override
  String get carbs => 'الكربوهيدرات';

  @override
  String get sugars => 'السكريات';

  @override
  String get fiber => 'الألياف';

  @override
  String get protein => 'البروتين';

  @override
  String get sodium => 'الصوديوم';

  @override
  String get sfdaRegistered => 'مسجل SFDA ✓';

  @override
  String get halalCertified => 'حلال ✓';

  @override
  String get labelScanComingSoon => 'وضع مسح الملصقات جاهز!';

  @override
  String get sar => 'ريال';

  @override
  String get serverError => 'خطأ في الاتصال';

  @override
  String get retryButton => 'إعادة المحاولة';

  @override
  String get pointCameraAtLabel => 'وجه الكاميرا نحو ملصق البيانات الغذائية';

  @override
  String get analyzingLabel => 'جاري تحليل الملصق بالذكاء الاصطناعي...';

  @override
  String get priceComparison => 'مقارنة الأسعار';

  @override
  String get viewHistory => 'عرض السجل';

  @override
  String get addToCart => 'أضف إلى السلة';

  @override
  String get historicalPriceTrend => 'اتجاه السعر التاريخي';

  @override
  String get outOfStock => 'غير متوفر';

  @override
  String get sawaPlusGated => 'حصري لـ سوا بلس';

  @override
  String get unlockSawaPlus =>
      'اشترك في سوا بلس لعرض سجل الأسعار والاتجاهات بالتفصيل.';

  @override
  String get ecoScore => 'النتيجة البيئية';

  @override
  String get ecoScoreDescription => 'الأثر البيئي';

  @override
  String get allergensTitle => 'مسببات الحساسية';

  @override
  String get noAllergens => 'لم يتم اكتشاف مسببات حساسية';

  @override
  String get sfdaSafety => 'سلامة SFDA';

  @override
  String get nutriScoreTitle => 'التقييم الغذائي';

  @override
  String get novaGroupTitle => 'مجموعة NOVA';

  @override
  String get nutritionFactsTitle => 'القيم الغذائية';

  @override
  String get ingredientsTitle => 'المكونات';

  @override
  String get processingLevel1 => 'غير معالج أو معالج بالحد الأدنى';

  @override
  String get processingLevel2 => 'مكونات طهي معالجة';

  @override
  String get processingLevel3 => 'أغذية معالجة';

  @override
  String get processingLevel4 => 'منتجات فائقة المعالجة';

  @override
  String get environmentalImpact => 'التأثير البيئي';

  @override
  String gradeSummary(String grade) {
    return 'الدرجة $grade';
  }

  @override
  String novaGroupSummary(int group) {
    return 'المجموعة $group';
  }

  @override
  String get per100g => 'لكل ١٠٠ غ';

  @override
  String ingredientsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مكونات',
      two: 'مكونان',
      one: 'مكون واحد',
    );
    return '$_temp0';
  }

  @override
  String flaggedItemsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count مواد منبهة',
      two: 'مادتان منبهتان',
      one: 'مادة منبهة واحدة',
    );
    return '$_temp0';
  }

  @override
  String get scanTab => 'مسح';

  @override
  String get searchTab => 'بحث';

  @override
  String get historyTab => 'السجل';

  @override
  String get profileTab => 'الحساب';

  @override
  String get searchProducts => 'البحث عن منتجات';

  @override
  String get searchHint => 'ابحث باسم المنتج...';

  @override
  String get noResults => 'لم يتم العثور على نتائج';

  @override
  String get scanHistory => 'سجل المسح';

  @override
  String get clearHistory => 'مسح السجل';

  @override
  String scannedOn(String date) {
    return 'تم المسح في $date';
  }

  @override
  String get noHistory => 'لا يوجد سجل مسح بعد';

  @override
  String get clearHistoryConfirm =>
      'هل أنت متأكد من رغبتك في مسح سجل المسح بالكامل؟';

  @override
  String get cancel => 'إلغاء';

  @override
  String get clear => 'مسح';

  @override
  String get today => 'اليوم';

  @override
  String get yesterday => 'أمس';

  @override
  String get language => 'اللغة';

  @override
  String get english => 'الإنجليزية';

  @override
  String get arabic => 'العربية';

  @override
  String get notifications => 'الإشعارات';

  @override
  String get privacyAndSecurity => 'الخصوصية والأمان';

  @override
  String get sawaPlus => 'سوا بلس';

  @override
  String get manageSubscription => 'إدارة الاشتراك';

  @override
  String get freePlan => 'مجاني';

  @override
  String get userName => 'اسم المستخدم';

  @override
  String get welcomeTitle => 'مرحباً بك في سوا';

  @override
  String get welcomeSubtitle =>
      'امسح المنتجات للتحقق من التغذية والسلامة وأفضل الأسعار';

  @override
  String get dietaryPreferences => 'التفضيلات الغذائية';

  @override
  String get allergenFilters => 'تنبيهات الحساسية';

  @override
  String get getStarted => 'ابدأ الآن';

  @override
  String get skipForNow => 'تخطي الآن';

  @override
  String get next => 'التالي';

  @override
  String get back => 'رجوع';

  @override
  String get vegan => 'نباتي';

  @override
  String get vegetarian => 'نباتي (لاكتو)';

  @override
  String get halalOnly => 'حلال فقط';

  @override
  String get glutenFree => 'خالٍ من الغلوتين';

  @override
  String get peanuts => 'فول سوداني';

  @override
  String get dairy => 'منتجات الألبان';

  @override
  String get soy => 'صويا';

  @override
  String get eggs => 'بيض';

  @override
  String get wheat => 'قمح';

  @override
  String get fish => 'سمك';

  @override
  String get shellfish => 'محار';

  @override
  String get treeNuts => 'مكسرات شجرية';

  @override
  String get editPreferences => 'تعديل التفضيلات';

  @override
  String get yourPreferences => 'تفضيلاتك';

  @override
  String get yourAllergens => 'مسببات الحساسية';

  @override
  String get confirmationTitle => 'أنت جاهز!';

  @override
  String get confirmationSubtitle => 'إليك ملخص تفضيلاتك';

  @override
  String get selectLanguage => 'اختر اللغة';

  @override
  String get editProduct => 'تعديل المنتج';

  @override
  String get addProduct => 'إضافة منتج';

  @override
  String get basicInfo => 'معلومات أساسية';

  @override
  String get nutritionFacts_tab => 'التغذية';

  @override
  String get ingredients_tab => 'المكونات';

  @override
  String get photos => 'الصور';

  @override
  String get submitProduct => 'إرسال';

  @override
  String get productSubmitted => '!تم إرسال المنتج بنجاح';

  @override
  String get nameAr => 'الاسم (عربي)';

  @override
  String get nameEn => 'الاسم (إنجليزي)';

  @override
  String get brand => 'العلامة التجارية';

  @override
  String get frontPhoto => 'صورة الواجهة';

  @override
  String get ingredientsPhoto => 'صورة المكونات';

  @override
  String get nutritionPhoto => 'صورة القيم الغذائية';

  @override
  String get takePhoto => 'التقاط صورة';

  @override
  String get chooseFromGallery => 'اختر من المعرض';

  @override
  String get productNotFoundDescription =>
      'لم نتمكن من العثور على هذا المنتج في قاعدة بياناتنا. يمكنك مساعدتنا بإضافته.';

  @override
  String get serverErrorDescription =>
      'حدث خطأ أثناء الاتصال بالخادم. يرجى المحاولة مرة أخرى.';

  @override
  String get gtinBarcode => 'GTIN / الباركود';

  @override
  String get enterIngredientsList => 'أدخل قائمة المكونات...';

  @override
  String get upgradeNow => 'ترقية الآن';

  @override
  String get backendUnavailable => 'خدمة سوا غير متوفرة';

  @override
  String get backendUnavailableDescription =>
      'خوادمنا الأساسية غير قادرة على الاتصال حالياً. نحن نعمل على استعادة الوصول.';

  @override
  String get fallbackUnavailable => 'خطأ في القاعدة العالمية';

  @override
  String get fallbackUnavailableDescription =>
      'تعذر الوصول إلى قاعدة البيانات العالمية للمنتجات (OpenFoodFacts).';

  @override
  String get fallbackConfiguration => 'خطأ في تهيئة التطبيق';

  @override
  String get fallbackConfigurationDescription =>
      'حدث خطأ في إعدادات التطبيق (User-Agent مفقود). يرجى التواصل مع الدعم.';

  @override
  String get apiConfiguration => 'قاعدة بيانات سوا غير مهيأة';

  @override
  String get apiConfigurationDescription =>
      'رابط الخادم الأساسي مفقود. يجب البناء باستخدام --dart-define=API_BASE_URL=...';

  @override
  String get scanOrSearchPrompt => 'امسح باركود أو ابحث عن منتج';

  @override
  String get nearbyStores => 'المتاجر القريبة';

  @override
  String get nearbyStoresSubtitle => 'أسعار المتاجر القريبة منك';

  @override
  String storeDistance(String distance) {
    return '$distance كم';
  }

  @override
  String get promoPrice => 'عرض';

  @override
  String get unitPrice => 'سعر الوحدة';

  @override
  String perUnit(String unit) {
    return 'لكل $unit';
  }

  @override
  String get locationPermissionRequired =>
      'يلزم إذن الموقع لعرض المتاجر القريبة';

  @override
  String get enableLocation => 'تفعيل الموقع';

  @override
  String get noNearbyStores => 'لم يتم العثور على متاجر قريبة لهذا المنتج';

  @override
  String get nutritionIntelligence => 'الذكاء الغذائي';

  @override
  String get healthSummary => 'ملخص صحي';

  @override
  String get harmfulSubstances => 'مواد ضارة';

  @override
  String get allergenWarnings => 'تحذيرات الحساسية';

  @override
  String get noHarmfulSubstances => 'لم يتم اكتشاف مواد ضارة';

  @override
  String get noAllergenWarnings => 'لا توجد تحذيرات حساسية';

  @override
  String get lowLevel => 'منخفض';

  @override
  String get mediumLevel => 'متوسط';

  @override
  String get highLevel => 'مرتفع';

  @override
  String get nutriScoreExplanation =>
      'يقيّم NutriScore الجودة الغذائية من A (الأفضل) إلى E (الأقل ملاءمة)';

  @override
  String get nutritionDataIncomplete =>
      'البيانات الغذائية غير مكتملة لهذا المنتج';

  @override
  String get compareProducts => 'مقارنة المنتجات';

  @override
  String get similarProducts => 'منتجات مشابهة';

  @override
  String get noSimilarProducts => 'لم يتم العثور على منتجات مشابهة';

  @override
  String get selectToCompare => 'اختر للمقارنة';

  @override
  String get nutritionComparison => 'مقارنة التغذية';

  @override
  String get allergenComparison => 'مقارنة الحساسية';

  @override
  String get recommendation => 'التوصية';

  @override
  String get betterChoice => 'الخيار الأفضل';

  @override
  String get tieResult => 'تعادل';

  @override
  String get onlyInA => 'في المنتج الأول فقط';

  @override
  String get onlyInB => 'في المنتج الثاني فقط';

  @override
  String get shared => 'مشترك';

  @override
  String get vsLabel => 'مقابل';

  @override
  String get lower => 'أقل';

  @override
  String get higher => 'أعلى';

  @override
  String get equal => 'متساوٍ';

  @override
  String get unknown => 'غير معروف';

  @override
  String get scanPartialTitle => 'مسح جزئي';

  @override
  String get extractedText => 'النص المستخرج:';

  @override
  String get close => 'إغلاق';

  @override
  String get recognizingWithAi => 'جاري التعرف على المنتج محلياً...';

  @override
  String get recognizedByAiBadge => 'تم التعرف عبر الذكاء الاصطناعي';

  @override
  String get aiRecognitionFailed => 'تعذر التعرف على المنتج. حاول مرة أخرى.';

  @override
  String get adminSignIn => 'تسجيل دخول المسؤول';

  @override
  String get email => 'البريد الإلكتروني';

  @override
  String get password => 'كلمة المرور';

  @override
  String get signIn => 'تسجيل الدخول';

  @override
  String get adminTools => 'أدوات المسؤول';

  @override
  String get quickEntry => 'إدخال سريع';

  @override
  String get missingGtinList => 'قائمة الباركود المفقود';

  @override
  String get submitAndNext => 'إرسال والتالي';

  @override
  String get scanningForQuickEntry => 'جاري المسح للإدخال السريع...';

  @override
  String get fetchingProduct => 'جاري جلب بيانات المنتج...';

  @override
  String get allergens_tab => 'مسببات الحساسية';

  @override
  String get productExistsBanner => 'المنتج موجود بالفعل في قاعدة البيانات';

  @override
  String get productNewBanner => 'تم اكتشاف منتج جديد';

  @override
  String get gtinAssignedBanner => 'تم تعيين الباركود بنجاح';

  @override
  String get submitAndStay => 'إرسال وبقاء';

  @override
  String get signOut => 'تسجيل الخروج';

  @override
  String get notAuthorized => 'ليس لديك صلاحية الوصول إلى أدوات المسؤول.';

  @override
  String get reportsCount => 'التقارير';

  @override
  String get browseHsProducts => 'تصفح المنتجات';

  @override
  String get needsGtinTitle => 'منتجات بحاجة لباركود';

  @override
  String get needsGtinSubtitle => 'اضغط على المنتج لمسح الباركود';

  @override
  String get scanGtinButton => 'مسح الباركود';

  @override
  String get assignGtinTitle => 'تعيين الباركود';

  @override
  String get gtinAssignedSuccess => 'تم تعيين الباركود بنجاح!';

  @override
  String get nextProduct => 'المنتج التالي';

  @override
  String get noProductsNeedGtin => 'جميع المنتجات لديها باركود';

  @override
  String get gtinScannerTitle => 'ماسح الباركود';

  @override
  String get filterByCategory => 'تصفية حسب الفئة';

  @override
  String productsCount(int count) {
    return '$count منتج';
  }

  @override
  String get hsProductId => 'معرّف المنتج HS';

  @override
  String confirmGtinAssignment(String gtin) {
    return 'هل تريد تعيين الباركود $gtin لهذا المنتج؟';
  }

  @override
  String get confirm => 'تأكيد';

  @override
  String get gtinAlreadyAssigned => 'هذا الباركود مُعيّن لمنتج آخر';

  @override
  String get toggleGridView => 'التبديل إلى عرض الشبكة';

  @override
  String get toggleListView => 'التبديل إلى عرض القائمة';

  @override
  String get viewMode => 'وضع العرض';

  @override
  String get productsGtinEditTitle => 'تعديل باركود المنتجات';

  @override
  String get gtinStatusAll => 'الكل';

  @override
  String get gtinStatusNeedsGtin => 'بحاجة لباركود';

  @override
  String get gtinStatusWithGtin => 'مع باركود';

  @override
  String get filterBrand => 'العلامة التجارية';

  @override
  String get filterCategory => 'الفئة';

  @override
  String get correctGtin => 'تصحيح الباركود';

  @override
  String gtinValue(String gtin) {
    return 'الباركود: $gtin';
  }

  @override
  String get allBrands => 'كل العلامات التجارية';

  @override
  String get allCategories => 'كل الفئات';

  @override
  String get enterGtinManually => 'إدخال الباركود يدوياً';

  @override
  String get lowestPrice => 'أقل سعر';

  @override
  String get averagePrice => 'متوسط السعر';

  @override
  String get highestPrice => 'أعلى سعر';

  @override
  String get scannedProductNotFoundTitle => 'المنتج غير موجود';

  @override
  String get scannedProductNotFoundDesc =>
      'بحثنا في ٦ متاجر محلية كبرى في الوقت الفعلي ولم نعثر على هذا الباركود. هل ترغب في المحاولة مجدداً، أو إدخال البيانات يدوياً، أو الإبلاغ عن المنتج؟';

  @override
  String get retryScan => 'إعادة المسح';

  @override
  String get manualCorrectionPlaceholder => 'أدخل الباركود الصحيح...';

  @override
  String get reportMissingProduct => 'الإبلاغ عن منتج مفقود';

  @override
  String get searchByText => 'البحث بالاسم';

  @override
  String get submittingReport => 'جاري إرسال البلاغ...';

  @override
  String get reportSubmitted => 'تم إرسال البلاغ بنجاح!';

  @override
  String get searchingLiveStores => 'جاري البحث في المتاجر المحلية...';

  @override
  String get cartTab => 'السلة';

  @override
  String get addedToCart => 'تمت إضافة المنتج إلى السلة';

  @override
  String get cartTotal => 'إجمالي السلة';

  @override
  String get emptyCart => 'سلتك فارغة';

  @override
  String get checkout => 'الدفع';

  @override
  String get quantity => 'الكمية';

  @override
  String get totalAmount => 'المبلغ الإجمالي';

  @override
  String get lowestPriceTotal => 'الإجمالي (الأقل)';

  @override
  String get highestPriceTotal => 'الإجمالي (الأعلى)';

  @override
  String get potentialSavings => 'التوفير المحتمل';

  @override
  String get startScanning => 'ابدأ المسح';

  @override
  String get clearCart => 'تفريغ السلة';

  @override
  String itemsCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count عناصر',
      one: 'عنصر واحد',
    );
    return '$_temp0';
  }

  @override
  String get priceSummary => 'ملخص الأسعار';

  @override
  String get authTitle => 'تسجيل الدخول أو الإنشاء';

  @override
  String get registerButton => 'تسجيل جديد';

  @override
  String get signUpSuccess => 'تم تسجيل الحساب بنجاح!';

  @override
  String get alreadyHaveAccount => 'لديك حساب بالفعل؟ تسجيل الدخول';

  @override
  String get dontHaveAccount => 'ليس لديك حساب؟ تسجيل جديد';

  @override
  String get passwordsDoNotMatch => 'كلمات المرور غير متطابقة';

  @override
  String get confirmPasswordLabel => 'تأكيد كلمة المرور';

  @override
  String get scanLimitTitle => 'تم الوصول إلى الحد اليومي للمسح';

  @override
  String get scanLimitMessage =>
      'يقتصر المستخدمون المجانيون على 5 عمليات مسح في اليوم. قم بالترقية إلى سوا بلس للحصول على عمليات مسح غير محدودة!';

  @override
  String get scanLimitMessageFirstDay =>
      'يقتصر المستخدمون المجانيون على 15 عملية مسح في يومهم الأول. اشترك في سوا بلس للحصول على عمليات مسح غير محدودة!';

  @override
  String get upgradeSawaPlusButton => 'الترقية إلى سوا بلس';

  @override
  String get unlimitedScans => 'عمليات مسح غير محدودة في الوقت الفعلي';

  @override
  String get cartOptimizations => 'نطاق أسعار السلة الذكية';

  @override
  String get historicTrends => 'اتجاهات الأسعار التاريخية والتحليلات';

  @override
  String get subscriptionExplanationTitle => 'تكامل الفوترة مع متجر التطبيقات';

  @override
  String get subscriptionExplanationText =>
      'يتم فوترة الاشتراكات شهرياً (٤.٩٩ ريال/شهرياً) بشكل آمن من خلال حساب متجر التطبيقات الخاص بك. يتجدد الاشتراك تلقائياً كل شهر ما لم يتم إلغاؤه في إعدادات حسابك قبل 24 ساعة على الأقل من نهاية الفترة الحالية. يتم التحقق من صحة رموز الشراء بأمان على خوادمنا.';

  @override
  String get privacyPolicy => 'سياسة الخصوصية';

  @override
  String get termsOfUse => 'شروط الاستخدام (EULA)';

  @override
  String get monthly => 'شهرياً';

  @override
  String get subscriptionPeriod => 'فترة الاشتراك';

  @override
  String get oneMonth => 'شهر واحد';

  @override
  String get autoRenewable => 'تجديد تلقائي';

  @override
  String upgradeButtonWithPrice(String price) {
    return 'الترقية إلى سوا بلس ($price / شهرياً)';
  }

  @override
  String get subscribeMockSuccess =>
      'تمت محاكاة الشراء! أنت الآن مشترك في سوا بلس.';

  @override
  String get priceDropAlerts => 'تنبيهات انخفاض الأسعار';

  @override
  String get priceDropAlertsDesc =>
      'احصل على تنبيهات عندما تنخفض أسعار المنتجات في سلتك.';

  @override
  String get cartReminders => 'تذكيرات السلة';

  @override
  String get cartRemindersDesc =>
      'تذكيرك بالمنتجات المتبقية في سلة التسوق الخاصة بك.';

  @override
  String get newStoresAlerts => 'المتاجر والعروض الجديدة';

  @override
  String get newStoresAlertsDesc => 'تنبيهك عند إضافة متاجر جديدة في منطقتك.';

  @override
  String get notificationSettingsTitle => 'إعدادات التنبيهات';

  @override
  String get privacyCommitmentTitle => 'الخصوصية والأمان';

  @override
  String get privacyCommitmentText =>
      'تم بناء سوا مع وضع الخصوصية في الاعتبار. نحن لا نبيع بياناتك الشخصية أو سجل مسح المنتجات الخاص بك. يتم تخزين عمليات المسح بأمان على جهازك.';

  @override
  String get deleteAccount => 'حذف الحساب';

  @override
  String get deleteAccountConfirm =>
      'هل أنت متأكد أنك تريد حذف حسابك نهائيًا؟ لا يمكن التراجع عن هذا الإجراء.';

  @override
  String get deleteAccountSuccess => 'تم حذف الحساب بنجاح';

  @override
  String get sawaPlusSubscriber => 'مشترك سوا بلس';

  @override
  String searchingStore(String store) {
    return 'جاري فحص $store...';
  }

  @override
  String storeNotFound(String store) {
    return '$store: غير متوفر';
  }

  @override
  String get featuresTitle => 'اكتشف مميزات سوا';

  @override
  String get featureScanTitle => 'مقارنة الأسعار في الوقت الفعلي';

  @override
  String get featureScanDesc =>
      'امسح أي باركود للمنتجات لمقارنة الأسعار عبر أكثر من 20 متجرًا إلكترونيًا محليًا على الفور.';

  @override
  String get featureCartTitle => 'سلة التسوق الذكية';

  @override
  String get featureCartDesc =>
      'أضف المنتجات إلى سلتك وتحقق من كل من الإجمالي الأقل والإجمالي الأعلى لمعرفة مقدار ما توفره.';

  @override
  String get signInPrompt =>
      'سجل الدخول إلى سوا للوصول إلى السجل الخاص بك ومزامنة سلة التسوق الذكية الخاصة بك عبر الأجهزة.';

  @override
  String get signInOrRegister => 'تسجيل الدخول / التسجيل';

  @override
  String get confirmDelete => 'تأكيد الحذف';

  @override
  String get yesDelete => 'حذف';

  @override
  String get keepAccount => 'الاحتفاظ بالحساب';

  @override
  String get visitStore => 'زيارة المتجر';

  @override
  String get lowPrice => 'سعر منخفض';

  @override
  String get highPrice => 'سعر مرتفع';

  @override
  String get commonPrice => 'سعر شائع';

  @override
  String get inCart => 'في السلة';

  @override
  String get iapLoadingProducts => 'جاري تحميل تفاصيل الاشتراك...';

  @override
  String get iapPurchaseFailed => 'فشلت عملية الشراء. يرجى المحاولة مرة أخرى.';

  @override
  String get iapRestoreSuccess => 'تم استعادة الاشتراك بنجاح!';

  @override
  String get iapRestoreNotFound => 'لم يتم العثور على اشتراك نشط لاستعادته.';

  @override
  String get iapStoreUnavailable => 'متجر التطبيقات غير متوفر حالياً.';

  @override
  String get restorePurchaseButton => 'استعادة المشتريات';

  @override
  String get sawaPlusPopupTitle => 'اشترك في سوا بلس';

  @override
  String get sawaPlusPopupMessage =>
      'اشترك في سوا بلس للحصول على عمليات مسح وميزات غير محدودة';

  @override
  String get continueButton => 'متابعة';
}
