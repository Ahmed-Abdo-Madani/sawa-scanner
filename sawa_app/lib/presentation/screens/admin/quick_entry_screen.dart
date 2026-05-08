import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:image_picker/image_picker.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../l10n/app_localizations.dart';
import '../../providers/auth_provider.dart';
import '../../providers/user_preferences_provider.dart';
import '../_shared/product_form_widgets.dart';
import '../../../data/models/admin_product_dto.dart';

class QuickEntryScreen extends ConsumerStatefulWidget {
  final String? initialGtin;

  const QuickEntryScreen({super.key, this.initialGtin});

  @override
  ConsumerState<QuickEntryScreen> createState() => _QuickEntryScreenState();
}

class _QuickEntryScreenState extends ConsumerState<QuickEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  late final MobileScannerController _scanCtrl;
  
  // State fields
  String? _lastDetected;
  DateTime? _lastDetectedAt;
  AdminProductDto? _existingProduct;
  AdminProductDto? _lastResult;
  bool _isLookingUp = false;
  bool _isSubmitting = false;

  // Controllers
  final _gtinCtrl = TextEditingController();
  final _nameArCtrl = TextEditingController();
  final _nameEnCtrl = TextEditingController();
  final _brandCtrl = TextEditingController();
  final _manufacturerCtrl = TextEditingController();
  final _categoryCtrl = TextEditingController();
  final _subcategoryCtrl = TextEditingController();
  final _netWeightValueCtrl = TextEditingController();
  final _netUnitCtrl = TextEditingController();
  
  final _energyCtrl = TextEditingController();
  final _fatCtrl = TextEditingController();
  final _satFatCtrl = TextEditingController();
  final _carbsCtrl = TextEditingController();
  final _sugarsCtrl = TextEditingController();
  final _fiberCtrl = TextEditingController();
  final _proteinCtrl = TextEditingController();
  final _sodiumCtrl = TextEditingController();
  
  final _ingredientsTextCtrl = TextEditingController();
  final _nutriScoreCtrl = TextEditingController();
  final _novaGroupCtrl = TextEditingController();

  final Set<String> _selectedAllergens = {};
  bool _halalCertified = false;

  final Map<String, XFile> _photos = {};
  final Map<String, Uint8List> _photoBytes = {};
  final ImagePicker _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    _scanCtrl = MobileScannerController(
      formats: [BarcodeFormat.ean13, BarcodeFormat.ean8, BarcodeFormat.upcA, BarcodeFormat.upcE],
    );
    
    if (widget.initialGtin != null) {
      _gtinCtrl.text = widget.initialGtin!;
      WidgetsBinding.instance.addPostFrameCallback((_) => _lookupGtin(widget.initialGtin!));
    }
  }

  @override
  void dispose() {
    _scanCtrl.dispose();
    _gtinCtrl.dispose();
    _nameArCtrl.dispose();
    _nameEnCtrl.dispose();
    _brandCtrl.dispose();
    _manufacturerCtrl.dispose();
    _categoryCtrl.dispose();
    _subcategoryCtrl.dispose();
    _netWeightValueCtrl.dispose();
    _netUnitCtrl.dispose();
    _energyCtrl.dispose();
    _fatCtrl.dispose();
    _satFatCtrl.dispose();
    _carbsCtrl.dispose();
    _sugarsCtrl.dispose();
    _fiberCtrl.dispose();
    _proteinCtrl.dispose();
    _sodiumCtrl.dispose();
    _ingredientsTextCtrl.dispose();
    _nutriScoreCtrl.dispose();
    _novaGroupCtrl.dispose();
    super.dispose();
  }

  void _onBarcodeDetect(BarcodeCapture capture) {
    final code = capture.barcodes.first.rawValue;
    if (code == null) return;

    final now = DateTime.now();
    if (_lastDetected == code && _lastDetectedAt != null && now.difference(_lastDetectedAt!) < const Duration(milliseconds: 1500)) {
      return;
    }

    _lastDetected = code;
    _lastDetectedAt = now;
    _gtinCtrl.text = code;
    _lookupGtin(code);
  }

  Future<void> _lookupGtin(String gtin) async {
    setState(() {
      _isLookingUp = true;
      _lastResult = null;
    });
    try {
      final dataSource = ref.read(adminProductDataSourceProvider);
      final product = await dataSource.getByGtin(gtin);
      
      if (!mounted) return;

      if (product != null) {
        _fillForm(product);
      } else {
        _clearForm(gtinOnly: true);
      }
    } finally {
      if (mounted) setState(() => _isLookingUp = false);
    }
  }

  void _fillForm(AdminProductDto product) {
    _existingProduct = product;
    _nameArCtrl.text = product.nameAr ?? '';
    _nameEnCtrl.text = product.nameEn ?? '';
    _brandCtrl.text = product.brand ?? '';
    _manufacturerCtrl.text = product.manufacturer ?? '';
    _categoryCtrl.text = product.category ?? '';
    _subcategoryCtrl.text = product.subcategory ?? '';
    _netWeightValueCtrl.text = product.netWeightValue?.toString() ?? '';
    _netUnitCtrl.text = product.netUnit ?? '';
    
    final nf = product.nutrition;
    _energyCtrl.text = nf?.energyKcal?.toString() ?? '';
    _fatCtrl.text = nf?.fatG?.toString() ?? '';
    _satFatCtrl.text = nf?.saturatedFatG?.toString() ?? '';
    _carbsCtrl.text = nf?.carbsG?.toString() ?? '';
    _sugarsCtrl.text = nf?.sugarsG?.toString() ?? '';
    _fiberCtrl.text = nf?.fiberG?.toString() ?? '';
    _proteinCtrl.text = nf?.proteinG?.toString() ?? '';
    _sodiumCtrl.text = nf?.sodiumMg?.toString() ?? '';
    
    _ingredientsTextCtrl.text = product.ingredientTags?.join(', ') ?? '';
    _nutriScoreCtrl.text = product.nutriScoreGrade ?? '';
    _novaGroupCtrl.text = product.novaGroup?.toString() ?? '';
    _halalCertified = product.halalCertified ?? false;
    
    _selectedAllergens.clear();
    if (product.allergenTags != null) {
      _selectedAllergens.addAll(product.allergenTags!);
    }
  }

  void _clearForm({bool gtinOnly = false}) {
    _existingProduct = null;
    if (!gtinOnly) _gtinCtrl.clear();
    _nameArCtrl.clear();
    _nameEnCtrl.clear();
    _brandCtrl.clear();
    _manufacturerCtrl.clear();
    _categoryCtrl.clear();
    _subcategoryCtrl.clear();
    _netWeightValueCtrl.clear();
    _netUnitCtrl.clear();
    _energyCtrl.clear();
    _fatCtrl.clear();
    _satFatCtrl.clear();
    _carbsCtrl.clear();
    _sugarsCtrl.clear();
    _fiberCtrl.clear();
    _proteinCtrl.clear();
    _sodiumCtrl.clear();
    _ingredientsTextCtrl.clear();
    _nutriScoreCtrl.clear();
    _novaGroupCtrl.clear();
    _selectedAllergens.clear();
    _halalCertified = false;
    _photos.clear();
    _photoBytes.clear();
  }

  /// Parse a numeric field, returning null if empty or invalid.
  /// Only returns a value if the field has actual content.
  double? _parseNumericField(TextEditingController ctrl) {
    final text = ctrl.text.trim();
    if (text.isEmpty) return null;
    return double.tryParse(text);
  }

  Future<void> _pickPhoto(ImageSource source, String slot) async {
    final picked = await _picker.pickImage(source: source, imageQuality: 85);
    if (picked == null) return;
    final bytes = await picked.readAsBytes();
    setState(() {
      _photos[slot] = picked;
      _photoBytes[slot] = bytes;
    });
  }

  void _showPhotoBottomSheet(BuildContext context, String slot) {
    final l10n = AppLocalizations.of(context)!;
    showModalBottomSheet(
      context: context,
      backgroundColor: AppColors.surface,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.camera_alt, color: AppColors.primary),
                title: Text(l10n.takePhoto),
                onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.camera, slot); },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library, color: AppColors.primary),
                title: Text(l10n.chooseFromGallery),
                onTap: () { Navigator.pop(context); _pickPhoto(ImageSource.gallery, slot); },
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submit({required bool clearAfter}) async {
    if (!_formKey.currentState!.validate()) return;
    final l10n = AppLocalizations.of(context)!;

    // Validate GTIN pattern (8 or 12-14 digits)
    final gtin = _gtinCtrl.text.trim();
    final gtinRegex = RegExp(r'^\d{8}$|^\d{12,14}$');
    if (!gtinRegex.hasMatch(gtin)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('GTIN must be 8 or 12-14 digits'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Normalize nutriScoreGrade to lowercase (backend accepts 'a', 'b', 'c', 'd', 'e')
    final nutriScoreRaw = _nutriScoreCtrl.text.trim().toLowerCase();
    final validNutriScores = ['a', 'b', 'c', 'd', 'e'];
    if (nutriScoreRaw.isNotEmpty && !validNutriScores.contains(nutriScoreRaw)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Nutri-Score must be A-E'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Constrain netUnit to allowed values ('g' or 'ml')
    final netUnitRaw = _netUnitCtrl.text.trim().toLowerCase();
    final validUnits = ['g', 'ml'];
    if (netUnitRaw.isNotEmpty && !validUnits.contains(netUnitRaw)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Net unit must be g or ml'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Validate NOVA group (1-4)
    final novaGroup = int.tryParse(_novaGroupCtrl.text);
    if (novaGroup != null && (novaGroup < 1 || novaGroup > 4)) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('NOVA group must be 1-4'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Validate netWeightValue - must be positive if provided
    final netWeightValue = double.tryParse(_netWeightValueCtrl.text);
    if (_netWeightValueCtrl.text.trim().isNotEmpty && netWeightValue == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Net weight must be a valid number'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }
    if (netWeightValue != null && netWeightValue <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Net weight must be positive'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    // Validate nutrition fields - must be non-negative if provided
    final nutritionFields = [
      (_energyCtrl, 'Energy'),
      (_fatCtrl, 'Fat'),
      (_satFatCtrl, 'Saturated Fat'),
      (_carbsCtrl, 'Carbohydrates'),
      (_sugarsCtrl, 'Sugars'),
      (_fiberCtrl, 'Fiber'),
      (_proteinCtrl, 'Protein'),
      (_sodiumCtrl, 'Sodium'),
    ];

    for (final (ctrl, name) in nutritionFields) {
      final text = ctrl.text.trim();
      if (text.isNotEmpty) {
        final value = double.tryParse(text);
        if (value == null) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$name must be a valid number'),
              backgroundColor: AppColors.error,
            ),
          );
          return;
        }
        if (value < 0) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$name cannot be negative'),
              backgroundColor: AppColors.error,
            ),
          );
          return;
        }
      }
    }

    setState(() => _isSubmitting = true);

    try {
      final dto = AdminUpsertProductDto(
        gtin: gtin,
        nameEn: _nameEnCtrl.text.trim(),
        nameAr: _nameArCtrl.text.trim(),
        brand: _brandCtrl.text.trim(),
        manufacturer: _manufacturerCtrl.text.trim(),
        category: _categoryCtrl.text.trim(),
        subcategory: _subcategoryCtrl.text.trim(),
        netWeightValue: netWeightValue,
        netUnit: netUnitRaw.isEmpty ? null : netUnitRaw,
        halalCertified: _halalCertified,
        nutriScoreGrade: nutriScoreRaw.isEmpty ? null : nutriScoreRaw,
        novaGroup: novaGroup,
        ingredientTags: _ingredientsTextCtrl.text.trim().split(',').map((e) => e.trim()).where((e) => e.isNotEmpty).toList(),
        allergenTags: _selectedAllergens.toList(),
        nutrition: AdminNutritionDto(
          energyKcal: _parseNumericField(_energyCtrl),
          fatG: _parseNumericField(_fatCtrl),
          saturatedFatG: _parseNumericField(_satFatCtrl),
          carbsG: _parseNumericField(_carbsCtrl),
          sugarsG: _parseNumericField(_sugarsCtrl),
          fiberG: _parseNumericField(_fiberCtrl),
          proteinG: _parseNumericField(_proteinCtrl),
          sodiumMg: _parseNumericField(_sodiumCtrl),
        ),
      );

      final dataSource = ref.read(adminProductDataSourceProvider);
      final result = await dataSource.upsert(dto);
      _lastResult = result;

      if (_photos.isNotEmpty) {
        final updatedProduct = await dataSource.uploadProductImages(result.id, _photos);
        _lastResult = updatedProduct;
        _existingProduct = updatedProduct;
      }

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(l10n.productSubmitted),
          backgroundColor: AppColors.primary,
        ),
      );

      if (clearAfter) {
        _clearForm();
        _lastDetected = null;
      } else {
        setState(() {});
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString()), backgroundColor: AppColors.error),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    final locale = Localizations.localeOf(context);

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.background,
        elevation: 0,
        title: Text(l10n.quickEntry, style: AppTypography.headline(locale)),
        actions: [
          IconButton(
            tooltip: l10n.signOut,
            icon: const Icon(Icons.logout, color: AppColors.error),
            onPressed: () {
              ref.read(authDataSourceProvider).signOut();
              Navigator.pop(context);
            },
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: Column(
          children: [
            // Scanner
            SizedBox(
              height: 200,
              child: Padding(
                padding: const EdgeInsets.all(16.0),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: MobileScanner(
                    controller: _scanCtrl,
                    onDetect: _onBarcodeDetect,
                  ),
                ),
              ),
            ),
            
            // Manual GTIN entry
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: buildProductTextField(
                context,
                _gtinCtrl,
                keyboardType: TextInputType.number,
                hintText: l10n.gtinBarcode,
              ),
            ),

            _buildStatusBanner(l10n, locale),

            Expanded(
              child: DefaultTabController(
                length: 5,
                child: Column(
                  children: [
                    TabBar(
                      isScrollable: true,
                      labelColor: AppColors.primary,
                      unselectedLabelColor: AppColors.onSurface,
                      indicatorColor: AppColors.primary,
                      tabs: [
                        Tab(text: l10n.basicInfo),
                        Tab(text: l10n.nutritionFacts_tab),
                        Tab(text: l10n.ingredients_tab),
                        Tab(text: l10n.photos),
                        const Tab(text: 'Allergens'),
                      ],
                    ),
                    Expanded(
                      child: TabBarView(
                        children: [
                          _buildBasicTab(l10n, locale),
                          buildNutritionFields(context, [
                            (l10n.calories, _energyCtrl, 'kcal'),
                            (l10n.fat, _fatCtrl, 'g'),
                            (l10n.saturatedFat, _satFatCtrl, 'g'),
                            (l10n.carbs, _carbsCtrl, 'g'),
                            (l10n.sugars, _sugarsCtrl, 'g'),
                            (l10n.fiber, _fiberCtrl, 'g'),
                            (l10n.protein, _proteinCtrl, 'g'),
                            (l10n.sodium, _sodiumCtrl, 'mg'),
                          ], locale),
                          _buildIngredientsTab(l10n, locale),
                          _buildPhotosTab(l10n, locale),
                          _buildAllergensTab(l10n, locale),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Row(
                children: [
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isSubmitting || _isLookingUp ? null : () => _submit(clearAfter: true),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(l10n.submitAndNext, style: const TextStyle(color: Colors.white)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _isSubmitting || _isLookingUp ? null : () => _submit(clearAfter: false),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.secondary,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      child: Text(l10n.submitAndStay, style: const TextStyle(color: Colors.white)),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBanner(AppLocalizations l10n, Locale locale) {
    if (_gtinCtrl.text.isEmpty && !_isLookingUp) return const SizedBox.shrink();

    Color color = Colors.grey;
    String text = '';

    if (_isLookingUp) {
      text = 'Looking up...';
      color = Colors.blue;
    } else if (_existingProduct != null) {
      text = l10n.productExistsBanner;
      color = Colors.green;
    } else {
      text = l10n.productNewBanner;
      color = AppColors.primary;
    }

    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border(left: BorderSide(color: color, width: 4)),
      ),
      child: Row(
        children: [
          Icon(Icons.info_outline, color: color, size: 20),
          const SizedBox(width: 8),
          Text(text, style: TextStyle(color: color, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildBasicTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        buildProductLabel(l10n.nameAr, locale),
        buildProductTextField(context, _nameArCtrl, textDirection: TextDirection.rtl),
        const SizedBox(height: 16),
        buildProductLabel(l10n.nameEn, locale),
        buildProductTextField(context, _nameEnCtrl),
        const SizedBox(height: 16),
        buildProductLabel(l10n.brand, locale),
        buildProductTextField(context, _brandCtrl),
        const SizedBox(height: 16),
        buildProductLabel('Manufacturer', locale),
        buildProductTextField(context, _manufacturerCtrl),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('Category', locale),
                  buildProductTextField(context, _categoryCtrl),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('Subcategory', locale),
                  buildProductTextField(context, _subcategoryCtrl),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('Net Weight', locale),
                  buildProductTextField(context, _netWeightValueCtrl, keyboardType: TextInputType.number),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('Unit (g/ml)', locale),
                  buildProductTextField(context, _netUnitCtrl),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
        CheckboxListTile(
          title: const Text('Halal Certified'),
          value: _halalCertified,
          onChanged: (v) => setState(() => _halalCertified = v ?? false),
          activeColor: AppColors.primary,
          contentPadding: EdgeInsets.zero,
        ),
      ],
    );
  }

  Widget _buildIngredientsTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        buildProductLabel(l10n.ingredients_tab, locale),
        TextFormField(
          controller: _ingredientsTextCtrl,
          maxLines: 8,
          decoration: InputDecoration(
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
          ),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('Nutri-Score (A-E)', locale),
                  buildProductTextField(context, _nutriScoreCtrl),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  buildProductLabel('NOVA Group (1-4)', locale),
                  buildProductTextField(context, _novaGroupCtrl, keyboardType: TextInputType.number),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildPhotosTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        buildPhotoSlot(context, l10n.frontPhoto, 'front', _photos['front'], _photoBytes['front'], locale, (s) => _showPhotoBottomSheet(context, s)),
        const SizedBox(height: 16),
        buildPhotoSlot(context, l10n.ingredientsPhoto, 'ingredients', _photos['ingredients'], _photoBytes['ingredients'], locale, (s) => _showPhotoBottomSheet(context, s)),
        const SizedBox(height: 16),
        buildPhotoSlot(context, l10n.nutritionPhoto, 'nutrition', _photos['nutrition'], _photoBytes['nutrition'], locale, (s) => _showPhotoBottomSheet(context, s)),
      ],
    );
  }

  Widget _buildAllergensTab(AppLocalizations l10n, Locale locale) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        buildProductLabel('Select Allergens', locale),
        Wrap(
          spacing: 8,
          children: PreferenceOptions.allergens.map<Widget>((opt) {
            final isSelected = _selectedAllergens.contains(opt.id);
            return FilterChip(
              label: Text(opt.labelOf(l10n)),
              selected: isSelected,
              onSelected: (selected) {
                setState(() {
                  if (selected) _selectedAllergens.add(opt.id);
                  else _selectedAllergens.remove(opt.id);
                });
              },
              selectedColor: AppColors.primary.withOpacity(0.2),
              checkmarkColor: AppColors.primary,
            );
          }).toList(),
        ),
      ],
    );
  }
}
