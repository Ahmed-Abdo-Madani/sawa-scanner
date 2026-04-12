import 'package:flutter/foundation.dart';
import 'package:openfoodfacts/openfoodfacts.dart';

import 'package:image_picker/image_picker.dart';

import '../../core/exceptions.dart';
import '../models/product_model.dart';

class OpenFoodFactsDataSource {
  /// Looks up a product by [barcode] via the OFF v3 API.
  ///
  /// Returns `null` only when OFF definitively reports that the product does
  /// not exist ([ProductResultV3.resultProductNotFound]).
  ///
  /// Throws [ServerException] for [ProductResultV3.statusFailure],
  /// unexpected [ProductResultV3.statusWarning] responses without product
  /// data, or a success response without a product object — all of which
  /// represent OFF-side failures rather than a missing product.
  ///
  /// Network / transport errors are intentionally not caught here so they
  /// propagate to the repository as-is.
  Future<ProductModel?> getProductByBarcode(String barcode) async {
    if (OpenFoodAPIConfiguration.userAgent == null) {
      throw FallbackConfigurationException('OpenFoodFacts User-Agent is not configured.');
    }

    final ProductQueryConfiguration configuration = ProductQueryConfiguration(

      barcode,
      language: OpenFoodFactsLanguage.ENGLISH,
      fields: [ProductField.ALL],
      version: ProductQueryVersion.v3,
    );

    // Network / transport errors propagate to the caller un-wrapped.
    final ProductResultV3 result =
        await OpenFoodAPIClient.getProductV3(configuration);

    // ── Happy path ──────────────────────────────────────────────────────────
    if (result.status == ProductResultV3.statusSuccess &&
        result.product != null) {
      return _mapOffProduct(result.product!);
    }

    // ── Definitive product-not-found ────────────────────────────────────────
    // OFF sets result.id to 'product_not_found' when the barcode is simply
    // absent from the database.  This is not an availability failure.
    if (result.result?.id == ProductResultV3.resultProductNotFound) {
      return null;
    }

    // ── OFF-side failure ─────────────────────────────────────────────────────
    // statusFailure means the server could not process the request.
    // statusWarning without a product, or statusSuccess with a null product,
    // are also anomalous outcomes that should not be silently collapsed into
    // null (which would make the repository report a false 404).
    final errorDetail = result.errors?.map((e) => e.toString()).join('; ') ??
        result.warnings?.map((w) => w.toString()).join('; ') ??
        'status=${result.status}, result=${result.result?.id}';
    throw ServerException('OpenFoodFacts lookup failed: $errorDetail');
  }

  Future<List<ProductModel>> searchProducts(String query) async {
    final ProductSearchQueryConfiguration configuration = ProductSearchQueryConfiguration(
      parametersList: [
        SearchTerms(terms: [query]),
        const PageNumber(page: 1),
        const PageSize(size: 24),
      ],
      language: OpenFoodFactsLanguage.ENGLISH,
      fields: [ProductField.ALL],
      version: ProductQueryVersion.v3,
    );

    const User user = User(userId: '', password: '');
    final SearchResult result =
        await OpenFoodAPIClient.searchProducts(user, configuration);

    return result.products?.map((p) => _mapOffProduct(p)).toList() ?? [];



  }

  Future<void> contributeProduct(
    String barcode,
    Map<String, dynamic> data,
    Map<String, XFile> photos,
  ) async {
    try {
      // 1. Prepare Metadata
      final Product product = Product(
        barcode: barcode,
        productName: data['name_en'],
        productNameInLanguages: {
          OpenFoodFactsLanguage.ARABIC: data['name_ar'],
        },
        brands: data['brand'],
        ingredientsText: data['ingredients_text'],
      );

      // Map nutrition if available
      final nutrition = data['nutrition'] as Map<String, dynamic>?;
      if (nutrition != null) {
        final nutriments = Nutriments.empty();
        nutriments.setValue(Nutrient.energyKCal, PerSize.oneHundredGrams,
            (nutrition['energy_kcal'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.fat, PerSize.oneHundredGrams,
            (nutrition['fat_g'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.saturatedFat, PerSize.oneHundredGrams,
            (nutrition['saturated_fat_g'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.carbohydrates, PerSize.oneHundredGrams,
            (nutrition['carbs_g'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.sugars, PerSize.oneHundredGrams,
            (nutrition['sugars_g'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.fiber, PerSize.oneHundredGrams,
            (nutrition['fiber_g'] as num?)?.toDouble());
        nutriments.setValue(Nutrient.proteins, PerSize.oneHundredGrams,
            (nutrition['protein_g'] as num?)?.toDouble());

        // Convert sodium mg to salt g (approx) if salt bukan salt? OFF accepts sodium.
        // Actually nutriments.setValue(Nutrient.sodium, ...) is fine.
        final sodiumMg = (nutrition['sodium_mg'] as num?)?.toDouble();
        if (sodiumMg != null) {
          nutriments.setValue(
              Nutrient.sodium, PerSize.oneHundredGrams, sodiumMg / 1000);
        }
        product.nutriments = nutriments;
      }

      // 2. Save Metadata (Anonymous)
      const User user = User(userId: '', password: '');
      await OpenFoodAPIClient.saveProduct(
        user,
        product,
      );


      // 3. Upload Images
      for (final entry in photos.entries) {
        final slot = entry.key;
        final file = entry.value;

        ImageField field;
        switch (slot) {
          case 'front':
            field = ImageField.FRONT;
            break;
          case 'ingredients':
            field = ImageField.INGREDIENTS;
            break;
          case 'nutrition':
            field = ImageField.NUTRITION;
            break;
          default:
            continue;
        }

        final SendImage image = SendImage(
          lang: OpenFoodFactsLanguage.ENGLISH,
          barcode: barcode,
          imageField: field,
          imageUri: Uri.file(file.path),
        );

        const User user = User(userId: '', password: '');
        await OpenFoodAPIClient.addProductImage(user, image);

      }
    } catch (e) {
      // Best-effort contribution; catch errors to prevent blocking Sawa submission
      // In production, we'd log this to an error tracking service.
      debugPrint('OFF Contribution failed: $e');
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
    final rawAllergens = offProduct.allergens?.names;


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
