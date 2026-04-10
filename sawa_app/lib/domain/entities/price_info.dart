class PriceInfo {
  final String merchant;
  final String merchantAr;
  final String? logoUrl;
  final String? sourceUrl;
  final double priceSarInclVat;
  final bool inStock;
  final DateTime scrapedAt;

  const PriceInfo({
    required this.merchant,
    required this.merchantAr,
    this.logoUrl,
    this.sourceUrl,
    required this.priceSarInclVat,
    required this.inStock,
    required this.scrapedAt,
  });
}
