/**
 * fetchRawBatch port (design §6.3): enqueue PlatformJob×N → settle → RawAnswer[]
 */

const { InProcessScheduler } = require('./queue');
const { createMockAdapter } = require('../adapters/mock-adapter');
const { platforms: defaultCatalog } = require('../../mock-data');

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

  const jobs = selected.map((p, platformIndex) => ({
    task_id: input.task_id,
    platformId: p.platformId || p.id || p,
    modeId: p.modeId || p.mode || 'web_fast',
    priority: input.priority != null ? input.priority : 100,
    credential_ref: 'mock',
    platformIndex,
  }));

  scheduler.enqueue(jobs);

  const { results, errors, stats } = await scheduler.runUntilIdle(async (job) => {
    return adapter.fetchRaw({
      task_id: job.task_id || input.task_id,
      prompt: input.prompt,
      brand: input.brand || '',
      platformId: job.platformId,
      modeId: job.modeId,
      platformIndex: job.platformIndex || 0,
    });
  });

  const rawList = results.map((r) => r.value);

  // Error stubs so parse can still run (partial)
  for (const e of errors) {
    rawList.push({
      platform_id: e.job.platformId,
      platform: e.job.platformId,
      mode: e.job.modeId,
      fetched_at: new Date().toISOString(),
      adapter: 'mock',
      raw_text: `【${e.job.platformId}】adapter failed: ${e.error.kind} — ${e.error.message}`,
      error: e.error,
      _failed: true,
    });
  }

  const partial = errors.length > 0 && results.length > 0;
  const allFailed = results.length === 0 && errors.length > 0;

  return {
    rawList,
    errors,
    stats,
    partial,
    allFailed,
    scheduler: scheduler.snapshot(),
  };
}

module.exports = { fetchRawBatch };
