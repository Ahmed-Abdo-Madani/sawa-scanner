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

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text(l10n.missingGtinList, style: AppTypography.headline(locale)),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: TextField(
              controller: _searchCtrl,
              decoration: InputDecoration(
                hintText: 'Search products...',
                prefixIcon: const Icon(Icons.search),
                filled: true,
                fillColor: AppColors.surface,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
              ),
            ),
          ),
          Expanded(
            child: ListView.builder(
              controller: _scrollCtrl,
              itemCount: _items.length + (_hasMore ? 1 : 0),
              itemBuilder: (context, index) {
                if (index == _items.length) {
                  return const Center(child: Padding(padding: EdgeInsets.all(16.0), child: CircularProgressIndicator()));
                }
                final item = _items[index];
                return ListTile(
                  title: Text(item.gtin, style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                  subtitle: Text('${l10n.reportsCount}: ${item.count}', style: AppTypography.caption(locale)),
                  trailing: const Icon(Icons.chevron_right, color: AppColors.primary),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(builder: (_) => QuickEntryScreen(initialGtin: item.gtin)),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
