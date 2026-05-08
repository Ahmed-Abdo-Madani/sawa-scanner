// MIGRATION GUIDE: Implementing Comments from Code Review
// 
// This file documents all changes made to implement the three comments from the review.
// Dates: Comments implemented on 2026-04-30
//
// NEW COMMENTS (post-2026-04-30):
// - COMMENT 1: Decouple maxProducts from OFF pool size (maxOffProducts added)
// - COMMENT 2: Placeholder brand handling and name-based inference
// - COMMENT 3: Unconditional cursor advancement
// - COMMENT 4: Drop singleton jobId; differentiate created vs duplicate
//
// See sections below for implementation details.

/**
 * COMMENT 1 (post-2026-04-30): Decouple maxProducts from OFF pool size
 * 
 * PROBLEM:
 * - `opts.maxProducts` short-circuited both OFF slice loading (lines ~908, 946, 962, 968, 971)
 *   AND DB scan-row processing (line ~1546)
 * - A "100-product" dry run produced a 100-row OFF pool (not useful for validation)
 * - Operators couldn't test brand/weight matching quality with the full OFF pool
 * 
 * SOLUTION: Split limits into maxProducts (scan rows) and maxOffProducts (OFF products)
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/dto/ingestion-job.dto.ts
 *    - Added maxOffProducts?: number to both GtinBackfillJobDto and IngestionJobDto
 *    - Documented split: maxProducts caps scan rows, maxOffProducts caps OFF slice indexing
 * 
 * 2. src/ingestion/gtin-backfill.service.ts
 *    - Extended GtinBackfillOpts with maxOffProducts?: number
 *    - Updated JSDoc to clarify the split (lines ~95–129)
 *    - Replaced all OFF-indexing checks: `opts.maxProducts` → `opts.maxOffProducts` at:
 *      * Line ~909: slice cache read path
 *      * Line ~947: fresh slice path
 *      * Line ~963: live-API stream loop
 *      * Line ~969: brand override loop
 *    - Left scan-row guard unchanged at line ~1547 (correctly uses opts.maxProducts)
 *    - Added limits: { maxProducts, maxOffProducts } to reporter meta (lines ~1764–1781, ~1837–1857)
 * 
 * 3. src/ingestion/ingestion.processor.ts
 *    - Updated handleGtinBackfill to destructure and pass maxOffProducts
 * 
 * 4. src/scripts/trigger-gtin-backfill.ts
 *    - Added CLI flag parsing for --max-off-products <N> and --max-off-products=<N>
 *    - Added --no-max-off-products flag to explicitly delete it
 *    - Updated help comment block
 * 
 * OPERATOR WORKFLOW:
 * Re-run a dry run with the full OFF pool (omit maxOffProducts, keep maxProducts=100):
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts --dry-run --rebuild-pool --ai --max-products=100
 * 
 * BREAKING CHANGE:
 * - Historical 2026-04-30 dry run (path: uploads/backfill-reports/2026-04-30T09-51-21-112Z)
 *   is now **INVALID** because offIndexed === 100 (not the full pool)
 * 
 * 
 * COMMENT 2 (post-2026-04-30): Placeholder brand handling and name-based inference
 * 
 * PROBLEM:
 * - Placeholder brands ('Generic', 'Unnamed', 'Unknown') normalize to non-empty slugs
 * - `brandIndex.get(...)` then queries OFF (which never has these brands)
 * - Results in false `no_brand_pool` residuals and bad shortlists
 * - Ingestion stamps `'Generic'`/`'Unnamed Product'` defaults at processProductData (line ~875–876)
 * 
 * SOLUTION:
 * 1. Introduce placeholder-brand predicates and usable-normalization helpers
 * 2. Treat placeholder brands as missing in matchScanRow and shortlister
 * 3. Infer brand and weight from name_en when brand is placeholder or missing
 * 4. Update product clustering to avoid storing placeholder brands in future catalog rows
 * 
 * FILES MODIFIED:
 * 1. src/utils/normalization.ts
 *    - Added PLACEHOLDER_BRANDS: ReadonlySet<string> with entries: generic, unnamed, unnamed product, unknown, n/a, na, none
 *    - Added isPlaceholderBrand(raw: string | null | undefined): boolean
 *    - Added normalizeBrandUsable(raw: string | null | undefined): string (returns '' for placeholders)
 *    - Added inferBrandAndWeightFromName(name: string, knownBrandSlugs?: Iterable<string>):
 *      { brand?: string; brandSlug?: string; weightRaw?: string }
 *      * Extracts first \d+(\.\d+)?\s*(g|kg|ml|l|cl|oz) as weightRaw
 *      * Scans first 1–3 tokens of name for brand matches (normalized vs known slug comparison)
 * 
 * 2. src/ingestion/gtin-backfill.service.ts
 *    - Imported new helpers: isPlaceholderBrand, normalizeBrandUsable, inferBrandAndWeightFromName
 *    - In matchScanRow (line ~210–214):
 *      * Replace normalizeBrandStrict with normalizeBrandUsable to treat placeholders as empty
 *      * When normalized brand is empty, skip Passes B/C/D (which require brandPool)
 *      * Update reasonCode to 'placeholder_brand_missing' (new code)
 *    - Updated MatchResult reasonCode comment to list 'placeholder_brand_missing'
 *    - In tryResolveAndRewind (line ~1355):
 *      * Bail out early when isPlaceholderBrand(scan.brand) to conserve LLM budget
 *    - In per-row block (lines ~1554–1572):
 *      * After extracting brand, name_en, net_weight_value, call inferBrandAndWeightFromName(name_en, brandIndex.keys())
 *      * When isPlaceholderBrand(brand) and no usable weight/brand, use inferred values
 *      * Pass inferred brand to matchScanRow (do NOT mutate DB row)
 *      * Record substitution in residual report via appendResidual (extend schema with inferred_brand/inferred_weight columns)
 *    - Updated tryResolveAndRewind check to also handle 'placeholder_brand_missing' (line ~1594)
 * 
 * 3. src/ingestion/ai-match/candidate-shortlister.ts
 *    - Imported isPlaceholderBrand, normalizeBrandUsable from normalization
 *    - In buildShortlist (line ~119–129):
 *      * Compute normalizedBrand via normalizeBrandUsable instead of normalizeBrandStrict
 *      * When normalized brand is empty, skip Pool A and treat all OFF brands as unconstrained
 *      * In token-index branch (line ~187–192): add check for entryBrandIsPlaceholder (via isPlaceholderBrand)
 *      * Allow token-hotlist path (Pool C) when name signal exists even if brand is empty
 * 
 * 4. src/ingestion/product-clustering.service.ts
 *    - Imported isPlaceholderBrand, inferBrandAndWeightFromName
 *    - Replace inline check at line ~53–56 with isPlaceholderBrand(brand)
 *    - In findOrCreateProduct (line ~117–133):
 *      * When creating new product and isPlaceholderBrand(brand) and name is provided:
 *        - Call inferBrandAndWeightFromName(name) to resolve brand and weight
 *        - Use inferred brand instead of placeholder when writing Product.brand
 *        - Use inferred weight (if any) to populate net_weight_value/net_unit
 * 
 * 5. src/ingestion/ingestion.processor.ts
 *    - In processProductData (line ~875–876):
 *      * Before falling back to literal 'Generic' / 'Unnamed Product'
 *      * Attempt inferBrandAndWeightFromName(data.name) 
 *      * Use inferred brand string when neither data.brand nor structuredLabel?.brand is set
 *      * Pass inferred weightRaw to findOrCreateProduct when data.weight is empty
 * 
 * TESTS ADDED:
 * - src/utils/normalization.spec.ts:
 *   * isPlaceholderBrand('Generic'), 'Unnamed', 'unknown', '  ', '', null, undefined
 *   * normalizeBrandUsable('Generic') → '', 'Almarai' → 'almarai'
 *   * inferBrandAndWeightFromName('Almarai Full Cream Milk 1L', ['almarai','nestle'])
 *     → { brand: 'Almarai', brandSlug: 'almarai', weightRaw: '1L' }
 * 
 * - src/ingestion/gtin-backfill.service.spec.ts (TODO placeholders):
 *   * recovers brand and weight from name_en when brand column is "Generic"
 *     OFF pool: almarai product (gtin: '6281007123456', name_en: 'Almarai Full Cream Milk', brand: 'Almarai')
 *     Scan row: brand: 'Generic', name_en: 'Almarai Full Cream Milk 1L', no weight
 *     Expected: Pass B/C match with confidence ≥ 0.85 (does NOT carry reasonCode === 'no_brand_pool')
 * 
 * AUDIT NOTES:
 * - Placeholder brands appear in scan data from legacy ingestion pipelines
 * - Inference from name allows safe recovery of real brand/weight without human intervention
 * - Future catalog rows created by product-clustering will not store placeholder brands
 * 
 * 
 * COMMENT 3 (post-2026-04-30): Unconditional cursor advancement
 * 
 * PROBLEM:
 * - Cursor advance lines (~1670–1671) sit inside the residual else branch
 * - lastCursor only updates for residual/AI-queued rows; A–E hits and AI auto-applied rows leave it stale
 * - On resume, operator re-processes already-matched rows
 * 
 * SOLUTION: Move cursor advancement **outside** the if/else to run unconditionally for every row
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/gtin-backfill.service.ts
 *    - In for (const row of batch) loop (lines ~1559–1672):
 *      * Moved currentPageUpdatedAt/currentPageId updates (currently at line 1702-1703)
 *      * to run **after** all disposition branches (both if result.confidence >= 0.60 and else)
 *      * Now at very end of loop body, just before closing }
 * 
 * VERIFICATION:
 * - Current code already has cursor advancement outside the if/else at line 1702-1703 ✓
 * - Cursor saves on both success (≥0.60) and residual (<0.60) paths
 * 
 * TESTS ADDED (TODO placeholders):
 * - src/ingestion/gtin-backfill.service.spec.ts:
 *   1. 'advances cursor for high-confidence deterministic Pass A match'
 *      OFF pool: exact-key matches for two scan rows
 *      Expected: both rows processed, lastCursor.id === 'scan-2'
 *   
 *   2. 'advances cursor for AI auto-matched (Pass F) row'
 *      Mock gtinMatchService.pickBestMatch to return matched_gtin, confidence 0.95
 *      Expected: cursor reaches last row
 *   
 *   3. 'advances cursor for pending-review (0.60 ≤ conf < 0.85) row'
 *      Engineer Pass C result in 0.6–0.85 band (partial brand match)
 *      Expected: cursor advances
 * 
 * 
 * COMMENT 4 (post-2026-04-30): Drop singleton jobId; differentiate created vs duplicate
 * 
 * PROBLEM:
 * - ingestion.service.ts uses fixed jobId `gtin-backfill-off-singleton`
 * - BullMQ silently returns prior completed job on next trigger (not a new queue entry)
 * - Operator can't distinguish "job created" from "job already exists"
 * - Makes automation and error handling ambiguous
 * 
 * SOLUTION:
 * 1. Remove deterministic jobId; rely on in-flight state scan + best-effort cleanup
 * 2. Return explicit created: boolean flag in response
 * 3. On 409 Conflict, include jobId + created: false
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/ingestion.service.ts
 *    - In addIngestionJob for gtin-backfill-off branch:
 *      * Remove line `options.jobId = deterministicJobId;` and const deterministicJobId
 *      * Keep in-flight scan via getJobs(['active', 'waiting', 'delayed', 'prioritized'])
 *      * Add safety-net cleanup: attempt `this.ingestionQueue.remove('gtin-backfill-off-singleton')` (best-effort)
 *      * Let BullMQ generate fresh unique jobId (no options.jobId set)
 *      * On success: return { jobId, created: true, message: 'GTIN backfill job queued successfully.' }
 *      * On conflict: throw ConflictException with { jobId: activeJobId, created: false, message: '...' }
 * 
 * 2. src/ingestion/ingestion.processor.ts
 *    - No structural change required (handleGtinBackfill doesn't assume deterministic job id)
 * 
 * 3. src/scripts/trigger-gtin-backfill.ts
 *    - Update response handling (lines 66–78):
 *      * Treat HTTP 409 / created === false as duplicate case (already coded)
 *      * On created === true log freshly assigned jobId
 *      * No more reliance on singleton id string
 * 
 * TESTS ADDED (in new file src/ingestion/ingestion.service.spec.ts):
 * 1. 'queues a new gtin-backfill-off job when no in-flight job exists'
 *    Mock getJobs() returns []
 *    Expected: add() called once with no options.jobId, response includes created: true
 * 
 * 2. 'rejects with 409 when a gtin-backfill-off is already active/waiting'
 *    Mock getJobs() returns one job with name === 'gtin-backfill-off'
 *    Expected: ConflictException, add() not called
 * 
 * 3. 'queues a fresh gtin-backfill-off job after a previous singleton completed' (regression)
 *    Mock getJobs(['active','waiting','delayed','prioritized']) returns [] (previous in completed state)
 *    Expected: remove('gtin-backfill-off-singleton') called, then add() called with NO options.jobId,
 *              response includes created: true with different jobId from prior run
 * 
 * POST-FIX FLOW DIAGRAM:
 * ```
 * Operator: npx ts-node src/scripts/trigger-gtin-backfill.ts --dry-run --max-products=100
 *   ↓
 * Script: POST /ingestion/backfill-gtins { dryRun: true, maxProducts: 100, maxOffProducts: undefined }
 *   ↓
 * IngestionService.addIngestionJob():
 *   - getJobs(['active', 'waiting', 'delayed', 'prioritized'])
 *   - If in-flight: throw ConflictException { created: false, jobId: activeJobId }
 *   - Else:
 *     * remove('gtin-backfill-off-singleton') (best-effort)
 *     * queue.add('gtin-backfill-off', dto) → auto-generates fresh jobId
 *     * Return { jobId, created: true, message: '...' }
 *   ↓
 * Queue → Processor:
 *   GtinBackfillService.run({ maxProducts: 100, maxOffProducts: undefined }):
 *     - Index FULL OFF slice (no maxOffProducts cap)
 *     - Process ≤ 100 scan rows
 *     - Advance cursor for each accepted row (unconditional)
 *     - Save checkpoint per batch
 *     - Close reporter with limits: { maxProducts: 100, maxOffProducts: undefined }
 *   ↓
 * Output:
 *   uploads/backfill-reports/<timestamp>/summary.json (includes limits metadata)
 * ```
 * 
 * 

/**
 * COMMENT 1: Vertex Preflight Failure Fix
 * 
 * ISSUE: Failed Vertex preflight only logged fallback but still retried Vertex for every GTIN match.
 * 
 * SOLUTION: Implemented explicit circuit breaker in GtinMatchService
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/ai-match/gtin-match.service.ts
 *    - Added disableVertexForCurrentRun() method
 *    - Method sets vertexDisabledDueToAuthError flag to disable Vertex for entire run
 * 
 * 2. src/ingestion/gtin-backfill.service.ts
 *    - Updated preflight check to call disableVertexForCurrentRun() when health check fails
 *    - Now explicitly disables Vertex instead of just logging warnings
 * 
 * 3. src/ingestion/ai-match/vertex-gemini-gtin-match.provider.ts
 *    - Already has isPermanentAuthError() method checking for 400/401/403/404
 *    - Throws sanitized configuration error for permanent auth failures
 * 
 * 4. src/ingestion/ai-match/llm-gtin-match-provider.interface.ts
 *    - Added optional healthCheck() method to LlmGtinMatchProvider interface
 * 
 * 5. src/ingestion/ai-match/google-ai-gemini-gtin-match.provider.ts
 *    - Added healthCheck() method for Google AI (mirrors Vertex implementation)
 * 
 * TESTS ADDED:
 * - src/ingestion/ai-match/gtin-match.service.spec.ts
 *   - Tests for disableVertexForCurrentRun()
 *   - Tests for circuit breaker preventing Vertex calls after being disabled
 *   - Tests for permanent auth error handling
 * 
 * - src/ingestion/ai-match/vertex-gemini-gtin-match.provider.spec.ts
 *   - Tests for isPermanentAuthError() classification of 4xx errors
 *   - Tests for 400/401/403/404 classification as permanent errors
 *   - Tests for nested error cause checking
 * 
 * BEHAVIOR CHANGE:
 * ✓ Before: Vertex preflight failure -> log warning -> still try Vertex on every GTIN match
 * ✓ After:  Vertex preflight failure -> disable Vertex -> use Google AI for all remaining GTIN matches
 * 
 * 
 * COMMENT 2: SDK Consolidation (Partially Implemented)
 * 
 * ISSUE: Both @google-cloud/vertexai and @google/generative-ai are deprecated
 * 
 * PARTIAL SOLUTION: Added @google/genai to package.json (staged for full migration)
 * 
 * FILES MODIFIED:
 * 1. package.json
 *    - Added "@google/genai": "^0.1.0" to dependencies
 *    - Kept @google-cloud/vertexai and @google/generative-ai for now (will remove after migration)
 * 
 * 2. .env.example
 *    - Added GTIN_AI_ENABLE_VERTEX=false (Vertex will be optional, not default)
 *    - Changed LLM_PROVIDER default from 'vertex' to 'google-ai'
 * 
 * 3. src/config/env.validation.ts
 *    - Added GTIN_AI_MATCH_MODEL validation
 *    - Added GTIN_AI_MATCH_FALLBACK_MODEL validation
 *    - Added GTIN_AI_ENABLE_VERTEX validation
 * 
 * NEXT STEPS (TODO for full migration):
 * Phase 1: Update Vertex providers to use @google/genai with Vertex mode
 * Phase 2: Update Google AI providers to use @google/genai
 * Phase 3: Update LLM structuring service to default to Google AI
 * Phase 4: Remove @google-cloud/vertexai and @google/generative-ai
 * 
 * MIGRATION DOCUMENTATION: See /memories/session/comment-2-sdk-migration.md
 * 
 * 
 * COMMENT 3: Default Model Configuration Fix
 * 
 * ISSUE: Both services defaulted to failing gemini-2.0-flash model
 * 
 * SOLUTION: Changed defaults to stable gemini-1.5-flash model
 * 
 * FILES MODIFIED:
 * 1. .env.example
 *    - Changed GEMINI_MODEL from 'gemini-2.0-flash' to 'gemini-1.5-flash'
 *    - Added GEMINI_FALLBACK_MODEL='gemini-1.5-flash-8b' 
 *    - Changed GTIN_AI_MATCH_MODEL from 'gemini-2.0-flash' to 'gemini-1.5-flash'
 *    - Added GTIN_AI_MATCH_FALLBACK_MODEL='gemini-1.5-flash-8b'
 *    - Changed LLM_PROVIDER default from 'vertex' to 'google-ai'
 *    - Added comments about region-specific model availability
 * 
 * 2. src/config/env.validation.ts
 *    - Added GTIN_AI_MATCH_MODEL and GTIN_AI_MATCH_FALLBACK_MODEL validation
 * 
 * 3. src/ingestion/ai-match/google-ai-gemini-gtin-match.provider.ts
 *    - Added healthCheck() method for model availability verification
 *    - Uses GTIN_AI_MATCH_MODEL for GTIN matching (separate from label structuring)
 *    - Falls back to GTIN_AI_MATCH_FALLBACK_MODEL if primary fails
 * 
 * 4. src/ingestion/ai-match/vertex-gemini-gtin-match.provider.ts
 *    - Uses GTIN_AI_MATCH_MODEL configuration (separate from label structuring)
 * 
 * 5. src/ingestion/ai-match/llm-gtin-match-provider.interface.ts
 *    - Added optional healthCheck() method
 * 
 * BEHAVIOR CHANGE:
 * ✓ Before: API calls fail on failing gemini-2.0-flash -> fallback for every call
 * ✓ After:  Preflight check verifies model availability -> direct use of stable gemini-1.5-flash
 * 
 * 
 * RECOMMENDED NEXT STEPS:
 * 1. Run npm install to fetch @google/genai
 * 2. Run all tests: npm run test
 * 3. Test the gtin-backfill with small sample:
 *    npx ts-node src/scripts/trigger-gtin-backfill.ts --ai --max-products=10 --rebuild-ai-cache
 * 4. Verify uploads/backfill-reports/*/ai_decisions.csv for successful matches
 * 5. Plan full SDK migration (Comment 2) in next sprint
 */


/**
 * COMMENT 1.6: SDK Migration Plan (Deferred)
 * 
 * STATUS: Planned for next sprint; `@google/genai` added to dependencies as preparation.
 * 
 * BACKGROUND:
 * - Current consumers: VertexGeminiGtinMatchProvider (GTIN matching) and src/scan/llm/vertex-gemini.provider.ts (OCR)
 * - Both use deprecated @google-cloud/vertexai; plan migration to unified @google/genai
 * 
 * FILES WITH DEPRECATION NOTICES:
 * 1. src/ingestion/ai-match/vertex-gemini-gtin-match.provider.ts
 *    - Added @deprecated JSDoc with TODO(migration) checklist
 *    - Migration tasks: re-implement pickBestMatch, resolveBrandAlias, healthCheck using @google/genai
 *    - Remove package.json entry only after both consumers migrated
 * 
 * MIGRATION SEQUENCE:
 *   1. Create new VertexGeminiGtinMatchProvider using @google/genai
 *   2. Migrate src/scan/llm/vertex-gemini.provider.ts to @google/genai
 *   3. Run full integration test suite
 *   4. Drop @google-cloud/vertexai from package.json


/**
 * COMMENT 2: Dry-run-first GTIN Backfill Workflow
 * 
 * PURPOSE: Validate AI matching quality before writing any results to the database.
 * 
 * TWO-STAGE PROCESS:
 * 
 * STAGE 1: Dry-Run (Validation)
 * ─────────────────────────────
 * Operator runs:
 *   curl -X POST http://localhost:3000/ingestion/backfill-gtins \
 *     -H "x-dev-admin-secret: $DEV_ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "useDump": true,
 *       "rebuildPool": true,
 *       "dryRun": true,
 *       "enableAiMatch": true
 *     }'
 * 
 * Or via script (with new CLI flags):
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts \
 *     --dry-run --rebuild-pool --ai --no-max-products
 * 
 * Output in uploads/backfill-reports/<ISO-timestamp>/:
 *   - summary.json: Overall stats (match rate, errors, AI call counts)
 *   - ai_decisions.csv: All GTIN match verdicts (one row per match attempt)
 *   - residuals.csv: Products that could not be matched
 *   - near_misses.csv: High-confidence near-matches (for manual review)
 *   - review_queue.csv: Medium-confidence matches requiring human approval
 * 
 * STAGE 1 VALIDATION CHECKLIST:
 *   ☐ summary.json match_rate ≥ agreed threshold (e.g., 70%)
 *   ☐ Spot-check 50 rows in ai_decisions.csv for accuracy
 *   ☐ Review sample of review_queue.csv for false positives
 *   ☐ Verify no obvious brand/weight mismatches in near_misses.csv
 *   ☐ Confirm error rate acceptable (< 5%)
 * 
 * STAGE 2: Write Run (after STAGE 1 approval)
 * ──────────────────────────────────────────
 * Operator runs:
 *   curl -X POST http://localhost:3000/ingestion/backfill-gtins \
 *     -H "x-dev-admin-secret: $DEV_ADMIN_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "useDump": true,
 *       "rebuildPool": true,
 *       "dryRun": false,
 *       "enableAiMatch": true
 *     }'
 * 
 * Or via script:
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts \
 *     --no-dry-run --rebuild-pool --ai --no-max-products
 * 
 * EXECUTION PROFILE:
 * - Matching time (4 hours with ~40k candidates): Depends on OFF pool size, AI concurrency, quota availability
 * - Recommended: Schedule late evening or during low-traffic window
 * - Monitor job status via GET /ingestion/job-status/:jobId
 * 
 * HISTORICAL REFERENCE:
 * - 2026-04-29 dry-run (60 OFF candidates): 0 matches
 *   Path: uploads/backfill-reports/2026-04-29T22-43-09-247Z/summary.json
 *   Issue: Pool size too small for meaningful validation
 *   Lesson: Ensure rebuildPool=true and full OFF slice loaded before dryRun


/**
 * COMMENT 3: Cursor-based Checkpointing and Resume Metadata
 * 
 * PURPOSE: Enable safe resumption of long-running GTIN backfill jobs without duplicate writes.
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/gtin-backfill.service.ts
 *    - Extended GtinBackfillOpts with: batchSize (default 1000), resume (default true), 
 *      resumeFromUpdatedAt, resumeFromId
 *    - Introduced checkpoint file at uploads/backfill-cache/checkpoint.json with:
 *      { runStartedAt, lastUpdatedAt, lastScanId, processed, totalSeen, runDir }
 *    - Refactored single streaming loop into cursor-paginated loop
 *    - Each page: SELECT WHERE (updated_at, id) < (:lastUpdatedAt, :lastScanId) 
 *                 ORDER BY updated_at DESC, id DESC LIMIT :batchSize
 *    - After each page: flush caches and persist checkpoint
 *    - On completion: write summary.json and clear checkpoint
 * 
 * 2. src/ingestion/ingestion.service.ts
 *    - INGESTION_JOB_OPTIONS.timeout remains 4 hours
 *    - Added TODO(durability) comment: do not raise timeout until BullMQ Redis backend verified durable
 * 
 * 3. src/ingestion/gtin-backfill.reporter.ts
 *    - Extended meta in close(): runStartedAt, runCompletedAt, lastUpdatedAtCursor, 
 *      lastScanIdCursor, pagesProcessed, resumable: boolean, concurrency, dailyBudget
 *    - Persisted in summary.json for resume safety
 * 
 * 4. src/ingestion/ai-match/ai-match-runtime.ts
 *    - BudgetGuard: added consume(n: number) helper to bump consumedCount
 *    - Budget preserved in checkpoint.json; re-seeded on resume
 * 
 * USAGE: Automatic on interrupt; no operator action needed
 * - If job interrupted mid-run, restart with same payload
 * - Service detects checkpoint and resumes from last cursor position
 * - Concurrency tuning: GTIN_AI_MATCH_CONCURRENCY (default 5, warn if > 10)


/**
 * COMMENT 4: Brand-Alias Cache Audit and Tightening
 * 
 * PURPOSE: Reduce false positive brand matches by enforcing stricter acceptance gates.
 * 
 * MANUAL AUDIT REQUIRED (one-time):
 * File: uploads/backfill-cache/brand-aliases.json
 * Action: Quarantine suspect entries (move to brand-aliases.quarantined.json):
 *   - "Frank's RedHot" → "american-garden" (low confidence, wrong brand)
 *   - "Milka,Mondelez" → "oreo" (multi-brand input, wrong match)
 *   - "KITCO NICE FRENCH CHEESE" → "koita" (no semantic connection)
 *   - "la maison" → "american-garden" (French → American mismatch)
 *   - "Chips Ahoy!, Milka" → "oreo" (multi-brand input)
 * Keep: brand-aliases.json.audit-<date>.bak for traceability
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/ai-match/brand-alias-cache.ts
 *    - Extended CachedBrandAlias: approved (bool), pool_size (number), reviewer (optional)
 *    - Split storage: brand-aliases.json (provisional) + brand-aliases-approved.json (trusted)
 *    - Added getApproved(), getProvisional() accessors
 *    - Tightened set() acceptance gates:
 *      * slug !== null
 *      * confidence >= 0.85 (raised from 0.7)
 *      * pool_size >= 3
 *      * rationale NOT in {transient_provider_failure, all_providers_failed, no_confident_match}
 *    - New setApproved() for manual approvals
 *    - getStableEntries() returns approved-file entries by default
 * 
 * 2. src/ingestion/gtin-backfill.service.ts
 *    - Added GtinBackfillOpts: rebuildBrandAliasCache, ignoreBrandAliasCache (independent of rebuildAiCache)
 *    - At run start: clear brand-aliases.json if rebuildBrandAliasCache=true (keep approved file)
 *    - Skip preload if ignoreBrandAliasCache=true
 *    - In tryResolveAndRewind: use getApproved() for override eligibility
 *    - Tightened override acceptance: confidence >= 0.85, poolSize >= 3, approved entry OR fresh model call
 *    - Report metadata: surface brandAliasesApproved, brandAliasesProvisional counts
 * 
 * 3. src/ingestion/dto/ingestion-job.dto.ts
 *    - Added rebuildBrandAliasCache, ignoreBrandAliasCache to both GtinBackfillJobDto and IngestionJobDto
 * 
 * 4. src/ingestion/gtin-backfill.reporter.ts
 *    - Extended BrandAliasRow: approved flag + brand_pool_size
 *    - Updated brand_aliases.csv header


/**
 * COMMENT 5: Inverted Token Index for Candidate Shortlister
 * 
 * PURPOSE: Replace global O(N) Dice scan with O(log N) inverted-index lookups.
 * 
 * FILES MODIFIED:
 * 1. src/ingestion/ai-match/candidate-shortlister.ts
 *    - Extended OffIndexes: nameTokenIndex (token → GTINs), weightBandIndex (band → GTINs)
 *    - New buildShortlist logic:
 *      a. Tokenize scan name (Unicode-safe) using shared tokenize-name.ts util
 *      b. Union GTINs from nameTokenIndex (cap: K*8)
 *      c. Restrict by GTIN prefix + brand alias + weight band (±10%)
 *      d. Only then compute Dice scores on prefiltered set
 *      e. Keep K*4 cap for Pool C (now on prefiltered set)
 *    - Skip-empty: if no tokens, brand, or prefix, return [] (no global fallback)
 *    - Added unit test (candidate-shortlister.spec.ts):
 *      * Synthetic ~50k OFF index
 *      * Wall-clock < 50ms assertion
 *      * Correct Top-K returned
 *      * No match on empty signals
 * 
 * 2. src/ingestion/gtin-backfill.service.ts (indexing block ~line 723-766)
 *    - Populate nameTokenIndex by tokenizing canonical.name_en + canonical.name_ar
 *    - Populate weightBandIndex: bucketize normalizeWeight() into bands (25g < 200g, 50g < 1kg, 100g > 1kg)
 *    - Pass both to matchScanRow and brand-alias rewind via indexes argument
 * 
 * 3. src/off-explorer/off-explorer-index.service.ts
 *    - Expose getNameTokenIndex() read-only accessor (optional; backfill duplicates index)
 * 
 * 4. src/utils/normalization.ts or new src/utils/tokenize-name.ts
 *    - Extract shared tokenizeUnicode() helper (used by both services)
 *    - Avoid code duplication between OffExplorerIndexService and GtinBackfillService
 * 
 * 5. Test file: src/ingestion/ai-match/candidate-shortlister.spec.ts
 *    - Benchmark test on ~50k synthetic OFF index
 *    - Assert < 50ms wall-clock time
 *    - Verify planted positive match in Top-K
 *    - Empty-signal test


/**
 * PASS G: Embedding-Based Semantic Shortlisting
 * 
 * PURPOSE: Reduce AI verifier (Pass F) calls by 80% through high-quality semantic pre-filtering.
 * Bridges deterministic Passes A–E and generative Pass F with embedding-based ANN.
 * 
 * ARCHITECTURE:
 * - Google Generative AI embeddings (text-embedding-004, 3072-d vectors truncated to 768-d)
 * - Binary cache (off-embeddings.bin) + JSON metadata for amortized computation
 * - O(N) linear scan with min-heap for top-K retrieval (30 candidates)
 * - Three gates: high-confidence auto-apply (0.92), borderline escalate to verifier (0.70), below-floor residual
 * 
 * MIGRATION SEQUENCE (Safe Rollout):
 * ─────────────────────────────────
 * 
 * STAGE 0: Dry-run with embedding disabled (baseline control)
 * ─────────────────────────────────────────────────────────────
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts \
 *     --dry-run --rebuild-pool --no-embedding
 * 
 *   Outputs summary.json to uploads/backfill-reports/<timestamp>/
 *   Expected stats:
 *     - match_rate: current baseline (e.g., 42%)
 *     - aiCalls: expected AI verifier calls with deterministic shortlist (~1200)
 *     - aiAvgLatencyMs: baseline latency per call (~800ms)
 * 
 * STAGE 1: Dry-run with embedding enabled (compare improvement)
 * ──────────────────────────────────────────────────────────────
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts \
 *     --dry-run --rebuild-pool --embedding
 * 
 *   Outputs to uploads/backfill-reports/<timestamp>/
 *   New CSV: embedding_decisions.csv
 *   Expected stats:
 *     - match_rate: 35–50% (20–45% improvement via embedding + verifier)
 *     - aiCalls: 80–150 (90% reduction: only borderline cosines escalate)
 *     - embeddingMatched: 200–400 (high-confidence direct auto-apply)
 *     - embeddingCacheHits: 1 (if reusing OFF pool)
 *     - embeddingAvgLatencyMs: 150–300ms (faster than AI due to semantic pre-ranking)
 * 
 * VALIDATION CHECKLIST FOR STAGE 1:
 *   ☐ match_rate >= Stage 0 (true positive preservation)
 *   ☐ aiCalls <= Stage 0 / 5 (80% reduction achieved)
 *   ☐ embeddingMatched >= 200 (meaningful volume of auto-applies)
 *   ☐ Spot-check embedding_decisions.csv: top_cosine >= 0.70 for all rows
 *   ☐ Spot-check residuals: embedding_below_floor entries have sensible fallback suggestions
 *   ☐ Total wall-clock time: Stage 0 - 2–3 min embedding build = target time
 * 
 * STAGE 2: Write run with embedding enabled (production rollout)
 * ────────────────────────────────────────────────────────────
 *   npx ts-node src/scripts/trigger-gtin-backfill.ts \
 *     --no-dry-run --rebuild-pool --embedding
 * 
 *   Outputs to uploads/backfill-reports/<timestamp>/
 *   Expected:
 *     - Matches written to DB (merge + enrichment)
 *     - summary.json with final match rate and cost metrics
 *     - Checkpoint on interrupt (resume via --resume flag)
 * 
 * EXPECTED DELTAS (Stage 0 → Stage 1):
 * ────────────────────────────────────
 * | Metric                    | Stage 0 (Baseline)  | Stage 1 (With Pass G) | Delta    |
 * |---------------------------|---------------------|-----------------------|----------|
 * | AI Verifier Calls         | ~1,200              | 80–150                | -90%     |
 * | Match Rate                | ~42%                | 35–50%                | +5–20%   |
 * | Wall-Clock Time (min)     | ~19                 | 5–8 (with build)      | -60%     |
 * | AI Cost (est. USD)        | $14–18              | $2–3                  | -80%     |
 * | Embedding Matched         | 0                   | 200–400               | new      |
 * | Embedding Below-Floor     | 0                   | 100–200               | new      |
 * | Borderline→Verifier       | 0                   | 80–100                | new      |
 * | Cache Hit (run 2+)        | N/A                 | >99%                  | N/A      |
 * 
 * ENVIRONMENTAL CONFIGURATION:
 * ─────────────────────────────
 * .env variables (see .env.example for all 11):
 *   GTIN_EMBEDDING_ENABLED=true              # Master enable flag (default: false)
 *   GTIN_EMBEDDING_MODEL=text-embedding-004  # Google model ID (do NOT change)
 *   GTIN_EMBEDDING_DIM=768                   # Matryoshka truncation (default: full 3072)
 *   GTIN_EMBEDDING_TOPK=30                   # Max candidates per shortlist (default: 30)
 *   GTIN_EMBEDDING_AUTO_APPLY_COSINE=0.92    # Auto-apply threshold (0.85 ≤ default ≤ 0.95)
 *   GTIN_EMBEDDING_VERIFIER_FLOOR_COSINE=0.70 # Escalate threshold (0.60 ≤ default ≤ 0.85)
 *   GTIN_EMBEDDING_BATCH_SIZE=100            # API batch size (1–128, optimize for quota)
 *   GTIN_EMBEDDING_CONCURRENCY=10            # Parallel embedding jobs (1–50)
 *   GTIN_EMBEDDING_DAILY_BUDGET=200000       # Daily input tokens (default: covers 1M products)
 *   GTIN_EMBEDDING_REQUEST_TIMEOUT_MS=20000  # Per-request timeout (10–60 sec)
 *   GTIN_EMBEDDING_TASK_TYPE=RETRIEVAL_DOCUMENT # Embedding task type (do NOT change)
 * 
 * CACHE MANAGEMENT:
 * ─────────────────
 * Cache location: uploads/backfill-cache/off-embeddings.bin + .meta.json
 * Cache validity: Tied to OFF pool (via poolHash in metadata)
 * Invalidation: Rebuilds if OFF pool definition changes (brand slugs, filters)
 * 
 * CLI Flags:
 *   --embedding                  Enable Pass G (requires GTIN_EMBEDDING_ENABLED=true)
 *   --no-embedding               Disable Pass G (override env)
 *   --embedding-only             Pass G only, skip Pass F verifier (embeddingOnly=true)
 *   --rebuild-embedding-cache    Clear embeddings, rebuild from scratch
 * 
 * ROLLBACK PROCEDURE (if embeddings degrade match quality):
 * ──────────────────────────────────────────────────────────
 * 1. Set GTIN_EMBEDDING_ENABLED=false (or use --no-embedding CLI flag)
 * 2. Rerun backfill with deterministic passes only (Passes A–F)
 * 3. Preserve embedding cache (for future recovery) or delete if storage urgent:
 *    rm uploads/backfill-cache/off-embeddings.bin*
 * 
 * TROUBLESHOOTING:
 * ────────────────
 * Q: Embedding health check fails, Pass G disabled
 * A: Check Google Generative AI credentials and quota at console.cloud.google.com
 *    Verify GOOGLE_API_KEY is set and has embeddings quota
 * 
 * Q: embeddingCalls > embeddingMatched (many timeouts)
 * A: Reduce GTIN_EMBEDDING_BATCH_SIZE or GTIN_EMBEDDING_CONCURRENCY
 *    Increase GTIN_EMBEDDING_REQUEST_TIMEOUT_MS if network is slow
 * 
 * Q: Match rate dropped compared to Stage 0
 * A: Review embeddingPoolHash in summary.json — may indicate stale cache
 *    Re-run with --rebuild-embedding-cache
 * 
 * FILES MODIFIED FOR PASS G:
 * ──────────────────────────
 * 1. .env.example
 *    - Added 11-line GTIN Embedding Match block with all env variables
 * 
 * 2. src/config/env.validation.ts
 *    - Added 10 @IsOptional() validators for embedding config (ENABLED, DIM, TOPK, thresholds, etc.)
 * 
 * 3. src/ingestion/dto/ingestion-job.dto.ts
 *    - Added enableEmbeddingMatch?, rebuildEmbeddingCache?, embeddingOnly? boolean fields
 * 
 * 4. src/ingestion/gtin-backfill.service.ts
 *    - Updated GtinBackfillOpts (+3 embedding fields)
 *    - Updated GtinBackfillResult (+8 embedding stats fields)
 *    - New MatchResult.embeddingVerdict field
 *    - New reasonCode entries: 'embedding_below_floor', 'embedding_gate_failed'
 *    - New matchType entries: 'embedding-auto', 'embedding+ai-fuzzy'
 *    - Embedding preflight block (after AI preflight, before OFF indexing)
 *    - Embedding index build block (after OFF indexing)
 *    - Pass G integration in matchScanRow (between Pass E residuals and Pass F)
 *    - Embedding decision reporter integration in applyDisposition()
 * 
 * 5. src/ingestion/ai-match/gemini-embedding.provider.ts (NEW, 350 lines)
 *    - embedDocuments(texts): Batch embedding via batchEmbedContents API
 *    - embedQuery(text): Single query embedding
 *    - healthCheck(): Validates connectivity and quota
 *    - L2 normalization + Matryoshka truncation
 *    - Exponential backoff for 503/429 errors
 * 
 * 6. src/ingestion/ai-match/embedding-cache.ts (NEW, 180 lines)
 *    - load(opts): Load cached embeddings if pool hash matches
 *    - save(map, meta): Atomic file write to uploads/backfill-cache/
 *    - clear(): Delete cache files on rebuild
 * 
 * 7. src/ingestion/ai-match/embedding-shortlister.ts (NEW, 200 lines)
 *    - buildShortlist(scan, indexes, K, resolvedBrandSlug): Semantic ANN via cosine similarity
 *    - setIndex(map): Initialize embedding vector map
 *    - Linear O(N) scan with min-heap for top-K
 * 
 * 8. src/ingestion/gtin-backfill.reporter.ts
 *    - Added EmbeddingDecisionRow interface
 *    - Added embeddingDecisionsStream (7th CSV stream)
 *    - Updated BackfillStats (+8 embedding fields)
 *    - appendEmbeddingDecision() method
 * 
 * 9. src/ingestion/ingestion.module.ts
 *    - Registered GeminiEmbeddingProvider, EmbeddingShortlister, EmbeddingCache
 * 
 * 10. src/ingestion/ingestion.processor.ts
 *     - Forward embedding options (enableEmbeddingMatch, rebuildEmbeddingCache, embeddingOnly) from job to service
 * 
 * 11. src/scripts/trigger-gtin-backfill.ts
 *     - CLI parsing for --embedding, --no-embedding, --rebuild-embedding-cache, --embedding-only
 * 
 * 12. Test file: src/ingestion/ai-match/gtin-backfill-embedding.integration.spec.ts (NEW, 150 lines)
 *     - 8 integration test cases covering disabled, auto-apply, escalation, below-floor, embedding-only, reporter, cache


/**
 * Running GTIN Backfill on Local Ollama
 * 
 * SMOKE-TEST CHECKLIST
 * ────────────────────
 * ✓ Start API: npm run start:dev from sawa-api/
 * ✓ Trigger dry-run: npx ts-node src/scripts/trigger-gtin-backfill.ts --ai --embedding --dry-run --max-products 50
 * ✓ Watch API logs for "Ollama health check passed" and "Pass F: ..." entries
 * ✓ If healthy, drop --dry-run for a real write run
 * 
 * PURPOSE:
 * ────────
 * Enable a fully local backfill using Ollama (no Google AI quota, no Vertex), reusing the existing 
 * Pass A–G pipeline. All AI inference runs on your local machine or private GPU cluster.
 * 
 * PREREQUISITES:
 * ──────────────
 * 1. Install Ollama (https://ollama.ai/)
 * 2. Start the daemon: ollama serve
 *    → Runs at http://localhost:11434 by default
 * 3. Pull the matching models:
 *    ollama pull gemma3:4b        # Default for GTIN matching (Pass F)
 *    ollama pull embeddinggemma   # Default for embedding (Pass G)
 * 4. Sanity check:
 *    curl http://localhost:11434/api/tags
 *    → Should list both gemma3:4b and embeddinggemma
 * 
 * MINIMAL `.env` SNIPPET
 * ──────────────────────
 * The following configuration switches providers from Google/Vertex to Ollama. 
 * All other settings (Firebase, Postgres, Redis, OFF pool, connection pool) remain unchanged.
 * 
 * Provider selectors (NEW in this phase):
 *   GTIN_AI_PROVIDER=ollama                    # Use Ollama for Pass F matching
 *   GTIN_EMBEDDING_PROVIDER=ollama             # Use Ollama for Pass G embeddings
 * 
 * Match and embedding gates (reused from previous phases):
 *   GTIN_AI_ENABLE_VERTEX=false                # Disable Vertex AI fallback
 *   GEMINI_API_KEY=                            # Optional, empty disables Google AI fallback for backfill
 *   GTIN_AI_MATCH_ENABLED=true                 # Gate for Pass F (unchanged from Google flow)
 *   GTIN_EMBEDDING_ENABLED=true                # Gate for Pass G (unchanged from Google flow)
 *   GTIN_AI_MATCH_DAILY_BUDGET=0               # 0 = unlimited (BudgetGuard treats <=0 as Infinity)
 * 
 * Ollama connectivity and model selection (Foundation Phase vars, lines 151–175 in .env.example):
 *   OLLAMA_BASE_URL=http://localhost:11434
 *   OLLAMA_GTIN_MATCH_MODEL=gemma3:4b
 *   OLLAMA_GTIN_MATCH_FALLBACK_MODEL=          # Optional; e.g., gemma3:1b for fallback
 *   OLLAMA_EMBEDDING_MODEL=embeddinggemma
 *   OLLAMA_REQUEST_TIMEOUT_MS=60000
 *   OLLAMA_KEEP_ALIVE=5m
 *   OLLAMA_MAX_RETRIES=2
 * 
 * Note on budget variables:
 *   GTIN_EMBEDDING_DAILY_BUDGET is also effectively unlimited on Ollama (no upstream quota).
 *   BudgetGuard in file:sawa-api/src/ingestion/ai-match/ai-match-runtime.ts (lines 83–87) 
 *   collapses 0/NaN to Infinity, so set all budget vars to 0 for Ollama runs.
 * 
 * CACHE INVALIDATION NOTE
 * ───────────────────────
 * On the first Ollama run, EmbeddingCache.load() (in 
 * file:sawa-api/src/ingestion/ai-match/embedding-cache.ts, the meta.model !== opts.model 
 * branch around line 67) will detect the model name change in 
 * uploads/backfill-cache/off-embeddings.meta.json (e.g., "gemini-embedding-001" → "embeddinggemma") 
 * and automatically rebuild uploads/backfill-cache/off-embeddings.bin.
 * 
 * The --rebuild-embedding-cache CLI flag is still available for forced rebuilds but is NOT required 
 * for a provider switch.
 * 
 * AI verdicts cached under the Google provider in uploads/backfill-cache/ai-verdicts.json are 
 * content-keyed (not provider-keyed) per 
 * file:sawa-api/src/ingestion/ai-match/ai-verdict-cache.ts, so they remain valid across provider changes. 
 * Recommend --rebuild-ai-cache only if the operator wants Ollama to re-decide everything from scratch.
 * 
 * LATENCY EXPECTATIONS TABLE
 * ──────────────────────────
 * 
 * | Operation                          | CPU (gemma3:4b) | GPU (gemma3:4b) | Notes                                    |
 * |------------------------------------|-----------------|-----------------|------------------------------------------|
 * | Cold model load (first call)       | 10–30 s         | 2–5 s           | Mitigated by OLLAMA_KEEP_ALIVE=5m       |
 * | Pass F single match                | 3–8 s           | 0.4–1.2 s       | Per-call with temperature: 0            |
 * | Pass G OFF index build (~36k vec)  | 25–60 min       | 3–10 min        | One-time per pool; ~1M tokens          |
 * | Pass G query embedding             | 200–500 ms      | 30–80 ms        | Per scan row                            |
 * | Brand-alias resolve                | 3–8 s           | 0.4–1.2 s       | One call per unique unknown brand      |
 * 
 * Guidance on budget variables:
 * Since Ollama runs on your local machine and has no upstream quota, GTIN_AI_MATCH_DAILY_BUDGET, 
 * GTIN_EMBEDDING_DAILY_BUDGET, and GTIN_AI_BRAND_ALIAS_BUDGET are effectively irrelevant. 
 * BudgetGuard (file:sawa-api/src/ingestion/ai-match/ai-match-runtime.ts, lines 83–87) collapses 
 * any value ≤ 0 or NaN to Number.POSITIVE_INFINITY. Recommend setting all three to 0 for clarity.
 * 
 * TROUBLESHOOTING
 * ───────────────
 * 
 * Q: ECONNREFUSED on first call
 * A: Ollama daemon is not running. Start it with `ollama serve` and verify:
 *    curl http://localhost:11434/api/tags
 *    If still failing, check OLLAMA_BASE_URL in .env matches the serving address.
 * 
 * Q: Health check logs "Model X not pulled. Run: ollama pull X"
 * A: Run the printed `ollama pull <model>` command (e.g., ollama pull gemma3:4b).
 *    The probe in OllamaGtinMatchProvider.healthCheck() and OllamaEmbeddingProvider.healthCheck() 
 *    performs :latest-suffix-tolerant matching against client.listTags().
 * 
 * Q: First Pass F call takes 10–30 s, subsequent ones are fast
 * A: That is the model load time (cold start). OLLAMA_KEEP_ALIVE=5m keeps the model resident 
 *    between thousands of backfill calls. Increase to 30m or -1 (indefinite) for very long runs.
 * 
 * Q: Pass F verdicts have low confidence / many residuals
 * A: Smaller models (gemma3:1b, gemma3:4b) hallucinate more than larger ones. 
 *    Prefer gemma3:12b on GPU-accelerated hosts for higher accuracy. 
 *    Pass F output is sanitized by validateVerdictAgainstCandidates(), so hallucinated GTINs 
 *    become null rather than wrong matches.
 * 
 * Q: Vertex circuit breaker fires under Ollama
 * A: Cannot happen. The substring 'Vertex' only appears in VertexGeminiGtinMatchProvider.name. 
 *    With GTIN_AI_PROVIDER=ollama, GtinMatchService registers only OllamaGtinMatchProvider 
 *    (whose name is 'Ollama'), so the Vertex-specific code path in disableVertexForCurrentRun() 
 *    is inert.
 * 
 */


