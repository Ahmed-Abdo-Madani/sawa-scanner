import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/intl.dart';

class ScanHistoryEntry {
  final String barcode;
  final String productName;
  final String brand;
  final String? nutriScore;
  final String? imageUrl;
  final DateTime scannedAt;

  ScanHistoryEntry({
    required this.barcode,
    required this.productName,
    required this.brand,
    this.nutriScore,
    this.imageUrl,
    required this.scannedAt,
  });

  Map<String, dynamic> toMap() {
    return {
      'barcode': barcode,
      'productName': productName,
      'brand': brand,
      'nutriScore': nutriScore,
      'imageUrl': imageUrl,
      'scannedAt': scannedAt.toIso8601String(),
    };
  }

  factory ScanHistoryEntry.fromMap(Map<dynamic, dynamic> map) {
    return ScanHistoryEntry(
      barcode: map['barcode'] as String,
      productName: map['productName'] as String,
      brand: map['brand'] as String,
      nutriScore: map['nutriScore'] as String?,
      imageUrl: map['imageUrl'] as String?,
      scannedAt: DateTime.parse(map['scannedAt'] as String),
    );
  }
}

class ScanHistoryNotifier extends StateNotifier<List<ScanHistoryEntry>> {
  final Box _box = Hive.box('scanHistoryBox');

  ScanHistoryNotifier() : super([]) {
    _loadEntries();
  }

  void _loadEntries() {
    final List<ScanHistoryEntry> entries = _box.values
        .map((e) => ScanHistoryEntry.fromMap(Map<String, dynamic>.from(e as Map)))
        .toList();
    
    // Sort by scannedAt descending
    entries.sort((a, b) => b.scannedAt.compareTo(a.scannedAt));
    state = entries;
  }

  Future<void> addEntry(ScanHistoryEntry entry) async {
    // Remove if already exists (to move to top)
    final existingIndex = state.indexWhere((e) => e.barcode == entry.barcode);
    
    List<ScanHistoryEntry> newList = List.from(state);
    if (existingIndex != -1) {
      newList.removeAt(existingIndex);
    }
    
    newList.insert(0, entry);
    
    // Cap at 100 entries
    if (newList.length > 100) {
      newList = newList.sublist(0, 100);
    }

    state = newList;
    
    // Persist to Hive (use barcode as key for easy management)
    await _box.put(entry.barcode, entry.toMap());
    
    // If we capped, delete old entries from Hive too
    if (_box.length > 100) {
      // Find the barcodes that are in Hive but not in our top 100 state
      final stateBarcodes = state.map((e) => e.barcode).toSet();
      final keysToDelete = _box.keys.where((k) => !stateBarcodes.contains(k)).toList();
      for (final key in keysToDelete) {
        await _box.delete(key);
      }
    }
  }

  Future<void> removeEntry(String barcode) async {
    state = state.where((e) => e.barcode != barcode).toList();
    await _box.delete(barcode);
  }

  Future<void> clearAll() async {
    state = [];
    await _box.clear();
  }
}

final scanHistoryProvider = StateNotifierProvider<ScanHistoryNotifier, List<ScanHistoryEntry>>((ref) {
  return ScanHistoryNotifier();
});
