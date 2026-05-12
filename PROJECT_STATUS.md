# Project Status

## Milestones
- [x] Integrate AI-driven GTIN product matching
- [x] Configure fallback LLM providers (Vertex, Google AI, Ollama)
- [x] Implement robust backfill architecture (Pass A-G) with automated reporting
- [x] Optimize Ollama matching throughput (Dominant Match fast path, concurrency limits, timeouts, smaller local model fallback)
- [x] Add OFF pivot database schema updates (Product fields & migrations)
- [x] Implement automated Open Food Facts (OFF) ingestion pipeline (`OffImportService`)
- [x] Implement semantic data enrichment pipeline (`OffEnrichmentService`) with borrowing rules
- [x] Integrate ingestion infrastructure (Controller, Processor, CLI Triggers)
- [x] Implement HungerStation price linking pipeline (`OffPriceLinkerService`)
- [x] Refactor HungerStation scraper for dynamic store URLs and search parameters
- [x] Implement barcode-list.com alternative name scraping pipeline (`BarcodeListScraperService`)
- [x] HungerStation Catalog Pivot: DB schema (nullable gtin, hs_product_id, hs_product_url), refined catalog scraper, admin GTIN assignment workflow
- [x] Next Steps: Run `HsCatalogPivot` migration to reset product tables and apply new schema.
- [x] Next Steps: Execute first HS catalog scrape run against Al-Othaim store (Fixed 404 URL extraction).
- [x] Next Steps: Use admin mobile app to scan and assign GTINs to scraped products.
- [ ] Next Steps: Integrate alternative names into HungerStation price linking search queries.
- [ ] Next Steps: Perform a full product catalog re-indexing for `ProductClusteringService` once the data is imported and enriched.
- [x] Next Steps: Deploy and validate the distributed worker system for portable multi-node price linking.

## Architecture Decisions
- **AI Processing Layer**: A clear separation of match routing vs processing ensures clean code. The `gtin-backfill.service.ts` acts as the orchestrator.
- **Provider Fallbacks**: Fallbacks configured via `.env` thresholds.
- **Ollama Fast Paths**: We use a `isDominantMatch` fast path (topCosine >= 0.78 and > 0.08 diff from runner-up) to auto-apply semantic embeddings without invoking LLM tokens.
- **OFF Data Integration**: The `OffImportService` processes the 10GB raw dump dynamically using memory-efficient streams. Singleton concurrency locking using BullMQ ensures database resilience.
- **Enrichment Logic**: `OffEnrichmentService` uses `EmbeddingShortlister` to find donor products and borrow high-completeness data (nutrition, ingredients, names) based on cosine similarity thresholds.
- **HungerStation Price Linking**: Uses dynamic store URLs from `store.source_url` (or fallback to standardized paths) and normalized search query logic (`query` param) to resolve items on the platform. Implements confidence scoring for cross-merchant product linkage.
- **Barcode-List Name Enrichment**: `BarcodeListScraperService` scrapes barcode-list.com for alternative commercial product names (POS/retail-style) per GTIN. These names are stored in a dedicated `product_alternative_name` table with popularity rankings, enabling better HungerStation search match rates.
- **HungerStation Catalog Pivot**: Products are now primary-indexed by `hs_product_id` (the numeric ID from HungerStation URLs), not by GTIN. The `gtin` column is nullable with a partial unique index (`WHERE gtin IS NOT NULL`) to maintain integrity for scanned products while allowing HS catalog imports without GTINs. The `HsCatalogScraperService` navigates the HungerStation web platform using Playwright-stealth. It robustly deduplicates listing products by resolving URL slugs, preventing 404s on detail pages. Manual GTIN assignment is handled via a dedicated Flutter admin screen (`NeedsGtinBrowseScreen`) with inline camera barcode scanning.
- **Distributed Scraping Orchestration**: `HsCatalogScraperService` utilizes an Orchestrator-Worker pattern to bypass the singleton lock limitation for `hs-catalog-scrape`. An initial orchestrator job discovers categories and enqueues individual `hs-catalog-scrape-category` sub-tasks into BullMQ, allowing multiple local and remote PCs to process categories completely independently and in parallel. This also inherently resolves failover and resumability (since failed chunks return to the queue independently).

## Environment & Configuration
Ensure you have updated the `.env` settings to match the optimizations:
- `OFF_IMPORT_BATCH_SIZE=500`
- `OFF_IMPORT_GLOBAL_BRANDS=coca-cola,pepsi,almarai,nido,maggi,lipton,red-bull,oreo,pringles,nutella,indomie`
- `GTIN_AI_MATCH_CONCURRENCY=1`
- `GTIN_EMBEDDING_CONCURRENCY=2`
- `OLLAMA_GTIN_MATCH_MODEL=gemma3:1b`
- `GTIN_EMBEDDING_AUTO_APPLY_COSINE=0.88`
- `BARCODE_LIST_REQUEST_DELAY_MS=2000`
- `BARCODE_LIST_DAILY_BUDGET=5000`
- `HS_CATALOG_STORE_URL=https://hungerstation.com/sa-en/qc/65969/AL-Othaim/branch/...` (target store for catalog scrape)
- `HS_CATALOG_MAX_CATEGORIES=0` (0 = all categories)
- `HS_CATALOG_MAX_PRODUCTS_PER_CAT=0` (0 = all products)
- `HS_CATALOG_REQUEST_DELAY_MS=2000`

## Key File References
| File | Role |
|------|------|
| `src/ingestion/gtin-backfill.service.ts` | Orchestrator for GTIN AI extraction pipeline. |
| `src/ingestion/off-import.service.ts` | Handles batch streaming and normalization of OFF dump. |
| `src/ingestion/off-enrichment.service.ts` | Implements automated data borrowing from donor products. |
| `src/ingestion/ai-match/embedding-shortlister.ts` | Calculates semantic distance for matching and enrichment ranking. |
| `src/scripts/trigger-off-import.ts` | CLI script to trigger the OFF ingestion pipeline. |
| `src/scripts/trigger-off-enrichment.ts` | CLI script to trigger the automated enrichment pipeline. |
| `src/ingestion/off-price-linker.service.ts` | Cross-references OFF products with store prices (HungerStation). |
| `src/ingestion/barcode-list-scraper.service.ts` | Scrapes barcode-list.com for alternative commercial product names per GTIN. |
| `src/entities/product-alternative-name.entity.ts` | Entity for storing multiple alternative names per product. |
| `scripts/trigger-off-price-linking.ts` | CLI script to trigger the HungerStation price linking pipeline. |
| `src/scripts/trigger-barcode-list-names.ts` | CLI script to trigger the barcode-list.com name scraping pipeline. |
| `src/ingestion/hs-catalog-scraper.service.ts` | Refined HungerStation catalog scraper (Playwright-stealth, category/product iteration). |
| `src/ingestion/dto/hs-catalog-job.dto.ts` | DTO for HS catalog scrape job configuration. |
| `src/scripts/trigger-hs-catalog.ts` | CLI script to trigger the HS catalog scrape pipeline. |
| `src/products/admin-products.service.ts` | Admin service for GTIN assignment and missing-GTIN queries. |
| `sawa_app/lib/presentation/screens/admin/needs_gtin_browse_screen.dart` | Flutter screen for browsing HS products and assigning GTINs via camera scanner. |
| `.env.example` | Template for configuring thresholds and batch sizes. |
