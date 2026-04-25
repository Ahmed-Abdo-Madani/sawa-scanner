import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:typed_data';
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
  Uint8List? _lastCapturedBytes;

  LabelScanNotifier(this.ref) : super(const AsyncValue.data(null));

  Uint8List? get capturedBytes => _lastCapturedBytes;

  Future<void> scanLabel(List<int> imageBytes, {String? gtin, String? imagePath}) async {
    _lastCapturedBytes = Uint8List.fromList(imageBytes);
    state = const AsyncValue.loading();
    try {
      final product = await ref.read(productRepositoryProvider).scanLabel(
        imageBytes,
        gtin: gtin,
        imagePath: imagePath,
      );
      state = AsyncValue.data(product);
    } catch (e, stack) {
      state = AsyncValue.error(e, stack);
    }
  }

  void reset() {
    _lastCapturedBytes = null;
    state = const AsyncValue.data(null);
  }
}

final labelScanProvider = StateNotifierProvider<LabelScanNotifier, AsyncValue<Product?>>((ref) {
  return LabelScanNotifier(ref);
});
