import '../../domain/entities/product.dart';
import '../../domain/entities/nutrition_fact.dart';
import '../../domain/entities/ingredient.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/entities/product_image.dart';

class ProductModel extends Product {
  const ProductModel({
    required super.id,
    required super.gtin,
    required super.nameAr,
    required super.nameEn,
    required super.brand,
    required super.nutriScoreGrade,
    required super.novaGroup,
    required super.sfdaRegistrationStatus,
    required super.halalCertified,
    super.nutritionFact,
    required super.ingredients,
    required super.prices,
    required super.images,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    return ProductModel(
      id: json['id'].toString(),
      gtin: json['gtin'].toString(),
      nameAr: json['name_ar'] ?? '',
      nameEn: json['name_en'] ?? '',
      brand: json['brand'] ?? '',
      sfdaRegistrationStatus: json['sfda_registration_status']?.toString(),
      halalCertified: json['halal_certified'] as bool?,
      nutriScoreGrade: json['nutri_score_grade']?.toString(),
      novaGroup: json['nova_group'] as int?,
      nutritionFact: json['nutrition'] != null 
          ? NutritionFactModel.fromJson(json['nutrition'] as Map<String, dynamic>)
          : null,
      ingredients: (json['ingredients'] as List<dynamic>?)
              ?.map((e) => IngredientModel.fromJson(e as Map<String, dynamic>))
              .toList() ?? 
          [],
      prices: (json['prices'] as List<dynamic>?)
              ?.map((e) => PriceInfoModel.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      images: (json['images'] as List<dynamic>?)
              ?.map((e) => ProductImageModel.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
    );
  }
}

class NutritionFactModel extends NutritionFact {
  const NutritionFactModel({
    super.energyKcal,
    super.fatG,
    super.saturatedFatG,
    super.carbsG,
    super.sugarsG,
    super.fiberG,
    super.proteinG,
    super.sodiumMg,
    super.servingSizeG,
  });

  factory NutritionFactModel.fromJson(Map<String, dynamic> json) {
    return NutritionFactModel(
      energyKcal: _toDouble(json['energy_kcal']),
      fatG: _toDouble(json['fat_g']),
      saturatedFatG: _toDouble(json['saturated_fat_g']),
      carbsG: _toDouble(json['carbs_g']),
      sugarsG: _toDouble(json['sugars_g']),
      fiberG: _toDouble(json['fiber_g']),
      proteinG: _toDouble(json['protein_g']),
      sodiumMg: _toDouble(json['sodium_mg']),
      servingSizeG: _toDouble(json['serving_size_g']),
    );
  }

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

class IngredientModel extends Ingredient {
  const IngredientModel({
    required super.nameAr,
    required super.nameEn,
    super.eNumber,
    required super.sfdaStatus,
  });

  factory IngredientModel.fromJson(Map<String, dynamic> json) {
    return IngredientModel(
      nameAr: json['name_ar'] ?? '',
      nameEn: json['name_en'] ?? '',
      eNumber: json['e_number'],
      sfdaStatus: _parseSfdaStatus(json['sfda_status']),
    );
  }

  static IngredientSfdaStatus _parseSfdaStatus(String? status) {
    switch (status?.toLowerCase()) {
      case 'safe':
        return IngredientSfdaStatus.safe;
      case 'restricted':
        return IngredientSfdaStatus.restricted;
      case 'prohibited':
        return IngredientSfdaStatus.prohibited;
      default:
        return IngredientSfdaStatus.safe;
    }
  }
}

class PriceInfoModel extends PriceInfo {
  const PriceInfoModel({
    required super.merchant,
    required super.merchantAr,
    super.logoUrl,
    super.sourceUrl,
    required super.priceSarInclVat,
    required super.inStock,
    required super.scrapedAt,
  });

  factory PriceInfoModel.fromJson(Map<String, dynamic> json) {
    return PriceInfoModel(
      merchant: json['merchant'] ?? 'Unknown',
      merchantAr: json['merchant_ar'] ?? '',
      logoUrl: json['logo_url'],
      sourceUrl: json['source_url'],
      priceSarInclVat: (json['price_sar_incl_vat'] as num?)?.toDouble() ?? 0.0,
      inStock: json['in_stock'] ?? true,
      scrapedAt: DateTime.tryParse(json['scraped_at'] ?? '') ?? DateTime.now(),
    );
  }
}

class ProductImageModel extends ProductImage {
  const ProductImageModel({
    required super.url,
    required super.imageType,
  });

  factory ProductImageModel.fromJson(Map<String, dynamic> json) {
    return ProductImageModel(
      url: json['url'] ?? '',
      imageType: json['image_type'] ?? 'primary',
    );
  }
}
