import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/search_provider.dart';
import '../../widgets/nutri_score_badge.dart';
import '../product_detail/product_detail_screen.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // Initialize with existing query if any
    _searchController.text = ref.read(searchQueryProvider);
    _searchController.addListener(_onSearchChanged);
  }

  @override
  void dispose() {
    _searchController.removeListener(_onSearchChanged);
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged() {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      if (mounted) {
        ref.read(searchQueryProvider.notifier).state = _searchController.text;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final resultsAsync = ref.watch(searchResultsProvider);

    // Listen for external updates to the search query (e.g. from the Scanner screen)
    // and sync the controller text accordingly.
    ref.listen<String>(searchQueryProvider, (previous, next) {
      if (next != _searchController.text) {
        _searchController.text = next;
      }
    });

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: SearchBar(
                controller: _searchController,
                hintText: l10n.searchHint,
                leading: const Icon(Icons.search, color: AppColors.onSurface),
                trailing: [
                  if (_searchController.text.isNotEmpty)
                    IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _searchController.clear();
                        ref.read(searchQueryProvider.notifier).state = '';
                      },
                    ),
                ],
                backgroundColor: WidgetStateProperty.all(AppColors.surface),
                elevation: WidgetStateProperty.all(0),
                shape: WidgetStateProperty.all(
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
                ),
                padding: WidgetStateProperty.all(
                  const EdgeInsets.symmetric(horizontal: 16),
                ),
              ),
            ),
            Expanded(
              child: resultsAsync.when(
                data: (products) => _buildResults(products, l10n, locale),
                loading: () => const Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
                error: (err, stack) => Center(
                  child: Text(
                    l10n.serverError,
                    style: AppTypography.body(locale).copyWith(color: AppColors.error),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildResults(List<Product> products, AppLocalizations l10n, Locale locale) {
    final query = ref.watch(searchQueryProvider);
    
    if (query.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_outlined, size: 64, color: AppColors.onSurface.withOpacity(0.5)),
            const SizedBox(height: 16),
            Text(
              l10n.searchProducts,
              style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
            ),
          ],
        ),
      );
    }

    if (products.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.sentiment_dissatisfied, size: 64, color: AppColors.onSurface.withOpacity(0.5)),
            const SizedBox(height: 16),
            Text(
              l10n.noResults,
              style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: products.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final product = products[index];
        return _ProductResultCard(product: product);
      },
    );
  }
}

class _ProductResultCard extends StatelessWidget {
  final Product product;

  const _ProductResultCard({required this.product});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final theme = Theme.of(context);

    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(gtin: product.gtin, initialProduct: product),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.onSurface.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            // Thumbnail
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(8.0),
                child: product.images.isNotEmpty
                    ? Image.network(product.images.first.url, fit: BoxFit.contain)
                    : const Icon(Icons.inventory_2_outlined, color: AppColors.onSurface),
              ),
            ),
            const SizedBox(width: 16),
            // Details
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.brand,
                    style: AppTypography.caption(locale).copyWith(
                      color: theme.colorScheme.secondary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                    style: AppTypography.body(locale).copyWith(
                      fontWeight: FontWeight.bold,
                      height: 1.2,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  if (product.nutriScoreGrade != null)
                    NutriScoreBadge(grade: product.nutriScoreGrade!, isMini: true),
                ],
              ),
            ),
            Icon(
              locale.languageCode == 'ar'
                  ? Icons.chevron_left
                  : Icons.chevron_right,
              color: AppColors.onSurface,
            ),
          ],
        ),
      ),
    );
  }
}
