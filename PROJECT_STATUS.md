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
- [ ] Next Steps: Perform a full product catalog re-indexing for `ProductClusteringService` once the data is imported and enriched.

## Architecture Decisions
- **AI Processing Layer**: A clear separation of match routing vs processing ensures clean code. The `gtin-backfill.service.ts` acts as the orchestrator.
- **Provider Fallbacks**: Fallbacks configured via `.env` thresholds.
- **Ollama Fast Paths**: We use a `isDominantMatch` fast path (topCosine >= 0.78 and > 0.08 diff from runner-up) to auto-apply semantic embeddings without invoking LLM tokens.
- **OFF Data Integration**: The `OffImportService` processes the 10GB raw dump dynamically using memory-efficient streams. Singleton concurrency locking using BullMQ ensures database resilience.
- **Enrichment Logic**: `OffEnrichmentService` uses `EmbeddingShortlister` to find donor products and borrow high-completeness data (nutrition, ingredients, names) based on cosine similarity thresholds.

## Environment & Configuration
Ensure you have updated the `.env` settings to match the optimizations:
- `OFF_IMPORT_BATCH_SIZE=500`
- `OFF_IMPORT_GLOBAL_BRANDS=coca-cola,pepsi,almarai,nido,maggi,lipton,red-bull,oreo,pringles,nutella,indomie`
- `GTIN_AI_MATCH_CONCURRENCY=1`
- `GTIN_EMBEDDING_CONCURRENCY=2`
- `OLLAMA_GTIN_MATCH_MODEL=gemma3:1b`
- `GTIN_EMBEDDING_AUTO_APPLY_COSINE=0.88`

## Key File References
| File | Role |
|------|------|
| `src/ingestion/gtin-backfill.service.ts` | Orchestrator for GTIN AI extraction pipeline. |
| `src/ingestion/off-import.service.ts` | Handles batch streaming and normalization of OFF dump. |
| `src/ingestion/off-enrichment.service.ts` | Implements automated data borrowing from donor products. |
| `src/ingestion/ai-match/embedding-shortlister.ts` | Calculates semantic distance for matching and enrichment ranking. |
| `src/scripts/trigger-off-import.ts` | CLI script to trigger the OFF ingestion pipeline. |
| `src/scripts/trigger-off-enrichment.ts` | CLI script to trigger the automated enrichment pipeline. |
| `.env.example` | Template for configuring thresholds and batch sizes. |
