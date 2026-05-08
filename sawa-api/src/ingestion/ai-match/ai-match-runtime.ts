/**
 * AI Match Runtime Utilities
 * Shared concurrency primitives (Semaphore, BudgetGuard) for Phase 3 orchestration.
 * No NestJS dependencies — these are plain classes instantiated per-run.
 */

/**
 * Semaphore — a Promise-based concurrency limiter.
 * Limits the number of concurrently executing async tasks.
 */
export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];
  private currentActive: number = 0;
  private currentLimit: number;

  constructor(concurrency: number) {
    this.currentLimit = Math.max(1, concurrency);
    this.permits = this.currentLimit;
  }

  /**
   * Runs a function with a semaphore slot.
   * If all slots are busy, waits until one is released.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    // Wait for a slot to become available
    if (this.permits <= 0) {
      await new Promise<void>((resolve) => {
        this.waitQueue.push(resolve);
      });
    }

    this.permits--;
    this.currentActive++;

    try {
      return await fn();
    } finally {
      this.currentActive--;
      this.permits++;

      // Resume the next waiting task
      const next = this.waitQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Returns the number of tasks currently waiting for a slot.
   */
  pending(): number {
    return this.waitQueue.length;
  }

  /**
   * Returns the number of tasks currently active.
   */
  active(): number {
    return this.currentActive;
  }

  /**
   * Adjusts the concurrency limit incrementally without resetting the semaphore.
   */
  setPermits(newLimit: number): void {
    const clampedLimit = Math.max(1, newLimit);
    const delta = clampedLimit - this.currentLimit;
    
    if (delta > 0) {
      this.permits += delta;
      for (let i = 0; i < delta; i++) {
        const next = this.waitQueue.shift();
        if (next) {
          next();
        } else {
          break;
        }
      }
    } else if (delta < 0) {
      this.permits -= Math.abs(delta);
    }
    this.currentLimit = clampedLimit;
  }
}

/**
 * BudgetGuard — atomic per-run AI call budget tracker.
 * Phase 3 calls tryConsume() before invoking the LLM; on false, propagates
 * reason_code='ai_budget_exhausted' to the residual and skips LLM.
 * 
 * Comment 3: Budget is preserved in checkpoint.json on pause/interrupt and re-seeded on resume.
 * Use getConsumed() to persist to checkpoint; use consume(n) to restore on resume.
 */
export class BudgetGuard {
  private consumedCount: number = 0;
  private limit: number;

  constructor(limitFromEnv: number | string | undefined) {
    // Parse the limit; treat 0, NaN, or falsy as "disabled" (unlimited)
    let parsed = 0;
    if (limitFromEnv) {
      parsed = parseInt(String(limitFromEnv), 10);
    }

    if (isNaN(parsed) || parsed <= 0) {
      this.limit = Number.POSITIVE_INFINITY;
    } else {
      this.limit = parsed;
    }
  }

  /**
   * Atomically tries to consume one unit from the budget.
   * Returns true if the budget was not exceeded; false if exhausted.
   */
  tryConsume(): boolean {
    if (this.consumedCount >= this.limit) {
      return false;
    }
    this.consumedCount++;
    return true;
  }

  /**
   * Comment 3: Bulk consume for checkpoint restoration on resume.
   * Bumps consumedCount by n units (used when re-seeding budget after resume).
   */
  consume(n: number): void {
    if (n > 0) {
      this.consumedCount += n;
    }
  }

  /**
   * Returns the number of units consumed so far.
   */
  getConsumed(): number {
    return this.consumedCount;
  }

  /**
   * Returns the number of units remaining (or Infinity if budget is disabled).
   */
  getRemaining(): number {
    if (this.limit === Number.POSITIVE_INFINITY) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.max(0, this.limit - this.consumedCount);
  }
}

/**
 * OllamaConcurrencyLimiter — per-operation inner concurrency gate for Ollama.
 * 
 * This is an **inner** gate that sits inside the outer `activeSemaphore` (row-level).
 * While the outer gate limits concurrent rows being matched, this inner gate limits
 * how many concurrent /api/embed or /api/chat calls are sent to the Ollama daemon.
 * 
 * Ollama runs a single-threaded model server; sending too many concurrent requests
 * causes cascading timeouts and saturation. By limiting embed and chat concurrency
 * independently, we prevent the daemon from being overwhelmed while still parallelizing
 * across rows.
 * 
 * The limiter can degrade to lower concurrency when embedding failures exceed a threshold,
 * allowing the system to self-heal under heavy load.
 */
export class OllamaConcurrencyLimiter {
  private embedSemaphore: Semaphore;
  private chatSemaphore: Semaphore;

  constructor(embedConcurrency: number, chatConcurrency: number) {
    this.embedSemaphore = new Semaphore(embedConcurrency);
    this.chatSemaphore = new Semaphore(chatConcurrency);
  }

  /**
   * Run a function with a semaphore slot reserved for embedding operations.
   */
  async runEmbed<T>(fn: () => Promise<T>): Promise<T> {
    return this.embedSemaphore.run(fn);
  }

  /**
   * Run a function with a semaphore slot reserved for chat operations.
   */
  async runChat<T>(fn: () => Promise<T>): Promise<T> {
    return this.chatSemaphore.run(fn);
  }

  /**
   * Degrade to lower concurrency limits for both embed and chat.
   * Called when the embedding degraded-mode threshold is triggered.
   */
  degradeTo(embedConcurrency: number, chatConcurrency: number): void {
    this.embedSemaphore.setPermits(embedConcurrency);
    this.chatSemaphore.setPermits(chatConcurrency);
  }

  /**
   * Degrade to a lower concurrency limit for chat only.
   */
  degradeChatTo(chatConcurrency: number): void {
    this.chatSemaphore.setPermits(chatConcurrency);
  }

  /**
   * Getter that exposes the embed semaphore with the { run: ... } interface.
   * Used by call sites to pass per-operation semaphore limits.
   */
  get embedLimiter(): Semaphore {
    return this.embedSemaphore;
  }

  /**
   * Getter that exposes the chat semaphore with the { run: ... } interface.
   * Used by call sites to pass per-operation semaphore limits.
   */
  get chatLimiter(): Semaphore {
    return this.chatSemaphore;
  }
}
