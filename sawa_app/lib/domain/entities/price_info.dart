class PriceInfo {
  final String merchant;
  final double priceSarInclVat;
  final DateTime scrapedAt;

  const PriceInfo({
    required this.merchant,
    required this.priceSarInclVat,
    required this.scrapedAt,
  });
}
