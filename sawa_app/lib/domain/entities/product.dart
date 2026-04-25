import 'nutrition_fact.dart';
import 'ingredient.dart';
import 'price_info.dart';
import 'product_image.dart';

class AllergenInfo {
  final String key;
  final String nameAr;
  final String nameEn;
  final String? source;

  const AllergenInfo({
    required this.key,
    required this.nameAr,
    required this.nameEn,
    this.source,
  });
}

class Product {
  final String id;
  final String gtin;
  final String nameAr;
  final String nameEn;
  final String brand;
  final String? category;
  final String? subcategory;
  final String? descriptionAr;
  final String? descriptionEn;
  final String? nutriScoreGrade;
  final int? novaGroup;
  final String? sfdaRegistrationStatus;
  final bool? halalCertified;
  final double? netWeightValue;
  final String? netUnit;
  final NutritionFact? nutritionFact;
  final List<Ingredient> ingredients;
  final List<AllergenInfo> allergenDetails;
  final List<PriceInfo> prices;
  final List<ProductImage> images;
  final String? ecoScore;
  final List<String> allergens;
  final List<String> allergenTags;
  final List<String> ingredientTags;
  final bool allergensDataAvailable;
  final List<String> categories;
  final String? ingredientsText;
  final String? imageFrontUrl;
  final String? imageNutritionUrl;
  final bool nutritionDataComplete;
  final String? source;
  final bool sawaDbAvailable;

  const Product({
    required this.id,
    required this.gtin,
    required this.nameAr,
    required this.nameEn,
    required this.brand,
    this.category,
    this.subcategory,
    this.descriptionAr,
    this.descriptionEn,
    required this.nutriScoreGrade,
    required this.novaGroup,
    required this.sfdaRegistrationStatus,
    required this.halalCertified,
    this.netWeightValue,
    this.netUnit,
    this.nutritionFact,
    required this.ingredients,
    this.allergenDetails = const [],
    required this.prices,
    required this.images,
    this.ecoScore,
    this.allergens = const [],
    this.allergenTags = const [],
    this.ingredientTags = const [],
    this.allergensDataAvailable = false,
    this.categories = const [],
    this.ingredientsText,
    this.imageFrontUrl,
    this.imageNutritionUrl,
    this.nutritionDataComplete = false,
    this.source,
    this.sawaDbAvailable = false,
  });
}

