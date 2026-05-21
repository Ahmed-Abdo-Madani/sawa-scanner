import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sawa_app/l10n/app_localizations.dart';

import '../../../data/datasources/admin_product_remote_data_source.dart';
import '../../providers/auth_provider.dart';

/// Provider for the admin data source — used only in admin screens.
final _adminDataSourceProvider = Provider<AdminProductRemoteDataSource>((ref) {
  final authedClient = ref.watch(authedHttpClientProvider);
  return AdminProductRemoteDataSource(authedClient: authedClient);
});

/// State for the products GTIN edit dashboard
class NeedsGtinState {
  final List<NeedsGtinProduct> products;
  final int total;
  final int page;
  final bool isLoading;
  final String? error;
  final String searchQuery;
  final String categoryFilter;
  final String brandFilter;
  final String gtinStatusFilter; // 'unassigned' | 'assigned' | 'all'
  final List<String> categoriesList;
  final List<String> brandsList;

  const NeedsGtinState({
    this.products = const [],
    this.total = 0,
    this.page = 1,
    this.isLoading = false,
    this.error,
    this.searchQuery = '',
    this.categoryFilter = '',
    this.brandFilter = '',
    this.gtinStatusFilter = 'unassigned',
    this.categoriesList = const [],
    this.brandsList = const [],
  });

  NeedsGtinState copyWith({
    List<NeedsGtinProduct>? products,
    int? total,
    int? page,
    bool? isLoading,
    String? error,
    String? searchQuery,
    String? categoryFilter,
    String? brandFilter,
    String? gtinStatusFilter,
    List<String>? categoriesList,
    List<String>? brandsList,
  }) {
    return NeedsGtinState(
      products: products ?? this.products,
      total: total ?? this.total,
      page: page ?? this.page,
      isLoading: isLoading ?? this.isLoading,
      error: error,
      searchQuery: searchQuery ?? this.searchQuery,
      categoryFilter: categoryFilter ?? this.categoryFilter,
      brandFilter: brandFilter ?? this.brandFilter,
      gtinStatusFilter: gtinStatusFilter ?? this.gtinStatusFilter,
      categoriesList: categoriesList ?? this.categoriesList,
      brandsList: brandsList ?? this.brandsList,
    );
  }
}

/// Provider that manages the products GTIN edit state
final needsGtinProvider =
    StateNotifierProvider<NeedsGtinNotifier, NeedsGtinState>((ref) {
  final dataSource = ref.watch(_adminDataSourceProvider);
  return NeedsGtinNotifier(dataSource);
});

class NeedsGtinNotifier extends StateNotifier<NeedsGtinState> {
  final AdminProductRemoteDataSource _dataSource;

  NeedsGtinNotifier(this._dataSource) : super(const NeedsGtinState());

  Future<void> initFilterOptions() async {
    try {
      debugPrint('🔍 Loading admin filter options...');
      final filters = await _dataSource.getFilterOptions();
      state = state.copyWith(
        categoriesList: filters['categories'] ?? [],
        brandsList: filters['brands'] ?? [],
      );
      debugPrint('✅ Loaded ${state.categoriesList.length} categories and ${state.brandsList.length} brands.');
    } catch (e) {
      debugPrint('❌ Error loading filter options: $e');
      // Keep lists empty or keep previous state
    }
  }

  Future<void> loadProducts({int page = 1}) async {
    state = state.copyWith(isLoading: true, error: null, page: page);
    try {
      final response = await _dataSource.listProductsNeedingGtin(
        page: page,
        pageSize: 20,
        search: state.searchQuery.isNotEmpty ? state.searchQuery : null,
        category: state.categoryFilter.isNotEmpty ? state.categoryFilter : null,
        brand: state.brandFilter.isNotEmpty ? state.brandFilter : null,
        gtinStatus: state.gtinStatusFilter,
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

  void setBrand(String brand) {
    state = state.copyWith(brandFilter: brand);
    loadProducts();
  }

  void setGtinStatus(String status) {
    state = state.copyWith(gtinStatusFilter: status);
    loadProducts();
  }

  Future<bool> assignGtin(String productId, String gtin) async {
    try {
      await _dataSource.assignGtin(productId, gtin);
      
      // If we are filtering only unassigned products, remove it from list
      if (state.gtinStatusFilter == 'unassigned') {
        state = state.copyWith(
          products: state.products.where((p) => p.id != productId).toList(),
          total: state.total - 1,
        );
      } else {
        // Otherwise, update the gtin locally on the product card immediately
        state = state.copyWith(
          products: state.products.map((p) {
            if (p.id == productId) {
              return NeedsGtinProduct(
                id: p.id,
                hsProductId: p.hsProductId,
                nameEn: p.nameEn,
                nameAr: p.nameAr,
                brand: p.brand,
                category: p.category,
                imageFrontUrl: p.imageFrontUrl,
                imageUrls: p.imageUrls,
                gtin: gtin,
              );
            }
            return p;
          }).toList(),
        );
      }
      return true;
    } catch (e) {
      return false;
    }
  }
}

/// Screen that lists products and allows administrators to filter by Category, Brand,
/// and GTIN Assignment status. It supports camera scanning or manual text input to assign/correct GTINs.
class ProductsGtinEditScreen extends ConsumerStatefulWidget {
  const ProductsGtinEditScreen({super.key});

  @override
  ConsumerState<ProductsGtinEditScreen> createState() =>
      _ProductsGtinEditScreenState();
}

class _ProductsGtinEditScreenState extends ConsumerState<ProductsGtinEditScreen> {
  final _searchController = TextEditingController();
  NeedsGtinProduct? _selectedProduct;
  bool _isScannerOpen = false;
  bool _isGridView = false;
  final MobileScannerController _scannerController = MobileScannerController(
    detectionSpeed: DetectionSpeed.normal,
    facing: CameraFacing.back,
  );

  @override
  void initState() {
    super.initState();
    // Load products and dynamic filter metadata when screen initializes
    Future.microtask(() {
      ref.read(needsGtinProvider.notifier).initFilterOptions();
      ref.read(needsGtinProvider.notifier).loadProducts();
    });
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
        title: Text(l10n.productsGtinEditTitle),
        actions: [
          IconButton(
            icon: Icon(_isGridView ? Icons.view_list : Icons.grid_view),
            tooltip: _isGridView ? l10n.toggleListView : l10n.toggleGridView,
            onPressed: () {
              setState(() {
                _isGridView = !_isGridView;
              });
            },
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(116),
          child: Column(
            children: [
              // Search input
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: TextField(
                  controller: _searchController,
                  decoration: InputDecoration(
                    hintText: l10n.searchHint,
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: _searchController.text.isNotEmpty
                        ? IconButton(
                            icon: const Icon(Icons.clear),
                            onPressed: () {
                              _searchController.clear();
                              ref.read(needsGtinProvider.notifier).setSearch('');
                            },
                          )
                        : null,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    filled: true,
                    fillColor: theme.colorScheme.surfaceContainerHighest,
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onChanged: (val) {
                    setState(() {}); // refresh trailing clear button visibility
                  },
                  onSubmitted: (value) {
                    ref.read(needsGtinProvider.notifier).setSearch(value);
                  },
                ),
              ),
              // Segmented GTIN Status filter chips
              _buildStatusFilterRow(state, l10n, theme),
            ],
          ),
        ),
      ),
      body: _isScannerOpen && _selectedProduct != null
          ? _buildScannerView(l10n, theme)
          : _buildDashboardBody(state, l10n, theme),
    );
  }

  Widget _buildStatusFilterRow(NeedsGtinState state, AppLocalizations l10n, ThemeData theme) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          _StatusChip(
            label: l10n.gtinStatusNeedsGtin,
            isSelected: state.gtinStatusFilter == 'unassigned',
            onSelected: () => ref.read(needsGtinProvider.notifier).setGtinStatus('unassigned'),
          ),
          const SizedBox(width: 8),
          _StatusChip(
            label: l10n.gtinStatusWithGtin,
            isSelected: state.gtinStatusFilter == 'assigned',
            onSelected: () => ref.read(needsGtinProvider.notifier).setGtinStatus('assigned'),
          ),
          const SizedBox(width: 8),
          _StatusChip(
            label: l10n.gtinStatusAll,
            isSelected: state.gtinStatusFilter == 'all',
            onSelected: () => ref.read(needsGtinProvider.notifier).setGtinStatus('all'),
          ),
        ],
      ),
    );
  }

  Widget _buildDashboardBody(NeedsGtinState state, AppLocalizations l10n, ThemeData theme) {
    return Column(
      children: [
        // Dropdown filter selectors
        _buildDropdownFilterRow(state, l10n, theme),
        
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
                state.gtinStatusFilter == 'unassigned'
                    ? l10n.needsGtinSubtitle
                    : l10n.viewMode,
                style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.primary),
              ),
            ],
          ),
        ),

        // Products List / Grid
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async {
              await ref.read(needsGtinProvider.notifier).initFilterOptions();
              await ref.read(needsGtinProvider.notifier).loadProducts();
            },
            child: state.isLoading && state.products.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : state.error != null
                    ? _buildErrorView(state.error!, l10n, theme)
                    : state.products.isEmpty
                        ? _buildEmptyView(l10n, theme)
                        : _buildProductsDisplay(state, l10n, theme),
          ),
        ),

        // Pagination
        if (state.total > 20) _buildPaginationRow(state, theme),
      ],
    );
  }

  Widget _buildDropdownFilterRow(NeedsGtinState state, AppLocalizations l10n, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Row(
        children: [
          // Brand dropdown
          Expanded(
            child: DropdownButtonFormField<String>(
              value: state.brandFilter.isEmpty ? null : state.brandFilter,
              decoration: InputDecoration(
                labelText: l10n.filterBrand,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              items: [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text(l10n.allBrands, style: const TextStyle(fontSize: 12)),
                ),
                ...state.brandsList.map((brand) => DropdownMenuItem<String>(
                      value: brand,
                      child: Text(
                        brand,
                        style: const TextStyle(fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    )),
              ],
              onChanged: (val) {
                ref.read(needsGtinProvider.notifier).setBrand(val ?? '');
              },
            ),
          ),
          const SizedBox(width: 12),
          // Category dropdown
          Expanded(
            child: DropdownButtonFormField<String>(
              value: state.categoryFilter.isEmpty ? null : state.categoryFilter,
              decoration: InputDecoration(
                labelText: l10n.filterCategory,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
              ),
              items: [
                DropdownMenuItem<String>(
                  value: null,
                  child: Text(l10n.allCategories, style: const TextStyle(fontSize: 12)),
                ),
                ...state.categoriesList.map((cat) => DropdownMenuItem<String>(
                      value: cat,
                      child: Text(
                        cat,
                        style: const TextStyle(fontSize: 12),
                        overflow: TextOverflow.ellipsis,
                      ),
                    )),
              ],
              onChanged: (val) {
                ref.read(needsGtinProvider.notifier).setCategory(val ?? '');
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProductsDisplay(NeedsGtinState state, AppLocalizations l10n, ThemeData theme) {
    if (_isGridView) {
      return GridView.builder(
        itemCount: state.products.length,
        padding: const EdgeInsets.all(12),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          childAspectRatio: 0.64,
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
        ),
        itemBuilder: (context, index) {
          final product = state.products[index];
          return _ProductGridCard(
            product: product,
            onAction: () => _showAssignmentOptions(product, l10n, theme),
          );
        },
      );
    }

    return ListView.builder(
      itemCount: state.products.length,
      padding: const EdgeInsets.symmetric(vertical: 4),
      itemBuilder: (context, index) {
        final product = state.products[index];
        return _ProductCard(
          product: product,
          onAction: () => _showAssignmentOptions(product, l10n, theme),
        );
      },
    );
  }

  Widget _buildErrorView(String err, AppLocalizations l10n, ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.error_outline, size: 48, color: theme.colorScheme.error),
          const SizedBox(height: 16),
          Text(err, style: theme.textTheme.bodyLarge),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () => ref.read(needsGtinProvider.notifier).loadProducts(),
            child: Text(l10n.retryButton),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyView(AppLocalizations l10n, ThemeData theme) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.check_circle_outline, size: 64, color: theme.colorScheme.primary),
          const SizedBox(height: 16),
          Text(l10n.noProductsNeedGtin, style: theme.textTheme.titleMedium),
        ],
      ),
    );
  }

  Widget _buildPaginationRow(NeedsGtinState state, ThemeData theme) {
    return Padding(
      padding: const EdgeInsets.all(8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: state.page > 1
                ? () => ref.read(needsGtinProvider.notifier).loadProducts(page: state.page - 1)
                : null,
            icon: const Icon(Icons.chevron_left),
          ),
          Text('${state.page} / ${(state.total / 20).ceil()}'),
          IconButton(
            onPressed: state.page * 20 < state.total
                ? () => ref.read(needsGtinProvider.notifier).loadProducts(page: state.page + 1)
                : null,
            icon: const Icon(Icons.chevron_right),
          ),
        ],
      ),
    );
  }

  /// Premium Bottom Sheet displaying assignment options: Camera scan or Manual keyboard entry.
  void _showAssignmentOptions(NeedsGtinProduct product, AppLocalizations l10n, ThemeData theme) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Product Info Header inside Bottom Sheet
                Row(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: product.displayImage.isNotEmpty
                          ? Image.network(
                              product.displayImage,
                              width: 60,
                              height: 60,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                width: 60,
                                height: 60,
                                color: theme.colorScheme.surfaceContainerHighest,
                                child: const Icon(Icons.image_not_supported),
                              ),
                            )
                          : Container(
                              width: 60,
                              height: 60,
                              color: theme.colorScheme.surfaceContainerHighest,
                              child: const Icon(Icons.inventory_2_outlined),
                            ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            product.displayName,
                            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (product.brand != null)
                            Text(
                              product.brand!,
                              style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.outline),
                            ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                // Scanner CTA
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primaryContainer,
                    child: Icon(Icons.qr_code_scanner, color: theme.colorScheme.primary),
                  ),
                  title: Text(
                    product.gtin != null ? l10n.correctGtin : l10n.scanGtinButton,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(product.gtin != null
                      ? 'Re-scan and override current GTIN'
                      : 'Scan product barcode using camera'),
                  onTap: () {
                    Navigator.pop(context);
                    setState(() {
                      _selectedProduct = product;
                      _isScannerOpen = true;
                    });
                  },
                ),
                const Divider(),
                // Manual Entry CTA
                ListTile(
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.secondaryContainer,
                    child: Icon(Icons.keyboard, color: theme.colorScheme.secondary),
                  ),
                  title: Text(
                    l10n.enterGtinManually,
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: const Text('Type barcode value manually with keyboard'),
                  onTap: () {
                    Navigator.pop(context);
                    _showManualEntryDialog(product, l10n, theme);
                  },
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  /// Displays a dialog allowing manual correction/assignment of GTIN barcodes via keyboard input.
  void _showManualEntryDialog(NeedsGtinProduct product, AppLocalizations l10n, ThemeData theme) {
    final manualController = TextEditingController(text: product.gtin);
    final formKey = GlobalKey<FormState>();

    showDialog(
      context: context,
      builder: (dialogCtx) {
        return AlertDialog(
          title: Text(l10n.assignGtinTitle),
          content: Form(
            key: formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  product.displayName,
                  style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: manualController,
                  autofocus: true,
                  keyboardType: TextInputType.number,
                  decoration: InputDecoration(
                    labelText: l10n.enterGtinManually,
                    border: const OutlineInputBorder(),
                    hintText: 'e.g. 6281001123456',
                  ),
                  validator: (value) {
                    if (value == null || value.trim().isEmpty) {
                      return 'GTIN barcode is required';
                    }
                    if (value.trim().length < 8 || value.trim().length > 14) {
                      return 'Enter a valid barcode (8-14 digits)';
                    }
                    return null;
                  },
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(dialogCtx),
              child: Text(l10n.cancel),
            ),
            FilledButton(
              onPressed: () async {
                if (formKey.currentState?.validate() ?? false) {
                  final newGtin = manualController.text.trim();
                  Navigator.pop(dialogCtx);
                  
                  final success = await ref
                      .read(needsGtinProvider.notifier)
                      .assignGtin(product.id, newGtin);

                  if (mounted) {
                    if (success) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(l10n.gtinAssignedSuccess),
                          backgroundColor: theme.colorScheme.primary,
                        ),
                      );
                    } else {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(l10n.gtinAlreadyAssigned),
                          backgroundColor: theme.colorScheme.error,
                        ),
                      );
                    }
                  }
                }
              },
              child: Text(l10n.confirm),
            ),
          ],
        );
      },
    );
  }

  Widget _buildScannerView(AppLocalizations l10n, ThemeData theme) {
    final product = _selectedProduct!;

    return Column(
      children: [
        // Product Info Header inside Camera Scanner View
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
                    errorBuilder: (_, __, ___) => const Icon(Icons.image_not_supported, size: 48),
                  ),
                ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      product.displayName,
                      style: theme.textTheme.titleSmall
                          ?.copyWith(color: theme.colorScheme.onPrimaryContainer),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (product.gtin != null)
                      Text(
                        l10n.gtinValue(product.gtin!),
                        style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onPrimaryContainer.withValues(alpha: 0.7)),
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
                icon: Icon(Icons.close, color: theme.colorScheme.onPrimaryContainer),
              ),
            ],
          ),
        ),
        // Active Camera Scanner Widget
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
              style: Theme.of(dialogContext).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.bold),
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
                      backgroundColor: Theme.of(context).colorScheme.primary,
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
                      backgroundColor: Theme.of(context).colorScheme.error,
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

/// Custom horizontal selectable chip supporting dynamic material theme sizing and styles.
class _StatusChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onSelected;

  const _StatusChip({
    required this.label,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ChoiceChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(),
      selectedColor: theme.colorScheme.primaryContainer,
      checkmarkColor: theme.colorScheme.primary,
      labelStyle: TextStyle(
        color: isSelected ? theme.colorScheme.onPrimaryContainer : theme.colorScheme.onSurface,
        fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
      ),
    );
  }
}

/// Product card widget for list layout (dumb/stateless component)
class _ProductCard extends StatelessWidget {
  final NeedsGtinProduct product;
  final VoidCallback onAction;

  const _ProductCard({
    required this.product,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: InkWell(
        onTap: onAction,
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
                        style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.outline),
                      ),
                    if (product.category != null)
                      Text(
                        product.category!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                    if (product.gtin != null) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          l10n.gtinValue(product.gtin!),
                          style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // Action button
              FilledButton.icon(
                onPressed: onAction,
                icon: Icon(product.gtin != null ? Icons.edit : Icons.qr_code_scanner, size: 14),
                label: Text(product.gtin != null ? l10n.correctGtin : l10n.scanGtinButton),
                style: FilledButton.styleFrom(
                  backgroundColor: product.gtin != null
                      ? theme.colorScheme.secondary
                      : theme.colorScheme.primary,
                  foregroundColor: product.gtin != null
                      ? theme.colorScheme.onSecondary
                      : theme.colorScheme.onPrimary,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  textStyle: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Premium product grid card widget for grid layout (dumb/stateless component)
class _ProductGridCard extends StatelessWidget {
  final NeedsGtinProduct product;
  final VoidCallback onAction;

  const _ProductGridCard({
    required this.product,
    required this.onAction,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      elevation: 2,
      child: InkWell(
        onTap: onAction,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image section with overlay category
            Stack(
              children: [
                Container(
                  height: 100,
                  width: double.infinity,
                  color: theme.colorScheme.surfaceContainerHighest,
                  child: product.displayImage.isNotEmpty
                      ? Image.network(
                          product.displayImage,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: theme.colorScheme.surfaceContainerHighest,
                            child: Icon(
                              Icons.image_not_supported,
                              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
                              size: 32,
                            ),
                          ),
                        )
                      : Icon(
                          Icons.inventory_2_outlined,
                          color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
                          size: 32,
                        ),
                ),
                if (product.category != null)
                  Positioned(
                    top: 6,
                    left: 6,
                    right: 6,
                    child: Align(
                      alignment: Alignment.topLeft,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primaryContainer.withValues(alpha: 0.9),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          product.category!,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onPrimaryContainer,
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            // Text section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 6, 10, 2),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (product.brand != null)
                      Text(
                        product.brand!.toUpperCase(),
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.outline,
                          fontWeight: FontWeight.bold,
                          letterSpacing: 0.5,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    const SizedBox(height: 2),
                    Text(
                      product.displayName,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                        height: 1.1,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (product.gtin != null) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surfaceContainerHigh,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          l10n.gtinValue(product.gtin!),
                          style: theme.textTheme.labelSmall?.copyWith(
                            fontWeight: FontWeight.w600,
                            fontSize: 9,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            // Action CTA Button
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: SizedBox(
                width: double.infinity,
                height: 36,
                child: FilledButton.icon(
                  onPressed: onAction,
                  icon: Icon(product.gtin != null ? Icons.edit : Icons.qr_code_scanner, size: 14),
                  label: Text(
                    product.gtin != null ? l10n.correctGtin : l10n.scanGtinButton,
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: product.gtin != null
                        ? theme.colorScheme.secondary
                        : theme.colorScheme.primary,
                    foregroundColor: product.gtin != null
                        ? theme.colorScheme.onSecondary
                        : theme.colorScheme.onPrimary,
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
