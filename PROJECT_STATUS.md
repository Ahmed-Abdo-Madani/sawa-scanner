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
  - **Neon Cloud PostgreSQL** integration with successful migration execution and SSL support.
  - **Redis Cloud** integration for BullMQ task processing with TLS and password authentication.
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

### Phase 5: Material 3 Theme Migration (Completed ✅)
- [x] **Theme Overhaul**: Integrated **Material 3 Light Theme** with an explicit `ColorScheme` mapped to `AppColors` for cross-component consistency.
- [x] **Color Tokens**: Updated `AppColors` to light palette (#FAFAFA background, #00C853 primary).
- [x] **Component Refactoring**: 
  - Refactored `GlassSurface` to use standard Material `Card` with zero margin and anti-alias clipping to preserve layout semantics.
  - Fixed accessibility for `NutriScoreBadge`, `NovaGroupBadge`, and `HalalBadge` by ensuring white text on colored backgrounds.
  - Updated `ScannerScreen` and `ProductDetailScreen` for readability in light mode.
- [x] **Bilingual Integrity**: Ensured `ThemeShowcaseScreen` and other modified views use `AppLocalizations` for all UI text, maintaining full AR/EN support.

### Phase 6: OpenFoodFacts Integration (Completed ✅)
- [x] **SDK Integration**: Added `openfoodfacts: ^3.30.2` dependency.
- [x] **Automated Fallback**: Implemented fallback logic in `ProductRepositoryImpl` to query OFF if the Sawa API returns a 404 (ProductNotFoundException).
- [x] **Data Mapping**: Created `OpenFoodFactsDataSource` to map OFF product data (Nutriscore, Eco-score, Allergens, Ingredients) to the Sawa `ProductModel`.
- [x] **Domain Extension**: Extended `Product` entity and repository interface with new fields and search capabilities.
- [x] **Search Support**: Integrated OFF global search functionality via `searchProducts`.
- [x] **Camera Overlay Optimization**: Adjusted `ModePill` and `Flash Button` for high contrast on camera previews.

### Phase 7: Knowledge Panel Redesign (Completed ✅)
- [x] **Layout Overhaul**: Rebuilt `ProductDetailScreen` with a collapsible **Knowledge Panel Cards** system for prioritized info density.
- [x] **Badge System 2.0**: 
    - Redesigned `NutriScoreBadge` and `NovaGroupBadge` as horizontal segment indicators (A–E and 1–4).
    - Integrated `EcoScoreBadge` (environmental impact) with official segment coloring.
- [x] **New Components**: Created `KnowledgePanelCard` as a reusable M3 widget with expandable content.
- [x] **Hero Section Real Estate**: Moved certification badges (SFDA, Halal) to the hero header to improve content scannability.
- [x] **Bilingual UX Refinement (Completed ✅)**: 
    - Resolved raw OFF tags by normalizing labels (e.g., "en:milk" -> "Milk").
    - Replaced hardcoded panel summaries with localized templates and pluralization.
    - Added comprehensive empty state for Allergens panel based on data availability.
    
### Phase 8: Search, History & Navigation (Completed ✅)
- [x] **Navigation Shell**: Migrated to a persistent 4-tab `IndexedStack` navigation using M3 `NavigationBar`.
- [x] **Scan History**:
    - Implemented with **Hive** (`scanHistoryBox`).
    - Persistent de-duplicated list with automatic recording on success.
    - Features: Dismiss-to-delete, Clear-all, and relative date formatting (Today/Yesterday).
- [x] **Product Search**:
    - Integrated logic in `SearchScreen` with **500ms debounce**.
    - Fully reactive results via `searchResultsProvider` using OFF API fallback.
- [x] **New Providers**:
    - `scanHistoryProvider`: Manage local persistence.
    - `searchQueryProvider` & `searchResultsProvider`: Handle search state.
- [x] **Bilingual Support (Finalized ✅)**: 
    - Regenerated the localization API (`AppLocalizations`) using the Flutter SDK.
    - Added 25+ localization keys across `History`, `Profile`, `Search`, and `Navigation`.
    - Resolved variable scope issues in the Profile screen and verified all relevant screens compile and consume localized getters.
- [x] **Scan Accuracy (Refined ✅)**: 
    - Moved history recording logic from the detail screen to `ScannerScreen`.
    - Searches and history re-opens no longer misclassified as new scans.
101: 
### Phase 9: Onboarding & User Preferences (Finalized ✅)
- [x] **New Hive Box**: `userPreferencesBox` for settings persistence.
- [x] **4-Page Onboarding**:
    - Language selection with live UI swap.
    - Dietary preference selection (Vegan, Halal Only, etc.).
    - Allergen filter selection (Peanuts, Dairy, etc.).
    - Summary confirmation page.
- [x] **First-Launch Gate**: App startup logic in `app.dart` to conditionally show onboarding.
- [x] **Profile Editing**: Added interactive preference and allergen sections to the Profile tab.
- [x] **Bilingual Sync**: Fully localized keys (AR/EN) and synchronized locale transitions with `userPreferencesProvider`.
- [x] **Persistence Durability (Finalized ✅)**: 
    - Implemented a robust, loop-based **Persistence Barrier** in `UserPreferencesNotifier` to guarantee atomic settings commits even under rapid-fire updates.
    - Switched from legacy observers to the modern `AppLifecycleListener` in `SawaApp` to ensure a best-effort "drain" of the persistence queue whenever the app is backgrounded or paused.
    - Updated `_persist()` to capture synchronous state snapshots before the async chain, preventing data drift.
    - Added explicit `_box.flush()` and error logging to ensure hardware commit and visibility into write failures.

### Phase 10: Code Hardening & Constants Extraction (Completed ✅)
- [x] **Single Source of Truth**:
    - Extracted all raw string literals for Hive box names and preference field keys into `UserPreferencesKeys`.
    - Consolidated 12+ dietary and allergen IDs into a canonical `PreferenceOptions` list with localized label resolvers.
- [x] **UI Decoupling**:
    - Refactored `OnboardingScreen` and `ProfileScreen` to dynamically render preference chips from the canonical list, eliminating duplicated logic and reducing drift risk.
    - Centralized startup read logic in `main.dart` to share the same key definitions used by the notifier.
- [x] **Logic Safety**:
    - Verified all call sites route through the serialized notifier queue to prevent race conditions during rapid app suspension.

### Phase 11: Full-App Polish & Localization (Completed ✅)
- [x] **Localization Cleanup**: Removed duplicate keys and renamed legacy glassmorphic keys to M3 terminology across `app_en.arb` and `app_ar.arb`.
- [x] **Hardcoded String Extraction**: Localized all remaining hardcoded strings in `ProductDetailScreen`, `ProductEditScreen`, and `PriceComparisonScreen`.
- [x] **M3 Theme Integrity**: Replaced hardcoded allergen chip colors with M3 `ColorScheme` tokens (`errorContainer` and `error`).
- [x] **RTL/LTR Directional Fixes**:
    - Updated `HistoryScreen` dismissible background to use `AlignmentDirectional.centerEnd`.
    - Switched all hardcoded `EdgeInsets.only` to `EdgeInsetsDirectional.only` in charts.
    - Implemented locale-aware flipping for chevron icons in Search and History cards.
- [x] **Codebase Cleanup**:
    - [x] Renamed and refactored `GlassSurface` to `SurfaceCard` (plain M3 Card).
- [x] Updated all UI references to the new `SurfaceCard` component.
- [x] Deleted dead code file `home_screen.dart` and legacy `glass_surface.dart`.

### Phase 12: Production Readiness & Pipeline Hardening (Completed ✅)
- [x] **Backend Storage Migration**:
    - Transitioned product report photo storage from in-memory base64 to server-side `diskStorage`.
    - Configured `ServeStaticModule` to serve `/uploads/reports` publicly, resolving the 1MB JSON payload limit.
    - Updated `ProductsController` to return relative URL strings for submitted photos.
- [x] **Automated Localization Sync (Restored ✅)**:
    - Verified that `flutter gen-l10n` correctly generates the localization layer in the `lib/l10n` directory.
    - Cleaned up `l10n.yaml` by removing deprecated parameters.
    - Future UI string additions now only require updating the `.arb` files and running the generator.

- [x] **Component Finalization**:
    - Removed all remaining references to `GlassSurface` from `ScannerScreen`.
    - Fully localized `ThemeShowcaseScreen` debug views.

### Phase 13: Retrieval Resilience & Global Synchronization (Completed ✅)
- [x] **Robust Fallback Chain**: Refactored `ProductRepositoryImpl` to implement a multi-tier fallback: `Fresh Cache -> Sawa API -> OFF API -> Stale Cache`.
- [x] **Transport Failure Handling**: Corrected the repo layer to catch `ServerException` and `SocketException` during lookups, preventing early termination of the fallback chain.
- [x] **OpenFoodFacts Contribution Sync**:
    - Implemented `contributeProduct` in `OpenFoodFactsDataSource` mapping internal fields to the global OFF schema.
    - Integrated dual-submission in `ProductRepositoryImpl`, ensuring user reports are synced to both Sawa and OFF databases.
    - **Unlocked Metadata Sync**: Verified that metadata-only updates (without photos) are now synchronized correctly to OFF.
    - Added high-quality photo synchronization to OFF's corresponding image slots.

### Phase 14: System Stabilization & Mobile Launch (2026-04-12)
- **Backend Stability**: Resolved Redis auth (`NOAUTH`) and TypeORM schema mismatches.
- **Android Networking**: Enabled `usesCleartextTraffic` and added internet permissions to `AndroidManifest.xml`.
- **Configuration**: Decoupled `ApiConfig` from hardcoded LAN IPs; enforced `--dart-define` targets.
- **SDK Repairs**: Fixed `openfoodfacts` SDK 3.x syntax regressions (Page -> PageNumber).

### Phase 15: Infrastructure Hardening & Resilience (2026-04-12)
- **Redis & BullMQ Resilience**:
    - Centralized Redis configuration in `src/config/redis.config.ts` (consistent TLS, auth, and retry logic).
    - Refactored `main.ts` to reuse existing NestJS `Queue` instances via `app.get(getQueueToken())`.
    - Corrected queue name mismatch (`price-scrape-queue` -> `price-scraping-queue`) in Bull Board.
- **Granular Error Handling**:
    - Implemented specialized exception layer (`BackendUnavailableException`, `FallbackUnavailableException`, `FallbackConfigurationException`).
    - Fixed initialization bug in `main.dart` (mandatory OpenFoodFacts User-Agent).
    - Refactored `ProductRepositoryImpl` to provide detailed diagnostic feedback instead of generic connection errors.
    - Updated `ProductDetailScreen` with specific UI icons and localized descriptions for failure modes.
- [x] **Backend Runtime Repair**:
    - [x] Resolved TypeORM `DataTypeNotSupportedError` by explicitly typing `reporter_uid` as `varchar`.
    - [x] Stabilized Redis authentication configuration to resolve `NOAUTH` errors during startup.
    - [x] Scaled backend to serve static report images from `/uploads/reports`.
- [x] **Flutter Compilation & SDK Hardening**:
    - [x] Fixed syntax errors in `price_comparison_screen.dart` (redundant parentheses).
    - [x] Updated `OpenFoodFactsDataSource` to match version 3.30.2 (PageNumber, non-null User, allergens names).
    - [x] Added `isMini` support to `NutriScoreBadge` for mobile UI density.
- [x] **Hardware Deployment**: Successfully launched and verified the application on physical Android device **A142**.


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
| **Design Tokens** | [`lib/core/theme/`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/core/theme/) | M3 Light Theme, colors, and typography. |
| **Score Utils** | [`lib/core/utils/grade_colors.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/core/utils/grade_colors.dart) | Segment coloring logic for Nutri/Nova/Eco scores. |
| **Panel System** | [`lib/presentation/widgets/knowledge_panel_card.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/widgets/knowledge_panel_card.dart) | Reusable collapsible card component. |
| **Navigation Shell** | [`lib/presentation/screens/navigation_shell.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/screens/navigation_shell.dart) | Tab management shell. |
| **History Logic** | [`lib/presentation/providers/scan_history_provider.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/providers/scan_history_provider.dart) | Hive-backed scan history. |
| **User Prefs** | [`lib/presentation/providers/user_preferences_provider.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/providers/user_preferences_provider.dart) | Dietary/Allergen settings. |
| **Onboarding UI** | [`lib/presentation/screens/onboarding/onboarding_screen.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/presentation/screens/onboarding/onboarding_screen.dart) | 4-page onboarding flow. |
| **OFF Sync Layer** | [`lib/data/datasources/openfoodfacts_data_source.dart`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa_app/lib/data/datasources/openfoodfacts_data_source.dart) | Global contribution and lookup client. |

---

## 🔐 Environment & Credentials
The following are now **fully configured** in the local environment:
- [x] `GOOGLE_APPLICATION_CREDENTIALS`: Linked to `config/service-account.json`.
- [x] `GEMINI_API_KEY`: Verified and active.
- [x] **Neon Cloud Database**: Connected via SSL (`DATABASE_SSL=true`), migrations synced.
- [x] **Redis Cloud**: Active for BullMQ queueing with TLS and password authentication.

---

## 📝 Recent Reliability & Build Fixes
- **Localization Strategy**: Switched to explicit `output-dir: lib/l10n` to prevent synthetic package resolution failures in IDEs and compilers.
- **Theme SDK Alignment**: Migrated `CardTheme` to `CardThemeData` manually to resolve deprecation warnings and build errors in newer Flutter versions.
- **Validation**: Heuristic validator now enforces a strict 100g limit on macro sums.
- **Scanner Reliability**: Barcode detection disabled in Label mode.
- **Precision**: SFDA queries are now case-insensitive.
- **Theme Migration**: Completed transition from glassmorphism to Material 3 Light Theme across all 17 UI files. Surface effects now use standard elevations and clean cards for better performance and readability.
- **Preference Durability**: Resolved a critical issue where Flutter's `void` callbacks prevented async persistence from being effective during app suspension. Now uses the modern `AppLifecycleListener` and a queue-tail barrier to guarantee best-effort disk flushes on backgrounding.
- **Structural Integrity**: Extracted magic strings and preference IDs into a centralized constants layer (`UserPreferencesKeys` & `PreferenceOptions`), ensuring that UI, storage, and startup logic never fall out of sync.
- **RTL & Localization Hardening**: Completed a comprehensive sweep of the application to ensure zero hardcoded strings and full RTL layout flipping. Standardized on `EdgeInsetsDirectional` and locale-aware icons for a premium bilingual experience.
- **Component Standardization**: Finalized the Material 3 migration by renaming legacy structural components (e.g., `GlassSurface` -> `SurfaceCard`) and removing dead code, ensuring the codebase is clean and maintainable.
- **Pipeline Hardening**: Migrated report photo uploads to disk storage, eliminating JSON payload bloat and enabling large image uploads in production.
- **Localization Integrity**: Manually synchronized the localization layer to ensure consistent bilingual support for new features without relying on external build tools.
- **Retrieval Resilience**: Hardened the product lookup chain to handle network outages and transport errors, falling back gracefully to OFF and stale local caches.
- **Global Contribution**: Established a dual-submission pipeline that synchronizes Sawa product corrections with the OpenFoodFacts global database.
- **Mobile Stabilization**: Resolved critical TypeORM and Flutter SDK mismatches to enable production launch on physical hardware.


---

## 🔮 Next Steps for Future Agents
1. **SFDA Expansion**: Populate `sfda_prohibited_ingredients` with full restricted additive lists.
2. **Offline Support**: Cache scanned products locally via SQLite/Drift.
3. **Analytics**: Implement event tracking for scan success/failure rates.
4. **Preference Filtering**: Update search and scan logic to actually highlight matched/prohibited items based on user preferences.
5. **Real-time Price Sync**: periodic updates for existing product prices.
6. **Provider Expansion**: Implement `CarrefourScraper` and `PandaScraper` templates.
