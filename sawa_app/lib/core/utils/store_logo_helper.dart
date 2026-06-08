import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

class StoreLogoHelper {
  static String? getAssetPath(String storeName) {
    final lower = storeName.toLowerCase().trim();

    if (lower.contains('yasmin') || lower.contains('ياسمين')) {
      return 'assets/images/yasmin_store.png';
    }
    if (lower.contains('shonaksa') || lower.contains('شوناكسا')) {
      return 'assets/images/shonaksa.png';
    }
    if (lower.contains('logman') || lower.contains('لوقمان')) {
      return 'assets/images/mr_logman.png';
    }
    if (lower.contains('park') || lower.contains('بارك') || lower.contains('سنتر')) {
      return 'assets/images/park_center.png';
    }
    if (lower.contains('menhal') || lower.contains('منهل')) {
      return 'assets/images/menhal.png';
    }
    if (lower.contains('etaam') || lower.contains('إطعام')) {
      return 'assets/images/etaam_express.png';
    }
    if (lower.contains('hsd') || lower.contains('نجد') || lower.contains('حصاد')) {
      return 'assets/images/hsd_sh.png';
    }
    if (lower.contains('hunger') || lower.contains('هنقر') || lower.contains('hungerstation')) {
      if (lower.startsWith('hunger') || lower.startsWith('هنقر') || lower == 'hungerstation') {
        return 'assets/images/hungerstation.png';
      }
    }
    if (lower.contains('nwsha') || lower.contains('نوشا')) {
      return 'assets/images/nwsha.png';
    }
    if (lower.contains('alaqial') || lower.contains('عقيل') || lower.contains('العقيل')) {
      return 'assets/images/alaqial_markets.png';
    }
    if (lower.contains('shaml') || lower.contains('الشمال') || lower.contains('الشامل')) {
      return 'assets/images/shaml.png';
    }
    if (lower.contains('tabuk') || lower.contains('تبوك') || lower.contains('aliaqtisadia') || lower.contains('الاقتصادية')) {
      return 'assets/images/aliaqtisadia.png';
    }
    if (lower.contains('mo3en') || lower.contains('معين') || lower.contains('معينكم')) {
      return 'assets/images/mo3en.png';
    }
    if (lower.contains('mo0o0nat') || lower.contains('مونة')) {
      return 'assets/images/mo0o0nat.png';
    }
    if (lower.contains('narjs') || lower.contains('نرجس')) {
      return 'assets/images/narjs_store.png';
    }
    if (lower.contains('talbatuk') || lower.contains('طلباتك')) {
      return 'assets/images/talbatuk.png';
    }
    if (lower.contains('dukan') || lower.contains('الدكان')) {
      return 'assets/images/dukan_express.png';
    }
    if (lower.contains('eanaab') || lower.contains('عناب')) {
      return 'assets/images/eanaab.png';
    }
    if (lower.contains('atayib') || lower.contains('أطايب')) {
      return 'assets/images/atayib.png';
    }
    if (lower.contains('mubarkiyah') || lower.contains('المباركية')) {
      return 'assets/images/mubarkiyah.png';
    }

    return null;
  }

  static Widget buildStoreLogo(String storeName, {double size = 40, String? networkFallbackUrl}) {
    final assetPath = getAssetPath(storeName);
    if (assetPath != null) {
      return Image.asset(
        assetPath,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (context, error, stackTrace) => _buildFallbackIcon(size),
      );
    }

    // Network fallback
    if (networkFallbackUrl != null && networkFallbackUrl.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: networkFallbackUrl,
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (context, url) => SizedBox(
          width: size,
          height: size,
          child: const Padding(
            padding: EdgeInsets.all(4.0),
            child: CircularProgressIndicator(strokeWidth: 1),
          ),
        ),
        errorWidget: (context, url, error) => _buildFallbackIcon(size),
      );
    }

    return _buildFallbackIcon(size);
  }

  static Widget _buildFallbackIcon(double size) {
    return Icon(
      Icons.store,
      size: size,
      color: Colors.white30,
    );
  }
}
