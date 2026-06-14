import 'package:hive_flutter/hive_flutter.dart';
import '../../domain/entities/ingredient.dart';
import '../../domain/entities/nutrition_fact.dart';
import '../../domain/entities/price_info.dart';
import '../../domain/entities/product_image.dart';
import '../../domain/entities/product.dart';

// ---------------------------------------------------------------------------
// TypeId registry
//   0 – IngredientSfdaStatus
//   1 – NutritionFact
//   2 – Ingredient
//   3 – PriceInfo
//   4 – ProductImage
//   5 – Product
// ---------------------------------------------------------------------------

// 0 ── IngredientSfdaStatus ─────────────────────────────────────────────────
class IngredientSfdaStatusAdapter extends TypeAdapter<IngredientSfdaStatus> {
  @override
  final int typeId = 0;

  @override
  IngredientSfdaStatus read(BinaryReader reader) {
    return IngredientSfdaStatus.values[reader.readByte()];
  }

  @override
  void write(BinaryWriter writer, IngredientSfdaStatus obj) {
    writer.writeByte(obj.index);
  }
}

// 1 ── NutritionFact ────────────────────────────────────────────────────────
class NutritionFactAdapter extends TypeAdapter<NutritionFact> {
  @override
  final int typeId = 1;

  @override
  NutritionFact read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return NutritionFact(
      energyKcal: fields[0] as double?,
      fatG: fields[1] as double?,
      saturatedFatG: fields[2] as double?,
      carbsG: fields[3] as double?,
      sugarsG: fields[4] as double?,
      fiberG: fields[5] as double?,
      proteinG: fields[6] as double?,
      sodiumMg: fields[7] as double?,
      servingSizeG: fields[8] as double?,
    );
  }

  @override
  void write(BinaryWriter writer, NutritionFact obj) {
    writer
      ..writeByte(9)
      ..writeByte(0)
      ..write(obj.energyKcal)
      ..writeByte(1)
      ..write(obj.fatG)
      ..writeByte(2)
      ..write(obj.saturatedFatG)
      ..writeByte(3)
      ..write(obj.carbsG)
      ..writeByte(4)
      ..write(obj.sugarsG)
      ..writeByte(5)
      ..write(obj.fiberG)
      ..writeByte(6)
      ..write(obj.proteinG)
      ..writeByte(7)
      ..write(obj.sodiumMg)
      ..writeByte(8)
      ..write(obj.servingSizeG);
  }
}

// 2 ── Ingredient ───────────────────────────────────────────────────────────
class IngredientAdapter extends TypeAdapter<Ingredient> {
  @override
  final int typeId = 2;

  @override
  Ingredient read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Ingredient(
      nameAr: fields[0] as String,
      nameEn: fields[1] as String,
      eNumber: fields[2] as String?,
      sfdaStatus: fields[3] as IngredientSfdaStatus,
    );
  }

  @override
  void write(BinaryWriter writer, Ingredient obj) {
    writer
      ..writeByte(4)
      ..writeByte(0)
      ..write(obj.nameAr)
      ..writeByte(1)
      ..write(obj.nameEn)
      ..writeByte(2)
      ..write(obj.eNumber)
      ..writeByte(3)
      ..write(obj.sfdaStatus);
  }
}

// 3 ── PriceInfo ────────────────────────────────────────────────────────────
class PriceInfoAdapter extends TypeAdapter<PriceInfo> {
  @override
  final int typeId = 3;

  @override
  PriceInfo read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return PriceInfo(
      merchant: fields[0] as String,
      merchantAr: fields[1] as String,
      logoUrl: fields[2] as String?,
      sourceUrl: fields[3] as String?,
      priceSarInclVat: fields[4] as double,
      inStock: fields[5] as bool,
      scrapedAt: fields[6] as DateTime,
      promoPriceSar: fields[7] as double?,
      unitPriceSar: fields[8] as double?,
      unitPriceUnit: fields[9] as String?,
      storeId: fields[10] as String?,
      storeName: fields[11] as String?,
      storeNameAr: fields[12] as String?,
      districtName: fields[13] as String?,
      districtNameAr: fields[14] as String?,
      storeLat: fields[15] as double?,
      storeLng: fields[16] as double?,
      distanceKm: fields[17] as double?,
    );
  }

  @override
  void write(BinaryWriter writer, PriceInfo obj) {
    writer
      ..writeByte(18)
      ..writeByte(0)
      ..write(obj.merchant)
      ..writeByte(1)
      ..write(obj.merchantAr)
      ..writeByte(2)
      ..write(obj.logoUrl)
      ..writeByte(3)
      ..write(obj.sourceUrl)
      ..writeByte(4)
      ..write(obj.priceSarInclVat)
      ..writeByte(5)
      ..write(obj.inStock)
      ..writeByte(6)
      ..write(obj.scrapedAt)
      ..writeByte(7)
      ..write(obj.promoPriceSar)
      ..writeByte(8)
      ..write(obj.unitPriceSar)
      ..writeByte(9)
      ..write(obj.unitPriceUnit)
      ..writeByte(10)
      ..write(obj.storeId)
      ..writeByte(11)
      ..write(obj.storeName)
      ..writeByte(12)
      ..write(obj.storeNameAr)
      ..writeByte(13)
      ..write(obj.districtName)
      ..writeByte(14)
      ..write(obj.districtNameAr)
      ..writeByte(15)
      ..write(obj.storeLat)
      ..writeByte(16)
      ..write(obj.storeLng)
      ..writeByte(17)
      ..write(obj.distanceKm);
  }
}

// 4 ── ProductImage ─────────────────────────────────────────────────────────
class ProductImageAdapter extends TypeAdapter<ProductImage> {
  @override
  final int typeId = 4;

  @override
  ProductImage read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ProductImage(
      url: fields[0] as String,
      imageType: fields[1] as String,
      source: fields[2] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, ProductImage obj) {
    writer
      ..writeByte(3)
      ..writeByte(0)
      ..write(obj.url)
      ..writeByte(1)
      ..write(obj.imageType)
      ..writeByte(2)
      ..write(obj.source);
  }
}

// 5 ── Product ──────────────────────────────────────────────────────────────
class ProductAdapter extends TypeAdapter<Product> {
  @override
  final int typeId = 5;

  @override
  Product read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Product(
      id: fields[0] as String,
      gtin: fields[1] as String,
      nameAr: fields[2] as String,
      nameEn: fields[3] as String,
      brand: fields[4] as String,
      nutriScoreGrade: fields[5] as String?,
      novaGroup: fields[6] as int?,
      sfdaRegistrationStatus: fields[7] as String?,
      halalCertified: fields[8] as bool?,
      nutritionFact: fields[9] as NutritionFact?,
      ingredients: (fields[10] as List).cast<Ingredient>(),
      prices: (fields[11] as List).cast<PriceInfo>(),
      images: (fields[12] as List).cast<ProductImage>(),
      ecoScore: fields[13] as String?,
      allergens: (fields[14] as List).cast<String>(),
      allergensDataAvailable: fields[15] as bool,
      categories: (fields[16] as List).cast<String>(),
      ingredientsText: fields[17] as String?,
      source: fields[18] as String?,
      sawaDbAvailable: fields[19] as bool? ?? false,
    );
  }

  @override
  void write(BinaryWriter writer, Product obj) {
    writer
      ..writeByte(20)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.gtin)
      ..writeByte(2)
      ..write(obj.nameAr)
      ..writeByte(3)
      ..write(obj.nameEn)
      ..writeByte(4)
      ..write(obj.brand)
      ..writeByte(5)
      ..write(obj.nutriScoreGrade)
      ..writeByte(6)
      ..write(obj.novaGroup)
      ..writeByte(7)
      ..write(obj.sfdaRegistrationStatus)
      ..writeByte(8)
      ..write(obj.halalCertified)
      ..writeByte(9)
      ..write(obj.nutritionFact)
      ..writeByte(10)
      ..write(obj.ingredients)
      ..writeByte(11)
      ..write(obj.prices)
      ..writeByte(12)
      ..write(obj.images)
      ..writeByte(13)
      ..write(obj.ecoScore)
      ..writeByte(14)
      ..write(obj.allergens)
      ..writeByte(15)
      ..write(obj.allergensDataAvailable)
      ..writeByte(16)
      ..write(obj.categories)
      ..writeByte(17)
      ..write(obj.ingredientsText)
      ..writeByte(18)
      ..write(obj.source)
      ..writeByte(19)
      ..write(obj.sawaDbAvailable);
  }
}

// ---------------------------------------------------------------------------
// ProductLocalDataSource
// ---------------------------------------------------------------------------
class ProductLocalDataSource {
  static const String productsBoxName = 'productsBox';
  static const String timestampsBoxName = 'productTimestampsBox';
  static const String cacheVersionBoxName = 'productCacheVersionBox';
  /// Cache schema version. Increment when Hive adapter field layout changes
  /// (e.g., adding sawaDbAvailable). Mismatch triggers cache invalidation.
  static const int currentCacheVersion = 4;
  static const String cacheVersionKey = 'schemaVersion';

  Box<Product> get _productsBox => Hive.box<Product>(productsBoxName);
  Box<DateTime> get _timestampsBox => Hive.box<DateTime>(timestampsBoxName);
  Box<int> get _cacheVersionBox => Hive.box<int>(cacheVersionBoxName);

  /// Initialize cache version tracking and invalidate cache if schema changed.
  Future<void> initializeCacheVersion() async {
    final storedVersion = _cacheVersionBox.get(cacheVersionKey, defaultValue: 0);
    if (storedVersion != currentCacheVersion) {
      // Schema mismatch: clear all cached products to prevent stale data
      await _productsBox.clear();
      await _timestampsBox.clear();
      // Record the new schema version
      await _cacheVersionBox.put(cacheVersionKey, currentCacheVersion);
    }
  }

  /// Returns the cached [Product] for [key], or `null` if not cached.
  Product? getCachedProduct(String key) {
    return _productsBox.get(key);
  }

  /// Writes [product] to the products box and records the current timestamp.
  Future<void> cacheProduct(Product product) async {
    final key = product.gtin.isNotEmpty ? product.gtin : product.id;
    await _productsBox.put(key, product);
    await _timestampsBox.put(key, DateTime.now());
  }

  /// Returns `true` if the cached timestamp is older than [ttl] or missing.
  bool isExpired(String key, Duration ttl) {
    final cached = _timestampsBox.get(key);
    if (cached == null) return true;
    return DateTime.now().difference(cached) > ttl;
  }

  /// Removes [key] from both the products and timestamps boxes.
  Future<void> clearProduct(String key) async {
    await _productsBox.delete(key);
    await _timestampsBox.delete(key);
  }
}
