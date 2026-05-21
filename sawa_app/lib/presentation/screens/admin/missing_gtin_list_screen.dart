import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../../data/models/admin_product_dto.dart';
import 'quick_entry_screen.dart';

class MissingGtinListScreen extends ConsumerStatefulWidget {
  const MissingGtinListScreen({super.key});

  @override
  ConsumerState<MissingGtinListScreen> createState() => _MissingGtinListScreenState();
}

class _MissingGtinListScreenState extends ConsumerState<MissingGtinListScreen> {
  final _searchCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  
  List<AdminMissingGtinSummary> _items = [];
  bool _isLoading = false;
  bool _hasMore = true;
  int _page = 1;
  String _query = '';
  Timer? _debounce;
  bool _isGridView = false;

  @override
  void initState() {
    super.initState();
    _loadItems();
    _scrollCtrl.addListener(_onScroll);
    _searchCtrl.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    _scrollCtrl.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollCtrl.position.pixels >= _scrollCtrl.position.maxScrollExtent - 200) {
      if (!_isLoading && _hasMore) {
        _loadItems();
      }
    }
  }

  void _onSearchChanged() {
    if (_debounce?.isActive ?? false) _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () {
      if (_query != _searchCtrl.text) {
        setState(() {
          _query = _searchCtrl.text;
          _items = [];
          _page = 1;
          _hasMore = true;
        });
        _loadItems();
      }
    });
  }

  Future<void> _loadItems() async {
    if (_isLoading) return;
    setState(() => _isLoading = true);

    try {
      final dataSource = ref.read(adminProductDataSourceProvider);
      final results = await dataSource.listMissingGtin(
        page: _page,
        search: _query.isEmpty ? null : _query,
      );

      if (mounted) {
        setState(() {
          _items.addAll(results);
          _isLoading = false;
          _page++;
          if (results.length < 20) {
            _hasMore = false;
          }
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text(l10n.missingGtinList, style: AppTypography.headline(locale)),
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
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: l10n.searchHint,
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppColors.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: _isGridView
                ? GridView.builder(
                    controller: _scrollCtrl,
                    itemCount: _items.length + (_hasMore ? 1 : 0),
                    padding: const EdgeInsets.all(12),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: 0.72,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                    ),
                    itemBuilder: (context, index) {
                      if (index == _items.length) {
                        return const Center(child: Padding(padding: EdgeInsets.all(16.0), child: CircularProgressIndicator()));
                      }
                      final item = _items[index];
                      return _MissingGtinGridCard(
                        item: item,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => QuickEntryScreen(initialGtin: item.gtin)),
                          );
                        },
                      );
                    },
                  )
                : ListView.builder(
                    controller: _scrollCtrl,
                    itemCount: _items.length + (_hasMore ? 1 : 0),
                    itemBuilder: (context, index) {
                      if (index == _items.length) {
                        return const Center(child: Padding(padding: EdgeInsets.all(16.0), child: CircularProgressIndicator()));
                      }
                      final item = _items[index];
                      final String displayName = (item.name != null && item.name!.isNotEmpty)
                          ? item.name!
                          : item.gtin;

                      return Card(
                        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 1,
                        color: AppColors.surface,
                        child: ListTile(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                          leading: ClipRRect(
                            borderRadius: BorderRadius.circular(8),
                            child: (item.imageUrl != null && item.imageUrl!.isNotEmpty)
                                ? Image.network(
                                    item.imageUrl!,
                                    width: 48,
                                    height: 48,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      width: 48,
                                      height: 48,
                                      color: AppColors.background,
                                      child: Icon(Icons.image_not_supported, color: theme.colorScheme.outline),
                                    ),
                                  )
                                : Container(
                                    width: 48,
                                    height: 48,
                                    color: AppColors.background,
                                    child: Icon(Icons.inventory_2_outlined, color: theme.colorScheme.outline),
                                  ),
                          ),
                          title: Text(
                            displayName,
                            style: AppTypography.body(locale).copyWith(
                              fontWeight: FontWeight.bold,
                              letterSpacing: (item.name != null && item.name!.isNotEmpty) ? 0.0 : 1.2,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                          subtitle: Text(
                            (item.name != null && item.name!.isNotEmpty)
                                ? 'GTIN: ${item.gtin} • ${l10n.reportsCount}: ${item.count}'
                                : '${l10n.reportsCount}: ${item.count}',
                            style: AppTypography.caption(locale),
                          ),
                          trailing: const Icon(Icons.chevron_right, color: AppColors.primary),
                          onTap: () {
                            Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => QuickEntryScreen(initialGtin: item.gtin)),
                            );
                          },
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

/// Premium grid card widget for missing GTIN layout
class _MissingGtinGridCard extends StatelessWidget {
  final AdminMissingGtinSummary item;
  final VoidCallback onTap;

  const _MissingGtinGridCard({
    required this.item,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final theme = Theme.of(context);

    final String displayName = (item.name != null && item.name!.isNotEmpty)
        ? item.name!
        : 'GTIN ${item.gtin}';

    return Card(
      clipBehavior: Clip.antiAlias,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      elevation: 2,
      color: AppColors.surface,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image section with overlay count badge
            Stack(
              children: [
                Container(
                  height: 120,
                  width: double.infinity,
                  color: AppColors.background,
                  child: (item.imageUrl != null && item.imageUrl!.isNotEmpty)
                      ? Image.network(
                          item.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            color: AppColors.background,
                            child: Icon(
                              Icons.image_not_supported,
                              color: theme.colorScheme.outline,
                              size: 32,
                            ),
                          ),
                        )
                      : Icon(
                          Icons.inventory_2_outlined,
                          color: theme.colorScheme.outline,
                          size: 32,
                        ),
                ),
                Positioned(
                  top: 8,
                  right: 8,
                  left: 8,
                  child: Align(
                    alignment: locale.languageCode == 'ar' ? Alignment.topLeft : Alignment.topRight,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.9),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        '${l10n.reportsCount}: ${item.count}',
                        style: AppTypography.caption(locale).copyWith(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 10,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            // Text section
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      displayName,
                      style: AppTypography.body(locale).copyWith(
                        fontWeight: FontWeight.bold,
                        height: 1.2,
                      ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 4),
                    if (item.name != null && item.name!.isNotEmpty)
                      Text(
                        item.gtin,
                        style: AppTypography.caption(locale).copyWith(
                          color: theme.colorScheme.outline,
                          letterSpacing: 0.5,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
            ),
            // Edit CTA
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
              child: SizedBox(
                width: double.infinity,
                height: 32,
                child: OutlinedButton(
                  onPressed: onTap,
                  style: OutlinedButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                    side: const BorderSide(color: AppColors.primary),
                    padding: EdgeInsets.zero,
                  ),
                  child: Text(
                    l10n.editProduct,
                    style: AppTypography.caption(locale).copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.bold,
                      fontSize: 11,
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
