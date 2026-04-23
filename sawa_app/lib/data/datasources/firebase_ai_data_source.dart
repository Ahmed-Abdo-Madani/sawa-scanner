import 'dart:convert';
import 'dart:typed_data';
import 'package:firebase_ai/firebase_ai.dart';
import '../../core/exceptions.dart';
import '../../core/api_config.dart';

/// Data source for client-side AI label structuring using Firebase AI Logic.
/// This serves as a fallback when the backend's Gemini quota is exceeded.
class FirebaseAiDataSource {
  late final GenerativeModel _model;
  bool _initialized = false;

  FirebaseAiDataSource();

  void _initializeModel() {
    if (_initialized) return;
    
    final firebaseAi = FirebaseAI.googleAI();
    _model = firebaseAi.generativeModel(
      model: ApiConfig.aiModel,
      generationConfig: GenerationConfig(
        responseMimeType: 'application/json',
      ),
    );
    _initialized = true;
  }

  /// Builds the same prompt string used in the backend's GoogleAiGeminiProvider.
  String _buildPrompt(String rawOcrText) {
    return '''
You are an expert nutrition label analyst specializing in Saudi Arabian food products.
Extract and structure information from the following OCR text from a nutrition label.

OCR TEXT:
"""
$rawOcrText
"""

INSTRUCTIONS:
1. Return a JSON object matching the schema below.
2. Handle Arabic nutrient aliases: 
   - 'دهون' -> fat_g
   - 'دهون مشبعة' -> saturated_fat_g
   - 'بروتين' -> protein_g
   - 'سكريات' -> sugars_g
   - 'ألياف' -> fiber_g
   - 'صوديوم' -> sodium_mg
   - 'سعرات حرارية' or 'طاقة' -> energy_kcal
   - 'كربوهيدرات' -> carbs_g
3. All nutrient values should be numeric (float or int). If a range is given, use the average.
4. Ingredients should include Arabic names where possible. Extract E-numbers if visible.
5. If a field is missing, leave it as null or omit it.

SCHEMA:
{
  "name_ar": "Arabic product name",
  "name_en": "English product name",
  "brand": "Brand name",
  "net_weight": "e.g. 500g",
  "nutrition": {
    "energy_kcal": number,
    "fat_g": number,
    "saturated_fat_g": number,
    "carbs_g": number,
    "sugars_g": number,
    "fiber_g": number,
    "protein_g": number,
    "sodium_mg": number,
    "serving_size_g": number
  },
  "ingredients": [
    { "name_ar": "string", "name_en": "string", "e_number": "string" }
  ]
}
''';
  }

  /// Structures raw OCR text into a JSON map using Firebase AI Logic.
  /// 
  /// [rawOcrText] - The OCR text extracted from a nutrition label image.
  /// [gtin] - Optional GTIN to associate with the structured product.
  /// Returns a Map<String, dynamic> containing the structured label data mapped to ProductModel contract.
  Future<Map<String, dynamic>> structureLabel(String rawOcrText, {String? gtin}) async {
    if (!_initialized) {
      _initializeModel();
    }

    final prompt = _buildPrompt(rawOcrText);
    
    final response = await _model.generateContent(
      [Content.text(prompt)],
    );

    final responseText = response.text;
    if (responseText == null || responseText.isEmpty) {
      throw Exception('Empty response from Firebase AI');
    }

    // Parse the JSON response
    try {
      // Remove any markdown code blocks if present
      final cleanedResponse = responseText
          .replaceAll(RegExp(r'^```json\s*', multiLine: true), '')
          .replaceAll(RegExp(r'^```\s*', multiLine: true), '')
          .replaceAll(RegExp(r'\s*```$', multiLine: true), '')
          .trim();
      
      final aiResult = json.decode(cleanedResponse) as Map<String, dynamic>;
      return _mapToProductJson(aiResult, gtin: gtin, source: 'firebase_ai_text');
    } catch (e) {
      throw Exception('Failed to parse Firebase AI response as JSON: $e\nResponse: $responseText');
    }
  }

  /// Recognizes product directly from an image.
  Future<Map<String, dynamic>> recognizeProductFromImage(List<int> imageBytes, {String mimeType = 'image/jpeg', String? gtin}) async {
    if (!_initialized) {
      _initializeModel();
    }

    if (imageBytes.isEmpty) {
      throw AiRecognitionException('Image bytes cannot be empty');
    }

    final prompt = '''
You are an expert nutrition label analyst specializing in Saudi Arabian food products.
Identify the product from the package image (brand, name AR/EN, category, subcategory, net weight + unit).
Extract any visible barcode digits -> gtin (if not provided).
Extract nutrition table values. Handle Arabic nutrient aliases: 
   - 'دهون' -> fat_g
   - 'دهون مشبعة' -> saturated_fat_g
   - 'بروتين' -> protein_g
   - 'سكريات' -> sugars_g
   - 'ألياف' -> fiber_g
   - 'صوديوم' -> sodium_mg
   - 'سعرات حرارية' or 'طاقة' -> energy_kcal
   - 'كربوهيدرات' -> carbs_g
Extract ingredients list, allergens, halal indicator, SFDA registration text, NutriScore/NOVA/Eco-Score badges if visible.

INSTRUCTIONS:
1. Return a JSON object matching the schema below.
2. All nutrient values should be numeric (float or int). If a range is given, use the average.
3. Ingredients should include Arabic names where possible. Extract E-numbers if visible.
4. If a field is missing, leave it as null or omit it.

SCHEMA:
{
  "name_ar": "Arabic product name",
  "name_en": "English product name",
  "brand": "Brand name",
  "net_weight": "e.g. 500g",
  "gtin": "barcode digits if visible",
  "nutrition": {
    "energy_kcal": number,
    "fat_g": number,
    "saturated_fat_g": number,
    "carbs_g": number,
    "sugars_g": number,
    "fiber_g": number,
    "protein_g": number,
    "sodium_mg": number,
    "serving_size_g": number
  },
  "ingredients": [
    { "name_ar": "string", "name_en": "string", "e_number": "string" }
  ]
}
''';

    final response = await _model.generateContent([
      Content.multi([
        TextPart(prompt),
        InlineDataPart(mimeType, Uint8List.fromList(imageBytes)),
      ])
    ]);

    final responseText = response.text;
    if (responseText == null || responseText.isEmpty) {
      throw AiRecognitionException('Empty vision response from Firebase AI');
    }

    try {
      final cleanedResponse = responseText
          .replaceAll(RegExp(r'^```json\s*', multiLine: true), '')
          .replaceAll(RegExp(r'^```\s*', multiLine: true), '')
          .replaceAll(RegExp(r'\s*```$', multiLine: true), '')
          .trim();
      
      final aiResult = json.decode(cleanedResponse) as Map<String, dynamic>;
      final recognizedGtin = (gtin != null && gtin.isNotEmpty) ? gtin : aiResult['gtin']?.toString();
      return _mapToProductJson(aiResult, gtin: recognizedGtin, source: 'firebase_ai_vision');
    } catch (e) {
      throw AiRecognitionException('Failed to parse Firebase AI vision response as JSON: $e\nResponse: $responseText');
    }
  }

  /// Maps the raw AI structuring result into the ProductModel JSON contract.
  Map<String, dynamic> _mapToProductJson(Map<String, dynamic> aiResult, {String? gtin, required String source}) {
    final now = DateTime.now().toIso8601String();
    final id = (gtin != null && gtin.isNotEmpty) ? gtin : 'SCAN-${DateTime.now().millisecondsSinceEpoch}';

    return {
      'id': id,
      'gtin': id,
      'name_ar': aiResult['name_ar'] ?? '',
      'name_en': aiResult['name_en'] ?? '',
      'brand': aiResult['brand'] ?? '',
      'category': aiResult['category'] ?? '',
      'subcategory': aiResult['subcategory'] ?? '',
      'description_ar': '',
      'description_en': '',
      'sfda_registration_status': 'pending',
      'halal_certified': null,
      'nutri_score_grade': null,
      'nova_group': null,
      'net_weight_value': null,
      'net_unit': null,
      'nutrition': aiResult['nutrition'] ?? {},
      'ingredients': (aiResult['ingredients'] as List? ?? []).map((i) {
        return {
          'name_ar': i['name_ar'] ?? '',
          'name_en': i['name_en'] ?? '',
          'e_number': i['e_number'],
          'sfda_status': 'safe',
        };
      }).toList(),
      'prices': [],
      'images': [],
      'allergen_details': [],
      'allergen_tags': [],
      'ingredient_tags': [],
      'allergens_data_available': false,
      'categories': [],
      'ingredients_text': '',
      'image_front_url': null,
      'image_nutrition_url': null,
      'nutrition_data_complete': false,
      'source': source,
      'created_at': now,
      'updated_at': now,
    };
  }
}

/// A disabled implementation of FirebaseAiDataSource for unsupported platforms like Windows.
class NoOpFirebaseAiDataSource implements FirebaseAiDataSource {
  @override
  bool get _initialized => true;

  @override
  GenerativeModel get _model => throw UnsupportedError('Not supported');

  @override
  set _model(GenerativeModel value) {}

  @override
  set _initialized(bool value) {}

  @override
  void _initializeModel() {}

  @override
  String _buildPrompt(String rawOcrText) => '';

  @override
  Future<Map<String, dynamic>> structureLabel(String rawOcrText, {String? gtin}) async {
    throw AiRecognitionException('Firebase AI is not supported on this platform');
  }

  @override
  Future<Map<String, dynamic>> recognizeProductFromImage(List<int> imageBytes, {String mimeType = 'image/jpeg', String? gtin}) async {
    throw AiRecognitionException('Firebase AI is not supported on this platform');
  }

  @override
  Map<String, dynamic> _mapToProductJson(Map<String, dynamic> aiResult, {String? gtin, required String source}) => {};
}