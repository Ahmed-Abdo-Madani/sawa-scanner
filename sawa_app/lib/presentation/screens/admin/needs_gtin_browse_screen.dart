import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:flutter_gen/gen_l10n/app_localizations.dart';

import '../../../data/datasources/admin_product_remote_data_source.dart';
import '../../../data/datasources/authed_http_client.dart';
import '../../providers/auth_provider.dart';

/// Provider for the admin data source — used only in admin screens.
final _adminDataSourceProvider = Provider<AdminProductRemoteDataSource>((ref) {
  final authedClient = ref.watch(authedHttpClientProvider);
  return AdminProductRemoteDataSource(authedClient: authedClient);
});

/// State for the needs-gtin product list
class NeedsGtinState {
  final List<NeedsGtinProduct> products;
  final int total;
  final int page;
  final bool isLoading;
  final String? error;
  final String searchQuery;
  final String categoryFilter;

  const NeedsGtinState({
    this.products = const [],
    this.total = 0,
    this.page = 1,
    this.isLoading = false,
    this.error,
    this.searchQuery = '',
    this.categoryFilter = '',
  });

  NeedsGtinState copyWith({
    List<NeedsGtinProduct>? products,
    int? total,
    int? page,
    bool? isLoading,
    String? error,
    String? searchQuery,
    String? categoryFilter,
  }) {
    return NeedsGtinState(
      products: products ?? this.products,
      total: total ?? this.total,
      page: page ?? this.page,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
      categoryFilter: categoryFilter ?? this.categoryFilter,
    );
  }
}

/// Provider that manages the needs-gtin product list state
final needsGtinProvider =
    StateNotifierProvider<NeedsGtinNotifier, NeedsGtinState>((ref) {
  final dataSource = ref.watch(_adminDataSourceProvider);
  return NeedsGtinNotifier(dataSource);
});

class NeedsGtinNotifier extends StateNotifier<NeedsGtinState> {
  final AdminProductRemoteDataSource _dataSource;

  NeedsGtinNotifier(this._dataSource) : super(const NeedsGtinState());

  Future<void> loadProducts({int page = 1}) async {
    state = state.copyWith(isLoading: true, error: null, page: page);
    try {
      final response = await _dataSource.listProductsNeedingGtin(
        page: page,
        pageSize: 20,
        search: state.searchQuery.isNotEmpty ? state.searchQuery : null,
        category: state.categoryFilter.isNotEmpty ? state.categoryFilter : null,
      );
      state = state.copyWith(
        products: response.items,
        total: response.total,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void setSearch(String query) {
    state = state.copyWith(searchQuery: query);
    loadProducts();
  }

  void setCategory(String category) {
    state = state.copyWith(categoryFilter: category);
    loadProducts();
  }

  Future<bool> assignGtin(String productId, String gtin) async {
    try {
      await _dataSource.assignGtin(productId, gtin);
      // Remove the assigned product from the list
      state = state.copyWith(
        products:
            state.products.where((p) => p.id != productId).toList(),
        total: state.total - 1,
      );
      return true;
    } catch (e) {
      return false;
    }
  }
}

/// Screen that lists products needing GTIN assignment and provides a
/// barcode scanner for rapid assignment.
class NeedsGtinBrowseScreen extends ConsumerStatefulWidget {
  const NeedsGtinBrowseScreen({super.key});

  @override
  ConsumerState<NeedsGtinBrowseScreen> createState() =>
      _NeedsGtinBrowseScreenState();
}

class _NeedsGtinBrowseScreenState
    extends ConsumerState<NeedsGtinBrowseScreen> {
  final _searchController = TextEditingController();
  NeedsGtinProduct? _selectedProduct;
  bool _isScannerOpen = false;
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
  );

  @override
  void initState() {
    super.initState();
    // Load products when the screen is first shown
    Future.microtask(
        () => ref.read(needsGtinProvider.notifier).loadProducts());
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scannerController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final state = ref.watch(needsGtinProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.needsGtinTitle),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: l10n.searchHint,
                prefixIcon: const Icon(Icons.search),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: theme.colorScheme.surfaceContainerHighest,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(vertical: 10),
              ),
              onSubmitted: (value) {
                ref.read(needsGtinProvider.notifier).setSearch(value);
              },
            ),
          ),
        ),
      ),
      body: _isScannerOpen && _selectedProduct != null
          ? _buildScannerView(l10n, theme)
          : _buildProductList(state, l10n, theme),
    );
  }

  Widget _buildProductList(
      NeedsGtinState state, AppLocalizations l10n, ThemeData theme) {
    if (state.isLoading && state.products.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
            const SizedBox(height: 16),
            Text(state.error!, style: theme.textTheme.bodyLarge),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () =>
                  ref.read(needsGtinProvider.notifier).loadProducts(),
              child: Text(l10n.retryButton),
            ),
          ],
        ),
      );
    }

    if (state.products.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.check_circle_outline,
                size: 64, color: theme.colorScheme.primary),
            const SizedBox(height: 16),
            Text(l10n.noProductsNeedGtin, style: theme.textTheme.titleMedium),
          ],
        ),
      );
    }

    return Column(
      children: [
        // Stats bar
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          color: theme.colorScheme.surfaceContainerLow,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                l10n.productsCount(state.total),
                style: theme.textTheme.bodySmall,
              ),
              Text(
                l10n.needsGtinSubtitle,
                style: theme.textTheme.bodySmall
                    ?.copyWith(color: theme.colorScheme.primary),
              ),
            ],
          ),
        ),
        // Product list
        Expanded(
          child: RefreshIndicator(
            onRefresh: () =>
                ref.read(needsGtinProvider.notifier).loadProducts(),
            child: ListView.builder(
              itemCount: state.products.length,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemBuilder: (context, index) {
                final product = state.products[index];
                return _ProductCard(
                  product: product,
                  onScanGtin: () {
                    setState(() {
                      _selectedProduct = product;
                      _isScannerOpen = true;
                    });
                  },
                );
              },
            ),
          ),
        ),
        // Pagination
        if (state.total > 20)
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  onPressed: state.page > 1
                      ? () => ref
                          .read(needsGtinProvider.notifier)
                          .loadProducts(page: state.page - 1)
                      : null,
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('${state.page} / ${(state.total / 20).ceil()}'),
                IconButton(
                  onPressed: state.page * 20 < state.total
                      ? () => ref
                          .read(needsGtinProvider.notifier)
                          .loadProducts(page: state.page + 1)
                      : null,
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildScannerView(AppLocalizations l10n, ThemeData theme) {
    final product = _selectedProduct!;

    return Column(
      children: [
        // Product info header
        Container(
          padding: const EdgeInsets.all(16),
          color: theme.colorScheme.primaryContainer,
          child: Row(
            children: [
              if (product.displayImage.isNotEmpty)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.network(
                    product.displayImage,
                    width: 48,
                    height: 48,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.image_not_supported, size: 48),
                  ),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.displayName,
                      style: theme.textTheme.titleSmall?.copyWith(
                          color: theme.colorScheme.onPrimaryContainer),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (product.category != null)
                      Text(
                        product.category!,
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onPrimaryContainer
                                .withValues(alpha: 0.7)),
                      ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () {
                  setState(() {
                    _isScannerOpen = false;
                    _selectedProduct = null;
                  });
                },
                icon: Icon(Icons.close,
                    color: theme.colorScheme.onPrimaryContainer),
              ),
            ],
          ),
        ),
        // Scanner
        Expanded(
          child: MobileScanner(
            controller: _scannerController,
            onDetect: (BarcodeCapture capture) {
              final barcode = capture.barcodes.firstOrNull;
              if (barcode?.rawValue != null && barcode!.rawValue!.isNotEmpty) {
                _onBarcodeScanned(barcode.rawValue!);
              }
            },
          ),
        ),
        // Cancel button
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: () {
                  setState(() {
                    _isScannerOpen = false;
                    _selectedProduct = null;
                  });
                },
                child: Text(l10n.cancel),
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _onBarcodeScanned(String gtin) {
    // Pause scanner immediately to prevent multiple scans
    _scannerController.stop();

    final l10n = AppLocalizations.of(context)!;
    final product = _selectedProduct!;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => AlertDialog(
        title: Text(l10n.assignGtinTitle),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.confirmGtinAssignment(gtin)),
            const SizedBox(height: 12),
            Text(
              product.displayName,
              style: Theme.of(dialogContext)
                  .textTheme
                  .bodyMedium
                  ?.copyWith(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(dialogContext);
              _scannerController.start();
            },
            child: Text(l10n.cancel),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
              final success = await ref
                  .read(needsGtinProvider.notifier)
                  .assignGtin(product.id, gtin);

              if (mounted) {
                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l10n.gtinAssignedSuccess),
                      backgroundColor:
                          Theme.of(context).colorScheme.primary,
                    ),
                  );
                  setState(() {
                    _isScannerOpen = false;
                    _selectedProduct = null;
                  });
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(l10n.gtinAlreadyAssigned),
                      backgroundColor:
                          Theme.of(context).colorScheme.error,
                    ),
                  );
                  _scannerController.start();
                }
              }
            },
            child: Text(l10n.confirm),
          ),
        ],
      ),
    );
  }
}

/// Product card widget for the needs-GTIN list
class _ProductCard extends StatelessWidget {
  final NeedsGtinProduct product;
  final VoidCallback onScanGtin;

  const _ProductCard({
    required this.product,
    required this.onScanGtin,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: InkWell(
        onTap: onScanGtin,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              // Product image
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: product.displayImage.isNotEmpty
                    ? Image.network(
                        product.displayImage,
                        width: 56,
                        height: 56,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          width: 56,
                          height: 56,
                          color: theme.colorScheme.surfaceContainerHighest,
                          child: const Icon(Icons.image_not_supported),
                        ),
                      )
                    : Container(
                        width: 56,
                        height: 56,
                        color: theme.colorScheme.surfaceContainerHighest,
                        child: const Icon(Icons.inventory_2_outlined),
                      ),
              ),
              const SizedBox(width: 12),
              // Product info
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.displayName,
                      style: theme.textTheme.titleSmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 2),
                    if (product.brand != null)
                      Text(
                        product.brand!,
                        style: theme.textTheme.bodySmall
                            ?.copyWith(color: theme.colorScheme.outline),
                      ),
                    if (product.category != null)
                      Text(
                        product.category!,
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.primary,
                            fontWeight: FontWeight.w500),
                      ),
                  ],
                ),
              ),
              // Scan button
              FilledButton.icon(
                onPressed: onScanGtin,
                icon: const Icon(Icons.qr_code_scanner, size: 18),
                label: Text(l10n.scanGtinButton),
                style: FilledButton.styleFrom(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  textStyle: theme.textTheme.labelSmall,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
