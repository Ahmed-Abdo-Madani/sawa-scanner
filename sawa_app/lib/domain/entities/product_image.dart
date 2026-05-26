class ProductImage {
  final String url;
  final String imageType;
  final String? source;

  const ProductImage({
    required this.url,
    required this.imageType,
    this.source,
  });
}
