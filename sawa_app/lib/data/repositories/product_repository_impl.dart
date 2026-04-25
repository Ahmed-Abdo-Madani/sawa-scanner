import 'dart:convert';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../../domain/entities/product.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/repositories/product_repository.dart';
import '../../core/exceptions.dart';
import '../datasources/product_remote_data_source.dart';
import '../datasources/openfoodfacts_data_source.dart';
import '../datasources/product_local_data_source.dart';
import '../datasources/firebase_ai_data_source.dart';
import '../models/product_model.dart';
import 'package:image_picker/image_picker.dart';

class ProductRepositoryImpl implements ProductRepository {
  final ProductRemoteDataSource remoteDataSource;
  final OpenFoodFactsDataSource openFoodFactsDataSource;
  final ProductLocalDataSource localDataSource;
  final FirebaseAiDataSource firebaseAiDataSource;

  static const Duration _cacheTtl = Duration(hours: 24);
  bool _cacheVersionInitialized = false;

  ProductRepositoryImpl({
    required this.remoteDataSource,
    required this.openFoodFactsDataSource,
    required this.localDataSource,
    required this.firebaseAiDataSource,
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: normalise any ProductModel (and its nested models) into plain
  // base entities before writing to Hive.  Hive's registered adapters cover
  // only the base types, so writing a subtype raises an unregistered adapter
  // error at runtime.
  // ─────────────────────────────────────────────────────────────────────────
  Product _toEntity(Product product) {
    return product is ProductModel ? product.toEntity() : product;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: ensure cache schema version is initialized.
  // On first call, validates cached data against current Hive schema version
  // and clears cache if schema changed (e.g., sawaDbAvailable field added).
  // ─────────────────────────────────────────────────────────────────────────
  Future<void> _ensureCacheVersionInitialized() async {
    if (_cacheVersionInitialized) return;
    await localDataSource.initializeCacheVersion();
    _cacheVersionInitialized = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helper: enrich product with structured data from Sawa or OpenFoodFacts.
  // Returns (enrichedModel, wasEnrichedWithOff).
  // Tries Sawa first (sets sawaDbAvailable=true, caches on hit, returns wasEnrichedWithOff=false).
  // Falls back to OpenFoodFacts on ProductNotFoundException (sawaDbAvailable=false, no cache, returns wasEnrichedWithOff=true if OFF was used).
  // Swallows all other errors and returns (base, false) unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  Future<(ProductModel, bool)> _enrichProduct(ProductModel base, String? capturedGtin) async {
    // Resolve canonical GTIN
    final gtin = capturedGtin ?? base.gtin;

    // Validate GTIN: must be non-null, not contain 'SCAN-' prefix, and be numeric
    if (gtin == null || gtin.startsWith('SCAN-') || !RegExp(r'^\d+$').hasMatch(gtin)) {
      return (base, false);
    }

    try {
      // Tier 1: Try Sawa
      try {
        final sawaModel = await remoteDataSource.fetchProductByGtin(gtin);
        
        // Merge: prefer Sawa values for structured fields
        final merged = ProductModel(
          id: sawaModel.id,
          gtin: sawaModel.gtin,
          nameAr: sawaModel.nameAr.isNotEmpty ? sawaModel.nameAr : base.nameAr,
          nameEn: sawaModel.nameEn.isNotEmpty ? sawaModel.nameEn : base.nameEn,
          brand: sawaModel.brand.isNotEmpty ? sawaModel.brand : base.brand,
          category: sawaModel.category,
          subcategory: sawaModel.subcategory,
          descriptionAr: sawaModel.descriptionAr,
          descriptionEn: sawaModel.descriptionEn,
          nutriScoreGrade: sawaModel.nutriScoreGrade,
          novaGroup: sawaModel.novaGroup,
          sfdaRegistrationStatus: sawaModel.sfdaRegistrationStatus,
          halalCertified: sawaModel.halalCertified,
          netWeightValue: sawaModel.netWeightValue,
          netUnit: sawaModel.netUnit,
          nutritionFact: sawaModel.nutritionFact ?? base.nutritionFact,
          ingredients: sawaModel.ingredients.isNotEmpty ? sawaModel.ingredients : base.ingredients,
          allergenDetails: sawaModel.allergenDetails,
          prices: sawaModel.prices,
          images: sawaModel.images,
          ecoScore: sawaModel.ecoScore,
          allergens: sawaModel.allergens,
          allergenTags: sawaModel.allergenTags,
          ingredientTags: sawaModel.ingredientTags,
          allergensDataAvailable: sawaModel.allergensDataAvailable,
          categories: sawaModel.categories,
          ingredientsText: sawaModel.ingredientsText?.isNotEmpty == true ? sawaModel.ingredientsText : base.ingredientsText,
          imageFrontUrl: sawaModel.imageFrontUrl,
          imageNutritionUrl: sawaModel.imageNutritionUrl,
          nutritionDataComplete: sawaModel.nutritionDataComplete,
          source: base.source,
          sawaDbAvailable: true,
        );
        
        // Cache the enriched product
        await localDataSource.cacheProduct(_toEntity(merged));
        return (merged, false);
      } on ProductNotFoundException {
        // Tier 2: Fall back to OpenFoodFacts
        try {
          final offModel = await openFoodFactsDataSource.getProductByBarcode(gtin);
          if (offModel != null) {
            // Merge: prefer OFF values for structured fields, but keep AI nutrition if present
            final merged = ProductModel(
              id: offModel.id,
              gtin: offModel.gtin,
              nameAr: offModel.nameAr.isNotEmpty ? offModel.nameAr : base.nameAr,
              nameEn: offModel.nameEn.isNotEmpty ? offModel.nameEn : base.nameEn,
              brand: offModel.brand.isNotEmpty ? offModel.brand : base.brand,
              category: offModel.category,
              subcategory: offModel.subcategory,
              descriptionAr: offModel.descriptionAr,
              descriptionEn: offModel.descriptionEn,
              nutriScoreGrade: offModel.nutriScoreGrade,
              novaGroup: offModel.novaGroup,
              sfdaRegistrationStatus: offModel.sfdaRegistrationStatus,
              halalCertified: offModel.halalCertified,
              netWeightValue: offModel.netWeightValue,
              netUnit: offModel.netUnit,
              nutritionFact: base.nutritionFact ?? offModel.nutritionFact,
              ingredients: offModel.ingredients.isNotEmpty ? offModel.ingredients : base.ingredients,
              allergenDetails: offModel.allergenDetails,
              prices: offModel.prices,
              images: offModel.images,
              ecoScore: offModel.ecoScore,
              allergens: offModel.allergens,
              allergenTags: offModel.allergenTags,
              ingredientTags: offModel.ingredientTags,
              allergensDataAvailable: offModel.allergensDataAvailable,
              categories: offModel.categories,
              ingredientsText: offModel.ingredientsText?.isNotEmpty == true ? offModel.ingredientsText : base.ingredientsText,
              imageFrontUrl: offModel.imageFrontUrl,
              imageNutritionUrl: offModel.imageNutritionUrl,
              nutritionDataComplete: offModel.nutritionDataComplete,
              source: base.source,
              sawaDbAvailable: false,
            );
            return (merged, true);
          }
        } catch (_) {
          // Swallow OFF errors
        }
        
        // OFF returned null or errored; return base unchanged
        return (base, false);
      }
    } catch (_) {
      // Swallow all other Sawa errors
      return (base, false);
    }
  }

  @override
  Future<Product> getProductByGtin(String gtin) async {
    // Ensure cache schema is compatible; invalidate if changed.
    await _ensureCacheVersionInitialized();

    // Tier 1 ── Hive cache (fresh).
    final cached = localDataSource.getCachedProduct(gtin);
    if (cached != null && !localDataSource.isExpired(gtin, _cacheTtl)) {
      return cached;
    }

    // Track whether each remote definitively said "not found".
    bool sawaNotFound = false;
    bool offNotFound = false;

    // Track specific failures to provide granular diagnostic feedback.
    Object? sawaError;
    Object? offError;


    // Tier 2 ── Sawa remote API.
    try {
      final product = await remoteDataSource.fetchProductByGtin(gtin);
      final enriched = product.copyWith(sawaDbAvailable: true);
      final entity = _toEntity(enriched);
      await localDataSource.cacheProduct(entity);
      return entity;
    } on ProductNotFoundException {
      sawaNotFound = true;
    } on NetworkTimeoutException {
      // Fast-fail: if we timeout, immediately check if we have a stale cache
      if (cached != null) return cached;
      sawaError = NetworkTimeoutException('Sawa service timed out');
    } catch (e) {
      // Record the primary failure (likely a BackendUnavailableException-equivalent)
      sawaError = e;
    }

    // Tier 3 ── OpenFoodFacts fallback.
    try {
      final offProduct =
          await openFoodFactsDataSource.getProductByBarcode(gtin);
      if (offProduct != null) {
        final entity = _toEntity(offProduct);
        await localDataSource.cacheProduct(entity);
        return entity;
      }
      offNotFound = true;
    } on FallbackConfigurationException catch (e) {
      offError = e;
    } catch (e) {
      offError = FallbackUnavailableException(e.toString());
    }

    // Tier 4 ── Stale cache (graceful degradation).
    if (cached != null) {
      return cached;
    }

    // Reachable if both failed or were not found.
    if (sawaNotFound && offNotFound) {
      throw ProductNotFoundException('Product not found for GTIN: $gtin');
    }

    // If we're here, we failed to fulfill the request. Distinguish why.
    if (offError is FallbackConfigurationException) {
      throw offError;
    }
    
    // If the primary failed but the fallback didn't have the product (offNotFound),
    // then the ultimate reason the user didn't get results was the backend failure.
    if (sawaError != null) {
      throw BackendUnavailableException(sawaError.toString());
    }

    if (offError != null) {
      throw FallbackUnavailableException(offError.toString());
    }

    throw ServerException('Unable to retrieve product for GTIN: $gtin');

  }


  @override
  Future<void> clearProductCache(String gtin) async {
    await localDataSource.clearProduct(gtin);
  }

  @override
  Future<Product> scanLabel(List<int> imageBytes, {String? gtin, String? imagePath}) async {
    // Ensure cache schema is compatible; invalidate if changed.
    await _ensureCacheVersionInitialized();

    String? detectedGtin = gtin;
    Object? aiError;

    // Tier A — Barcode pre-pass (detect only; no early return)
    if (imagePath != null && imagePath.isNotEmpty) {
      try {
        final controller = MobileScannerController();
        try {
          final capture = await controller.analyzeImage(imagePath);
          if (capture != null && 
              capture.barcodes.isNotEmpty && 
              capture.barcodes.first.rawValue != null &&
              capture.barcodes.first.rawValue!.isNotEmpty) {
            detectedGtin = capture.barcodes.first.rawValue!;
            // Continue to Tier B to fetch real product data (do NOT return here)
          }
        } finally {
          await controller.dispose();
        }
      } catch (_) {
        // Fall through to Tier B on any detector failure
      }
    }

    // Tier B — Firebase AI vision (new primary)
    try {
      final jsonResult = await firebaseAiDataSource.recognizeProductFromImage(
        imageBytes,
        gtin: detectedGtin,
      );
      final product = ProductModel.fromJson(jsonResult);
      final (enriched, wasEnrichedWithOff) = await _enrichProduct(product, detectedGtin);
      final entity = _toEntity(enriched);
      if (!entity.id.startsWith('SCAN-') && !wasEnrichedWithOff) {
        await localDataSource.cacheProduct(entity);
      }
      return entity;
    } catch (e) {
      aiError = e;
    }

    // Tier C — Backend `/scan/label` fallback
    try {
      final base64Image = base64Encode(imageBytes);
      final product = await remoteDataSource.scanLabel(base64Image, gtin: detectedGtin);
      final (enriched, wasEnrichedWithOff) = await _enrichProduct(product, detectedGtin);
      final entity = _toEntity(enriched);
      if (!entity.id.startsWith('SCAN-') && !wasEnrichedWithOff) {
        await localDataSource.cacheProduct(entity);
      }
      return entity;
    } on PartialScanException catch (e) {
      if (e.rawOcrText != null && e.rawOcrText!.isNotEmpty) {
        try {
          final jsonResult = await firebaseAiDataSource.structureLabel(
            e.rawOcrText!,
            gtin: detectedGtin,
          );
          final product = ProductModel.fromJson(jsonResult);
          final (enriched, wasEnrichedWithOff) = await _enrichProduct(product, detectedGtin);
          final entity = _toEntity(enriched);
          if (!entity.id.startsWith('SCAN-') && !wasEnrichedWithOff) {
            await localDataSource.cacheProduct(entity);
          }
          return entity;
        } catch (_) {
          // Prefer the PartialScanException
          rethrow;
        }
      } else {
        // Prefer the PartialScanException
        rethrow;
      }
    } on NetworkTimeoutException catch (_) {
      // Rethrow the previously-captured aiError from Tier B
      if (aiError != null) {
        throw aiError;
      }
      rethrow;
    } on BackendUnavailableException catch (_) {
      // Rethrow the previously-captured aiError from Tier B
      if (aiError != null) {
        throw aiError;
      }
      rethrow;
    } on ServerException catch (_) {
      // Rethrow the previously-captured aiError from Tier B
      if (aiError != null) {
        throw aiError;
      }
      rethrow;
    } catch (_) {
      rethrow;
    }
  }

  @override
  Future<List<PriceInfoModel>> getLatestPrices(String gtin) {
    return remoteDataSource.fetchLatestPrices(gtin);
  }

  @override
  Future<List<PriceInfoModel>> getPriceHistory(String gtin) {
    return remoteDataSource.fetchPriceHistory(gtin);
  }

  @override
  Future<List<Product>> searchProducts(String query) {
    return openFoodFactsDataSource.searchProducts(query);
  }

  @override
  Future<Map<String, String>> uploadReportImages(
    String gtin,
    Map<String, XFile> photos,
  ) {
    return remoteDataSource.uploadReportImages(gtin, photos);
  }

  @override
  Future<bool> submitProductReport(
    String gtin,
    Map<String, dynamic> payload, {
    Map<String, String>? imageUrls,
    Map<String, XFile>? photos,
  }) async {
    // 1. Submit to Sawa (Primary)
    final success = await remoteDataSource.submitProductReport(
      gtin,
      payload,
      imageUrls: imageUrls,
    );

    // 2. Submit to OpenFoodFacts (Secondary/Sync)
    // If Sawa succeeds, sync to OFF global database (metadata always, images if present).
    if (success) {
      // photos may be null or empty; contributeProduct handles empty maps gracefully.
      await openFoodFactsDataSource.contributeProduct(
          gtin, payload, photos ?? {});
    }


    return success;
  }

  @override
  Future<Map<String, dynamic>> getNutritionAnalysis(
    String gtin, {
    List<String>? userAllergens,
  }) {
    return remoteDataSource.fetchNutritionAnalysis(
      gtin,
      userAllergens: userAllergens,
    );
  }

  @override
  Future<List<Map<String, dynamic>>> getSimilarProducts(
    String gtin, {
    int limit = 10,
  }) {
    return remoteDataSource.fetchSimilarProducts(gtin, limit: limit);
  }

  @override
  Future<Map<String, dynamic>> getComparison(String gtinA, String gtinB) {
    return remoteDataSource.fetchComparison(gtinA, gtinB);
  }

  @override
  Future<List<PriceInfo>> getPricesByStore(
    String gtin,
    String citySlug, {
    String? districtSlug,
  }) async {
    final rawList = await remoteDataSource.fetchPricesByStore(
      gtin,
      citySlug,
      districtSlug: districtSlug,
    );
    return rawList
        .map((json) => PriceInfoModel.fromStoreJson(json).toEntity())
        .toList();
  }
}
