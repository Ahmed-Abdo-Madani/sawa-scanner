import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
 import 'package:flutter_gen/gen_l10n/app_localizations.dart';
import 'package:image_picker/image_picker.dart';
import '../../providers/scanner_provider.dart';
import '../../widgets/mode_pill.dart';
import '../../widgets/scan_frame_overlay.dart';
import '../../widgets/glass_surface.dart';
import '../product_detail/product_detail_screen.dart';
import '../../../domain/entities/product.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

class ScannerScreen extends ConsumerStatefulWidget {
  const ScannerScreen({super.key});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> with SingleTickerProviderStateMixin {
  late AnimationController _scanController;
  final MobileScannerController _cameraController = MobileScannerController();
  bool _isProcessing = false;

  @override
  void initState() {
    super.initState();
    _scanController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _scanController.dispose();
    _cameraController.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_isProcessing) return;
    
    // Only detect barcodes in barcode mode
    final mode = ref.read(scannerModeProvider);
    if (mode != ScannerMode.barcode) return;
    
    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isNotEmpty) {
      final String? code = barcodes.first.rawValue;
      if (code != null) {
        setState(() => _isProcessing = true);
        ref.read(scannedGtinProvider.notifier).state = code;
        _navigateToDetail(code);
      }
    }
  }

   void _navigateToDetail(String gtin) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ProductDetailScreen(gtin: gtin),
      ),
    ).then((_) {
      if (mounted) {
        setState(() => _isProcessing = false);
      }
    });
  }

  void _navigateToDetailWithProduct(Product product) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => ProductDetailScreen(
          gtin: product.gtin,
          initialProduct: product,
        ),
      ),
    ).then((_) {
      if (mounted) {
        setState(() => _isProcessing = false);
        ref.read(labelScanProvider.notifier).reset();
      }
    });
  }

  Future<void> _captureLabel() async {
    if (_isProcessing) return;
    
    // Check if labelScanProvider is inherently in a loading state
    final labelScan = ref.read(labelScanProvider);
    if (labelScan.isLoading) return;

    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 85,
    );

    if (photo != null) {
      final bytes = await photo.readAsBytes();
      await ref.read(labelScanProvider.notifier).scanLabel(bytes);
    }
  }

  @override
  Widget build(BuildContext context) {
    final mode = ref.watch(scannerModeProvider);
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          // Camera Preview
          if (mode != ScannerMode.manual)
            MobileScanner(
              controller: _cameraController,
              onDetect: _onDetect,
            ),

          // Top Bar Overlay
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: Container(
              padding: EdgeInsets.only(
                top: MediaQuery.of(context).padding.top + 10,
                bottom: 20,
              ),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    Colors.black.withOpacity(0.7),
                    Colors.transparent,
                  ],
                ),
              ),
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.close, color: Colors.white),
                          onPressed: () => Navigator.pop(context),
                        ),
                        Row(
                          children: [
                            ModePill(
                              label: l10n.barcodeMode,
                              isActive: mode == ScannerMode.barcode,
                              onTap: () => ref.read(scannerModeProvider.notifier).state = ScannerMode.barcode,
                            ),
                            const SizedBox(width: 8),
                            ModePill(
                              label: l10n.labelMode,
                              isActive: mode == ScannerMode.label,
                              onTap: () => ref.read(scannerModeProvider.notifier).state = ScannerMode.label,
                            ),
                            const SizedBox(width: 8),
                            ModePill(
                              label: l10n.manualMode,
                              isActive: mode == ScannerMode.manual,
                              onTap: () => ref.read(scannerModeProvider.notifier).state = ScannerMode.manual,
                            ),
                          ],
                        ),
                        const SizedBox(width: 48), // Balancing spacer
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Barcode Overlay
          if (mode == ScannerMode.barcode) ...[
            AnimatedBuilder(
              animation: _scanController,
              builder: (context, child) {
                return ScanFrameOverlay(scanLineOffset: _scanController.value);
              },
            ),
            Positioned(
              bottom: 120,
              left: 0,
              right: 0,
              child: Center(
                child: Text(
                  l10n.pointCameraAtBarcode,
                  style: AppTypography.body(locale).copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
          ],

           // Label Mode UI
          if (mode == ScannerMode.label) ...[
            Center(
              child: Stack(
                alignment: Alignment.center,
                children: [
                   Container(
                    width: 250,
                    height: 250,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white.withOpacity(0.5), width: 2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                  ),
                  const Icon(Icons.add_a_photo_outlined, size: 48, color: Colors.white54),
                ],
              ),
            ),
            Positioned(
              bottom: 120,
              left: 0,
              right: 0,
              child: Center(
                child: Text(
                  l10n.pointCameraAtLabel,
                  style: AppTypography.body(locale).copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),
            Positioned(
              bottom: 40,
              left: 0,
              right: 0,
              child: Center(
                child: GestureDetector(
                  onTap: _captureLabel,
                  child: Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                    ),
                    child: Center(
                      child: Container(
                        width: 56,
                        height: 56,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],

          // Analysis Overlay
          Consumer(
            builder: (context, ref, child) {
              final labelScan = ref.watch(labelScanProvider);
              
              return labelScan.when(
                data: (product) {
                  if (product != null) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      _navigateToDetailWithProduct(product);
                    });
                  }
                  return const SizedBox.shrink();
                },
                loading: () => Container(
                  color: Colors.black54,
                  child: Center(
                    child: GlassSurface(
                      borderRadius: BorderRadius.circular(20),
                      child: Padding(
                        padding: const EdgeInsets.all(32),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const CircularProgressIndicator(color: AppColors.primary),
                            const SizedBox(height: 16),
                            Text(
                              l10n.analyzingLabel,
                              style: AppTypography.body(locale).copyWith(color: Colors.white),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
                error: (error, _) {
                   WidgetsBinding.instance.addPostFrameCallback((_) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text(error.toString())),
                    );
                    ref.read(labelScanProvider.notifier).reset();
                  });
                  return const SizedBox.shrink();
                },
              );
            },
          ),

          // Manual Entry Sheet
          if (mode == ScannerMode.manual)
            _ManualEntrySheet(onSearch: _navigateToDetail),

          // Flash Toggle
          if (mode != ScannerMode.manual)
            Positioned(
              bottom: 40,
              right: 24,
              child: _FlashButton(controller: _cameraController),
            ),
        ],
      ),
    );
  }
}

class _FlashButton extends StatelessWidget {
  final MobileScannerController controller;
  const _FlashButton({required this.controller});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: controller,
      builder: (context, state, child) {
        final torchEnabled = state.torchState == TorchState.on;
        return GestureDetector(
          onTap: () => controller.toggleTorch(),
          child: GlassSurface(
            borderRadius: BorderRadius.circular(30),
            child: Container(
              padding: const EdgeInsets.all(16),
              child: Icon(
                torchEnabled ? Icons.flash_on : Icons.flash_off,
                color: Colors.white,
              ),
            ),
          ),
        );
      },
    );
  }
}

class _ManualEntrySheet extends StatefulWidget {
  final Function(String) onSearch;
  const _ManualEntrySheet({required this.onSearch});

  @override
  State<_ManualEntrySheet> createState() => _ManualEntrySheetState();
}

class _ManualEntrySheetState extends State<_ManualEntrySheet> {
  final TextEditingController _controller = TextEditingController();

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    
    return Align(
      alignment: Alignment.bottomCenter,
      child: GlassSurface(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _controller,
                keyboardType: TextInputType.number,
                style: AppTypography.body(locale).copyWith(color: Colors.white),
                decoration: InputDecoration(
                  hintText: l10n.enterBarcodeNumber,
                  hintStyle: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
                  filled: true,
                  fillColor: AppColors.surfaceGlass,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                   contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () {
                    if (_controller.text.isNotEmpty) {
                      widget.onSearch(_controller.text);
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 18),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(
                    l10n.searchButton,
                    style: AppTypography.body(locale).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.background,
                    ),
                  ),
                ),
              ),
              SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
            ],
          ),
        ),
      ),
    );
  }
}
