import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';
import '../../core/iap_config.dart';
import 'user_preferences_provider.dart';

class IapState {
  final bool isLoading;
  final List<ProductDetails> products;
  final String? errorMessage;
  final bool hasRestored;

  IapState({
    this.isLoading = false,
    this.products = const [],
    this.errorMessage,
    this.hasRestored = false,
  });

  IapState copyWith({
    bool? isLoading,
    List<ProductDetails>? products,
    String? errorMessage,
    bool? hasRestored,
  }) {
    return IapState(
      isLoading: isLoading ?? this.isLoading,
      products: products ?? this.products,
      errorMessage: errorMessage,
      hasRestored: hasRestored ?? this.hasRestored,
    );
  }
}

class IapNotifier extends StateNotifier<IapState> {
  final Ref _ref;
  final InAppPurchase _iap = InAppPurchase.instance;
  late StreamSubscription<List<PurchaseDetails>> _subscription;

  IapNotifier(this._ref) : super(IapState()) {
    final purchaseUpdated = _iap.purchaseStream;
    _subscription = purchaseUpdated.listen(
      _onPurchaseUpdate,
      onError: _onPurchaseError,
    );
  }

  @override
  void dispose() {
    _subscription.cancel();
    super.dispose();
  }

  Future<void> loadProducts() async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final bool isAvailable = await _iap.isAvailable();
      if (!isAvailable) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'store_unavailable',
        );
        return;
      }

      final ProductDetailsResponse response = await _iap.queryProductDetails(
        {IapConfig.subscriptionProductId},
      );

      if (response.notFoundIDs.isNotEmpty) {
        debugPrint('Product IDs not found: ${response.notFoundIDs}');
      }

      state = state.copyWith(
        isLoading: false,
        products: response.productDetails,
        errorMessage: response.productDetails.isEmpty ? 'products_not_found' : null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  Future<void> buySubscription(ProductDetails product) async {
    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final PurchaseParam purchaseParam = PurchaseParam(productDetails: product);
      await _iap.buyNonConsumable(purchaseParam: purchaseParam);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  Future<void> restorePurchases() async {
    state = state.copyWith(isLoading: true, errorMessage: null, hasRestored: false);
    try {
      await _iap.restorePurchases();
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: e.toString(),
      );
    }
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }

  void resetRestoreFlag() {
    state = state.copyWith(hasRestored: false);
  }

  Future<void> _onPurchaseUpdate(List<PurchaseDetails> purchaseDetailsList) async {
    for (final purchaseDetails in purchaseDetailsList) {
      if (purchaseDetails.status == PurchaseStatus.pending) {
        state = state.copyWith(isLoading: true);
      } else if (purchaseDetails.status == PurchaseStatus.error) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: purchaseDetails.error?.message ?? 'purchase_error',
        );
        if (purchaseDetails.pendingCompletePurchase) {
          await _iap.completePurchase(purchaseDetails);
        }
      } else if (purchaseDetails.status == PurchaseStatus.purchased ||
                 purchaseDetails.status == PurchaseStatus.restored) {
        state = state.copyWith(isLoading: false);
        await _ref.read(userPreferencesProvider.notifier).setSubscribed(true);
        
        if (purchaseDetails.status == PurchaseStatus.restored) {
          state = state.copyWith(hasRestored: true);
        }

        if (purchaseDetails.pendingCompletePurchase) {
          await _iap.completePurchase(purchaseDetails);
        }
      } else if (purchaseDetails.status == PurchaseStatus.canceled) {
        state = state.copyWith(isLoading: false);
        if (purchaseDetails.pendingCompletePurchase) {
          await _iap.completePurchase(purchaseDetails);
        }
      }
    }
  }

  void _onPurchaseError(Object error) {
    state = state.copyWith(
      isLoading: false,
      errorMessage: error.toString(),
    );
  }
}

final iapProvider = StateNotifierProvider<IapNotifier, IapState>((ref) {
  return IapNotifier(ref);
});
