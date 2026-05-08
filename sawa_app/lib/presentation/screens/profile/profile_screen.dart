import 'package:flutter/material.dart';
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

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final isAdmin = ref.watch(isAdminProvider).value ?? false;
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
          const SizedBox(height: 32),
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
            icon: Icons.notifications_none,
            title: l10n.notifications,
            onTap: () {},
          ),
          _buildSettingsTile(
            context: context,
            icon: Icons.security,
            title: l10n.privacyAndSecurity,
            onTap: () {},
          ),
          const SizedBox(height: 24),
          _buildSectionTitle(l10n.sawaPlus),
          const SizedBox(height: 8),
          _buildSettingsTile(
            context: context,
            icon: Icons.star_outline,
            title: l10n.manageSubscription,
            onTap: () {},
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                l10n.freePlan,
                style: AppTypography.caption(locale).copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          if (isAdmin || user == null) ...[
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
          ],
          const SizedBox(height: 24),
          _buildSectionTitle(l10n.yourPreferences),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              children: PreferenceOptions.dietary.map((option) =>
                _buildPreferenceChip(ref, option.id, option.labelOf(l10n)),
              ).toList(),
            ),
          ),
          const SizedBox(height: 24),
          _buildSectionTitle(l10n.yourAllergens),
          const SizedBox(height: 8),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              children: PreferenceOptions.allergens.map((option) =>
                _buildAllergenChip(ref, option.id, option.labelOf(l10n)),
              ).toList(),
            ),
          ),
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
  }) {
    return ListTile(
      leading: Icon(icon, color: AppColors.onBackground),
      title: Text(title, style: AppTypography.body(Localizations.localeOf(context))),
      trailing: trailing ?? const Icon(Icons.chevron_right, size: 20),
      onTap: onTap,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    );
  }

  Widget _buildPreferenceChip(WidgetRef ref, String key, String label) {
    final isSelected = ref.watch(userPreferencesProvider).dietaryPreferences.contains(key);
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => ref.read(userPreferencesProvider.notifier).toggleDietaryPreference(key),
      selectedColor: AppColors.primary.withOpacity(0.2),
      checkmarkColor: AppColors.primary,
    );
  }

  Widget _buildAllergenChip(WidgetRef ref, String key, String label) {
    final isSelected = ref.watch(userPreferencesProvider).allergenFilters.contains(key);
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => ref.read(userPreferencesProvider.notifier).toggleAllergenFilter(key),
      selectedColor: AppColors.error.withOpacity(0.1),
      checkmarkColor: AppColors.error,
    );
  }
}
