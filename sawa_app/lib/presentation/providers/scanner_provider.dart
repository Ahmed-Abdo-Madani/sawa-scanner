import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/entities/product.dart';
import './product_provider.dart';

enum ScannerMode {
  barcode,
  label,
  manual,
}

final scannerModeProvider = StateProvider<ScannerMode>((ref) => ScannerMode.barcode);

final scannedGtinProvider = StateProvider<String?>((ref) => null);

class LabelScanNotifier extends StateNotifier<AsyncValue<Product?>> {
  final Ref ref;

  LabelScanNotifier(this.ref) : super(const AsyncValue.data(null));

  Future<void> scanLabel(List<int> imageBytes, {String? gtin}) async {
    state = const AsyncValue.loading();
    try {
      final base64Image = base64Encode(imageBytes);
      final product = await ref.read(productRepositoryProvider).scanLabel(
        base64Image,
        gtin: gtin,
      );
      state = AsyncValue.data(product);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  void reset() {
    state = const AsyncValue.data(null);
  }
}

final labelScanProvider = StateNotifierProvider<LabelScanNotifier, AsyncValue<Product?>>((ref) {
  return LabelScanNotifier(ref);
});
