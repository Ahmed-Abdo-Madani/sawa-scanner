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
    super.category,
    super.subcategory,
    super.descriptionAr,
    super.descriptionEn,
    required super.nutriScoreGrade,
    required super.novaGroup,
    required super.sfdaRegistrationStatus,
    required super.halalCertified,
    super.netWeightValue,
    super.netUnit,
    super.nutritionFact,
    required super.ingredients,
    super.allergenDetails = const [],
    required super.prices,
    required super.images,
    super.ecoScore,
    super.allergens = const [],
    super.allergenTags = const [],
    super.ingredientTags = const [],
    super.allergensDataAvailable = false,
    super.categories = const [],
    super.ingredientsText,
    super.imageFrontUrl,
    super.imageNutritionUrl,
    super.nutritionDataComplete = false,
    super.source,
    super.sawaDbAvailable = false,
  });

  factory ProductModel.fromJson(Map<String, dynamic> json) {
    // Parse allergen details from the enriched response
    final allergenDetailsList = (json['allergens'] as List<dynamic>?)
        ?.where((e) => e is Map<String, dynamic>)
        .map((e) {
          final m = e as Map<String, dynamic>;
          return AllergenInfo(
            key: m['key']?.toString() ?? '',
            nameAr: m['name_ar']?.toString() ?? '',
            nameEn: m['name_en']?.toString() ?? '',
            source: m['source']?.toString(),
          );
        })
        .toList() ?? const [];

    // Build the string list from allergen details for backward compat
    final allergenStrings = allergenDetailsList.map((a) => a.nameEn).toList();

    return ProductModel(
      id: json['id'].toString(),
      gtin: json['gtin'].toString(),
      nameAr: json['name_ar'] ?? '',
      nameEn: json['name_en'] ?? '',
      brand: json['brand'] ?? '',
      category: json['category']?.toString(),
      subcategory: json['subcategory']?.toString(),
      descriptionAr: json['description_ar']?.toString(),
      descriptionEn: json['description_en']?.toString(),
      sfdaRegistrationStatus: json['sfda_registration_status']?.toString(),
      halalCertified: json['halal_certified'] as bool?,
      nutriScoreGrade: json['nutri_score_grade']?.toString(),
      novaGroup: json['nova_group'] as int?,
      netWeightValue: (json['net_weight_value'] as num?)?.toDouble(),
      netUnit: json['net_unit']?.toString(),
      nutritionFact: json['nutrition'] is Map
          ? NutritionFactModel.fromJson(
              Map<String, dynamic>.from(json['nutrition'] as Map),
            )
          : null,
      ingredients: (json['ingredients'] as List? ?? const [])
              .whereType<Map>()
              .map((e) => IngredientModel.fromJson(Map<String, dynamic>.from(e)))
              .toList(),
      allergenDetails: allergenDetailsList,
      prices: (json['prices'] as List? ?? const [])
              .whereType<Map>()
              .map((e) => PriceInfoModel.fromJson(Map<String, dynamic>.from(e)))
              .toList(),
      images: (json['images'] as List? ?? const [])
              .whereType<Map>()
              .map((e) => ProductImageModel.fromJson(Map<String, dynamic>.from(e)))
              .toList() ??
          [],
      ecoScore: json['eco_score']?.toString(),
      allergens: allergenStrings,
      allergenTags: (json['allergen_tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      ingredientTags: (json['ingredient_tags'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      allergensDataAvailable: allergenDetailsList.isNotEmpty || (json['allergens_data_available'] as bool? ?? false),
      categories: (json['categories'] as List<dynamic>?)?.map((e) => e.toString()).toList() ?? const [],
      ingredientsText: json['ingredients_text']?.toString(),
      imageFrontUrl: json['image_front_url']?.toString(),
      imageNutritionUrl: json['image_nutrition_url']?.toString(),
      nutritionDataComplete: json['nutrition_data_complete'] as bool? ?? false,
      source: json['source']?.toString(),
      sawaDbAvailable: json['sawa_db_available'] as bool? ?? false,
    );
  }

  /// Returns a plain [Product] whose every nested field is also a plain base
  /// entity. Writing this to Hive instead of `this` ensures the registered
  /// adapters (which cover only the base types) can handle serialisation.
  ProductModel copyWith({
    String? id,
    String? gtin,
    String? nameAr,
    String? nameEn,
    String? brand,
    String? category,
    String? subcategory,
    String? descriptionAr,
    String? descriptionEn,
    String? nutriScoreGrade,
    int? novaGroup,
    String? sfdaRegistrationStatus,
    bool? halalCertified,
    double? netWeightValue,
    String? netUnit,
    NutritionFact? nutritionFact,
    List<Ingredient>? ingredients,
    List<AllergenInfo>? allergenDetails,
    List<PriceInfo>? prices,
    List<ProductImage>? images,
    String? ecoScore,
    List<String>? allergens,
    List<String>? allergenTags,
    List<String>? ingredientTags,
    bool? allergensDataAvailable,
    List<String>? categories,
    String? ingredientsText,
    String? imageFrontUrl,
    String? imageNutritionUrl,
    bool? nutritionDataComplete,
    String? source,
    bool? sawaDbAvailable,
  }) {
    return ProductModel(
      id: id ?? this.id,
      gtin: gtin ?? this.gtin,
      nameAr: nameAr ?? this.nameAr,
      nameEn: nameEn ?? this.nameEn,
      brand: brand ?? this.brand,
      category: category ?? this.category,
      subcategory: subcategory ?? this.subcategory,
      descriptionAr: descriptionAr ?? this.descriptionAr,
      descriptionEn: descriptionEn ?? this.descriptionEn,
      nutriScoreGrade: nutriScoreGrade ?? this.nutriScoreGrade,
      novaGroup: novaGroup ?? this.novaGroup,
      sfdaRegistrationStatus: sfdaRegistrationStatus ?? this.sfdaRegistrationStatus,
      halalCertified: halalCertified ?? this.halalCertified,
      netWeightValue: netWeightValue ?? this.netWeightValue,
      netUnit: netUnit ?? this.netUnit,
      nutritionFact: nutritionFact ?? this.nutritionFact,
      ingredients: ingredients ?? this.ingredients,
      allergenDetails: allergenDetails ?? this.allergenDetails,
      prices: prices ?? this.prices,
      images: images ?? this.images,
      ecoScore: ecoScore ?? this.ecoScore,
      allergens: allergens ?? this.allergens,
      allergenTags: allergenTags ?? this.allergenTags,
      ingredientTags: ingredientTags ?? this.ingredientTags,
      allergensDataAvailable: allergensDataAvailable ?? this.allergensDataAvailable,
      categories: categories ?? this.categories,
      ingredientsText: ingredientsText ?? this.ingredientsText,
      imageFrontUrl: imageFrontUrl ?? this.imageFrontUrl,
      imageNutritionUrl: imageNutritionUrl ?? this.imageNutritionUrl,
      nutritionDataComplete: nutritionDataComplete ?? this.nutritionDataComplete,
      source: source ?? this.source,
      sawaDbAvailable: sawaDbAvailable ?? this.sawaDbAvailable,
    );
  }

  Product toEntity() {
    return Product(
      id: id,
      gtin: gtin,
      nameAr: nameAr,
      nameEn: nameEn,
      brand: brand,
      category: category,
      subcategory: subcategory,
      descriptionAr: descriptionAr,
      descriptionEn: descriptionEn,
      nutriScoreGrade: nutriScoreGrade,
      novaGroup: novaGroup,
      sfdaRegistrationStatus: sfdaRegistrationStatus,
      halalCertified: halalCertified,
      netWeightValue: netWeightValue,
      netUnit: netUnit,
      nutritionFact: nutritionFact is NutritionFactModel
          ? (nutritionFact as NutritionFactModel).toEntity()
          : nutritionFact,
      ingredients: ingredients
          .map((i) => i is IngredientModel ? i.toEntity() : i)
          .toList(),
      allergenDetails: allergenDetails,
      prices: prices
          .map((p) => p is PriceInfoModel ? p.toEntity() : p)
          .toList(),
      images: images
          .map((img) => img is ProductImageModel ? img.toEntity() : img)
          .toList(),
      ecoScore: ecoScore,
      allergens: allergens,
      allergenTags: allergenTags,
      ingredientTags: ingredientTags,
      allergensDataAvailable: allergensDataAvailable,
      categories: categories,
      ingredientsText: ingredientsText,
      imageFrontUrl: imageFrontUrl,
      imageNutritionUrl: imageNutritionUrl,
      nutritionDataComplete: nutritionDataComplete,
      source: source,
      sawaDbAvailable: sawaDbAvailable,
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

  NutritionFact toEntity() {
    return NutritionFact(
      energyKcal: energyKcal,
      fatG: fatG,
      saturatedFatG: saturatedFatG,
      carbsG: carbsG,
      sugarsG: sugarsG,
      fiberG: fiberG,
      proteinG: proteinG,
      sodiumMg: sodiumMg,
      servingSizeG: servingSizeG,
    );
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

  Ingredient toEntity() {
    return Ingredient(
      nameAr: nameAr,
      nameEn: nameEn,
      eNumber: eNumber,
      sfdaStatus: sfdaStatus,
    );
  }
}

class PriceInfoModel extends PriceInfo {
  const PriceInfoModel({
    required super.merchant,
    required super.merchantAr,
    super.logoUrl,
    super.sourceUrl,
    required super.priceSarInclVat,
    super.promoPriceSar,
    super.unitPriceSar,
    super.unitPriceUnit,
    required super.inStock,
    required super.scrapedAt,
    super.storeId,
    super.storeName,
    super.storeNameAr,
    super.districtName,
    super.districtNameAr,
    super.storeLat,
    super.storeLng,
    super.distanceKm,
  });

  factory PriceInfoModel.fromJson(Map<String, dynamic> json) {
    return PriceInfoModel(
      merchant: json['merchant']?.toString() ?? json['merchant_name_en'] ?? 'Unknown',
      merchantAr: json['merchant_ar']?.toString() ?? json['merchant_name_ar'] ?? '',
      logoUrl: json['logo_url']?.toString() ?? json['merchant_logo_url']?.toString(),
      sourceUrl: json['source_url']?.toString(),
      priceSarInclVat: (json['price_sar_incl_vat'] as num?)?.toDouble() ?? 0.0,
      promoPriceSar: (json['promo_price_sar'] as num?)?.toDouble(),
      unitPriceSar: (json['unit_price_sar'] as num?)?.toDouble(),
      unitPriceUnit: json['unit_price_unit']?.toString(),
      inStock: json['in_stock'] ?? true,
      scrapedAt: DateTime.tryParse(json['scraped_at'] ?? '') ?? DateTime.now(),
      storeId: json['store_id']?.toString(),
      storeName: json['store_name']?.toString(),
      storeNameAr: json['store_name_ar']?.toString(),
      districtName: json['district_name']?.toString() ?? (json['district'] is Map ? json['district']['name_en'] : null),
      districtNameAr: json['district_name_ar']?.toString() ?? (json['district'] is Map ? json['district']['name_ar'] : null),
      storeLat: (json['store_lat'] as num?)?.toDouble(),
      storeLng: (json['store_lng'] as num?)?.toDouble(),
    );
  }

  /// Create from the by-store API response format.
  factory PriceInfoModel.fromStoreJson(Map<String, dynamic> json) {
    final merchant = json['merchant'] as Map<String, dynamic>? ?? {};
    final district = json['district'] as Map<String, dynamic>? ?? {};
    return PriceInfoModel(
      merchant: merchant['name_en']?.toString() ?? 'Unknown',
      merchantAr: merchant['name_ar']?.toString() ?? '',
      logoUrl: merchant['logo_url']?.toString(),
      sourceUrl: json['source_url']?.toString(),
      priceSarInclVat: (json['price_sar_incl_vat'] as num?)?.toDouble() ?? 0.0,
      promoPriceSar: (json['promo_price_sar'] as num?)?.toDouble(),
      unitPriceSar: (json['unit_price_sar'] as num?)?.toDouble(),
      unitPriceUnit: json['unit_price_unit']?.toString(),
      inStock: json['in_stock'] ?? true,
      scrapedAt: DateTime.tryParse(json['scraped_at'] ?? '') ?? DateTime.now(),
      storeId: json['store_id']?.toString(),
      districtName: district['name_en']?.toString(),
      districtNameAr: district['name_ar']?.toString(),
    );
  }

  PriceInfo toEntity() {
    return PriceInfo(
      merchant: merchant,
      merchantAr: merchantAr,
      logoUrl: logoUrl,
      sourceUrl: sourceUrl,
      priceSarInclVat: priceSarInclVat,
      promoPriceSar: promoPriceSar,
      unitPriceSar: unitPriceSar,
      unitPriceUnit: unitPriceUnit,
      inStock: inStock,
      scrapedAt: scrapedAt,
      storeId: storeId,
      storeName: storeName,
      storeNameAr: storeNameAr,
      districtName: districtName,
      districtNameAr: districtNameAr,
      storeLat: storeLat,
      storeLng: storeLng,
      distanceKm: distanceKm,
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

  ProductImage toEntity() {
    return ProductImage(
      url: url,
      imageType: imageType,
    );
  }
}
