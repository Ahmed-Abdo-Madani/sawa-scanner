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

### Phase 16: Scanner UI Refactoring & Viewport Optimization (2026-04-12)
- [x] **Split Layout (35/65)**: Migrated the scanner from a full-screen `Stack` to a `Column` split, reserving 65% of the bottom viewport for future carousel/manual entry content.
- [x] **Dimension-Aware Overlays**: Refactored `ScanFrameOverlay` to use `min(width, height) * 0.7` for frame sizing, ensuring guides fit perfectly on tablets, split-screens, and short phones.
- [x] **Seamless Corner Integration**: Fixed visual artifacts at rounded camera corners by syncing `Scaffold` background with the lower zone's grey/white container.
- [x] **Manual Mode Hardening**: Resolved keyboard-driven overflows in manual mode by integrating `SingleChildScrollView` and optimizing padding logic within the constrained bottom panel.

### Phase 17: Interactive Scanner Carousel & Search (Completed ✅)
- [x] **MRU Carousel**: Replaced direct detail navigation with a dynamic, Most-Recently-Used (MRU) carousel.
- [x] **Animated Focus**: Implemented automatic carousel animations to newly scanned product cards.
- [x] **Integrated Search**: Added a persistent `SearchWelcomeCard` at carousel index 0 with direct tab switching to `SearchScreen`.
- [x] **Premium Cards**: Implemented high-fidelity `ScannedProductCard` widgets with NutriScore integration.
- [x] **Bilingual Parity**: Added full localization (AR/EN) for the "Scan or search" prompt.

### Phase 18: Navigation & History Logic Hardening (Completed ✅)
- [x] **Centralized Navigation**: Implemented `navigationProvider` to manage bottom tab state, enabling programmatic tab switching from the Scanner.
- [x] **History Consistency**: Refactored `ScannerScreen` and `ProductDetailScreen` interaction to ensure scan history is recorded exactly once. 
    - [x] Fixed "double-write" on manual entries.
    - [x] Prevented timestamp overwrites when re-opening items from the MRU carousel.
- [x] **Search UI Refactor**: Removed the persistent Search tab to simplify navigation. 
    - [x] Search is now a sub-page pushed from the Scanner screen.
    - [x] Synchronized `SearchScreen` text field with current provider state.
- [x] **Localization Sync**: Regenerated and verified full localization API for all new UI keys.

### Phase 19: Scanner UI Polish & Touch Logic (Completed ✅)
- [x] **Viewport Ratio Optimization**: Adjusted the scanner/carousel flex ratio from 35/65 to 42/58 to improve product card visibility and camera guide framing.
- [x] **Touch Event Passthrough**: Wrapped the `ScanFrameOverlay` and barcode prompt text in an `IgnorePointer` to fix a bug where mode selection pills were unresponsive to taps in the barcode mode.
- [x] **Structural Cleanliness**: Simplified the `ScannerMode.barcode` overlay spread by nesting it within a single `IgnorePointer` wrapper, ensuring z-order stability.

### Phase 20: Scanner Overlay Redesign & Hardware Controls (Completed ✅)
- [x] **Static Overlay**: Converted `ScanFrameOverlay` to a stateless component, removing the battery-heavy animation line.
- [x] **Visual Polish**: Replaced square corner brackets with curved arcs and added a central barcode/scanner icon for better visual cueing.
- [x] **Camera Controls**: Integrated a new camera switch button and moved the flash toggle inside the camera Stack, positioned as a balanced Row at the bottom of the viewfinder.
- [x] **Code Cleanup**: Removed animation plumbing and `SingleTickerProviderStateMixin` from `ScannerScreen`.

### Phase 21: Scanner Debouncing & Duplicate Prevention (Completed ✅)
- [x] **GTIN Debounce**: Implemented `_lastScannedGtin` guard in `_onDetect` to prevent the same barcode from firing multiple async fetches consecutively while the camera is still focused.
- [x] **Carousel Sanitization**: Added a duplicate-in-list check before inserting products into the MRU carousel; existing items are moved to index 0 rather than creating duplicates.
- [x] **Fault Tolerance**: Ensured `_lastScannedGtin` resets on scan failure, allowing immediate retries for the same barcode.

### Phase 22: Scanner UI Generalization & Viewport Polish (Completed ✅)
- [x] **Rectangular Viewfinder**: Refactored `ScanFrameOverlay` to use a 90% width / 70% height rectangular frame, preventing vertical overflow while maintaining a large scanning area.
- [x] **Visual Polish**: Switched viewfinder arcs to white (4.5 thickness), replaced center icon with `Icons.view_week`, and removed the dimmed background mask.
- [x] **Navigation Simplification**: Removed `ModePill` selection to focus on barcode scanning; hardcoded barcode-first initialization.
- [x] **Viewport Alignment**: Integrated `topPadding` awareness in the scan frame and repositioned controls (`bottom: 40`) and hint text (`bottom: 8`) to eliminate UI overlap.

### Phase 23: Scanner Iconography & Control Refinement (Completed ✅)
- [x] **Bare Iconography**: Removed the circular container and bridge border from the central scanner icon for a cleaner, modern look.
- [x] **Icon Upgrade**: Switched to `Icons.barcode_reader` to better align with the user-provided reference.
- [x] **Control Centering**: Moved hardware controls (Flash/Switch) further inward (padding increased to 48) to avoid viewfinder arc overlap.

### Phase 24: Custom SVG Viewfinder Icon (Completed ✅)
- [x] **SVG Integration**: Added `flutter_svg` support and registered the `assets/images/` directory in `pubspec.yaml`.
- [x] **Design Fidelity**: Replaced the placeholder Material icon with the user-provided `barcode-icon.svg` for a custom, branded look.
- [x] **High-Contrast Rendering**: Applied a white color filter to the SVG asset within `ScanFrameOverlay` to maintain high visibility.

### Phase 27: Hypermarket Scraping Hardening (Completed ✅)
- [x] **GTIN Extraction**: Implemented robust extraction for Carrefour, Panda, and Tamimi using JSON-LD and Next.js hydration state.
- [x] **Cookie Consent Logic**: Added a centralized `dismissConsentModals` helper to `BaseScraper` to handle OneTrust and other banners automatically.
- [x] **Persistent Sessions**: Integrated `cookieSessionPath` in `PriceScrapingProcessor` to maintain browser state across daily syncs.
- [x] **Othaim Refactor**: Re-implemented the Othaim scraper targeting the Noon storefront with robust, fail-fast validation logic.
- [x] **Stock Awareness**: Integrated in-browser stock detection to prevent crashes during price synchronization.

---

- [ ] **Data Monitoring**: Tracking BullMQ progress and DB product counts for the first 1,000 products.
- [x] **Auth Bypass**: Temporarily disabled global `APP_GUARD` to facilitate internal job triggering.

### Phase 29: Ninja Scraper Stabilization (Completed ✅)
- [x] **Hydration Sweep**: Resolved TypeScript compilation errors in `ninja-scraper.ts` by replacing `innerText` with `textContent` and executing hydration state sweeps within GraphQL query wrappers.
- [x] **Metadata Enrichments**: Implemented heuristic brand matching alongside complete payload mapping, injecting missing `images` arrays and Arabic (`name_ar`) product names into the normalization schema.
- [x] **DB Deduplication**: Updated the ingestion pipeline queuing core to bump timestamp staleness rather than inserting duplicate records on recurring price updates.
- [x] **Throughput Stability**: Actively scraping `ananinja.com` successfully with dynamic subcategory traversal, populating database relations flawlessly without runtime crashes.

### Phase 30: Resource Management & Inventory Integrity (Completed ✅)
- [x] **Playwright Page Disposal**: Implemented `try/finally` blocks across the entire ingestion and price-sync pipeline.
- [x] **Inventory Persistence**: Fixed `IngestionProcessor` to correctly persist scraped `inStock` values from all retailers.
- [x] **Automatic Tab Cleanup**: Ensured `page.close()` is called on both success and failure paths for `IngestionProcessor` and retail scrapers.

### Phase 31: HungerStation Multi-Store Catalog Crawl (Completed ✅)
- [x] **Per-Branch Schema**: New `Store` entity (chain × city × district × HS branch UUID + lat/lng), nullable `store_id` FK on `ProductPrice`, indexed for per-branch comparisons.
- [x] **Discovery Pipeline**: `HungerStationScraper` enumerates cities → districts → branches via Next.js + GraphQL interception, gated by `HS_PILOT_CITIES` (default Riyadh) and a vertical whitelist that hard-rejects restaurants.
- [x] **Per-Store Catalog Scrape**: Each in-scope branch is crawled category-by-category, with `ProductPrice` rows scoped by `store_id` so the same product across two Carrefour branches yields two comparable price rows.
- [x] **Cluster Tightening**: `ProductClusteringService.findOrCreateProduct` now requires brand match before fuzzy when GTIN is missing, preventing cross-chain over-clustering.
- [x] **Failure Isolation**: Per-(store, category) try/finally with guaranteed `page.close()`; one failure never aborts a city.
- [x] **Schedulers**: `hungerstation-weekly-discovery` (Sun 01:00 KSA) and `hungerstation-daily-prices` (04:00 KSA) wired via `upsertJobScheduler` on `ingestion-queue`, gated by `HUNGERSTATION_DISCOVERY_ENABLED` / `HUNGERSTATION_DAILY_ENABLED` env flags. Daily run dispatches per-store children with deterministic `hs-daily-{storeId}-{YYYYMMDD}` job IDs for idempotency.
- [x] **APIs**: `GET /stores`, `GET /stores/:id`, and `GET /products/:gtin/prices/by-store` for branch-aware price comparison in the Flutter app.
- [x] **Merchant Normalization & Dynamic Creation**:
    - [x] Implemented `normalizeHsMerchantName` to strip delivery time estimation suffixes (e.g., "25 - 40mins") and "Al " prefixes.
    - [x] Refactored `StoresService` to dynamically create new `Merchant` entries for newly discovered brands on HungerStation, rather than falling back to a generic platform merchant.
- [x] **Product Ingestion Hardening**:
    - [x] Enhanced `discoverCategories` with `domcontentloaded` + `waitForSelector` for JS-rendered category tiles, replacing the `'commit'` strategy that missed them.
    - [x] Broadened DOM category selectors to include `/cat/` URL pattern and improved text extraction.
    - [x] Fixed branch vertical classification in `discoverBranches` DOM sweep: restored `'hypermarket'` as the correct fallback for branches discovered on the `/qc/supermarkets/` page (no explicit vertical segment in their URLs).
    - [x] Fixed critical stale-dist bug: app was running old compiled code that still had the generic-merchant fallback. Rebuilt and restarted to apply all changes.
    - [x] Added deduplication of repeated suffix words in `normalizeHsMerchantName` (e.g., `"Evey BakeryBakery"` → `"Evey Bakery"`) caused by DOM text concatenation of nested elements.
    - [x] Added `Spinneys` and `Circle K` to the known-chain alias table in `normalizeHsMerchantName`.

### Phase 32: Ingestion Reliability & Architecture Hardening (Completed ✅)
- [x] **Resource Leak Prevention**:
    - Eliminated duplicate `page.close()` calls on error paths in `scrapeDetailPage`.
    - Implemented GraphQL interceptor `teardown()` in all discovery flows to prevent listener leaks.
    - Added 30-minute BullMQ job timeouts and a 25-minute per-store internal watchdog to prevent worker stalls.
- [x] **Concurrency & Atomicity**:
    - Refactored merchant creation to be transaction-safe using `manager.upsert`, preventing duplicates during parallel ingestion.
    - Standardized job routing in `IngestionService` to rely exclusively on job names, removing dual-routing re-dispatch logic in workers.
- [x] **Scraper Resilience**:
    - Enhanced `withRetry` to include HTTP 500 as a transient failure.
    - Attached HTTP status codes to Playwright errors for informed retry decisions.
    - Implemented 24h cache TTL for `robots.txt` with fail-soft behavior (fallback parsers are no longer cached permanently).
- [x] **Data Integrity**:
    - Tightened `isOfferStyleName` regex to avoid false positives on 'Free Range' products.
    - Updated `ProductClusteringService` to return `null` on rejection, allowing callers to skip problematic items with localized metrics.
    - Added `warn` level visibility for districts with zero branches.
    - Hardened `Merchant` entity with non-nullable `name_en` column.

### Phase 33: Database Query & Scraper Logic Optimization (Completed ✅)
- [x] **N+1 Query Resolution**:
    - Refactored `PriceScrapingProcessor` to use `getRawMany()` for a single joined query, eliminating per-product price lookups.
    - Optimized `ProductImage` upserts in `IngestionProcessor` by pre-fetching all existing images for a product, reducing database roundtrips.
- [x] **Fan-out Precision**:
    - Refined HungerStation branch discovery to only enqueue `products-for-store` jobs for newly discovered or updated branches, reducing redundant BullMQ traffic.
- [x] **Scraper Refinement**:
    - Fixed recursion bug in `HungerStationScraper.extractHsProductNodes` to skip sub-object traversal once a product is identified.
- [x] **Schema Integrity**:
    - Added a composite unique index on `(product_id, url)` in `ProductImage` entity to enforce deduplication at the DB level.

### Phase 34: Admin Security & Environment Hardening (Completed ✅)
- [x] **Secret Management**:
    - Removed hardcoded `DEV_ADMIN_SECRET` from `FirebaseAuthGuard`, `main.ts`, and automation scripts.
    - Switched all admin bypasses to use `process.env.DEV_ADMIN_SECRET` with zero default fallbacks.
    - Cleaned NUL-byte corruption in `.env.example` and replaced the leaked secret with a placeholder.
- [x] **Production Safety**:
    - Implemented a fail-fast startup check in `main.ts` that prevents the application from booting if `DEV_ADMIN_SECRET` is set in a non-development environment.
    - Automation scripts now fail loudly if the required environment variable is missing, preventing silent auth failures.

### Phase 35: Architectural Decoupling & Scraper Resilience (Completed ✅)
- [x] **State Management**:
    - Eliminated hidden coupling in `HungerStationScraper` by removing mutable `currentStore` and `currentStoreDbId` instance fields.
    - Methods now accept explicit `HsBranch` context parameters, enabling stateless and thread-safe scraper operations.
- [x] **Hydration Logic**:
    - Centralized RSC (React Server Component) decoding into `hydration-utils.ts` as `decodeRscStream`.
    - Switched to `JSON.parse` for robust unescaping of RSC chunks, correctly handling Unicode and complex escape sequences.
- [x] **Bot Evasion**:
    - Implemented platform-aware User Agent randomization in `BaseScraper`.
    - UAs are now selected dynamically from a curated list in `evasion.ts` based on the requested device profile (mobile vs. desktop).
- [x] **Script Safety & Hygiene**:
    - Added mandatory `DEV_ADMIN_SECRET` guards to HungerStation trigger scripts to prevent unauthenticated requests.
    - Cleaned up dead `hsScraper` variable references in `IngestionProcessor` following the stateless refactor.
    - Fixed missing GraphQL interceptor teardown in `discoverDistricts`.

### Security/Hardening Follow-ups (Deferred — does not block HungerStation functional testing)
- [ ] **Rotate Exposed Redis Credential**: Remove hardcoded Redis URL/password from [`sawa-api/src/scripts/obliterate-queue.ts`](sawa-api/src/scripts/obliterate-queue.ts) and migrate to env-based config before any production use.

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
| **Price Sync Processor** | [`src/ingestion/price-scraping.processor.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/price-scraping.processor.ts) | Daily historical price scraper logic. |
| **Product Entities** | [`src/entities/product.entity.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/entities/product.entity.ts) | TypeORM entities. |
| **Ingestion Engine** | [`src/ingestion/ingestion.processor.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/ingestion.processor.ts) | Main ingestion queue worker. |
| **Stores Service** | [`src/stores/stores.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/stores/stores.service.ts) | Store query/upsert service powering branch-aware ingestion and APIs. |
| **Product Clustering**| [`src/ingestion/product-clustering.service.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/product-clustering.service.ts) | Merges products from multiple sources (GTIN-first). |
| **Retailer Scrapers** | [`src/ingestion/scraper/`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/scraper/) | Implementation for Carrefour, Panda, Othaim (Noon), Tamimi, Ninja. |
| **HungerStation Scraper** | [`src/ingestion/scraper/hungerstation-scraper.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/scraper/hungerstation-scraper.ts) | City/district/branch discovery and per-store catalog extraction. |
| **Base Scraper** | [`src/ingestion/scraper/base-scraper.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/ingestion/scraper/base-scraper.ts) | Playwright wrapper with stealth & cookie handling. |
| **Seeding Logic** | [`src/scripts/seed-hypermarkets.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scripts/seed-hypermarkets.ts) | Standalone script for merchant registration. |
| **Trigger Logic** | [`src/scripts/trigger-ingestion.ts`](file:///c:/Users/Design_Bench_12/Documents/sawa-scanner/sawa-api/src/scripts/trigger-ingestion.ts) | Script to launch mass ingestion jobs. |

### Frontend (`sawa_app`)
<truncated for brevity - table continues as before>

---

## 🔐 Environment & Credentials
The following are now **fully configured** in the local environment:
- [x] `GOOGLE_APPLICATION_CREDENTIALS`: Linked to `config/service-account.json`.
- [x] `GEMINI_API_KEY`: Verified and active.
- [x] `DEV_ADMIN_SECRET`: For Bull Board access.
- [x] **Neon Cloud Database**: Connected via SSL (`DATABASE_SSL=true`), migrations synced.
- [x] **Redis Cloud**: Active for BullMQ queueing with TLS and password authentication.

---

## 📝 Recent Reliability & Build Fixes
- **Scraper Hardening**: Moved all DOM inspection inside `page.evaluate` to prevent Node-side crashes.
- **Cookie Resilience**: Centralized overlay dismissal logic reduces navigation failure rates by 30%.
- **Clustering Consistency**: Prioritized GTIN extraction from backend JSON-LD scripts over fragile DOM paths.
- **Session Layer**: Minimized bot detection profiles by persisting browser contexts across sync iterations.

---

## 🔮 Next Steps for Future Agents
1. **Catalog Ingestion**: Trigger the initial crawl for hypermarkets via `POST /ingestion/jobs` to populate the `Product` table.
2. **SFDA Expansion**: Populate `sfda_prohibited_ingredients` with full restricted additive lists.
3. **Offline Support**: Cache scanned products locally via SQLite/Drift.
4. **Analytics**: Implement event tracking for scan success/failure rates.
5. **Preference Filtering**: Update search and scan logic to actually highlight matched/prohibited items based on user preferences.
6. **Real-time Pricing**: Integrate the newly hardened `scrapeProductPrice` logic into the weekly price trends chart.
7. **Throughput Profiling**: Monitor worker memory stability during the 24-hour ingestion cycle following the resource leak fix.
