import 'package:flutter/material.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/locale_provider.dart';
import '../../providers/user_preferences_provider.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../providers/auth_provider.dart';
import '../admin/admin_sign_in_screen.dart';
import '../admin/quick_entry_screen.dart';
import '../admin/missing_gtin_list_screen.dart';
import '../admin/products_gtin_edit_screen.dart';
import '../history/history_screen.dart';
import 'auth_screen.dart';
import 'subscription_screen.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final user = ref.watch(currentUserProvider).value;

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          l10n.profileTab,
          style: AppTypography.headline(locale),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _buildProfileHeader(context, locale, user),
          const SizedBox(height: 24),
          if (user == null || user.isAnonymous) ...[
            Card(
              elevation: 0,
              color: AppColors.primary.withOpacity(0.1),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      l10n.signInOrRegister,
                      style: AppTypography.body(locale).copyWith(fontWeight: FontWeight.bold, color: AppColors.primary),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      l10n.signInPrompt,
                      style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface.withOpacity(0.7)),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: () {
                        Navigator.push(context, MaterialPageRoute(builder: (_) => const AuthScreen()));
                      },
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        elevation: 0,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(
                        l10n.signIn,
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
          ],
          _buildSectionTitle(l10n.profile),
          const SizedBox(height: 8),
          _buildSettingsTile(
            context: context,
            icon: Icons.language,
            title: '${l10n.language} (${locale.languageCode == 'ar' ? l10n.arabic : l10n.english})',
            onTap: () {
              final newLocale = locale.languageCode == 'ar' ? 'en' : 'ar';
              ref.read(localeProvider.notifier).toggleLocale();
              ref.read(userPreferencesProvider.notifier).setPreferredLocale(newLocale);
            },
          ),
          _buildSettingsTile(
            context: context,
            icon: Icons.history,
            title: l10n.scanHistory,
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const HistoryScreen()),
              );
            },
          ),
          _buildSettingsTile(
            context: context,
            icon: Icons.security,
            title: l10n.privacyAndSecurity,
            onTap: () => _showPrivacySheet(context, ref),
          ),
          const SizedBox(height: 24),
          _buildSectionTitle(l10n.sawaPlus),
          const SizedBox(height: 8),
          _buildSettingsTile(
            context: context,
            icon: Icons.star_outline,
            title: l10n.manageSubscription,
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const SubscriptionScreen()),
              );
            },
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: (ref.watch(userPreferencesProvider).isSubscribed ? Colors.amber : AppColors.primary).withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                ref.watch(userPreferencesProvider).isSubscribed ? l10n.sawaPlusSubscriber : l10n.freePlan,
                style: AppTypography.caption(locale).copyWith(
                  color: ref.watch(userPreferencesProvider).isSubscribed ? Colors.amber.shade700 : AppColors.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          if (user != null && user.email == 'toni91994@gmail.com') ...[
            const SizedBox(height: 24),
            _buildSectionTitle(l10n.adminTools),
            const SizedBox(height: 8),
            _buildSettingsTile(
              context: context,
              icon: Icons.edit_note,
              title: l10n.quickEntry,
              onTap: () {
                if (ref.read(currentUserProvider).value != null) {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const QuickEntryScreen()));
                } else {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminSignInScreen(targetScreen: AdminTargetScreen.quickEntry)));
                }
              },
            ),
            _buildSettingsTile(
              context: context,
              icon: Icons.list_alt,
              title: l10n.missingGtinList,
              onTap: () {
                if (ref.read(currentUserProvider).value != null) {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const MissingGtinListScreen()));
                } else {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminSignInScreen(targetScreen: AdminTargetScreen.missingGtinList)));
                }
              },
            ),
            _buildSettingsTile(
              context: context,
              icon: Icons.qr_code_scanner,
              title: l10n.browseHsProducts,
              onTap: () {
                if (ref.read(currentUserProvider).value != null) {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const ProductsGtinEditScreen()));
                } else {
                  Navigator.push(context, MaterialPageRoute(builder: (_) => const AdminSignInScreen(targetScreen: AdminTargetScreen.quickEntry)));
                }
              },
            ),
          ],
          if (user != null && !user.isAnonymous) ...[
            const SizedBox(height: 16),
            _buildSettingsTile(
              context: context,
              icon: Icons.delete_forever,
              title: l10n.deleteAccount,
              iconColor: AppColors.error,
              textColor: AppColors.error,
              onTap: () {
                _confirmDeleteAccount(context, ref, fromSheet: false);
              },
            ),
            _buildSettingsTile(
              context: context,
              icon: Icons.logout,
              title: l10n.signOut,
              onTap: () {
                ref.read(authDataSourceProvider).signOut();
              },
            ),
          ],
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  Widget _buildProfileHeader(BuildContext context, Locale locale, dynamic user) {
    final l10n = AppLocalizations.of(context)!;
    final email = user?.email ?? l10n.userName;
    final displayName = user?.displayName ?? '';

    return Row(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: const BoxDecoration(
            shape: BoxShape.circle,
            color: AppColors.surface,
          ),
          child: const Icon(Icons.person, size: 40, color: AppColors.onSurface),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              displayName.isNotEmpty ? displayName : email,
              style: AppTypography.body(locale).copyWith(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            if (displayName.isNotEmpty)
              Text(
                email,
                style: AppTypography.caption(locale).copyWith(color: AppColors.onSurface),
              ),
          ],
        ),
      ],
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      child: Text(
        title,
        style: const TextStyle(
          fontWeight: FontWeight.bold,
          color: AppColors.primary,
          fontSize: 14,
        ),
      ),
    );
  }

  Widget _buildSettingsTile({
    required BuildContext context,
    required IconData icon,
    required String title,
    required VoidCallback onTap,
    Widget? trailing,
    Color? iconColor,
    Color? textColor,
  }) {
    return ListTile(
      leading: Icon(icon, color: iconColor ?? AppColors.onBackground),
      title: Text(
        title,
        style: AppTypography.body(Localizations.localeOf(context)).copyWith(
          color: textColor,
        ),
      ),
      trailing: trailing ?? Icon(Icons.chevron_right, size: 20, color: iconColor),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );
  }

  void _showPrivacySheet(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final user = FirebaseAuth.instance.currentUser;

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text(
                l10n.privacyCommitmentTitle,
                style: AppTypography.headline(locale).copyWith(fontSize: 20),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              Card(
                color: Colors.white.withOpacity(0.04),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                elevation: 0,
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Text(
                    l10n.privacyCommitmentText,
                    style: AppTypography.body(locale).copyWith(height: 1.4, color: AppColors.onSurface.withOpacity(0.8)),
                  ),
                ),
              ),
              if (user != null) ...[
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  onPressed: () => _confirmDeleteAccount(context, ref, fromSheet: true),
                  icon: const Icon(Icons.delete_forever, color: Colors.white),
                  label: Text(
                    l10n.deleteAccount,
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.error,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _confirmDeleteAccount(BuildContext context, WidgetRef ref, {required bool fromSheet}) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    showDialog(
      context: context,
      builder: (context) {
        return AlertDialog(
          backgroundColor: AppColors.surface,
          title: Text(l10n.confirmDelete, style: AppTypography.headline(locale)),
          content: Text(l10n.deleteAccountConfirm, style: AppTypography.body(locale)),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(l10n.keepAccount, style: TextStyle(color: AppColors.primary)),
            ),
            TextButton(
              onPressed: () async {
                Navigator.of(context).pop(); // pop dialog
                if (fromSheet) {
                  Navigator.of(context).pop(); // pop sheet
                }
                try {
                  final user = FirebaseAuth.instance.currentUser;
                  if (user != null) {
                    await user.delete();
                    await ref.read(authDataSourceProvider).signOut();
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(l10n.deleteAccountSuccess),
                        backgroundColor: Colors.green,
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  }
                } on FirebaseAuthException catch (e) {
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(e.message ?? l10n.serverError),
                      backgroundColor: AppColors.error,
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                }
              },
              child: Text(l10n.yesDelete, style: const TextStyle(color: AppColors.error, fontWeight: FontWeight.bold)),
            ),
          ],
        );
      },
    );
  }
}
