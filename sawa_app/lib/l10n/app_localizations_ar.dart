// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Arabic (`ar`).
class AppLocalizationsAr extends AppLocalizations {
  AppLocalizationsAr([String locale = 'ar']) : super(locale);

  @override
  String get appTitle => 'ساوا';

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
  String get glassmorphismPreview => 'معاينة النسق الزجاجي';

  @override
  String get gradeBadgesPreview => 'معاينة شارات التقييم';

  @override
  String get glassSurface => 'سطح زجاجي';

  @override
  String get blurredBackdropTest => 'اختبار الخلفية الضبابية';

  @override
  String get colorBackground => 'الخلفية';

  @override
  String get colorSurface => 'السطح';

  @override
  String get colorSurfaceGlass => 'السطح الزجاجي';

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
}
