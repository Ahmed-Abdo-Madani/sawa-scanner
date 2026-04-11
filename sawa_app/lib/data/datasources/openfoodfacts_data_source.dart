import 'package:openfoodfacts/openfoodfacts.dart';
import '../models/product_model.dart';

class OpenFoodFactsDataSource {
  Future<ProductModel?> getProductByBarcode(String barcode) async {
    try {
      final ProductQueryConfiguration configuration = ProductQueryConfiguration(
        barcode,
        language: OpenFoodFactsLanguage.ENGLISH,
        fields: [ProductField.ALL],
        version: ProductQueryVersion.v3,
      );

      final ProductResultV3 result = await OpenFoodAPIClient.getProductV3(configuration);

      if (result.status == ProductResultV3.statusSuccess && result.product != null) {
        return _mapOffProduct(result.product!);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  Future<List<ProductModel>> searchProducts(String query) async {
    try {
      final ProductSearchQueryConfiguration configuration = ProductSearchQueryConfiguration(
        parametersList: [
          SearchTerms(terms: [query]),
          Page(page: 1),
          PageSize(size: 24),
        ],
        language: OpenFoodFactsLanguage.ENGLISH,
        fields: [ProductField.ALL],
        version: ProductQueryVersion.v3,
      );

      final SearchResult result = await OpenFoodAPIClient.searchProducts(null, configuration);

      if (result.products == null) return [];

      return result.products!
          .where((p) => p != null)
          .map((p) => _mapOffProduct(p!))
          .toList();
    } catch (e) {
      return [];
    }
  }

  ProductModel _mapOffProduct(Product offProduct) {
    // Mapping OFF nutriments to NutritionFactModel
    final nutriments = offProduct.nutriments;
    
    final energy = nutriments?.getValue(Nutrient.energyKCal, PerSize.oneHundredGrams);
    final fat = nutriments?.getValue(Nutrient.fat, PerSize.oneHundredGrams);
    final satFat = nutriments?.getValue(Nutrient.saturatedFat, PerSize.oneHundredGrams);
    final carbs = nutriments?.getValue(Nutrient.carbohydrates, PerSize.oneHundredGrams);
    final sugars = nutriments?.getValue(Nutrient.sugars, PerSize.oneHundredGrams);
    final fiber = nutriments?.getValue(Nutrient.fiber, PerSize.oneHundredGrams);
    final protein = nutriments?.getValue(Nutrient.proteins, PerSize.oneHundredGrams);
    final sodium = nutriments?.getValue(Nutrient.sodium, PerSize.oneHundredGrams);

    NutritionFactModel? nutritionFact;

    if (energy != null || 
        fat != null || 
        satFat != null || 
        carbs != null || 
        sugars != null || 
        fiber != null || 
        protein != null || 
        sodium != null) {
      nutritionFact = NutritionFactModel(
        energyKcal: energy,
        fatG: fat,
        saturatedFatG: satFat,
        carbsG: carbs,
        sugarsG: sugars,
        fiberG: fiber,
        proteinG: protein,
        sodiumMg: sodium != null ? sodium * 1000 : null,
      );
    }

    // Mapping OFF image to ProductImageModel
    final images = <ProductImageModel>[];
    if (offProduct.imageFrontUrl != null) {
      images.add(ProductImageModel(
        url: offProduct.imageFrontUrl!,
        imageType: 'front',
      ));
    }

    // Normalize Allergens: Strip "en:", "fr:", etc. and capitalize
    final rawAllergens = offProduct.allergensTags;
    final normalizedAllergens = rawAllergens?.map((tag) {
      final parts = tag.split(':');
      final name = parts.length > 1 ? parts[1] : parts[0];
      return name.replaceAll('-', ' ').split(' ').map((word) {
        if (word.isEmpty) return word;
        return word[0].toUpperCase() + word.substring(1);
      }).join(' ');
    }).toList() ?? [];

    return ProductModel(
      id: offProduct.barcode ?? '',
      gtin: offProduct.barcode ?? '',
      nameEn: offProduct.productName ?? '',
      nameAr: offProduct.productNameInLanguages?[OpenFoodFactsLanguage.ARABIC] ?? offProduct.productName ?? '',
      brand: offProduct.brands ?? '',
      nutriScoreGrade: offProduct.nutriscore,
      novaGroup: offProduct.novaGroup,
      ecoScore: offProduct.ecoscoreGrade,
      allergens: normalizedAllergens,
      allergensDataAvailable: rawAllergens != null,
      categories: offProduct.categoriesTags ?? [],
      ingredientsText: offProduct.ingredientsText,
      nutritionFact: nutritionFact,
      ingredients: const [], // OFF doesn't provide SFDA-structured ingredients
      prices: const [],
      images: images,
      sfdaRegistrationStatus: null,
      halalCertified: null,
    );
  }
}
