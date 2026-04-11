import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../providers/locale_provider.dart';

class ThemeShowcaseScreen extends ConsumerWidget {
  const ThemeShowcaseScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(localeProvider);
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.themeShowcaseTitle),
        actions: [
          IconButton(
            icon: const Icon(Icons.language),
            onPressed: () {
              ref.read(localeProvider.notifier).toggleLocale();
            },
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l10n.colorSwatches),
            const SizedBox(height: 16),
            Wrap(
              spacing: 16,
              runSpacing: 16,
              children: [
                _ColorSwatch(color: AppColors.background, name: l10n.colorBackground),
                _ColorSwatch(color: AppColors.surface, name: l10n.colorSurface),
                _ColorSwatch(color: AppColors.primary, name: l10n.colorPrimary),
                _ColorSwatch(color: AppColors.secondary, name: l10n.colorSecondary),
                _ColorSwatch(color: AppColors.error, name: l10n.colorError),
                _ColorSwatch(color: AppColors.warning, name: l10n.colorWarning),
                _ColorSwatch(color: AppColors.onBackground, name: l10n.colorOnBackground),
                _ColorSwatch(color: AppColors.onSurface, name: l10n.colorOnSurface),
              ],
            ),
            const SizedBox(height: 32),
            Text(l10n.typographyScaleEn),
            const SizedBox(height: 16),
            _TypographyRow(label: l10n.labelDisplay, style: AppTypography.display(const Locale('en')), text: l10n.fontMeta('Plus Jakarta Sans', 'w800', '32')),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelHeadline, style: AppTypography.headline(const Locale('en')), text: l10n.fontMeta('Plus Jakarta Sans', 'w700', '22')),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelBody, style: AppTypography.body(const Locale('en')), text: l10n.fontMeta('Plus Jakarta Sans', 'w400', '15')),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelCaption, style: AppTypography.caption(const Locale('en')), text: l10n.fontMeta('Plus Jakarta Sans', 'w400', '12')),
            
            const SizedBox(height: 32),
            Text(l10n.typographyScaleAr, textDirection: TextDirection.rtl),
            const SizedBox(height: 16),
            _TypographyRow(label: l10n.labelDisplay, style: AppTypography.display(const Locale('ar')), text: l10n.fontMeta('IBM Plex Sans Arabic', 'w700', '32'), isRtl: true),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelHeadline, style: AppTypography.headline(const Locale('ar')), text: l10n.fontMeta('IBM Plex Sans Arabic', 'w600', '22'), isRtl: true),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelBody, style: AppTypography.body(const Locale('ar')), text: l10n.fontMeta('IBM Plex Sans Arabic', 'w400', '15'), isRtl: true),
            const SizedBox(height: 8),
            _TypographyRow(label: l10n.labelCaption, style: AppTypography.caption(const Locale('ar')), text: l10n.fontMeta('IBM Plex Sans Arabic', 'w400', '12'), isRtl: true),

            const SizedBox(height: 32),
            Text(l10n.colorSurface),
            const SizedBox(height: 16),
            Card(
              elevation: 0,
              margin: EdgeInsets.zero,
              clipBehavior: Clip.antiAlias,
              color: AppColors.surface,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(l10n.appTitle, style: AppTypography.headline(locale).copyWith(color: AppColors.onBackground)),
                    const SizedBox(height: 8),
                    Text(l10n.colorSurface, style: AppTypography.body(locale).copyWith(color: AppColors.onSurface)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            Text(l10n.gradeBadgesPreview),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _GradeBadge(label: 'A', color: AppColors.secondary),
                _GradeBadge(label: 'B', color: Colors.lightGreen),
                _GradeBadge(label: 'C', color: Colors.orange),
                _GradeBadge(label: 'D', color: AppColors.warning),
                _GradeBadge(label: 'E', color: AppColors.error),
              ],
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => ref.read(localeProvider.notifier).toggleLocale(),
        label: Text(l10n.scanNow),
        icon: const Icon(Icons.qr_code_scanner),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
      ),
    );
  }
}

class _ColorSwatch extends StatelessWidget {
  final Color color;
  final String name;

  const _ColorSwatch({required this.color, required this.name});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 60,
          height: 60,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.black12),
          ),
        ),
        const SizedBox(height: 8),
        Text(name, style: const TextStyle(fontSize: 12, color: AppColors.onSurface)),
        Text(
          color.value.toRadixString(16).toUpperCase(),
          style: const TextStyle(fontSize: 10, color: AppColors.onSurface),
        ),
      ],
    );
  }
}

class _TypographyRow extends StatelessWidget {
  final String label;
  final TextStyle style;
  final String text;
  final bool isRtl;

  const _TypographyRow({required this.label, required this.style, required this.text, this.isRtl = false});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: isRtl ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      children: [
        Text(text, style: const TextStyle(fontSize: 10, color: AppColors.onSurface)),
        Text(label, style: style.copyWith(color: AppColors.onBackground), textDirection: isRtl ? TextDirection.rtl : TextDirection.ltr),
      ],
    );
  }
}

class _GradeBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _GradeBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(24),
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 20,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
