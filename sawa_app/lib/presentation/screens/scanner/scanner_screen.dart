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



class ScannerScreen extends ConsumerStatefulWidget {
  final bool showBackButton;
  const ScannerScreen({super.key, this.showBackButton = true});

  @override
  ConsumerState<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends ConsumerState<ScannerScreen> with SingleTickerProviderStateMixin {
  late AnimationController _scanController;
  final MobileScannerController _cameraController = MobileScannerController();
  final PageController _pageController = PageController();
  final List<Product> _scannedProducts = [];
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
          setState(() => _isProcessing = false);
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
        }
      });
    } catch (e) {
      // Fallback navigation if pre-fetch fails (detail screen will show error)
      if (!mounted) return;
      
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
  }

  void _navigateToDetailWithProduct(
    Product product, {
    bool recordHistoryNow = true,
    bool historyAlreadyRecorded = false,
    bool resetLabelScan = true,
  }) {
    setState(() => _isProcessing = true);
    final locale = Localizations.localeOf(context);

    // Cache the scan-label result so it is available offline from history.
    ref.read(productLocalDataSourceProvider).cacheProduct(product).ignore();

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

    Navigator.of(context)
        .push(
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(
              gtin: product.gtin,
              initialProduct: product,
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
      backgroundColor: AppColors.background,
      body: Column(
        children: [
          // Top camera zone (35%)
          Expanded(
            flex: 35,
            child: ClipRRect(
              borderRadius: const BorderRadius.vertical(bottom: Radius.circular(24)),
              child: Stack(
                children: [
                  // Black background for camera area (clipped)
                  Positioned.fill(child: Container(color: Colors.black)),
                  // Camera Preview or placeholder
                  if (mode != ScannerMode.manual)
                    MobileScanner(
                      controller: _cameraController,
                      onDetect: _onDetect,
                    )
                  else
                    Container(color: Colors.black),

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
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                if (widget.showBackButton)
                                  IconButton(
                                    icon: const Icon(Icons.close, color: Colors.white),
                                    onPressed: () => Navigator.pop(context),
                                  ),
                                if (!widget.showBackButton)
                                  const SizedBox(width: 48), // Spacer to balance
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
                      bottom: 12,
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

                  // Flash Toggle
                  if (mode != ScannerMode.manual)
                    Positioned(
                      bottom: 12,
                      right: 16,
                      child: _FlashButton(controller: _cameraController),
                    ),
                ],
              ),
            ),
          ),

          // Bottom carousel zone (65%)
          Expanded(
            flex: 65,
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
                        ? Image.network(product.images.first.url, fit: BoxFit.contain)
                        : const Icon(Icons.inventory_2_outlined, size: 48, color: AppColors.onSurface),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  product.brand,
                  style: AppTypography.caption(locale).copyWith(
                    color: theme.colorScheme.secondary,
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                  style: AppTypography.headline(locale).copyWith(
                    color: AppColors.onBackground,
                    fontWeight: FontWeight.bold,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                ),
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
