import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'package:image_picker/image_picker.dart';
import '../../providers/scanner_provider.dart';
import '../../providers/product_provider.dart';
import '../../providers/scan_history_provider.dart';
import '../../widgets/mode_pill.dart';
import '../../widgets/scan_frame_overlay.dart';
import '../../widgets/surface_card.dart';
import '../product_detail/product_detail_screen.dart';
import '../../../domain/entities/product.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../providers/search_provider.dart';
import '../search/search_screen.dart';
import '../../widgets/nutri_score_badge.dart';
import '../../../core/exceptions.dart';



class ScannerScreen extends ConsumerStatefulWidget {
  final bool showBackButton;
  final bool isActive;
  const ScannerScreen({
    super.key,
    this.showBackButton = true,
    this.isActive = true,
  });

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> with WidgetsBindingObserver {
  final MobileScannerController _cameraController = MobileScannerController();
  final PageController _pageController = PageController();
  final List<Product> _scannedProducts = [];
  bool _isProcessing = false;
  String? _lastScannedGtin;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Barcode mode is now the primary mode
    Future.microtask(() => ref.read(scannerModeProvider.notifier).state = ScannerMode.barcode);
    
    if (widget.isActive) {
      _cameraController.start();
    }
  }

  @override
  void didUpdateWidget(ScannerScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isActive != oldWidget.isActive) {
      if (widget.isActive) {
        _cameraController.start();
      } else {
        _cameraController.stop();
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!widget.isActive) return;

    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      _cameraController.stop();
    } else if (state == AppLifecycleState.resumed) {
      _cameraController.start();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cameraController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) async {
    if (_isProcessing) return;

    // Only detect barcodes in barcode mode
    final mode = ref.read(scannerModeProvider);
    if (mode != ScannerMode.barcode) return;

    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isNotEmpty) {
      final String? code = barcodes.first.rawValue;
      if (code != null) {
        if (code == _lastScannedGtin) return;
        _lastScannedGtin = code;

        setState(() => _isProcessing = true);
        ref.read(scannedGtinProvider.notifier).state = code;

        try {
          final product = await ref.read(productRepositoryProvider).getProductByGtin(code);
          final locale = Localizations.localeOf(context);

          // Record to history
          ref.read(scanHistoryProvider.notifier).addEntry(
                ScanHistoryEntry(
                  barcode: product.gtin,
                  productName: locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                  brand: product.brand,
                  nutriScore: product.nutriScoreGrade,
                  imageUrl: product.images.firstOrNull?.url,
                  scannedAt: DateTime.now(),
                ),
              );

          if (!mounted) return;

          setState(() {
            final existingIndex = _scannedProducts.indexWhere((p) => p.gtin == product.gtin);
            if (existingIndex != -1) {
              _scannedProducts.removeAt(existingIndex);
            }
            _scannedProducts.insert(0, product);
            _isProcessing = false;
          });

          // Animate to page 1 (since page 0 is always the search card)
          _pageController.animateToPage(
            1,
            duration: const Duration(milliseconds: 400),
            curve: Curves.easeInOut,
          );
        } catch (e) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(e.toString())),
          );
          setState(() {
            _isProcessing = false;
            _lastScannedGtin = null;
          });
        }
      }
    }
  }

   Future<void> _navigateToDetail(String gtin) async {
    setState(() => _isProcessing = true);
    
    try {
      // Fetch product details for the history entry
      final product = await ref.read(productRepositoryProvider).getProductByGtin(gtin);
      final locale = Localizations.localeOf(context);

      // Record to history
      ref.read(scanHistoryProvider.notifier).addEntry(
            ScanHistoryEntry(
              barcode: product.gtin,
              productName: locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
              brand: product.brand,
              nutriScore: product.nutriScoreGrade,
              imageUrl: product.images.firstOrNull?.url,
              scannedAt: DateTime.now(),
            ),
          );

      if (!mounted) return;

      // Stop camera before navigation to save resources and avoid surface churn
      _cameraController.stop();

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => ProductDetailScreen(
            gtin: gtin,
            initialProduct: product,
            // History was already recorded above at line 118
            historyAlreadyRecorded: true,
          ),
        ),
      ).then((_) {
        if (mounted) {
          setState(() => _isProcessing = false);
          // Resume camera if tab is still active
          if (widget.isActive) {
            _cameraController.start();
          }
        }
      });
    } catch (e) {
      // Fallback navigation if pre-fetch fails (detail screen will show error)
      if (!mounted) return;
      
      // Stop camera before navigation to save resources and avoid surface churn
      _cameraController.stop();

      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => ProductDetailScreen(gtin: gtin),
        ),
      ).then((_) {
        if (mounted) {
          setState(() => _isProcessing = false);
          // Resume camera if tab is still active
          if (widget.isActive) {
            _cameraController.start();
          }
        }
      });
    }
  }

  void _navigateToDetailWithProduct(
    Product product, {
    bool recordHistoryNow = true,
    bool historyAlreadyRecorded = false,
    bool resetLabelScan = true,
  }) {
    setState(() => _isProcessing = true);
    final locale = Localizations.localeOf(context);

    // Record to history if requested.
    if (recordHistoryNow) {
      ref.read(scanHistoryProvider.notifier).addEntry(
            ScanHistoryEntry(
              barcode: product.gtin,
              productName:
                  locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
              brand: product.brand,
              nutriScore: product.nutriScoreGrade,
              imageUrl: product.images.firstOrNull?.url,
              scannedAt: DateTime.now(),
            ),
          );
    }

    // Stop camera before navigation to save resources and avoid surface churn
    _cameraController.stop();

    final capturedBytes = ref.read(labelScanProvider.notifier).capturedBytes;

    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              gtin: product.gtin,
              initialProduct: product,
              capturedImageBytes: capturedBytes,
              // Skip history in detail if it was recorded here OR if it already exists (e.g. carousel re-open)
              historyAlreadyRecorded: recordHistoryNow || historyAlreadyRecorded,
            ),
          ),
        )
        .then((_) {
      if (mounted) {
        setState(() => _isProcessing = false);
        if (resetLabelScan) {
          ref.read(labelScanProvider.notifier).reset();
        }
        // Resume camera if tab is still active
        if (widget.isActive) {
          _cameraController.start();
        }
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
      maxWidth: 1280,
    );

    if (photo != null) {
      final bytes = await photo.readAsBytes();
      await ref.read(labelScanProvider.notifier).scanLabel(
        bytes,
        imagePath: photo.path,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final mode = ref.watch(scannerModeProvider);

    // Handle Label Scan Success/Error via listener to avoid build-time navigation
    ref.listen<AsyncValue<Product?>>(labelScanProvider, (previous, next) {
      next.whenOrNull(
        data: (product) {
          if (product != null) {
            _navigateToDetailWithProduct(product);
          }
        },
        error: (error, stack) {
          if (error is PartialScanException) {
            showModalBottomSheet(
              context: context,
              builder: (context) => _PartialScanSheet(error: error),
              isScrollControlled: true,
              backgroundColor: Colors.transparent,
            );
          } else if (error is AiRecognitionException) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(l10n.aiRecognitionFailed)),
            );
          } else {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error.toString())),
            );
          }
          ref.read(labelScanProvider.notifier).reset();
        },
      );
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Top camera zone (42%)
          Expanded(
            flex: 42,
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
              child: Stack(
                children: [
                  // Black background for camera area (clipped)
                  Positioned.fill(child: Container(color: Colors.black)),
                  // Camera Preview or placeholder
                  // Only mount MobileScanner if the tab is active AND we are in barcode mode.
                  // Label mode uses a separate ImagePicker camera, so no live preview is needed here.
                  if (widget.isActive && mode == ScannerMode.barcode)
                    MobileScanner(
                      controller: _cameraController,
                      onDetect: _onDetect,
                    )
                  else
                    Container(
                      color: Colors.black,
                      child: Center(
                        child: Icon(
                          mode == ScannerMode.label
                              ? Icons.add_a_photo_outlined
                              : Icons.barcode_reader,
                          size: 64,
                          color: Colors.white12,
                        ),
                      ),
                    ),

                  // Top Bar Overlay (Mode Pills)
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
                              children: [
                                if (widget.showBackButton)
                                  IconButton(
                                    icon: const Icon(Icons.close, color: Colors.white),
                                    onPressed: () => Navigator.pop(context),
                                  )
                                else
                                  const SizedBox(width: 48),
                                Expanded(
                                  child: SingleChildScrollView(
                                    scrollDirection: Axis.horizontal,
                                    child: Row(
                                      mainAxisAlignment: MainAxisAlignment.center,
                                      children: [
                                        ModePill(
                                          label: l10n.barcodeMode,
                                          isActive: mode == ScannerMode.barcode,
                                          onTap: () {
                                            ref.read(scannerModeProvider.notifier).state = ScannerMode.barcode;
                                            setState(() => _lastScannedGtin = null);
                                          },
                                        ),
                                        const SizedBox(width: 8),
                                        ModePill(
                                          label: l10n.labelMode,
                                          isActive: mode == ScannerMode.label,
                                          onTap: () {
                                            ref.read(scannerModeProvider.notifier).state = ScannerMode.label;
                                          },
                                        ),
                                        const SizedBox(width: 8),
                                        ModePill(
                                          label: l10n.manualMode,
                                          isActive: mode == ScannerMode.manual,
                                          onTap: () {
                                            ref.read(scannerModeProvider.notifier).state = ScannerMode.manual;
                                          },
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 48),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Barcode Overlay
                  if (mode == ScannerMode.barcode)
                    IgnorePointer(
                      child: Stack(
                        children: [
                          ScanFrameOverlay(topPadding: MediaQuery.of(context).padding.top),
                          Positioned(
                            bottom: 8,
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
                      ),
                    ),

                  if (mode != ScannerMode.manual)
                    Positioned(
                      bottom: 40,
                      left: 48,
                      right: 48,
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _FlashButton(controller: _cameraController),
                          _CameraSwitchButton(controller: _cameraController),
                        ],
                      ),
                    ),

                  // Label Mode UI
                  if (mode == ScannerMode.label) ...[
                    Center(
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          Container(
                            width: 180,
                            height: 180,
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
                      bottom: 12,
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
                      bottom: 48,
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

                  // Analysis Overlay (Consumer)
                  Consumer(
                    builder: (context, ref, _) {
                      final labelScan = ref.watch(labelScanProvider);
                      
                      if (labelScan.isLoading) {
                        return Container(
                          color: Colors.black54,
                          child: Center(
                            child: SurfaceCard(
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
                                      style: AppTypography.body(locale).copyWith(color: AppColors.onBackground),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        );
                      }
                      
                      return const SizedBox.shrink();
                    },
                  ),


                ],
              ),
            ),
          ),

          // Bottom carousel zone (58%)
          Expanded(
            flex: 58,
            child: Container(
              color: AppColors.background,
              child: mode == ScannerMode.manual
                  ? _ManualEntrySheet(onSearch: _navigateToDetail)
                  : PageView(
                      controller: _pageController,
                      children: [
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                          child: _SearchWelcomeCard(
                            onSearch: (query) {
                              ref.read(searchQueryProvider.notifier).state = query;
                              // Push SearchScreen as a sub-page
                              Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (context) => const SearchScreen(),
                                ),
                              );
                            },
                          ),
                        ),
                        ..._scannedProducts.map(
                          (product) => Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                            child: _ScannedProductCard(
                              product: product,
                              onTap: () => _navigateToDetailWithProduct(
                                product,
                                recordHistoryNow: false,
                                historyAlreadyRecorded: true,
                                resetLabelScan: false,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
            ),
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
          child: Container(
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.4),
              borderRadius: BorderRadius.circular(30),
            ),
            padding: const EdgeInsets.all(16),
            child: Icon(
              torchEnabled ? Icons.flash_on : Icons.flash_off,
              color: Colors.white,
            ),
          ),
        );
      },
    );
  }
}

class _CameraSwitchButton extends StatelessWidget {
  final MobileScannerController controller;
  const _CameraSwitchButton({required this.controller});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => controller.switchCamera(),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.4),
          borderRadius: BorderRadius.circular(30),
        ),
        padding: const EdgeInsets.all(16),
        child: const Icon(
          Icons.flip_camera_android,
          color: Colors.white,
        ),
      ),
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
    
    return SurfaceCard(
      borderRadius: BorderRadius.circular(20),
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            TextField(
              controller: _controller,
              keyboardType: TextInputType.number,
              style: AppTypography.body(locale).copyWith(color: AppColors.onBackground),
              decoration: InputDecoration(
                hintText: l10n.enterBarcodeNumber,
                hintStyle: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
                filled: true,
                fillColor: AppColors.onSurface.withOpacity(0.08),
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
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
}

class _SearchWelcomeCard extends StatefulWidget {
  final Function(String query) onSearch;
  const _SearchWelcomeCard({required this.onSearch});

  @override
  State<_SearchWelcomeCard> createState() => _SearchWelcomeCardState();
}

class _SearchWelcomeCardState extends State<_SearchWelcomeCard> {
  final TextEditingController _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return SurfaceCard(
      child: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 32, 24, 48),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(
                Icons.qr_code_scanner,
                size: 48,
                color: AppColors.primary,
              ),
              const SizedBox(height: 16),
              Text(
                l10n.scanOrSearchPrompt,
                style: AppTypography.body(locale).copyWith(
                  color: AppColors.onSurface,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _controller,
                style: AppTypography.body(locale).copyWith(color: AppColors.onBackground),
                decoration: InputDecoration(
                  hintText: l10n.searchHint,
                  hintStyle: AppTypography.body(locale).copyWith(color: AppColors.onSurface.withOpacity(0.5)),
                  filled: true,
                  fillColor: AppColors.onSurface.withOpacity(0.08),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                ),
                onSubmitted: (value) {
                  if (value.isNotEmpty) widget.onSearch(value);
                },
              ),
              const SizedBox(height: 16),
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
                      color: Colors.white,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ScannedProductCard extends StatelessWidget {
  final Product product;
  final VoidCallback onTap;

  const _ScannedProductCard({
    required this.product,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final theme = Theme.of(context);

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: SurfaceCard(
        child: SingleChildScrollView(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12.0),
                    child: product.images.isNotEmpty
                        ? Image.network(
                            product.images.first.url,
                            fit: BoxFit.contain,
                            cacheWidth: 300,
                          )
                        : const Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.onSurface),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  product.brand,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: AppColors.onSurface.withOpacity(0.7),
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                if (product.source == 'firebase_ai_vision' || product.source == 'firebase_ai_text') ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.auto_awesome, size: 16, color: AppColors.primary),
                        const SizedBox(width: 4),
                        Text(
                          AppLocalizations.of(context)!.recognizedByAiBadge,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                if (product.nutriScoreGrade != null)
                  NutriScoreBadge(grade: product.nutriScoreGrade!, isMini: true),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PartialScanSheet extends StatelessWidget {
  final PartialScanException error;

  const _PartialScanSheet({required this.error});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final theme = Theme.of(context);
    final l10n = AppLocalizations.of(context)!;
    
    return Container(
      padding: EdgeInsets.fromLTRB(24, 24, 24, MediaQuery.of(context).padding.bottom + 24),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.scanPartialTitle,
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            error.message,
            style: theme.textTheme.bodyMedium?.copyWith(color: AppColors.error),
          ),
          if (error.rawOcrText != null && error.rawOcrText!.isNotEmpty) ...[
            const SizedBox(height: 24),
            Text(
              l10n.extractedText,
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Container(
              height: 150,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.background,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.onSurface.withOpacity(0.1)),
              ),
              child: SingleChildScrollView(
                child: Text(
                  error.rawOcrText!,
                  style: theme.textTheme.bodySmall?.copyWith(fontFamily: 'monospace'),
                ),
              ),
            ),
          ],
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: Text(
              l10n.close,
              style: theme.textTheme.titleMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.bold),
            ),
          ),
        ],
      ),
    );
  }
}
