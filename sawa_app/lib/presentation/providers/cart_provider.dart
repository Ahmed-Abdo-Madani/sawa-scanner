import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../../domain/entities/product.dart';
import 'product_provider.dart';

class CartItem {
  final Product product;
  final int quantity;

  CartItem({
    required this.product,
    required this.quantity,
  });

  double get lowestUnitPrice {
    final validPrices = product.prices
        .where((p) => p.priceSarInclVat > 0)
        .toList();
    if (validPrices.isEmpty) return 0.0;
    return validPrices.map((p) => p.priceSarInclVat).reduce((a, b) => a < b ? a : b);
  }

  double get highestUnitPrice {
    final validPrices = product.prices
        .where((p) => p.priceSarInclVat > 0)
        .toList();
    if (validPrices.isEmpty) return 0.0;
    return validPrices.map((p) => p.priceSarInclVat).reduce((a, b) => a > b ? a : b);
  }

  double get lowestTotalPrice => lowestUnitPrice * quantity;
  double get highestTotalPrice => highestUnitPrice * quantity;

  CartItem copyWith({
    Product? product,
    int? quantity,
  }) {
    return CartItem(
      product: product ?? this.product,
      quantity: quantity ?? this.quantity,
    );
  }
}

class CartNotifier extends StateNotifier<List<CartItem>> {
  final Box _cartBox = Hive.box('cartBox');
  final Ref ref;

  CartNotifier(this.ref) : super([]) {
    _loadCart();
  }

  void _loadCart() {
    final List<CartItem> items = [];
    final localDataSource = ref.read(productLocalDataSourceProvider);

    for (final key in _cartBox.keys) {
      final gtin = key as String;
      final quantity = _cartBox.get(gtin) as int;
      final cachedProduct = localDataSource.getCachedProduct(gtin);
      if (cachedProduct != null) {
        items.add(CartItem(product: cachedProduct, quantity: quantity));
      }
    }
    state = items;
  }

  String _getProductKey(Product product) {
    return product.gtin.isNotEmpty ? product.gtin : product.id;
  }

  Future<void> addProduct(Product product, {int quantity = 1}) async {
    // 1. Cache product locally to guarantee it persists in Hive
    final localDataSource = ref.read(productLocalDataSourceProvider);
    await localDataSource.cacheProduct(product);

    // 2. Update state and Hive
    final productKey = _getProductKey(product);
    final existingIndex = state.indexWhere((item) => _getProductKey(item.product) == productKey);
    final List<CartItem> newList = List.from(state);

    if (existingIndex != -1) {
      final oldItem = newList[existingIndex];
      final newQty = oldItem.quantity + quantity;
      newList[existingIndex] = oldItem.copyWith(quantity: newQty);
      await _cartBox.put(productKey, newQty);
    } else {
      newList.add(CartItem(product: product, quantity: quantity));
      await _cartBox.put(productKey, quantity);
    }

    state = newList;
  }

  Future<void> updateQuantity(String key, int quantity) async {
    if (quantity <= 0) {
      await removeProduct(key);
      return;
    }

    final index = state.indexWhere((item) => _getProductKey(item.product) == key);
    if (index == -1) return;

    final List<CartItem> newList = List.from(state);
    newList[index] = newList[index].copyWith(quantity: quantity);
    state = newList;

    await _cartBox.put(key, quantity);
  }

  Future<void> removeProduct(String key) async {
    state = state.where((item) => _getProductKey(item.product) != key).toList();
    await _cartBox.delete(key);
  }

  Future<void> clearCart() async {
    state = [];
    await _cartBox.clear();
  }

  double get lowestCartTotal {
    return state.fold(0.0, (sum, item) => sum + item.lowestTotalPrice);
  }

  double get highestCartTotal {
    return state.fold(0.0, (sum, item) => sum + item.highestTotalPrice);
  }

  double get potentialSavings {
    return highestCartTotal - lowestCartTotal;
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, List<CartItem>>((ref) {
  return CartNotifier(ref);
});
