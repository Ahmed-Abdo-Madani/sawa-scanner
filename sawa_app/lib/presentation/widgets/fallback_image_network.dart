import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../../core/theme/app_colors.dart';
import '../../../domain/entities/product.dart';

class FallbackImageNetwork extends StatefulWidget {
  final List<String> imageUrls;
  final BoxFit fit;
  final double? width;
  final double? height;
  final Widget? fallback;

  const FallbackImageNetwork({
    super.key,
    required this.imageUrls,
    this.fit = BoxFit.contain,
    this.width,
    this.height,
    this.fallback,
  });

  static List<String> getPrioritizedImageUrls(Product product, {String? selectedMerchant}) {
    final List<String> urls = [];

    bool isImageSourceMatch(String? imageSource, String merchantName) {
      if (imageSource == null || imageSource.isEmpty) return false;
      final cleanSource = imageSource.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      final cleanMerchant = merchantName.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]'), '');
      return cleanMerchant.contains(cleanSource) || cleanSource.contains(cleanMerchant);
    }

    if (selectedMerchant != null && selectedMerchant.isNotEmpty) {
      for (final img in product.images) {
        if (isImageSourceMatch(img.source, selectedMerchant)) {
          urls.add(img.url);
        }
      }
    }

    for (final img in product.images) {
      if (!urls.contains(img.url)) {
        urls.add(img.url);
      }
    }

    if (product.imageFrontUrl != null && product.imageFrontUrl!.isNotEmpty) {
      if (!urls.contains(product.imageFrontUrl!)) {
        urls.add(product.imageFrontUrl!);
      }
    }

    return urls;
  }

  @override
  State<FallbackImageNetwork> createState() => _FallbackImageNetworkState();
}

class _FallbackImageNetworkState extends State<FallbackImageNetwork> {
  int _currentIndex = 0;
  final Set<int> _failedIndices = {};

  @override
  void didUpdateWidget(covariant FallbackImageNetwork oldWidget) {
    super.didUpdateWidget(oldWidget);
    // Reset index if the image URLs list changes
    if (widget.imageUrls.join(',') != oldWidget.imageUrls.join(',')) {
      setState(() {
        _currentIndex = 0;
        _failedIndices.clear();
      });
    }
  }

  void _handleError(int index) {
    if (!_failedIndices.contains(index)) {
      _failedIndices.add(index);
      if (_currentIndex == index) {
        // Schedule state update after the current build frame
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            setState(() {
              _currentIndex++;
            });
          }
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final validUrls = widget.imageUrls
        .where((url) => url.isNotEmpty && (url.startsWith('http://') || url.startsWith('https://')))
        .toList();

    if (validUrls.isEmpty || _currentIndex >= validUrls.length) {
      return widget.fallback ?? const Center(
        child: Icon(
          Icons.inventory_2_outlined,
          size: 40,
          color: Colors.grey,
        ),
      );
    }

    final currentUrl = validUrls[_currentIndex];

    return CachedNetworkImage(
      imageUrl: currentUrl,
      fit: widget.fit,
      width: widget.width,
      height: widget.height,
      placeholder: (context, url) => const Center(
        child: SizedBox(
          width: 24,
          height: 24,
          child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
        ),
      ),
      errorWidget: (context, url, error) {
        _handleError(_currentIndex);
        return const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primary),
          ),
        );
      },
    );
  }
}
