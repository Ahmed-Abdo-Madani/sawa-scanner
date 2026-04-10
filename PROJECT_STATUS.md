# Sawa Scanner Project Status & AI Handoff

This document provides a comprehensive overview of the current development state of the Sawa Scanner application for AI agents and developers.

## 🚀 Project Overview
Sawa Scanner is a bilingual (AR/EN) product scanning system designed for the Saudi Arabian market. It enables users to scan barcodes or nutrition labels to verify product safety, nutritional content, and SFDA (Saudi Food & Drug Authority) compliance.

- **Frontend**: Flutter (Riverpod, Glassmorphic Design, RTL/LTR)
- **Backend**: NestJS (PostgreSQL, TypeORM, BullMQ)
- **AI Stack**: Google Cloud Vision (OCR) + Gemini 2.0 Flash (NLP Structuring)

---

## 🛠 Features & Development Status

### Phase 1: Barcode Scanning (Completed)
- [x] Functional `ScannerScreen` with `mobile_scanner`.
- [x] Product Detail View with Glassmorphism UI.
- [x] Bilingual Localization (AR/EN) using `AppLocalizations`.
- [x] Mock data fallback for missing GTINs.

### Phase 2: OCR & NLP Label Pipeline (Completed ✅)
- [x] **OCR Integration**: Bilingual text extraction via `@google-cloud/vision`.
- [x] **NLP Structuring**: Raw text to JSON schema mapping via **Gemini 2.0 Flash**.
- [x] **SFDA Safety Matcher**: 
  - Cross-references ingredients against `sfda_prohibited_ingredients` table.
  - Implemented **case-insensitive matching** and E-Number detection.
- [x] **Nutrition Heuristics**: 
  - Strict validation of macro sums (Fat + Carbs + Protein <= 100g).
  - Validation failures trigger `400 Bad Request` with descriptive errors.
- [x] **Flutter Label Capture**:
  - Image capture via `image_picker`.
  - Mode-guarded scanner logic (Barcode vs. Label modes).

- [x] **OCR Quality Guard**: Unified quality gate via `LabelCoreService` enforcing both nutrition and ingredient presence.

### Phase 4: Environment Setup & Smoke Test (Completed ✅)
- [x] **SDK Provisioning**: Flutter SDK installed and path initialized.
- [x] **Full-Stack Orchestration**: 
  - PostgreSQL 17 integration with successful migration execution.
  - Redis 5.x local service integrated for BullMQ task processing.
- [x] **Credential Hardening**: 
  - Firebase Admin SDK successfully initialized with valid private keys.
  - Google Cloud Vision API enabled and path-verified.
  - Gemini 2.0 Flash verified with automated connectivity tests.
- [x] **Service Health**: NestJS backend responding to health checks on port 3000.
- [x] **Frontend Stability**: 
  - Fixed localization by moving to an explicit output directory (`lib/l10n`) and disabling the synthetic package.
  - Updated `AppLocalizations` imports and removed hardcoded delegates/locales in `app.dart`.
  - Migrated `CardTheme` to `CardThemeData` in `AppTheme` for Flutter SDK compatibility.
  - Verified codebase with `flutter analyze` and `flutter gen-l10n`.

---

## 📂 Key Architecture & File References

### Backend (`sawa-api`)
| Responsibility | File Path | Description |
| :--- | :--- | :--- |
| **OCR Core Logic**         | [`src/scan/label-core.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scan/label-core.service.ts) | Centralized OCR -> LLM -> Validation gate. |
| **OCR Orchestration**      | [`src/scan/scan.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scan/scan.service.ts) | High-level service for manual label scans. |
| **Heuristic Validation**   | [`src/scan/label-validation.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scan/label-validation.service.ts) | Nutrition fact validation rules. |
| **Safety Matcher** | [`src/scan/sfda-matcher.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scan/sfda-matcher.service.ts) | Matches ingredients with restricted lists. |
| **Queue Management** | [`src/scan/ocr.processor.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scan/ocr.processor.ts) | Background processing for scans. |
| **Product Entities** | [`src/entities/product.entity.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/entities/product.entity.ts) | TypeORM entities. |
| **Ingestion Engine** | [`src/ingestion/ingestion.processor.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/ingestion.processor.ts) | Main ingestion queue worker. |
| **Scraper Logic** | [`src/ingestion/scraper/base-scraper.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/scraper/base-scraper.ts) | Base class for retailers. |
| **Product Clustering**| [`src/ingestion/product-clustering.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/product-clustering.service.ts) | Merges products from multiple sources. |

### Frontend (`sawa_app`)
| Responsibility | File Path | Description |
| :--- | :--- | :--- |
| **Main App Shell** | [`lib/app.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/app.dart) | Localization and Theme configuration. |
| **Generated L10n** | [`lib/l10n/app_localizations.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/l10n/app_localizations.dart) | Localized string delegates. |
| **Scanner Dashboard** | [`lib/presentation/screens/scanner/scanner_screen.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/screens/scanner/scanner_screen.dart) | Barcode/Label scanner UI. |
| **Detail Engine** | [`lib/presentation/screens/product_detail/product_detail_screen.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/screens/product_detail/product_detail_screen.dart) | Product analysis view. |
| **State Management** | [`lib/presentation/providers/scanner_provider.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/providers/scanner_provider.dart) | Riverpod providers for scanning. |
| **Design Tokens** | [`lib/core/theme/`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/core/theme/) | AppTheme, colors, and typography. |

---

## 🔐 Environment & Credentials
The following are now **fully configured** in the local environment:
- [x] `GOOGLE_APPLICATION_CREDENTIALS`: Linked to `config/service-account.json`.
- [x] `GEMINI_API_KEY`: Verified and active.
- [x] `DATABASE_URL` / Credentials: User authenticated, migrations synced.
- [x] `REDIS_URL` / Local Service: Active for BullMQ queueing.

---

## 📝 Recent Reliability & Build Fixes
- **Localization Strategy**: Switched to explicit `output-dir: lib/l10n` to prevent synthetic package resolution failures in IDEs and compilers.
- **Theme SDK Alignment**: Migrated `CardTheme` to `CardThemeData` manually to resolve deprecation warnings and build errors in newer Flutter versions.
- **Validation**: Heuristic validator now enforces a strict 100g limit on macro sums.
- **Scanner Reliability**: Barcode detection disabled in Label mode.
- **Precision**: SFDA queries are now case-insensitive.

---

## 🔮 Next Steps for Future Agents
1. **SFDA Expansion**: Populate `sfda_prohibited_ingredients` with full restricted additive lists.
2. **Offline Support**: Cache scanned products locally via SQLite/Drift.
3. **Analytics**: Implement event tracking for scan success/failure rates.
4. **Fine-Tuning**: Adjust Gemini prompt if label parsing for local KSA brands is inconsistent.
5. **Real-time Price Sync**: periodic updates for existing product prices.
6. **Provider Expansion**: Implement `CarrefourScraper` and `PandaScraper` templates.
