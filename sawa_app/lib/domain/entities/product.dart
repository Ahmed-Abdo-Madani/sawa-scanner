import 'nutrition_fact.dart';
import 'ingredient.dart';
import 'price_info.dart';
import 'product_image.dart';

class Product {
  final String id;
  final String gtin;
  final String nameAr;
  final String nameEn;
  final String brand;
  final String? nutriScoreGrade;
  final int? novaGroup;
  final String? sfdaRegistrationStatus;
  final bool? halalCertified;
  final NutritionFact? nutritionFact;
  final List<Ingredient> ingredients;
  final List<PriceInfo> prices;
  final List<ProductImage> images;
  final String? ecoScore;
  final List<String> allergens;
  final bool allergensDataAvailable;
  final List<String> categories;
  final String? ingredientsText;

  const Product({
    required this.id,
    required this.gtin,
    required this.nameAr,
    required this.nameEn,
    required this.brand,
    required this.nutriScoreGrade,
    required this.novaGroup,
    required this.sfdaRegistrationStatus,
    required this.halalCertified,
    this.nutritionFact,
    required this.ingredients,
    required this.prices,
    required this.images,
    this.ecoScore,
    this.allergens = const [],
    this.allergensDataAvailable = false,
    this.categories = const [],
    this.ingredientsText,
  });
}
