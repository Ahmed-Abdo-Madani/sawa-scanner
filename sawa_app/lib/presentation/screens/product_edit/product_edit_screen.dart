import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:sawa_app/l10n/app_localizations.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../domain/entities/product.dart';
import '../../providers/product_provider.dart';
import '../_shared/product_form_widgets.dart';

class ProductEditScreen extends ConsumerStatefulWidget {
  /// Existing product to pre-fill (edit flow).
  final Product? product;

  /// Barcode to pre-fill when no product exists yet (contribute flow).
  final String? barcode;

  const ProductEditScreen({super.key, this.product, this.barcode})
      : assert(product != null || barcode != null,
            'Either product or barcode must be provided');

  @override
  ConsumerState<ProductEditScreen> createState() => _ProductEditScreenState();
}

class _ProductEditScreenState extends ConsumerState<ProductEditScreen> {
  final _formKey = GlobalKey<FormState>();
  bool _isSubmitting = false;

  // ── Basic info controllers ─────────────────────────────────────────────────
  late final TextEditingController _nameArCtrl;
  late final TextEditingController _nameEnCtrl;
  late final TextEditingController _brandCtrl;

  // ── Nutrition controllers ──────────────────────────────────────────────────
  late final TextEditingController _energyCtrl;
  late final TextEditingController _fatCtrl;
  late final TextEditingController _satFatCtrl;
  late final TextEditingController _carbsCtrl;
  late final TextEditingController _sugarsCtrl;
  late final TextEditingController _fiberCtrl;
  late final TextEditingController _proteinCtrl;
  late final TextEditingController _sodiumCtrl;

  // ── Ingredients controller ─────────────────────────────────────────────────
  late final TextEditingController _ingredientsTextCtrl;

  // ── Photo selection: store the XFile and decoded bytes for cross-platform
  //    preview (avoids dart:io File / Image.file which breaks web targets).  ─
  XFile? _frontPhoto;
  Uint8List? _frontBytes;

  XFile? _ingredientsPhoto;
  Uint8List? _ingredientsBytes;

  XFile? _nutritionPhoto;
  Uint8List? _nutritionBytes;

  final ImagePicker _picker = ImagePicker();

  String get _gtin => widget.product?.gtin ?? widget.barcode!;

  @override
  void initState() {
    super.initState();
    final p = widget.product;
    final nf = p?.nutritionFact;

    _nameArCtrl = TextEditingController(text: p?.nameAr ?? '');
    _nameEnCtrl = TextEditingController(text: p?.nameEn ?? '');
    _brandCtrl = TextEditingController(text: p?.brand ?? '');

    _energyCtrl =
        TextEditingController(text: nf?.energyKcal?.toStringAsFixed(0) ?? '');
    _fatCtrl =
        TextEditingController(text: nf?.fatG?.toStringAsFixed(1) ?? '');
    _satFatCtrl =
        TextEditingController(text: nf?.saturatedFatG?.toStringAsFixed(1) ?? '');
    _carbsCtrl =
        TextEditingController(text: nf?.carbsG?.toStringAsFixed(1) ?? '');
    _sugarsCtrl =
        TextEditingController(text: nf?.sugarsG?.toStringAsFixed(1) ?? '');
    _fiberCtrl =
        TextEditingController(text: nf?.fiberG?.toStringAsFixed(1) ?? '');
    _proteinCtrl =
        TextEditingController(text: nf?.proteinG?.toStringAsFixed(1) ?? '');
    _sodiumCtrl =
        TextEditingController(text: nf?.sodiumMg?.toStringAsFixed(0) ?? '');

    _ingredientsTextCtrl =
        TextEditingController(text: p?.ingredientsText ?? '');
  }

  @override
  void dispose() {
    for (final ctrl in [
      _nameArCtrl,
      _nameEnCtrl,
      _brandCtrl,
      _energyCtrl,
      _fatCtrl,
      _satFatCtrl,
      _carbsCtrl,
      _sugarsCtrl,
      _fiberCtrl,
      _proteinCtrl,
      _sodiumCtrl,
      _ingredientsTextCtrl,
    ]) {
      ctrl.dispose();
    }
    super.dispose();
  }

  // ── Photo picking ──────────────────────────────────────────────────────────

  /// Reads the XFile bytes immediately after picking so previews work on all
  /// platforms (including web, which has no dart:io File).
  Future<void> _pickPhoto(ImageSource source, String slot) async {
    final picked = await _picker.pickImage(source: source, imageQuality: 85);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() {
      if (slot == 'front') {
        _frontPhoto = picked;
        _frontBytes = bytes;
      } else if (slot == 'ingredients') {
        _ingredientsPhoto = picked;
        _ingredientsBytes = bytes;
      } else if (slot == 'nutrition') {
        _nutritionPhoto = picked;
        _nutritionBytes = bytes;
      }
    });
  }

  void _showPhotoBottomSheet(BuildContext context, String slot) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt, color: AppColors.primary),
                title: Text(l10n.takePhoto, style: AppTypography.body(locale)),
                onTap: () {
                  Navigator.pop(context);
                  _pickPhoto(ImageSource.camera, slot);
                },
              ),
              ListTile(
                leading:
                    const Icon(Icons.photo_library, color: AppColors.primary),
                title: Text(l10n.chooseFromGallery,
                    style: AppTypography.body(locale)),
                onTap: () {
                  Navigator.pop(context);
                  _pickPhoto(ImageSource.gallery, slot);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  /// Returns a map of slot → XFile for any photos the user has selected.
  Map<String, XFile> _collectPhotos() {
    final photos = <String, XFile>{};
    if (_frontPhoto != null) photos['front'] = _frontPhoto!;
    if (_ingredientsPhoto != null) photos['ingredients'] = _ingredientsPhoto!;
    if (_nutritionPhoto != null) photos['nutrition'] = _nutritionPhoto!;
    return photos;
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    final l10n = AppLocalizations.of(context)!;

    setState(() => _isSubmitting = true);

    final payload = <String, dynamic>{
      'name_ar': _nameArCtrl.text.trim(),
      'name_en': _nameEnCtrl.text.trim(),
      'brand': _brandCtrl.text.trim(),
      'nutrition': {
        'energy_kcal': double.tryParse(_energyCtrl.text),
        'fat_g': double.tryParse(_fatCtrl.text),
        'saturated_fat_g': double.tryParse(_satFatCtrl.text),
        'carbs_g': double.tryParse(_carbsCtrl.text),
        'sugars_g': double.tryParse(_sugarsCtrl.text),
        'fiber_g': double.tryParse(_fiberCtrl.text),
        'protein_g': double.tryParse(_proteinCtrl.text),
        'sodium_mg': double.tryParse(_sodiumCtrl.text),
      },
      'ingredients_text': _ingredientsTextCtrl.text.trim(),
    };

    try {
      final repo = ref.read(productRepositoryProvider);

      // Step 1: Upload photos via multipart if any were selected.
      // Returns slot → data-URL from the server; stored as lightweight
      // references in the jsonb payload — not raw binary bytes.
      Map<String, String>? imageUrls;
      final photos = _collectPhotos();
      if (photos.isNotEmpty) {
        imageUrls = await repo.uploadReportImages(_gtin, photos);
      }

      // Step 2: Submit the structured JSON report with optional image refs.
      await repo.submitProductReport(
        _gtin,
        payload,
        imageUrls: imageUrls,
        photos: photos,
      );


      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.productSubmitted),
          backgroundColor: AppColors.primary,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
      Navigator.pop(context);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.serverError),
          backgroundColor: AppColors.error,
          behavior: SnackBarBehavior.floating,
        ),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);
    final isEditing = widget.product != null;

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          backgroundColor: AppColors.background,
          elevation: 0,
          scrolledUnderElevation: 0,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back, color: AppColors.onBackground),
            onPressed: () => Navigator.pop(context),
          ),
          title: Text(
            isEditing ? l10n.editProduct : l10n.addProduct,
            style: AppTypography.headline(locale)
                .copyWith(color: AppColors.onBackground, fontSize: 20),
          ),
          bottom: TabBar(
            labelColor: AppColors.primary,
            unselectedLabelColor: AppColors.onSurface,
            indicatorColor: AppColors.primary,
            labelStyle: AppTypography.caption(locale)
                .copyWith(fontWeight: FontWeight.bold),
            tabs: [
              Tab(text: l10n.basicInfo),
              Tab(text: l10n.nutritionFacts_tab),
              Tab(text: l10n.ingredients_tab),
              Tab(text: l10n.photos),
            ],
          ),
        ),
        body: Form(
          key: _formKey,
          child: Column(
            children: [
              Expanded(
                child: TabBarView(
                  children: [
                    _buildBasicInfoTab(l10n, locale),
                    _buildNutritionTab(l10n, locale),
                    _buildIngredientsTab(l10n, locale),
                    _buildPhotosTab(context, l10n, locale),
                  ],
                ),
              ),
              _buildSubmitButton(l10n, locale),
            ],
          ),
        ),
      ),
    );
  }

  // ── Tab 1: Basic Info ──────────────────────────────────────────────────────
  Widget _buildBasicInfoTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        buildProductLabel(l10n.nameAr, locale),
        buildProductTextField(context, _nameArCtrl, textDirection: TextDirection.rtl),
        const SizedBox(height: 20),
        buildProductLabel(l10n.nameEn, locale),
        buildProductTextField(context, _nameEnCtrl),
        const SizedBox(height: 20),
        buildProductLabel(l10n.brand, locale),
        buildProductTextField(context, _brandCtrl),
        const SizedBox(height: 20),
        buildProductLabel(l10n.gtinBarcode, locale),
        buildProductTextField(
          context,
          TextEditingController(text: _gtin),
          readOnly: true,
        ),
      ],
    );
  }

  // ── Tab 2: Nutrition ───────────────────────────────────────────────────────
  Widget _buildNutritionTab(AppLocalizations l10n, Locale locale) {
    final fields = [
      (l10n.calories, _energyCtrl, 'kcal'),
      (l10n.fat, _fatCtrl, 'g'),
      (l10n.saturatedFat, _satFatCtrl, 'g'),
      (l10n.carbs, _carbsCtrl, 'g'),
      (l10n.sugars, _sugarsCtrl, 'g'),
      (l10n.fiber, _fiberCtrl, 'g'),
      (l10n.protein, _proteinCtrl, 'g'),
      (l10n.sodium, _sodiumCtrl, 'mg'),
    ];

    return buildNutritionFields(context, fields, locale);
  }

  // ── Tab 3: Ingredients ─────────────────────────────────────────────────────
  Widget _buildIngredientsTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        buildProductLabel(l10n.ingredients_tab, locale),
        TextFormField(
          controller: _ingredientsTextCtrl,
          maxLines: 8,
          style:
              AppTypography.body(locale).copyWith(color: AppColors.onBackground),
          decoration: InputDecoration(
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
              borderSide: BorderSide.none,
            ),
            hintText: l10n.enterIngredientsList,
            hintStyle: AppTypography.body(locale)
                .copyWith(color: AppColors.onSurface),
          ),
        ),
      ],
    );
  }

  // ── Tab 4: Photos ──────────────────────────────────────────────────────────
  Widget _buildPhotosTab(
      BuildContext context, AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        buildPhotoSlot(
            context, l10n.frontPhoto, 'front', _frontPhoto, _frontBytes, locale, (s) => _showPhotoBottomSheet(context, s)),
        const SizedBox(height: 16),
        buildPhotoSlot(context, l10n.ingredientsPhoto, 'ingredients',
            _ingredientsPhoto, _ingredientsBytes, locale, (s) => _showPhotoBottomSheet(context, s)),
        const SizedBox(height: 16),
        buildPhotoSlot(context, l10n.nutritionPhoto, 'nutrition',
            _nutritionPhoto, _nutritionBytes, locale, (s) => _showPhotoBottomSheet(context, s)),
      ],
    );
  }


  Widget _buildSubmitButton(AppLocalizations l10n, Locale locale) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton(
          onPressed: _isSubmitting ? null : _submit,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            disabledBackgroundColor: AppColors.primary.withOpacity(0.5),
            padding: const EdgeInsets.symmetric(vertical: 18),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            elevation: 0,
          ),
          child: _isSubmitting
              ? const SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : Text(
                  l10n.submitProduct,
                  style: AppTypography.body(locale).copyWith(
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                ),
        ),
      ),
    );
  }
}
