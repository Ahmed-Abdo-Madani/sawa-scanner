import 'dart:math';

/// Static city boundary lookup for major Saudi cities.
/// Uses simple bounding-box matching to avoid Google Maps API costs.
/// This maps device GPS coordinates to a city_slug for the price-by-store API.
class LocationService {
  static const List<CityBoundary> _cities = [
    CityBoundary(
      slug: 'riyadh',
      nameEn: 'Riyadh',
      nameAr: 'الرياض',
      minLat: 24.50,
      maxLat: 24.95,
      minLng: 46.45,
      maxLng: 47.05,
    ),
    CityBoundary(
      slug: 'jeddah',
      nameEn: 'Jeddah',
      nameAr: 'جدة',
      minLat: 21.30,
      maxLat: 21.80,
      minLng: 39.05,
      maxLng: 39.40,
    ),
    CityBoundary(
      slug: 'dammam',
      nameEn: 'Dammam',
      nameAr: 'الدمام',
      minLat: 26.30,
      maxLat: 26.55,
      minLng: 49.85,
      maxLng: 50.20,
    ),
    CityBoundary(
      slug: 'makkah',
      nameEn: 'Makkah',
      nameAr: 'مكة',
      minLat: 21.30,
      maxLat: 21.50,
      minLng: 39.70,
      maxLng: 39.95,
    ),
    CityBoundary(
      slug: 'madinah',
      nameEn: 'Madinah',
      nameAr: 'المدينة',
      minLat: 24.35,
      maxLat: 24.55,
      minLng: 39.50,
      maxLng: 39.75,
    ),
    CityBoundary(
      slug: 'khobar',
      nameEn: 'Al Khobar',
      nameAr: 'الخبر',
      minLat: 26.15,
      maxLat: 26.40,
      minLng: 50.10,
      maxLng: 50.30,
    ),
    CityBoundary(
      slug: 'tabuk',
      nameEn: 'Tabuk',
      nameAr: 'تبوك',
      minLat: 28.30,
      maxLat: 28.50,
      minLng: 36.50,
      maxLng: 36.70,
    ),
    CityBoundary(
      slug: 'abha',
      nameEn: 'Abha',
      nameAr: 'أبها',
      minLat: 18.15,
      maxLat: 18.35,
      minLng: 42.45,
      maxLng: 42.60,
    ),
    CityBoundary(
      slug: 'buraidah',
      nameEn: 'Buraidah',
      nameAr: 'بريدة',
      minLat: 26.25,
      maxLat: 26.45,
      minLng: 43.90,
      maxLng: 44.10,
    ),
    CityBoundary(
      slug: 'khamis-mushait',
      nameEn: 'Khamis Mushait',
      nameAr: 'خميس مشيط',
      minLat: 18.25,
      maxLat: 18.40,
      minLng: 42.65,
      maxLng: 42.85,
    ),
  ];

  /// Resolve lat/lng to the nearest city slug.
  /// Returns 'riyadh' as fallback if no match found.
  static String resolveCitySlug(double lat, double lng) {
    for (final city in _cities) {
      if (lat >= city.minLat &&
          lat <= city.maxLat &&
          lng >= city.minLng &&
          lng <= city.maxLng) {
        return city.slug;
      }
    }
    // Fallback: find nearest city center
    double minDist = double.infinity;
    String nearest = 'riyadh';
    for (final city in _cities) {
      final centerLat = (city.minLat + city.maxLat) / 2;
      final centerLng = (city.minLng + city.maxLng) / 2;
      final dist = _haversineKm(lat, lng, centerLat, centerLng);
      if (dist < minDist) {
        minDist = dist;
        nearest = city.slug;
      }
    }
    return nearest;
  }

  /// Compute distance in km between two points (Haversine).
  static double distanceKm(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    return _haversineKm(lat1, lng1, lat2, lng2);
  }

  static double _haversineKm(
    double lat1,
    double lng1,
    double lat2,
    double lng2,
  ) {
    const R = 6371.0; // Earth's radius in km
    final dLat = _toRad(lat2 - lat1);
    final dLng = _toRad(lng2 - lng1);
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(_toRad(lat1)) * cos(_toRad(lat2)) * sin(dLng / 2) * sin(dLng / 2);
    final c = 2 * atan2(sqrt(a), sqrt(1 - a));
    return R * c;
  }

  static double _toRad(double deg) => deg * pi / 180;
}

class CityBoundary {
  final String slug;
  final String nameEn;
  final String nameAr;
  final double minLat;
  final double maxLat;
  final double minLng;
  final double maxLng;

  const CityBoundary({
    required this.slug,
    required this.nameEn,
    required this.nameAr,
    required this.minLat,
    required this.maxLat,
    required this.minLng,
    required this.maxLng,
  });
}
