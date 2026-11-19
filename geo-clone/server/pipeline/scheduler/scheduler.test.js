const assert = require('assert');
const { InProcessScheduler } = require('./queue');
const { fetchRawBatch } = require('./fetch-raw-batch');
const { createMockAdapter } = require('../adapters/mock-adapter');
const { AdapterError, KINDS } = require('../adapters/errors');
const { platforms } = require('../../mock-data');
const { runPipeline, createTask } = require('../runner');

async function main() {
  // --- concurrency: never exceed max_inflight ---
  const sched = new InProcessScheduler({
    max_inflight_jobs: 2,
    per_platform_inflight: 2,
    max_attempts: 1,
    base_backoff_ms: 5,
    rate_limit: { capacity: 100, refill_per_sec: 100 },
  });
  let maxSeen = 0;
  let current = 0;
  sched.enqueue(
    Array.from({ length: 6 }, (_, i) => ({
      platformId: `p${i % 3}`,
      modeId: 'web_fast',
      priority: 100 - i,
    }))
  );
  await sched.runUntilIdle(async () => {
    current += 1;
    maxSeen = Math.max(maxSeen, current);
    await new Promise((r) => setTimeout(r, 15));
    current -= 1;
    return { ok: true };
  });
  assert.ok(maxSeen <= 2, `max inflight ${maxSeen} should be <= 2`);
  assert.strictEqual(sched.stats.succeeded, 6);

  // --- retry TRANSIENT then succeed ---
  const batch = await fetchRawBatch({
    task_id: 'sched_retry',
    prompt: '调度重试测试',
    brand: '君乐宝',
    platforms: [
      { platformId: 'doubao', modeId: 'web_fast' },
      { platformId: 'deepseek', modeId: 'web_fast' },
    ],
    platformCatalog: platforms,
    adapterOpts: {
      failRemaining: { doubao: 2 },
      failKinds: { doubao: KINDS.TRANSIENT },
    },
    schedulerConfig: {
      max_inflight_jobs: 4,
      per_platform_inflight: 2,
      max_attempts: 3,
      base_backoff_ms: 5,
      max_backoff_ms: 20,
      rate_limit: { capacity: 50, refill_per_sec: 100 },
    },
  });
  assert.ok(batch.stats.retries >= 2, 'should have retried doubao');
  assert.ok(batch.rawList.length === 2);
  assert.ok(!batch.allFailed);
  assert.ok(batch.rawList.every((r) => r.raw_text));

  // --- AUTH no retry → partial ---
  const partial = await fetchRawBatch({
    task_id: 'sched_auth',
    prompt: '鉴权失败测试',
    brand: '君乐宝',
    platforms: [
      { platformId: 'doubao', modeId: 'web_fast' },
      { platformId: 'yuanbao', modeId: 'web_fast' },
    ],
    platformCatalog: platforms,
    adapterOpts: {
      failKinds: { doubao: KINDS.AUTH },
    },
    schedulerConfig: {
      max_attempts: 3,
      base_backoff_ms: 5,
      rate_limit: { capacity: 50, refill_per_sec: 100 },
    },
  });
  assert.ok(partial.partial || partial.errors.length === 1);
  assert.strictEqual(partial.errors[0].error.kind, KINDS.AUTH);
  assert.ok(partial.rawList.some((r) => r._failed));
  assert.ok(partial.rawList.some((r) => !r._failed));

  // --- rate limit stub waits ---
  const rl = new InProcessScheduler({
    max_inflight_jobs: 4,
    per_platform_inflight: 4,
    max_attempts: 1,
    rate_limit: { capacity: 1, refill_per_sec: 20 },
  });
  rl.enqueue([
    { platformId: 'same', modeId: 'a' },
    { platformId: 'same', modeId: 'b' },
    { platformId: 'same', modeId: 'c' },
  ]);
  await rl.runUntilIdle(async (job) => ({ platformId: job.platformId }));
  assert.ok(rl.stats.rate_limited_waits >= 1, 'token bucket should delay');
  assert.strictEqual(rl.stats.succeeded, 3);

  // --- AdapterError classification ---
  const err = new AdapterError(KINDS.RATE_LIMITED, 'slow down', { retryAfterMs: 10 });
  assert.ok(err.retryable);
  const auth = new AdapterError(KINDS.AUTH, 'bad key');
  assert.ok(!auth.retryable);

  // --- full pipeline still works via scheduler ---
  const task = createTask({
    prompt: `scheduler_pipeline_${Date.now()}`,
    brand: '君乐宝',
    platforms: [
      { platformId: 'doubao', modeId: 'web_fast' },
      { platformId: 'kimi', modeId: 'web_fast' },
    ],
    points_cost: 4,
    idempotent: false,
  });
  const done = await runPipeline(task, { stepDelayMs: 0 });
  assert.strictEqual(done.status, 'done');
  assert.ok(done.overview);
  assert.ok(done.pipeline.fetch_stats);

  console.log('scheduler.test.js OK', {
    maxSeen,
    retries: batch.stats.retries,
    rate_limited_waits: rl.stats.rate_limited_waits,
    pipeline_stage: done.pipeline.stage,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
