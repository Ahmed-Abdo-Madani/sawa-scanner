import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../providers/scan_history_provider.dart';
import '../../widgets/nutri_score_badge.dart';
import '../product_detail/product_detail_screen.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';

class HistoryScreen extends ConsumerWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final history = ref.watch(scanHistoryProvider);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(
          l10n.scanHistory,
          style: AppTypography.headline(locale),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        actions: [
          if (history.isNotEmpty)
            IconButton(
              icon: const Icon(Icons.delete_sweep_outlined, color: AppColors.onSurface),
              tooltip: l10n.clearHistory,
              onPressed: () => _confirmClear(context, ref, l10n),
            ),
        ],
      ),
      body: history.isEmpty
          ? _buildEmptyState(l10n, locale)
          : _buildHistoryList(history, l10n, locale, ref),
    );
  }

  Widget _buildEmptyState(AppLocalizations l10n, Locale locale) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.history_toggle_off, size: 64, color: AppColors.onSurface.withOpacity(0.5)),
          const SizedBox(height: 16),
          Text(
            l10n.noHistory,
            style: AppTypography.body(locale).copyWith(color: AppColors.onSurface),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryList(List<ScanHistoryEntry> history, AppLocalizations l10n, Locale locale, WidgetRef ref) {
    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: history.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        final entry = history[index];
        return Dismissible(
          key: Key(entry.barcode + entry.scannedAt.toString()),
          direction: DismissDirection.endToStart,
          background: Container(
            alignment: AlignmentDirectional.centerEnd,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            decoration: BoxDecoration(
              color: AppColors.error.withOpacity(0.8),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(Icons.delete, color: Colors.white),
          ),
          onDismissed: (_) {
            ref.read(scanHistoryProvider.notifier).removeEntry(entry.barcode);
          },
          child: _HistoryCard(entry: entry),
        );
      },
    );
  }

  void _confirmClear(BuildContext context, WidgetRef ref, AppLocalizations l10n) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.clearHistory),
        content: Text(l10n.clearHistoryConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(l10n.cancel),
          ),
          TextButton(
            onPressed: () {
              ref.read(scanHistoryProvider.notifier).clearAll();
              Navigator.pop(context);
            },
            child: Text(l10n.clear, style: const TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  final ScanHistoryEntry entry;

  const _HistoryCard({required this.entry});

  @override
  Widget build(BuildContext context) {
    final locale = Localizations.localeOf(context);
    final l10n = AppLocalizations.of(context)!;
    final theme = Theme.of(context);

    // Format date: "Today", "Yesterday", or "Oct 12"
    final dateStr = _formatDate(entry.scannedAt, locale, l10n);

    return InkWell(
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => ProductDetailScreen(gtin: entry.barcode),
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
              width: 70,
              height: 70,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Padding(
                padding: const EdgeInsets.all(8.0),
                child: entry.imageUrl != null
                    ? Image.network(entry.imageUrl!, fit: BoxFit.contain)
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
                    entry.brand,
                    style: AppTypography.caption(locale).copyWith(
                      color: theme.colorScheme.secondary,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    entry.productName,
                    style: AppTypography.body(locale).copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      if (entry.nutriScore != null) ...[
                        _buildMiniNutriScore(entry.nutriScore!),
                        const SizedBox(width: 8),
                      ],
                      Text(
                        l10n.scannedOn(dateStr),
                        style: AppTypography.caption(locale).copyWith(
                          color: AppColors.onSurface.withOpacity(0.6),
                          fontSize: 10,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Icon(
              Localizations.localeOf(context).languageCode == 'ar'
                  ? Icons.chevron_left
                  : Icons.chevron_right,
              color: AppColors.onSurface,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMiniNutriScore(String grade) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: _getNutriColor(grade).withOpacity(0.1),
        borderRadius: BorderRadius.circular(4),
        border: Border.all(color: _getNutriColor(grade).withOpacity(0.4)),
      ),
      child: Text(
        grade.toUpperCase(),
        style: TextStyle(
          color: _getNutriColor(grade),
          fontWeight: FontWeight.bold,
          fontSize: 10,
        ),
      ),
    );
  }

  Color _getNutriColor(String grade) {
    switch (grade.toLowerCase()) {
      case 'a': return const Color(0xFF038141);
      case 'b': return const Color(0xFF85BB2F);
      case 'c': return const Color(0xFFFECB02);
      case 'd': return const Color(0xFFEE8100);
      case 'e': return const Color(0xFFE63E11);
      default: return Colors.grey;
    }
  }

  String _formatDate(DateTime date, Locale locale, AppLocalizations l10n) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final scanDate = DateTime(date.year, date.month, date.day);

    if (scanDate == today) {
      return l10n.today;
    } else if (scanDate == yesterday) {
      return l10n.yesterday;
    } else {
      return DateFormat.MMMd(locale.languageCode).format(date);
    }
  }
}
