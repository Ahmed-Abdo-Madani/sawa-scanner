class PriceInfo {
  final String merchant;
  final String merchantAr;
  final String? logoUrl;
  final String? sourceUrl;
  final double priceSarInclVat;
  final double? promoPriceSar;
  final double? unitPriceSar;
  final String? unitPriceUnit;
  final bool inStock;
  final DateTime scrapedAt;
  final String? storeId;
  final String? storeName;
  final String? storeNameAr;
  final String? districtName;
  final String? districtNameAr;
  final double? storeLat;
  final double? storeLng;
  final double? distanceKm;

  const PriceInfo({
    required this.merchant,
    required this.merchantAr,
    this.logoUrl,
    this.sourceUrl,
    required this.priceSarInclVat,
    this.promoPriceSar,
    this.unitPriceSar,
    this.unitPriceUnit,
    required this.inStock,
    required this.scrapedAt,
    this.storeId,
    this.storeName,
    this.storeNameAr,
    this.districtName,
    this.districtNameAr,
    this.storeLat,
    this.storeLng,
    this.distanceKm,
  });
}

