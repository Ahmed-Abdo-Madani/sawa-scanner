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
  bool _isLoadingProduct = false;
  String? _loadingGtin;
  String? _scannedProductError;

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
    if (_isProcessing || _isLoadingProduct) return;

    // Only detect barcodes in barcode mode
    final mode = ref.read(scannerModeProvider);
    if (mode != ScannerMode.barcode) return;

    final List<Barcode> barcodes = capture.barcodes;
    if (barcodes.isNotEmpty) {
      final String? code = barcodes.first.rawValue;
      if (code != null) {
        if (code == _lastScannedGtin) return;
        _lastScannedGtin = code;

        setState(() {
          _isProcessing = true;
          _isLoadingProduct = true;
          _loadingGtin = code;
          _scannedProductError = null;
        });
        ref.read(scannedGtinProvider.notifier).state = code;

        // Immediately animate to page 1 to show the pulsing loading card!
        _pageController.animateToPage(
          1,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut,
        );

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
            _isLoadingProduct = false;
            _loadingGtin = null;
          });
        } catch (e) {
          if (!mounted) return;
          setState(() {
            _isProcessing = false;
            _isLoadingProduct = false;
            _scannedProductError = e.toString();
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
                  : Builder(
                      builder: (context) {
                        final List<Widget> carouselChildren = [
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                            child: _SearchWelcomeCard(
                              onSearch: (query) {
                                ref.read(searchQueryProvider.notifier).state = query;
                                Navigator.of(context).push(
                                  MaterialPageRoute(
                                    builder: (context) => const SearchScreen(),
                                  ),
                                );
                              },
                            ),
                          ),
                        ];

                        if (_isLoadingProduct && _loadingGtin != null) {
                          carouselChildren.add(
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                              child: _ScannedProductLoadingCard(gtin: _loadingGtin!),
                            ),
                          );
                        } else if (_scannedProductError != null) {
                          carouselChildren.add(
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
                              child: _ScannedProductNotFoundCard(
                                gtin: _lastScannedGtin ?? '',
                                onRetryScan: () {
                                  setState(() {
                                    _scannedProductError = null;
                                    _lastScannedGtin = null;
                                  });
                                  _pageController.animateToPage(
                                    0,
                                    duration: const Duration(milliseconds: 300),
                                    curve: Curves.easeOut,
                                  );
                                },
                                onManualSubmit: (gtin) {
                                  setState(() {
                                    _scannedProductError = null;
                                    _lastScannedGtin = null;
                                  });
                                  _cameraController.stop();
                                  final capture = BarcodeCapture(
                                    barcodes: [Barcode(rawValue: gtin)],
                                  );
                                  _onDetect(capture);
                                  _cameraController.start();
                                },
                              ),
                            ),
                          );
                        }

                        carouselChildren.addAll(
                          _scannedProducts.map(
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
                        );

                        return PageView(
                          controller: _pageController,
                          children: carouselChildren,
                        );
                      },
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
    final l10n = AppLocalizations.of(context)!;

    // Calculate price points
    final validPrices = product.prices
        .where((p) => p.priceSarInclVat > 0)
        .toList();

    double? lowest;
    double? average;
    double? highest;

    if (validPrices.isNotEmpty) {
      final numericalPrices = validPrices.map((p) => p.priceSarInclVat).toList();
      lowest = numericalPrices.reduce((a, b) => a < b ? a : b);
      highest = numericalPrices.reduce((a, b) => a > b ? a : b);
      average = numericalPrices.reduce((a, b) => a + b) / numericalPrices.length;
    }

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.85),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white12, width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.4),
              blurRadius: 16,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Product info
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Product Image
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.white10, width: 1),
                    ),
                    padding: const EdgeInsets.all(6.0),
                    child: product.images.isNotEmpty
                        ? Image.network(
                            product.images.first.url,
                            fit: BoxFit.contain,
                            cacheWidth: 200,
                            errorBuilder: (context, error, stackTrace) =>
                                const Icon(Icons.inventory_2_outlined, size: 32, color: Colors.grey),
                          )
                        : const Icon(Icons.inventory_2_outlined, size: 32, color: Colors.grey),
                  ),
                  const SizedBox(width: 16),
                  // Text details
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          product.brand.isNotEmpty ? product.brand : "Sawa Scanner",
                          style: TextStyle(
                            color: Colors.amber.shade300.withOpacity(0.8),
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.5,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            if (product.nutriScoreGrade != null) ...[
                              NutriScoreBadge(grade: product.nutriScoreGrade!, isMini: true),
                              const SizedBox(width: 8),
                            ],
                            if (product.source == 'scraped_live')
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                decoration: BoxDecoration(
                                  color: Colors.cyan.withOpacity(0.2),
                                  borderRadius: BorderRadius.circular(8),
                                  border: Border.all(color: Colors.cyan.withOpacity(0.4), width: 0.5),
                                ),
                                child: const Text(
                                  "Live Scraped",
                                  style: TextStyle(
                                    color: Colors.cyanAccent,
                                    fontSize: 9,
                                    fontWeight: FontWeight.bold,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              // Price Pills Section
              if (lowest != null && average != null && highest != null) ...[
                Row(
                  children: [
                    Expanded(
                      child: _buildPricePill(
                        title: l10n.lowestPrice,
                        price: lowest,
                        gradient: LinearGradient(
                          colors: [
                            HSLColor.fromAHSL(1.0, 140, 0.8, 0.4).toColor(),
                            HSLColor.fromAHSL(1.0, 160, 0.9, 0.35).toColor(),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: _buildPricePill(
                        title: l10n.averagePrice,
                        price: average,
                        gradient: LinearGradient(
                          colors: [
                            HSLColor.fromAHSL(1.0, 210, 0.8, 0.45).toColor(),
                            HSLColor.fromAHSL(1.0, 230, 0.9, 0.4).toColor(),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: _buildPricePill(
                        title: l10n.highestPrice,
                        price: highest,
                        gradient: LinearGradient(
                          colors: [
                            HSLColor.fromAHSL(1.0, 350, 0.8, 0.45).toColor(),
                            HSLColor.fromAHSL(1.0, 10, 0.9, 0.45).toColor(),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
              ],

              // Tabular Comparison Grid
              if (validPrices.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.04),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: Colors.white.withOpacity(0.08), width: 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8.0),
                        child: Text(
                          l10n.priceComparison,
                          style: const TextStyle(
                            color: Colors.white70,
                            fontSize: 12,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const Divider(color: Colors.white10, height: 1),
                      ...validPrices.map((priceInfo) {
                        final storeName = locale.languageCode == 'ar'
                            ? (priceInfo.merchantAr.isNotEmpty ? priceInfo.merchantAr : priceInfo.merchant)
                            : priceInfo.merchant;
                        
                        return Container(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          decoration: const BoxDecoration(
                            border: Border(
                              bottom: BorderSide(color: Colors.white10, width: 0.5),
                            ),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Row(
                                children: [
                                  if (priceInfo.logoUrl != null && priceInfo.logoUrl!.isNotEmpty)
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(4),
                                      child: Image.network(
                                        priceInfo.logoUrl!,
                                        width: 20,
                                        height: 20,
                                        fit: BoxFit.cover,
                                        errorBuilder: (context, error, stackTrace) =>
                                            const Icon(Icons.store, size: 20, color: Colors.white30),
                                      ),
                                    )
                                  else
                                    const Icon(Icons.store, size: 20, color: Colors.white30),
                                  const SizedBox(width: 8),
                                  Text(
                                    storeName,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ],
                              ),
                              Row(
                                children: [
                                  Text(
                                    "${priceInfo.priceSarInclVat.toStringAsFixed(2)} ${l10n.sar}",
                                    style: TextStyle(
                                      color: lowest == priceInfo.priceSarInclVat
                                          ? Colors.greenAccent
                                          : Colors.white,
                                      fontSize: 12,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                  const SizedBox(width: 4),
                                  Icon(
                                    Icons.arrow_forward_ios,
                                    size: 10,
                                    color: Colors.white.withOpacity(0.3),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ],
                  ),
                ),
              ] else
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.04),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Text(
                    l10n.noNearbyStores,
                    style: const TextStyle(color: Colors.white54, fontSize: 12),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildPricePill({
    required String title,
    required double price,
    required Gradient gradient,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
      decoration: BoxDecoration(
        gradient: gradient,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 4,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 8,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.5,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            "${price.toStringAsFixed(2)} SAR",
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}

class _ScannedProductLoadingCard extends StatefulWidget {
  final String gtin;
  const _ScannedProductLoadingCard({required this.gtin});

  @override
  State<_ScannedProductLoadingCard> createState() => _ScannedProductLoadingCardState();
}

class _ScannedProductLoadingCardState extends State<_ScannedProductLoadingCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _pulseAnimation = Tween<double>(begin: 0.3, end: 0.8).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.85),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white12, width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Pulse image shape
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Opacity(
                opacity: _pulseAnimation.value,
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(
                    Icons.storefront_outlined,
                    size: 40,
                    color: Colors.white54,
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 20),
          // Pulsing text line
          Text(
            l10n.searchingLiveStores,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 16,
              fontWeight: FontWeight.bold,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            "${l10n.gtinBarcode}: ${widget.gtin}",
            style: const TextStyle(
              color: Colors.white38,
              fontSize: 12,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          // Parallel search store badges pulsing
          AnimatedBuilder(
            animation: _pulseAnimation,
            builder: (context, child) {
              return Wrap(
                spacing: 8,
                runSpacing: 8,
                alignment: WrapAlignment.center,
                children: [
                  _buildStorePill("Yasmin", _pulseAnimation.value),
                  _buildStorePill("Shonaksa", _pulseAnimation.value),
                  _buildStorePill("Mr Logman", _pulseAnimation.value),
                  _buildStorePill("Park Center", _pulseAnimation.value),
                  _buildStorePill("Menhal", _pulseAnimation.value),
                  _buildStorePill("Etaam Express", _pulseAnimation.value),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildStorePill(String name, double opacity) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(opacity * 0.2),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primary.withOpacity(opacity * 0.4),
          width: 1,
        ),
      ),
      child: Text(
        name,
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 11,
          fontWeight: FontWeight.w500,
        ),
      ),
    );
  }
}

class _ScannedProductNotFoundCard extends StatefulWidget {
  final String gtin;
  final VoidCallback onRetryScan;
  final Function(String) onManualSubmit;
  
  const _ScannedProductNotFoundCard({
    required this.gtin,
    required this.onRetryScan,
    required this.onManualSubmit,
  });

  @override
  State<_ScannedProductNotFoundCard> createState() => _ScannedProductNotFoundCardState();
}

class _ScannedProductNotFoundCardState extends State<_ScannedProductNotFoundCard> {
  final TextEditingController _correctionController = TextEditingController();
  bool _isSubmittingReport = false;
  bool _reportSubmitted = false;

  @override
  void dispose() {
    _correctionController.dispose();
    super.dispose();
  }

  Future<void> _submitReport(WidgetRef ref) async {
    setState(() => _isSubmittingReport = true);
    try {
      final success = await ref.read(productRepositoryProvider).submitProductReport(
        widget.gtin,
        {
          'name': 'Missing Product',
          'description': 'Automatically reported missing product from live scanner screen',
          'reported_at': DateTime.now().toIso8601String(),
        },
      );
      if (mounted) {
        setState(() {
          _isSubmittingReport = false;
          _reportSubmitted = success;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() => _isSubmittingReport = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    
    return Container(
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.85),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: AppColors.error.withOpacity(0.3), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.4),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.error.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.error_outline_rounded,
                    color: AppColors.error,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    l10n.scannedProductNotFoundTitle,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              l10n.scannedProductNotFoundDesc,
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.06),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(
                "${l10n.gtinBarcode}: ${widget.gtin}",
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                  fontFamily: 'monospace',
                ),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(height: 16),
            // Text field for manual correction
            TextField(
              controller: _correctionController,
              keyboardType: TextInputType.number,
              style: const TextStyle(color: Colors.white, fontSize: 13),
              decoration: InputDecoration(
                hintText: l10n.manualCorrectionPlaceholder,
                hintStyle: const TextStyle(color: Colors.white30, fontSize: 13),
                filled: true,
                fillColor: Colors.white.withOpacity(0.08),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                suffixIcon: IconButton(
                  icon: const Icon(Icons.arrow_forward, color: Colors.white70, size: 18),
                  onPressed: () {
                    if (_correctionController.text.isNotEmpty) {
                      widget.onManualSubmit(_correctionController.text);
                    }
                  },
                ),
              ),
              onSubmitted: (val) {
                if (val.isNotEmpty) {
                  widget.onManualSubmit(val);
                }
              },
            ),
            const SizedBox(height: 12),
            // Buttons row
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: widget.onRetryScan,
                    icon: const Icon(Icons.qr_code_scanner, size: 14),
                    label: Text(
                      l10n.retryScan,
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                    ),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white24),
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Consumer(
                    builder: (context, ref, _) {
                      if (_isSubmittingReport) {
                        return Container(
                          height: 38,
                          alignment: Alignment.center,
                          child: const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                              color: AppColors.primary,
                              strokeWidth: 2,
                            ),
                          ),
                        );
                      }
                      
                      return _reportSubmitted
                          ? Container(
                              height: 38,
                              alignment: Alignment.center,
                              decoration: BoxDecoration(
                                color: AppColors.primary.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                l10n.reportSubmitted,
                                style: const TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                                textAlign: TextAlign.center,
                              ),
                            )
                          : ElevatedButton.icon(
                              onPressed: () => _submitReport(ref),
                              icon: const Icon(Icons.flag_outlined, size: 14),
                              label: Text(
                                l10n.reportMissingProduct,
                                style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 10),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                              ),
                            );
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () {
                // Navigate to search screen
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (context) => const SearchScreen(),
                  ),
                );
              },
              child: Text(
                l10n.searchByText,
                style: const TextStyle(
                  color: AppColors.primary,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
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
