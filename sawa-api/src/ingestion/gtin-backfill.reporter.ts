import * as fs from 'fs';
import * as path from 'path';

export interface ResidualRow {
  scan_id: string;
  scan_gtin: string;
  name_en: string;
  name_ar: string;
  brand: string;
  brand_normalized: string;
  weight_raw: string;
  gtin_prefix: string | null;
  reason_code: string;
  best_score: number;
  off_pool_size_for_brand: number;
  ai_provider?: string;
  ai_model?: string;
  ai_confidence?: number;
  ai_rationale?: string;
  ai_reason?: string;
  // Comment 5: Add inferred brand and weight fields
  inferred_brand?: string;
  inferred_weight?: string;
}

export interface ReviewRow {
  scan_id: string;
  scan_name: string;
  off_gtin: string;
  off_name_en: string;
  confidence: number;
  match_type: string;
  ai_provider?: string;
  ai_model?: string;
  ai_confidence?: number;
  ai_rationale?: string;
  review_reason?: string;
}

export interface AiDecisionRow {
  scan_id: string;
  scan_gtin: string;
  candidate_gtins: string[];
  matched_gtin: string | null;
  confidence: number;
  rationale: string;
  provider: string;
  model: string;
  latency_ms: number;
  cache_hit: boolean;
  /** Milliseconds spent waiting in the concurrency limiter queue (Ollama chat limiter). */
  queue_wait_ms?: number;
  /** Milliseconds spent inside the actual provider call (excludes queue wait). */
  provider_latency_ms?: number;
  /** True when this row was served from a cache entry produced by a different provider. */
  cross_provider_cache_hit?: boolean;
}

export interface AutoAppliedMatchRow {
  scan_id: string;
  scan_gtin: string;
  off_gtin: string;
  confidence: number;
  match_type: string;
  ai_provider?: string;
  ai_model?: string;
  ai_confidence?: number;
  ai_rationale?: string;
  dry_run?: boolean;
  db_applied?: boolean;
}

export interface BrandAliasRow {
  raw_brand: string;
  normalized_brand: string;
  resolved_slug: string | null;
  confidence: number;
  rationale: string;
  provider: string;
  model: string;
  cache_hit: boolean;
  brand_pool_size: number;
  // Comment 3: New field indicating if this alias was approved/trusted
  approved?: boolean;
  // Indicates whether this cache hit came from a different provider
  cross_provider_cache_hit?: boolean;
}

/**
 * Embedding decision row for Pass G (semantic similarity shortlist).
 * Tracks top-K shortlist, gate outcomes, and escalation to verifier.
 */
export interface EmbeddingDecisionRow {
  scan_id: string;
  scan_gtin: string;
  top_cosine: number;
  top_off_gtin: string;
  topk_gtins: string[]; // Semi-colon delimited list
  topk_cosines: number[]; // Semi-colon delimited list (4 decimal places each)
  used_as_auto_apply: boolean;
  escalated_to_verifier: boolean;
  gate_outcome: 'passed' | 'failed_weight' | 'failed_attribute' | 'failed_brand' | 'below_floor' | 'budget_exhausted' | 'borderline_no_verifier' | 'unknown';
  query_embed_time_ms: number;
}

export interface BackfillStats {
  offIndexed: number;
  candidates: number;
  gtinAssignedAuto: number;
  pendingReview: number;
  twinsMerged: number;
  skipped: number;
  matchTypeBreakdown: Record<string, number>;
  brandAliasesResolved: number;
  brandAliasesQueuedForReview: number;
  aiMatched: number;
  aiPending: number;
  aiNoMatch: number;
  aiCalls: number;
  aiCacheHits: number;
  aiErrors: number;
  aiAvgLatencyMs: number;
  dryRunAutoMatched: number;
  dbApplyErrors: number;
  // ── AI Observability Breakdown Maps ──
  reasonCodeBreakdown: Record<string, number>;
  aiRationaleBreakdown: Record<string, number>;
  /** Cross-provider cache hits detected during AI verdict cache lookups. */
  aiVerdictCrossProviderHits: number;
  // ── GTIN Embedding Match (Pass G) ──
  embeddingMatched: number;
  embeddingPending: number;
  embeddingNoMatch: number;
  embeddingCalls: number;
  embeddingCacheHits: number;
  embeddingErrors: number;
  embeddingAvgLatencyMs?: number;
  embeddingDim?: number;
  embeddingPoolHash?: string;
  /** Embedding gate outcome breakdown (passed, failed_weight, etc.) */
  embeddingGateOutcomeBreakdown: Record<string, number>;
  reportDir?: string;
}


/**
 * Owns all report I/O for a single GTIN backfill run.
 * Opens seven streamed writers at instantiation and flushes at close.
 * Comment 3: close() is idempotent — calling it multiple times is safe.
 */
export class BackfillReporter {
  private residualsStream: fs.WriteStream;
  private nearMissesStream: fs.WriteStream;
  private reviewQueueStream: fs.WriteStream;
  private aiDecisionsStream: fs.WriteStream;
  private autoAppliedStream: fs.WriteStream;
  private brandAliasesStream: fs.WriteStream;
  private embeddingDecisionsStream: fs.WriteStream;
  private closed = false;

  constructor(
    private readonly runDir: string,
    private readonly offPoolSize: number,
  ) {
    // Create the timestamped directory
    fs.mkdirSync(runDir, { recursive: true });

    // Open write streams in append mode
    this.residualsStream = fs.createWriteStream(
      path.join(runDir, 'residuals.csv'),
      { flags: 'a' },
    );
    this.nearMissesStream = fs.createWriteStream(
      path.join(runDir, 'near_misses.csv'),
      { flags: 'a' },
    );
    this.reviewQueueStream = fs.createWriteStream(
      path.join(runDir, 'review_queue.csv'),
      { flags: 'a' },
    );
    this.aiDecisionsStream = fs.createWriteStream(
      path.join(runDir, 'ai_decisions.csv'),
      { flags: 'a' },
    );
    this.autoAppliedStream = fs.createWriteStream(
      path.join(runDir, 'auto_applied.csv'),
      { flags: 'a' },
    );
    this.brandAliasesStream = fs.createWriteStream(
      path.join(runDir, 'brand_aliases.csv'),
      { flags: 'a' },
    );
    this.embeddingDecisionsStream = fs.createWriteStream(
      path.join(runDir, 'embedding_decisions.csv'),
      { flags: 'a' },
    );

    // Write headers
    this.residualsStream.write(
      'scan_id,scan_gtin,name_en,name_ar,brand,brand_normalized,weight_raw,gtin_prefix,reason_code,best_score,off_pool_size_for_brand,ai_provider,ai_model,ai_confidence,ai_rationale,ai_reason,inferred_brand,inferred_weight,top_off_gtin_embedding,top_cosine_embedding\n',
    );
    this.nearMissesStream.write(
      'scan_id,scan_name,off_gtin,off_name_en,off_brand,off_weight,dice_score,pass_name\n',
    );
    this.reviewQueueStream.write(
      'scan_id,scan_name,off_gtin,off_name_en,confidence,match_type,ai_provider,ai_model,ai_confidence,ai_rationale,review_reason\n',
    );
    this.aiDecisionsStream.write(
      'scan_id,scan_gtin,candidate_gtins,matched_gtin,confidence,rationale,provider,model,latency_ms,cache_hit,queue_wait_ms,provider_latency_ms,cross_provider_cache_hit\n',
    );
    this.autoAppliedStream.write(
      'scan_id,scan_gtin,off_gtin,confidence,match_type,ai_provider,ai_model,ai_confidence,ai_rationale,dry_run,db_applied\n',
    );
    this.brandAliasesStream.write(
      'raw_brand,normalized_brand,resolved_slug,confidence,rationale,provider,model,cache_hit,brand_pool_size,approved,cross_provider_cache_hit\n',
    );
    this.embeddingDecisionsStream.write(
      'scan_id,scan_gtin,top_cosine,top_off_gtin,topk_gtins,topk_cosines,used_as_auto_apply,escalated_to_verifier,gate_outcome,query_embed_time_ms\n',
    );
  }

  /**
   * Helper: Format CSV line with proper quoting and escaping
   */
  private csvLine(...fields: (string | number | null | undefined)[]): string {
    return (
      fields
        .map((field) => {
          const value = field ?? '';
          const stringValue = String(value);
          // Escape double quotes by doubling them
          const escaped = stringValue.replace(/"/g, '""');
          return `"${escaped}"`;
        })
        .join(',') + '\n'
    );
  }

  /**
   * Append one residual row to residuals.csv
   * 
   * NOTE: rows with reason_code='embedding_error' correspond to query-embedding failures
   * (e.g., OllamaEmbeddingProvider timeout). These rows are NOT paired with ai_decisions.csv
   * rows — the aiVerdict fields will be empty for these rows.
   */
  appendResidual(row: ResidualRow & { top_off_gtin_embedding?: string; top_cosine_embedding?: number }): void {
    const line = this.csvLine(
      row.scan_id,
      row.scan_gtin,
      row.name_en,
      row.name_ar,
      row.brand,
      row.brand_normalized,
      row.weight_raw,
      row.gtin_prefix,
      row.reason_code,
      row.best_score,
      row.off_pool_size_for_brand,
      row.ai_provider ?? '',
      row.ai_model ?? '',
      row.ai_confidence !== undefined ? row.ai_confidence : '',
      row.ai_rationale ?? '',
      row.ai_reason ?? '',
      // Comment 5: Include inferred brand and weight as the last two CSV fields
      row.inferred_brand ?? '',
      row.inferred_weight ?? '',
      // ── GTIN Embedding Match (Pass G) ──
      row.top_off_gtin_embedding ?? '',
      row.top_cosine_embedding !== undefined ? row.top_cosine_embedding : '',
    );
    this.residualsStream.write(line);
  }

  /**
   * Append top-3 near-misses for a residual scan
   */
  appendNearMisses(
    scanId: string,
    scanName: string,
    nearMisses: Array<{ candidate: any; score: number; pass: string }>,
  ): void {
    for (const miss of nearMisses.slice(0, 3)) {
      const line = this.csvLine(
        scanId,
        scanName,
        miss.candidate.gtin,
        miss.candidate.name_en,
        miss.candidate.brand,
        miss.candidate.weightRaw,
        miss.score,
        miss.pass,
      );
      this.nearMissesStream.write(line);
    }
  }

  /**
   * Append one review-queue row
   */
  appendReviewQueue(row: ReviewRow): void {
    const line = this.csvLine(
      row.scan_id,
      row.scan_name,
      row.off_gtin,
      row.off_name_en,
      row.confidence,
      row.match_type,
      row.ai_provider ?? '',
      row.ai_model ?? '',
      row.ai_confidence !== undefined ? row.ai_confidence : '',
      row.ai_rationale ?? '',
      row.review_reason ?? '',
    );
    this.reviewQueueStream.write(line);
  }

  /**
   * Append one AI decision row to ai_decisions.csv
   */
  appendAiDecision(row: AiDecisionRow): void {
    const candidateGtinsStr = row.candidate_gtins.join(';');
    const line = this.csvLine(
      row.scan_id,
      row.scan_gtin,
      candidateGtinsStr,
      row.matched_gtin ?? '',
      row.confidence,
      row.rationale,
      row.provider,
      row.model,
      row.latency_ms,
      row.cache_hit ? 'true' : 'false',
      row.queue_wait_ms !== undefined ? row.queue_wait_ms : '',
      row.provider_latency_ms !== undefined ? row.provider_latency_ms : '',
      row.cross_provider_cache_hit ? 'true' : 'false',
    );
    this.aiDecisionsStream.write(line);
  }

  /**
   * Append one auto-applied match row to auto_applied.csv
   */
  appendAutoAppliedMatch(row: AutoAppliedMatchRow): void {
    const line = this.csvLine(
      row.scan_id,
      row.scan_gtin,
      row.off_gtin,
      row.confidence,
      row.match_type,
      row.ai_provider ?? '',
      row.ai_model ?? '',
      row.ai_confidence !== undefined ? row.ai_confidence : '',
      row.ai_rationale ?? '',
      row.dry_run ? 'true' : 'false',
      row.db_applied !== undefined ? (row.db_applied ? 'true' : 'false') : '',
    );
    this.autoAppliedStream.write(line);
  }

  /**
   * Append one brand-alias row to brand_aliases.csv
   */
  appendBrandAlias(row: BrandAliasRow): void {
    const line = this.csvLine(
      row.raw_brand,
      row.normalized_brand,
      row.resolved_slug ?? '',
      row.confidence,
      row.rationale,
      row.provider,
      row.model,
      row.cache_hit ? 'true' : 'false',
      row.brand_pool_size,
      // Comment 3: Include approved flag in CSV
      row.approved ? 'true' : 'false',
      // Include cross-provider cache hit flag
      row.cross_provider_cache_hit ? 'true' : 'false',
    );
    this.brandAliasesStream.write(line);
  }

  /**
   * Append one embedding decision row to embedding_decisions.csv
   */
  appendEmbeddingDecision(row: EmbeddingDecisionRow): void {
    const topkGtinsStr = row.topk_gtins.join(';');
    const topkCosinesStr = row.topk_cosines
      .map((c) => c.toFixed(4))
      .join(';');
    const line = this.csvLine(
      row.scan_id,
      row.scan_gtin,
      row.top_cosine.toFixed(4),
      row.top_off_gtin,
      topkGtinsStr,
      topkCosinesStr,
      row.used_as_auto_apply ? 'true' : 'false',
      row.escalated_to_verifier ? 'true' : 'false',
      row.gate_outcome,
      row.query_embed_time_ms,
    );
    this.embeddingDecisionsStream.write(line);
  }

  /**
   * Flush and close all streams, write summary.json
   * Comment 2: Include consumed/remaining budget metrics in summary.json
   * Comment 2: Add stream error handling so close() rejects if a stream emits an error
   * Comment 3: close() is idempotent — safe to call multiple times
   */
  async close(
    stats: BackfillStats,
    meta: {
      totalRuntimeMs: number;
      offPoolSize: number;
      sliceFilePath: string;
      brandAliasesResolved?: number;
      aiBudgetConsumed?: number;
      aiBudgetRemaining?: number;
      aiBudgetLimit?: number;
      embeddingBudgetConsumed?: number;
      embeddingBudgetRemaining?: number;
      embeddingBudgetLimit?: number;
      resumable?: boolean;
      lastCursor?: { updatedAt: string | null; id: string | null; pageNumber: number };
      runStartTime?: string;
      runEndTime?: string;
      applyMode?: string;
      aiDegraded?: boolean;
      aiConcurrencyFinal?: number;
    },
  ): Promise<string> {
    // Comment 3: Idempotent guard — if already closed, reject to prevent repeated calls
    if (this.closed) {
      return Promise.reject(new Error('BackfillReporter.close() already called — cannot close again. Use same result or wrap in try/catch.'));
    }
    this.closed = true;

    return new Promise((resolve, reject) => {
      let closedCount = 0;
      let streamErrorOccurred = false;

      const onStreamFinish = () => {
        closedCount++;
        if (closedCount === 7 && !streamErrorOccurred) {
          // All streams closed successfully, now write summary.json
          const summaryPath = path.join(this.runDir, 'summary.json');
          const summary = {
            ...stats,
            ...meta,
          };
          try {
            fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
            resolve(this.runDir);
          } catch (writeError: any) {
            const errorMsg = writeError instanceof Error ? writeError.message : String(writeError);
            reject(new Error(`Failed to write summary.json: ${errorMsg}`));
          }
        }
      };

      const onStreamError = (streamName: string) => (error: any) => {
        if (!streamErrorOccurred) {
          streamErrorOccurred = true;
          const errorMsg = error instanceof Error ? error.message : String(error);
          reject(new Error(`Stream error on ${streamName}: ${errorMsg}`));
        }
      };

      // Attach finish listeners
      this.residualsStream.on('finish', onStreamFinish);
      this.nearMissesStream.on('finish', onStreamFinish);
      this.reviewQueueStream.on('finish', onStreamFinish);
      this.aiDecisionsStream.on('finish', onStreamFinish);
      this.autoAppliedStream.on('finish', onStreamFinish);
      this.brandAliasesStream.on('finish', onStreamFinish);
      this.embeddingDecisionsStream.on('finish', onStreamFinish);

      // Comment 2: Attach error listeners to all streams
      this.residualsStream.on('error', onStreamError('residuals'));
      this.nearMissesStream.on('error', onStreamError('nearMisses'));
      this.reviewQueueStream.on('error', onStreamError('reviewQueue'));
      this.aiDecisionsStream.on('error', onStreamError('aiDecisions'));
      this.autoAppliedStream.on('error', onStreamError('autoApplied'));
      this.brandAliasesStream.on('error', onStreamError('brandAliases'));
      this.embeddingDecisionsStream.on('error', onStreamError('embeddingDecisions'));

      this.residualsStream.end();
      this.nearMissesStream.end();
      this.reviewQueueStream.end();
      this.aiDecisionsStream.end();
      this.autoAppliedStream.end();
      this.brandAliasesStream.end();
      this.embeddingDecisionsStream.end();
    });
  }

  /**
   * Expose the report directory path for logging
   */
  get reportDir(): string {
    return this.runDir;
  }
}
