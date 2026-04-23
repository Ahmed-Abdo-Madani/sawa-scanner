import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import 'scanner/scanner_screen.dart';
import 'history/history_screen.dart';
import 'profile/profile_screen.dart';
import '../../../core/theme/app_colors.dart';
import '../providers/navigation_provider.dart';

class NavigationShell extends ConsumerStatefulWidget {
  const NavigationShell({super.key});

  @override
  ConsumerState<NavigationShell> createState() => _NavigationShellState();
}

class _NavigationShellState extends ConsumerState<NavigationShell> {
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final currentIndex = ref.watch(navigationProvider);

    final List<Widget> screens = [
      ScannerScreen(showBackButton: false, isActive: currentIndex == 0),
      const HistoryScreen(),
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
            icon: const Icon(Icons.qr_code_scanner_outlined),
            selectedIcon: const Icon(Icons.qr_code_scanner, color: AppColors.primary),
            label: l10n.scanTab,
          ),
          NavigationDestination(
            icon: const Icon(Icons.history_outlined),
            selectedIcon: const Icon(Icons.history, color: AppColors.primary),
            label: l10n.historyTab,
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
