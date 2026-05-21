class AdminNutritionDto {
  final double? energyKcal;
  final double? fatG;
  final double? saturatedFatG;
  final double? carbsG;
  final double? sugarsG;
  final double? fiberG;
  final double? proteinG;
  final double? sodiumMg;
  final double? servingSizeG;

  AdminNutritionDto({
    this.energyKcal,
    this.fatG,
    this.saturatedFatG,
    this.carbsG,
    this.sugarsG,
    this.fiberG,
    this.proteinG,
    this.sodiumMg,
    this.servingSizeG,
  });

  factory AdminNutritionDto.fromJson(Map<String, dynamic> json) {
    return AdminNutritionDto(
      energyKcal: (json['energy_kcal'] ?? json['energyKcal'])?.toDouble(),
      fatG: (json['fat_g'] ?? json['fatG'])?.toDouble(),
      saturatedFatG: (json['saturated_fat_g'] ?? json['saturatedFatG'])?.toDouble(),
      carbsG: (json['carbs_g'] ?? json['carbsG'])?.toDouble(),
      sugarsG: (json['sugars_g'] ?? json['sugarsG'])?.toDouble(),
      fiberG: (json['fiber_g'] ?? json['fiberG'])?.toDouble(),
      proteinG: (json['protein_g'] ?? json['proteinG'])?.toDouble(),
      sodiumMg: (json['sodium_mg'] ?? json['sodiumMg'])?.toDouble(),
      servingSizeG: (json['serving_size_g'] ?? json['servingSizeG'])?.toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{};
    if (energyKcal != null) map['energy_kcal'] = energyKcal;
    if (fatG != null) map['fat_g'] = fatG;
    if (saturatedFatG != null) map['saturated_fat_g'] = saturatedFatG;
    if (carbsG != null) map['carbs_g'] = carbsG;
    if (sugarsG != null) map['sugars_g'] = sugarsG;
    if (fiberG != null) map['fiber_g'] = fiberG;
    if (proteinG != null) map['protein_g'] = proteinG;
    if (sodiumMg != null) map['sodium_mg'] = sodiumMg;
    if (servingSizeG != null) map['serving_size_g'] = servingSizeG;
    return map;
  }
}

class AdminProductDto {
  final String id;
  final String gtin;
  final String? nameEn;
  final String? nameAr;
  final String? brand;
  final String? manufacturer;
  final String? category;
  final String? subcategory;
  final String? descriptionAr;
  final String? descriptionEn;
  final double? netWeightValue;
  final String? netUnit;
  final String? imageFrontUrl;
  final String? imageNutritionUrl;
  final bool? halalCertified;
  final String? nutriScoreGrade;
  final int? novaGroup;
  final int? sfdaNpmScore;
  final List<String>? allergenTags;
  final List<String>? ingredientTags;
  final AdminNutritionDto? nutrition;

  AdminProductDto({
    required this.id,
    required this.gtin,
    this.nameEn,
    this.nameAr,
    this.brand,
    this.manufacturer,
    this.category,
    this.subcategory,
    this.descriptionAr,
    this.descriptionEn,
    this.netWeightValue,
    this.netUnit,
    this.imageFrontUrl,
    this.imageNutritionUrl,
    this.halalCertified,
    this.nutriScoreGrade,
    this.novaGroup,
    this.sfdaNpmScore,
    this.allergenTags,
    this.ingredientTags,
    this.nutrition,
  });

  factory AdminProductDto.fromJson(Map<String, dynamic> json) {
    final nutritionJson = json['nutritionFact'] ?? json['nutrition'];
    
    return AdminProductDto(
      id: json['id'],
      gtin: json['gtin']?.toString() ?? '',
      nameEn: json['name_en'],
      nameAr: json['name_ar'],
      brand: json['brand'],
      manufacturer: json['manufacturer'],
      category: json['category'],
      subcategory: json['subcategory'],
      descriptionAr: json['description_ar'],
      descriptionEn: json['description_en'],
      netWeightValue: json['net_weight_value']?.toDouble(),
      netUnit: json['net_unit'],
      imageFrontUrl: json['image_front_url'],
      imageNutritionUrl: json['image_nutrition_url'],
      halalCertified: json['halal_certified'],
      nutriScoreGrade: json['nutri_score_grade'],
      novaGroup: json['nova_group'],
      sfdaNpmScore: json['sfda_npm_score'],
      allergenTags: json['allergen_tags'] != null ? List<String>.from(json['allergen_tags']) : null,
      ingredientTags: json['ingredient_tags'] != null ? List<String>.from(json['ingredient_tags']) : null,
      nutrition: nutritionJson != null ? AdminNutritionDto.fromJson(nutritionJson) : null,
    );
  }
}

class AdminUpsertProductDto {
  final String gtin;
  final String? nameEn;
  final String? nameAr;
  final String? brand;
  final String? manufacturer;
  final String? category;
  final String? subcategory;
  final String? descriptionAr;
  final String? descriptionEn;
  final double? netWeightValue;
  final String? netUnit;
  final bool? halalCertified;
  final String? nutriScoreGrade;
  final int? novaGroup;
  final int? sfdaNpmScore;
  final List<String>? allergenTags;
  final List<String>? ingredientTags;
  final AdminNutritionDto? nutrition;

  AdminUpsertProductDto({
    required this.gtin,
    this.nameEn,
    this.nameAr,
    this.brand,
    this.manufacturer,
    this.category,
    this.subcategory,
    this.descriptionAr,
    this.descriptionEn,
    this.netWeightValue,
    this.netUnit,
    this.halalCertified,
    this.nutriScoreGrade,
    this.novaGroup,
    this.sfdaNpmScore,
    this.allergenTags,
    this.ingredientTags,
    this.nutrition,
  });

  Map<String, dynamic> toJson() {
    final map = <String, dynamic>{
      'gtin': gtin,
    };
    if (nameEn != null) map['name_en'] = nameEn;
    if (nameAr != null) map['name_ar'] = nameAr;
    if (brand != null) map['brand'] = brand;
    if (manufacturer != null) map['manufacturer'] = manufacturer;
    if (category != null) map['category'] = category;
    if (subcategory != null) map['subcategory'] = subcategory;
    if (descriptionAr != null) map['description_ar'] = descriptionAr;
    if (descriptionEn != null) map['description_en'] = descriptionEn;
    if (netWeightValue != null) map['net_weight_value'] = netWeightValue;
    if (netUnit != null) map['net_unit'] = netUnit;
    if (halalCertified != null) map['halal_certified'] = halalCertified;
    if (nutriScoreGrade != null) map['nutri_score_grade'] = nutriScoreGrade;
    if (novaGroup != null) map['nova_group'] = novaGroup;
    if (sfdaNpmScore != null) map['sfda_npm_score'] = sfdaNpmScore;
    if (allergenTags != null) map['allergen_tags'] = allergenTags;
    if (ingredientTags != null) map['ingredient_tags'] = ingredientTags;
    if (nutrition != null) {
      final nutritionJson = nutrition!.toJson();
      if (nutritionJson.isNotEmpty) map['nutrition'] = nutritionJson;
    }
    return map;
  }
}

class AdminMissingGtinSummary {
  final String gtin;
  final int count;
  final String? name;
  final String? imageUrl;

  AdminMissingGtinSummary({
    required this.gtin,
    required this.count,
    this.name,
    this.imageUrl,
  });

  factory AdminMissingGtinSummary.fromJson(Map<String, dynamic> json) {
    return AdminMissingGtinSummary(
      gtin: json['gtin']?.toString() ?? '',
      count: int.tryParse(json['count'].toString()) ?? 0,
      name: json['name']?.toString(),
      imageUrl: json['image_url']?.toString(),
    );
  }
}
