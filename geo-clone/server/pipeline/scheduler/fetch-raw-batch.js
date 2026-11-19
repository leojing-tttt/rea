/**
 * fetchRawBatch port (design §6.3): enqueue PlatformJob×N → settle → RawAnswer[]
 * P3: consult vault + circuit before dispatch; credential_ref only (no secrets on disk).
 */

const { InProcessScheduler } = require('./queue');
const { createMockAdapter } = require('../adapters/mock-adapter');
const { platforms: defaultCatalog } = require('../../mock-data');
const { beforeDispatch, afterDispatch, credentialRefFor } = require('../api-mgmt');

/**
 * @param {object} input
 * @param {string} input.task_id
 * @param {string} input.prompt
 * @param {string} [input.brand]
 * @param {Array} input.platforms
 * @param {Array} [input.platformCatalog]
 * @param {number} [input.priority]
 * @param {object} [input.schedulerConfig]
 * @param {object} [input.adapter] PlatformAdapter override
 * @param {object} [input.adapterOpts] createMockAdapter opts
 * @param {boolean} [input.skipApiMgmt] bypass vault/circuit (tests)
 */
async function fetchRawBatch(input) {
  const catalog = input.platformCatalog || defaultCatalog;
  const adapter =
    input.adapter ||
    createMockAdapter({
      platformCatalog: catalog,
      delayMs: input.delayMs || 0,
      ...(input.adapterOpts || {}),
    });

  const scheduler = input.scheduler || new InProcessScheduler(input.schedulerConfig || {});
  const selected = input.platforms || [];
  const useMgmt = input.skipApiMgmt !== true;

  const skipped = [];
  const jobs = [];

  selected.forEach((p, platformIndex) => {
    const platformId = p.platformId || p.id || p;
    const modeId = p.modeId || p.mode || 'web_fast';
    const credential_ref = useMgmt ? credentialRefFor(platformId) : p.credential_ref || 'mock';

    if (useMgmt) {
      const gate = beforeDispatch(platformId);
      if (!gate.ok) {
        skipped.push({
          job: {
            task_id: input.task_id,
            platformId,
            modeId,
            credential_ref: gate.credential_ref || credential_ref,
            platformIndex,
          },
          error: gate.error || { kind: 'UNKNOWN', message: gate.reason || 'skipped' },
          skipped: true,
          reason: gate.reason,
        });
        return;
      }
      jobs.push({
        task_id: input.task_id,
        platformId,
        modeId,
        priority: input.priority != null ? input.priority : 100,
        credential_ref: gate.credential_ref,
        // Never put apiKey / resolved secrets on the job object that may be snapshotted
        platformIndex,
        _relay: gate.resolved && gate.resolved.relay,
        _baseUrl: gate.resolved && gate.resolved.baseUrl,
      });
    } else {
      jobs.push({
        task_id: input.task_id,
        platformId,
        modeId,
        priority: input.priority != null ? input.priority : 100,
        credential_ref,
        platformIndex,
      });
    }
  });

  scheduler.enqueue(jobs);

  const { results, errors, stats } = await scheduler.runUntilIdle(async (job) => {
    try {
      const value = await adapter.fetchRaw({
        task_id: job.task_id || input.task_id,
        prompt: input.prompt,
        brand: input.brand || '',
        platformId: job.platformId,
        modeId: job.modeId,
        platformIndex: job.platformIndex || 0,
        // Mock adapters ignore credentials; real adapters would receive ephemeral resolve separately
        credential_ref: job.credential_ref,
        relay: job._relay || null,
        baseUrl: job._baseUrl || null,
      });
      if (useMgmt) {
        afterDispatch(job.platformId, job.credential_ref, { ok: true });
      }
      return value;
    } catch (err) {
      if (useMgmt) {
        afterDispatch(job.platformId, job.credential_ref, { ok: false, error: err });
      }
      throw err;
    }
  });

  const rawList = results.map((r) => r.value);

  const allErrors = [...errors, ...skipped];

  // Error stubs so parse can still run (partial)
  for (const e of allErrors) {
    rawList.push({
      platform_id: e.job.platformId,
      platform: e.job.platformId,
      mode: e.job.modeId,
      fetched_at: new Date().toISOString(),
      adapter: 'mock',
      credential_ref: e.job.credential_ref || null,
      raw_text: `【${e.job.platformId}】adapter failed: ${e.error.kind} — ${e.error.message}`,
      error: {
        kind: e.error.kind,
        message: e.error.message,
        // never include secret material
      },
      _failed: true,
      _skipped: !!e.skipped,
    });
  }

  const successCount = results.length;
  const failCount = allErrors.length;
  const partial = failCount > 0 && successCount > 0;
  const allFailed = successCount === 0 && failCount > 0;

  return {
    rawList,
    errors: allErrors,
    stats: {
      ...stats,
      skipped: skipped.length,
    },
    partial,
    allFailed,
    scheduler: scheduler.snapshot(),
  };
}

module.exports = { fetchRawBatch };
