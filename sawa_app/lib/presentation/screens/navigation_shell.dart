import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'scanner/scanner_screen.dart';
import 'profile/profile_screen.dart';
import 'cart/cart_screen.dart';
import '../../../core/theme/app_colors.dart';
import '../providers/navigation_provider.dart';
import '../providers/user_preferences_provider.dart';
import '../widgets/paywall_dialog.dart';

final hasShownSubscriptionPromoProvider = StateProvider<bool>((ref) => false);

class NavigationShell extends ConsumerStatefulWidget {
  const NavigationShell({super.key});

  @override
  ConsumerState<NavigationShell> createState() => _NavigationShellState();
}

class _NavigationShellState extends ConsumerState<NavigationShell> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkAndShowPromo();
    });
  }

  void _checkAndShowPromo() {
    if (!mounted) return;
    final prefs = ref.read(userPreferencesProvider);
    final hasShownPromo = ref.read(hasShownSubscriptionPromoProvider);

    if (!prefs.isSubscribed && !hasShownPromo) {
      ref.read(hasShownSubscriptionPromoProvider.notifier).state = true;
      _showPromoDialog();
    }
  }

  void _showPromoDialog() {
    showDialog(
      context: context,
      barrierDismissible: true,
      builder: (BuildContext context) {
        return const SawaPlusPaywallDialog();
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final currentIndex = ref.watch(navigationProvider);

    final List<Widget> screens = [
      const CartScreen(),
      ScannerScreen(showBackButton: false, isActive: currentIndex == 1),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: IndexedStack(
        index: currentIndex,
        children: screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: currentIndex,
        onDestinationSelected: (int index) {
          ref.read(navigationProvider.notifier).state = index;
        },
        indicatorColor: AppColors.primary.withOpacity(0.12),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.shopping_cart_outlined),
            selectedIcon: const Icon(Icons.shopping_cart, color: AppColors.primary),
            label: l10n.cartTab,
          ),
          NavigationDestination(
            icon: const Icon(Icons.qr_code_scanner_outlined),
            selectedIcon: const Icon(Icons.qr_code_scanner, color: AppColors.primary),
            label: l10n.scanTab,
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person, color: AppColors.primary),
            label: l10n.profileTab,
          ),
        ],
      ),
    );
  }
}
