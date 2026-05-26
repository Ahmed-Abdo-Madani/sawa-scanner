import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../l10n/app_localizations.dart';
import '../../providers/user_preferences_provider.dart';

class SubscriptionScreen extends ConsumerStatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  ConsumerState<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends ConsumerState<SubscriptionScreen> with SingleTickerProviderStateMixin {
  late AnimationController _checkController;
  late Animation<double> _checkScale;
  bool _showSuccessAnimation = false;

  @override
  void initState() {
    super.initState();
    _checkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _checkScale = CurvedAnimation(parent: _checkController, curve: Curves.elasticOut);
  }

  @override
  void dispose() {
    _checkController.dispose();
    super.dispose();
  }

  Future<void> _simulatePurchase() async {
    setState(() => _showSuccessAnimation = true);
    await _checkController.forward();
    await Future.delayed(const Duration(milliseconds: 1000));
    
    if (!mounted) return;
    
    final l10n = AppLocalizations.of(context)!;
    ref.read(userPreferencesProvider.notifier).setSubscribed(true);
    
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.subscribeMockSuccess),
        backgroundColor: Colors.green,
        behavior: SnackBarBehavior.floating,
      ),
    );
    Navigator.of(context).pop();
  }

  Future<void> _cancelSubscription() async {
    ref.read(userPreferencesProvider.notifier).setSubscribed(false);
    final l10n = AppLocalizations.of(context)!;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(l10n.freePlan),
        backgroundColor: AppColors.primary,
        behavior: SnackBarBehavior.floating,
      ),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final isSubscribed = ref.watch(userPreferencesProvider).isSubscribed;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          l10n.sawaPlus,
          style: AppTypography.headline(locale),
        ),
      ),
      body: Stack(
        children: [
          SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Premium Badge Header
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      colors: [
                        Colors.amber.shade400,
                        Colors.amber.shade700,
                      ],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.amber.withOpacity(0.3),
                        blurRadius: 16,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.star, size: 64, color: Colors.white),
                      const SizedBox(height: 16),
                      Text(
                        l10n.sawaPlus,
                        style: AppTypography.display(locale).copyWith(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        isSubscribed ? l10n.sawaPlusSubscriber : l10n.upgradeSawaPlusButton,
                        style: AppTypography.body(locale).copyWith(color: Colors.white.withOpacity(0.9), fontWeight: FontWeight.bold),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 32),

                // Features Title
                Text(
                  l10n.featuresTitle,
                  style: AppTypography.headline(locale).copyWith(fontSize: 20),
                ),
                const SizedBox(height: 16),

                // Feature Items
                _buildFeatureRow(
                  icon: Icons.flash_on,
                  title: l10n.unlimitedScans,
                  description: l10n.scanLimitMessage,
                  locale: locale,
                ),
                _buildFeatureRow(
                  icon: Icons.shopping_cart_outlined,
                  title: l10n.cartOptimizations,
                  description: l10n.featureCartDesc,
                  locale: locale,
                ),
                _buildFeatureRow(
                  icon: Icons.show_chart,
                  title: l10n.historicTrends,
                  description: l10n.unlockSawaPlus,
                  locale: locale,
                ),
                const Divider(height: 48, color: Colors.white10),

                // Technical Explanation Card
                Card(
                  color: AppColors.surface,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  elevation: 0,
                  child: Padding(
                    padding: const EdgeInsets.all(20.0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.info_outline, color: AppColors.primary),
                            const SizedBox(width: 8),
                            Text(
                              l10n.subscriptionExplanationTitle,
                              style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text(
                          l10n.subscriptionExplanationText,
                          style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.7), height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 40),

                // Action Button
                if (isSubscribed)
                  OutlinedButton(
                    onPressed: _cancelSubscription,
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: AppColors.error),
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    ),
                    child: Text(
                      l10n.cancel,
                      style: AppTypography.body(locale).copyWith(
                        color: AppColors.error,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  )
                else
                  ElevatedButton(
                    onPressed: _simulatePurchase,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.amber.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                    child: Text(
                      l10n.upgradeSawaPlusButton,
                      style: AppTypography.body(locale).copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                const SizedBox(height: 24),
              ],
            ),
          ),
          
          // Success Animation Overlay
          if (_showSuccessAnimation)
            Container(
              color: Colors.black.withOpacity(0.8),
              child: Center(
                child: ScaleTransition(
                  scale: _checkScale,
                  child: Container(
                    padding: const EdgeInsets.all(24),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.check,
                      size: 80,
                      color: Colors.green,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildFeatureRow({
    required IconData icon,
    required String title,
    required String description,
    required Locale locale,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: Colors.amber.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: Colors.amber.shade700, size: 24),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.6), height: 1.3),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
