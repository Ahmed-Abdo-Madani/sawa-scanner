import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/cart_provider.dart';
import '../../providers/navigation_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../product_detail/product_detail_screen.dart';
import '../../widgets/fallback_image_network.dart';
import '../../providers/cart_suggestion_provider.dart';
import '../../../core/utils/store_logo_helper.dart';

class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cartItems = ref.watch(cartProvider);
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          l10n.cartTab,
          style: AppTypography.headline(locale),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          if (cartItems.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined, color: AppColors.error),
              tooltip: l10n.clearCart,
              onPressed: () => _confirmClearCart(context, ref, l10n),
            ),
        ],
      ),
      body: cartItems.isEmpty
          ? _buildEmptyState(context, ref, l10n, locale)
          : _buildCartContent(context, ref, cartItems, l10n, locale),
    );
  }

  Widget _buildEmptyState(BuildContext context, WidgetRef ref, AppLocalizations l10n, Locale locale) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.shopping_cart_outlined,
                size: 64,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              l10n.emptyCart,
              style: AppTypography.headline(locale).copyWith(
                fontSize: 20,
                color: AppColors.onBackground,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {
                  // Switch tab to Scanner (index 1)
                  ref.read(navigationProvider.notifier).state = 1;
                },
                icon: const Icon(Icons.qr_code_scanner, color: Colors.white),
                label: Text(
                  l10n.startScanning,
                  style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCartContent(
    BuildContext context,
    WidgetRef ref,
    List<CartItem> items,
    AppLocalizations l10n,
    Locale locale,
  ) {
    final cartNotifier = ref.read(cartProvider.notifier);
    final lowestTotal = cartNotifier.lowestCartTotal;
    final highestTotal = cartNotifier.highestCartTotal;
    final savings = cartNotifier.potentialSavings;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            children: [
              _buildSuggestionsSection(context, ref, l10n, locale),
              const SizedBox(height: 16),
              ...items.map((item) {
                final itemKey = item.product.gtin.isNotEmpty ? item.product.gtin : item.product.id;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 12.0),
                  child: _CartItemCard(
                    item: item,
                    onIncrement: () {
                      ref.read(cartProvider.notifier).updateQuantity(itemKey, item.quantity + 1);
                    },
                    onDecrement: () {
                      ref.read(cartProvider.notifier).updateQuantity(itemKey, item.quantity - 1);
                    },
                    onRemove: () {
                      ref.read(cartProvider.notifier).removeProduct(itemKey);
                    },
                  ),
                );
              }),
            ],
          ),
        ),
        _buildSummaryCard(context, ref, items.length, lowestTotal, highestTotal, savings, l10n, locale),
      ],
    );
  }

  Widget _buildSuggestionsSection(
    BuildContext context,
    WidgetRef ref,
    AppLocalizations l10n,
    Locale locale,
  ) {
    // Hidden for now, can get back to it later.
    return const SizedBox.shrink();

    final suggestion = ref.watch(cartSuggestionProvider);
    if (suggestion == null) return const SizedBox.shrink();

    final isRtl = locale.languageCode == 'ar';
    final cheapest = suggestion.bestCheapestStore;
    final nearest = suggestion.nearestStore;

    if (cheapest == null) return const SizedBox.shrink();

    final showNearest = nearest != null && nearest.storeKey != cheapest.storeKey;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 10.0, left: 4.0, right: 4.0),
          child: Text(
            l10n.suggestedStores,
            style: AppTypography.headline(locale).copyWith(fontSize: 16),
          ),
        ),
        if (!showNearest)
          _buildStoreSuggestionCard(context, cheapest, l10n.bestValueCheapest, l10n, locale, isRtl)
        else
          Column(
            children: [
              _buildStoreSuggestionCard(context, cheapest, l10n.bestValueCheapest, l10n, locale, isRtl),
              const SizedBox(height: 10),
              _buildStoreSuggestionCard(context, nearest, l10n.nearestStore, l10n, locale, isRtl),
            ],
          ),
      ],
    );
  }

  Widget _buildStoreSuggestionCard(
    BuildContext context,
    CartStoreSuggestion suggestion,
    String tagLabel,
    AppLocalizations l10n,
    Locale locale,
    bool isRtl,
  ) {
    final storeName = isRtl
        ? (suggestion.storeNameAr ?? suggestion.storeName ?? (suggestion.merchantAr.isNotEmpty ? suggestion.merchantAr : suggestion.merchant))
        : (suggestion.storeName ?? suggestion.merchant);
        
    final districtName = isRtl
        ? (suggestion.districtNameAr ?? suggestion.districtName ?? '')
        : (suggestion.districtName ?? '');

    final bool isCheapest = tagLabel == l10n.bestValueCheapest;
    final tagColor = isCheapest ? Colors.green.shade700 : Colors.blue.shade600;

    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: AppColors.onSurface.withOpacity(0.06),
          width: 1,
        ),
      ),
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: tagColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: tagColor.withOpacity(0.3), width: 1),
                ),
                child: Text(
                  tagLabel,
                  style: TextStyle(
                    color: tagColor,
                    fontSize: 10,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              if (suggestion.distanceKm != null)
                Text(
                  '${suggestion.distanceKm!.toStringAsFixed(1)} ${isRtl ? "كم" : "km"}',
                  style: const TextStyle(
                    color: Colors.white54,
                    fontSize: 12,
                    fontWeight: FontWeight.bold,
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  color: Colors.white.withOpacity(0.04),
                  width: 48,
                  height: 48,
                  child: StoreLogoHelper.buildStoreLogo(
                    suggestion.merchant,
                    size: 48,
                    networkFallbackUrl: suggestion.logoUrl,
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      storeName,
                      style: AppTypography.body(locale).copyWith(
                        fontWeight: FontWeight.bold,
                        fontSize: 15,
                      ),
                    ),
                    if (districtName.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        districtName,
                        style: const TextStyle(
                          color: Colors.white38,
                          fontSize: 11,
                        ),
                      ),
                    ],
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        Icon(
                          suggestion.missingProductNames.isEmpty
                              ? Icons.check_circle_outline
                              : Icons.warning_amber_rounded,
                          size: 14,
                          color: suggestion.missingProductNames.isEmpty
                              ? Colors.green
                              : Colors.amber,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          suggestion.missingProductNames.isEmpty
                              ? l10n.allItemsAvailable
                              : l10n.partialItemsAvailable(
                                  suggestion.matchedItemsCount,
                                  suggestion.matchedItemsCount + suggestion.missingProductNames.length,
                                ),
                          style: TextStyle(
                            color: suggestion.missingProductNames.isEmpty
                                ? Colors.green.shade400
                                : Colors.amber.shade400,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '${suggestion.totalPrice.toStringAsFixed(2)} ${l10n.sar}',
                    style: AppTypography.headline(locale).copyWith(
                      color: AppColors.primary,
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ],
          ),
          if (suggestion.missingProductNames.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.amber.withOpacity(0.04),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: Colors.amber.withOpacity(0.1),
                  width: 1,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    l10n.missingItems,
                    style: TextStyle(
                      color: Colors.amber.shade300,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    suggestion.missingProductNames.join(', '),
                    style: const TextStyle(
                      color: Colors.white54,
                      fontSize: 11,
                      height: 1.3,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryCard(
    BuildContext context,
    WidgetRef ref,
    int itemCount,
    double lowestTotal,
    double highestTotal,
    double savings,
    AppLocalizations l10n,
    Locale locale,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.06),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.itemsCount(itemCount),
                  style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
                ),
                if (savings > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.green.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.green.shade200),
                    ),
                    child: Text(
                      '${l10n.potentialSavings}: ${savings.toStringAsFixed(2)} ${l10n.sar}',
                      style: AppTypography.caption(locale).copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            const Divider(height: 1),
            const SizedBox(height: 12),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.lowestPriceTotal,
                  style: AppTypography.body(locale).copyWith(
                    fontWeight: FontWeight.w600,
                    color: AppColors.onBackground,
                  ),
                ),
                Text(
                  '${lowestTotal.toStringAsFixed(2)} ${l10n.sar}',
                  style: AppTypography.headline(locale).copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  l10n.highestPriceTotal,
                  style: AppTypography.body(locale).copyWith(
                    fontWeight: FontWeight.w500,
                    color: AppColors.onSurface,
                  ),
                ),
                Text(
                  '${highestTotal.toStringAsFixed(2)} ${l10n.sar}',
                  style: AppTypography.body(locale).copyWith(
                    color: AppColors.error,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),

          ],
        ),
      ),
    );
  }

  void _confirmClearCart(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.clearCart),
        content: Text(
          localeLanguageConfirm(context)
              ? "هل أنت متأكد من رغبتك في حذف جميع عناصر السلة؟"
              : "Are you sure you want to clear all items in your cart?",
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () {
              ref.read(cartProvider.notifier).clearCart();
              Navigator.pop(context);
            },
            child: Text(
              l10n.clear,
              style: const TextStyle(color: AppColors.error),
            ),
          ),
        ],
      ),
    );
  }

  bool localeLanguageConfirm(BuildContext context) {
    return Localizations.localeOf(context).languageCode == 'ar';
  }
}

class _CartItemCard extends StatelessWidget {
  final CartItem item;
  final VoidCallback onIncrement;
  final VoidCallback onDecrement;
  final VoidCallback onRemove;

  const _CartItemCard({
    required this.item,
    required this.onIncrement,
    required this.onDecrement,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    final product = item.product;
    final itemKey = product.gtin.isNotEmpty ? product.gtin : product.id;

    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(gtin: itemKey),
          ),
        );
      },
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.onSurface.withOpacity(0.06)),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image Thumbnail
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.onSurface.withOpacity(0.04)),
              ),
              padding: const EdgeInsets.all(6),
              child: FallbackImageNetwork(
                imageUrls: FallbackImageNetwork.getPrioritizedImageUrls(product),
                fit: BoxFit.contain,
                fallback: const Icon(Icons.inventory_2_outlined, color: Colors.grey),
              ),
            ),
            const SizedBox(width: 14),
            // Product info
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.brand.isNotEmpty ? product.brand : "Sawa",
                    style: AppTypography.caption(locale).copyWith(
                      color: theme.colorScheme.secondary,
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    locale.languageCode == 'ar' ? product.nameAr : product.nameEn,
                    style: AppTypography.body(locale).copyWith(
                      fontWeight: FontWeight.bold,
                      color: AppColors.onBackground,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 6),
                  // Price range info
                  _buildPriceRangeWidget(locale, l10n),
                  const SizedBox(height: 8),
                  // Subtotal display
                  _buildSubtotalWidget(locale, l10n),
                ],
              ),
            ),
            const SizedBox(width: 8),
            // Actions: delete and quantity
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                IconButton(
                  icon: const Icon(Icons.delete_outline, color: AppColors.onSurface, size: 20),
                  onPressed: onRemove,
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  splashRadius: 20,
                ),
                const SizedBox(height: 24),
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.background,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: AppColors.onSurface.withOpacity(0.08)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _buildQuantityButton(
                        icon: item.quantity == 1 ? Icons.delete_outline : Icons.remove,
                        onTap: onDecrement,
                        color: item.quantity == 1 ? AppColors.error : AppColors.onSurface,
                      ),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                        child: Text(
                          item.quantity.toString(),
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 14,
                            color: AppColors.onBackground,
                          ),
                        ),
                      ),
                      _buildQuantityButton(
                        icon: Icons.add,
                        onTap: onIncrement,
                        color: AppColors.onSurface,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPriceRangeWidget(Locale locale, AppLocalizations l10n) {
    final lowest = item.lowestUnitPrice;
    final highest = item.highestUnitPrice;
    
    if (lowest <= 0) {
      return Text(
        locale.languageCode == 'ar' ? "لا يتوفر سعر" : "Price not available",
        style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface),
      );
    }

    final isSamePrice = (lowest - highest).abs() < 0.01;
    if (isSamePrice) {
      return Text(
        '${lowest.toStringAsFixed(2)} ${l10n.sar}',
        style: AppTypography.caption(locale).copyWith(
          color: AppColors.primary,
          fontWeight: FontWeight.w600,
        ),
      );
    }

    return Text(
      '${l10n.lowestPrice}: ${lowest.toStringAsFixed(2)} | ${l10n.highestPrice}: ${highest.toStringAsFixed(2)}',
      style: AppTypography.caption(locale).copyWith(
        fontSize: 10,
        color: AppColors.onSurface.withOpacity(0.8),
      ),
    );
  }

  Widget _buildSubtotalWidget(Locale locale, AppLocalizations l10n) {
    final lowestTotal = item.lowestTotalPrice;
    final highestTotal = item.highestTotalPrice;

    if (lowestTotal <= 0) return const SizedBox.shrink();

    final isSamePrice = (lowestTotal - highestTotal).abs() < 0.01;
    if (isSamePrice) {
      return Text(
        '${l10n.totalAmount}: ${lowestTotal.toStringAsFixed(2)} ${l10n.sar}',
        style: AppTypography.caption(locale).copyWith(
          fontWeight: FontWeight.bold,
          color: AppColors.primary,
        ),
      );
    }

    return Text(
      '${lowestTotal.toStringAsFixed(2)} - ${highestTotal.toStringAsFixed(2)} ${l10n.sar}',
      style: AppTypography.caption(locale).copyWith(
        fontWeight: FontWeight.bold,
        color: AppColors.primary,
      ),
    );
  }

  Widget _buildQuantityButton({
    required IconData icon,
    required VoidCallback onTap,
    required Color color,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.all(6.0),
        child: Icon(
          icon,
          size: 14,
          color: color,
        ),
      ),
    );
  }
}
