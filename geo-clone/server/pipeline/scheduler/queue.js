/**
 * In-process Queue / Scheduler (design Phase 1–2 without Redis).
 * - Priority queue (higher first, FIFO within same priority)
 * - Global + per-platform concurrency
 * - Token-bucket rate limit stub per platform
 * - Retries with exponential backoff + jitter for retryable AdapterError
 */

const { mergeConfig } = require('./config');
const { isAdapterError, KINDS } = require('../adapters/errors');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jitter(ms) {
  return Math.floor(ms * (0.7 + Math.random() * 0.6));
}

class TokenBucket {
  constructor({ capacity, refill_per_sec }) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refill_per_sec = refill_per_sec;
    this.updated_at = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.updated_at) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refill_per_sec);
    this.updated_at = now;
  }

  tryTake() {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  msUntilToken() {
    this._refill();
    if (this.tokens >= 1) return 0;
    const need = 1 - this.tokens;
    return Math.ceil((need / this.refill_per_sec) * 1000);
  }
}

class InProcessScheduler {
  /**
   * @param {Partial<typeof import('./config').DEFAULT_SCHEDULER_CONFIG>} [config]
   */
  constructor(config = {}) {
    this.config = mergeConfig(config);
    /** @type {Array<object>} */
    this.pending = [];
    this.inflight = 0;
    this.perPlatformInflight = new Map();
    this.buckets = new Map();
    this.stats = {
      enqueued: 0,
      succeeded: 0,
      failed: 0,
      retries: 0,
      rate_limited_waits: 0,
    };
    this._running = false;
  }

  _bucket(platformId) {
    if (!this.buckets.has(platformId)) {
      this.buckets.set(platformId, new TokenBucket(this.config.rate_limit));
    }
    return this.buckets.get(platformId);
  }

  /**
   * @param {object|object[]} jobs
   */
  enqueue(jobs) {
    const list = Array.isArray(jobs) ? jobs : [jobs];
    for (const job of list) {
      this.pending.push({
        ...job,
        job_id: job.job_id || `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        attempt: job.attempt || 0,
        priority: job.priority != null ? job.priority : this.config.default_priority,
        enqueued_at: job.enqueued_at || new Date().toISOString(),
        not_before: job.not_before || 0,
      });
      this.stats.enqueued += 1;
    }
    this._sortPending();
  }

  _sortPending() {
    this.pending.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return String(a.enqueued_at).localeCompare(String(b.enqueued_at));
    });
  }

  _platformInflight(platformId) {
    return this.perPlatformInflight.get(platformId) || 0;
  }

  _claimNext(now = Date.now()) {
    for (let i = 0; i < this.pending.length; i += 1) {
      const job = this.pending[i];
      if (job.not_before && job.not_before > now) continue;
      if (this.inflight >= this.config.max_inflight_jobs) return null;
      if (this._platformInflight(job.platformId) >= this.config.per_platform_inflight) continue;

      const bucket = this._bucket(job.platformId);
      if (!bucket.tryTake()) {
        // rate limit stub: delay this job
        const wait = Math.max(bucket.msUntilToken(), 10);
        job.not_before = now + wait;
        this.stats.rate_limited_waits += 1;
        continue;
      }

      this.pending.splice(i, 1);
      this.inflight += 1;
      this.perPlatformInflight.set(job.platformId, this._platformInflight(job.platformId) + 1);
      return job;
    }
    return null;
  }

  _release(job) {
    this.inflight = Math.max(0, this.inflight - 1);
    const n = this._platformInflight(job.platformId);
    this.perPlatformInflight.set(job.platformId, Math.max(0, n - 1));
  }

  _backoffMs(attempt, retryAfterMs) {
    if (retryAfterMs != null) return retryAfterMs;
    const exp = Math.min(
      this.config.max_backoff_ms,
      this.config.base_backoff_ms * 2 ** Math.max(0, attempt - 1)
    );
    return jitter(exp);
  }

  /**
   * Process all pending jobs with handler(job) → result.
   * @param {(job: object) => Promise<any>} handler
   * @returns {Promise<{ results: Array, errors: Array, stats: object }>}
   */
  async runUntilIdle(handler) {
    const results = [];
    const errors = [];
    const deadline = Date.now() + (this.config.task_deadline_ms || 120000);

    const pump = async () => {
      while (this.pending.length > 0 || this.inflight > 0) {
        if (Date.now() > deadline) {
          // fail remaining pending
          while (this.pending.length) {
            const job = this.pending.shift();
            errors.push({
              job,
              error: { kind: KINDS.TRANSIENT, message: 'task_deadline_exceeded' },
            });
            this.stats.failed += 1;
          }
          break;
        }

        const job = this._claimNext();
        if (!job) {
          if (this.inflight === 0 && this.pending.length > 0) {
            // all pending delayed — wait for earliest not_before
            const nextAt = Math.min(...this.pending.map((j) => j.not_before || Date.now()));
            await sleep(Math.max(5, nextAt - Date.now()));
            continue;
          }
          await sleep(5);
          continue;
        }

        // fire without awaiting in tight loop — but we need controlled concurrency via claim
        // Process one at a time after claim, but allow parallel via Promise race pattern
        // eslint-disable-next-line no-await-in-loop
        await this._executeJob(job, handler, results, errors);
      }
    };

    // Parallel workers up to max_inflight
    const workers = [];
    const workerCount = Math.min(this.config.max_inflight_jobs, Math.max(1, this.pending.length));
    for (let w = 0; w < workerCount; w += 1) {
      workers.push(
        (async () => {
          while (this.pending.length > 0 || this.inflight > 0) {
            if (Date.now() > deadline) break;
            const job = this._claimNext();
            if (!job) {
              if (this.pending.length === 0 && this.inflight === 0) break;
              // eslint-disable-next-line no-await-in-loop
              await sleep(8);
              continue;
            }
            // eslint-disable-next-line no-await-in-loop
            await this._executeJob(job, handler, results, errors);
          }
        })()
      );
    }
    // If no jobs, workers exit immediately
    if (workers.length === 0) await pump();
    else await Promise.all(workers);

    return { results, errors, stats: { ...this.stats } };
  }

  async _executeJob(job, handler, results, errors) {
    try {
      const value = await handler(job);
      results.push({ job, value });
      this.stats.succeeded += 1;
    } catch (err) {
      const adapterErr = isAdapterError(err)
        ? err
        : { kind: KINDS.UNKNOWN, message: String(err && err.message ? err.message : err), retryable: true };

      const attempt = (job.attempt || 0) + 1;
      const canRetry =
        adapterErr.retryable !== false &&
        attempt < this.config.max_attempts &&
        !(adapterErr.kind === KINDS.UNKNOWN && attempt >= 2);

      if (canRetry) {
        this.stats.retries += 1;
        const delay = this._backoffMs(attempt, adapterErr.retryAfterMs);
        this.enqueue({
          ...job,
          attempt,
          not_before: Date.now() + delay,
          enqueued_at: job.enqueued_at,
        });
      } else {
        errors.push({
          job: { ...job, attempt },
          error: {
            kind: adapterErr.kind || KINDS.UNKNOWN,
            message: adapterErr.message || String(err),
            adapterId: adapterErr.adapterId || null,
          },
        });
        this.stats.failed += 1;
      }
    } finally {
      this._release(job);
    }
  }

  snapshot() {
    return {
      pending: this.pending.length,
      inflight: this.inflight,
      per_platform: Object.fromEntries(this.perPlatformInflight),
      stats: { ...this.stats },
      config: {
        max_inflight_jobs: this.config.max_inflight_jobs,
        per_platform_inflight: this.config.per_platform_inflight,
        max_attempts: this.config.max_attempts,
      },
    };
  }
}

module.exports = { InProcessScheduler, TokenBucket };
