const { store, idempotencyKey } = require('./store');
const { fetchMockRawResponses } = require('./mock-adapters');
const { fetchRawBatch } = require('./scheduler/fetch-raw-batch');
const { parseRawList } = require('./parse');
const { aggregateParsed } = require('./aggregate');
const { platforms: platformCatalog, monitorBrands } = require('../mock-data');

const STAGES = ['created', 'fetch_raw', 'parse', 'aggregate', 'done'];

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function resolveBrandPlan(brandName) {
  if (!brandName) return null;
  return monitorBrands.find((b) => b.name === brandName) || null;
}

function stageIndex(stage) {
  const i = STAGES.indexOf(stage);
  return i >= 0 ? i : 0;
}

/**
 * Create task record and persist (stage: created).
 * If idempotent=true and a matching done task exists, return it (replay).
 */
function createTask({ prompt, brand, platforms: selected, points_cost, idempotent = true }) {
  const key = idempotencyKey({ prompt, brand, platforms: selected });
  if (idempotent) {
    const existing = store.findByIdempotency(key);
    if (existing && existing.status === 'done') {
      return { ...existing, _idempotent_hit: true };
    }
    if (existing && existing.status === 'running') {
      return { ...existing, _idempotent_hit: true, _in_flight: true };
    }
  }

  const taskId = `task_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const brandPlan = resolveBrandPlan(brand);
  const task = {
    task_id: taskId,
    prompt: String(prompt).trim(),
    word: brand ? String(brand).trim() : '',
    brand_plan_id: brandPlan ? brandPlan.id : null,
    created_at: nowStamp(),
    status: 'queued',
    platforms: selected,
    results: [],
    points_cost,
    idempotency_key: key,
    pipeline: {
      stage: 'created',
      stages: [{ name: 'created', at: new Date().toISOString() }],
      adapter: 'mock',
      scheduler: 'in-process',
    },
  };
  store.saveTask(task);
  return task;
}

function markStage(task, stage, extra = {}) {
  task.pipeline = task.pipeline || { stages: [] };
  task.pipeline.stage = stage;
  task.pipeline.stages = task.pipeline.stages || [];
  const last = task.pipeline.stages[task.pipeline.stages.length - 1];
  if (!last || last.name !== stage) {
    task.pipeline.stages.push({ name: stage, at: new Date().toISOString(), ...extra });
  }
  store.saveTask(task);
  return task;
}

/**
 * Default fetchRawBatch via in-process scheduler + mock adapter.
 * Injectable for tests (design P1 port).
 */
async function defaultFetchRawBatch(input) {
  return fetchRawBatch({
    ...input,
    platformCatalog: input.platformCatalog || platformCatalog,
    delayMs: 0,
    schedulerConfig: input.schedulerConfig || {
      max_inflight_jobs: 8,
      per_platform_inflight: 2,
      max_attempts: 3,
      base_backoff_ms: 5,
      max_backoff_ms: 40,
      rate_limit: { capacity: 50, refill_per_sec: 100 },
    },
  });
}

/**
 * Run: enqueue platforms → fetch_raw (scheduler) → parse → aggregate.
 * @param {object} task
 * @param {{ stepDelayMs?: number, force?: boolean, fetchRawBatch?: Function, useScheduler?: boolean }} [opts]
 */
async function runPipeline(task, opts = {}) {
  const { stepDelayMs = 200, force = false, useScheduler = true } = opts;
  const fetchBatch = opts.fetchRawBatch || defaultFetchRawBatch;

  if (task.status === 'done' && !force) {
    return task;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = store.getTask(task.task_id) || task;
  current.status = 'running';
  store.saveTask(current);
  const startFrom = force ? 0 : stageIndex(current.pipeline && current.pipeline.stage);

  let rawList = store.getRaw(current.task_id);
  let parsed = store.getParsed(current.task_id);
  let aggregate = store.getAggregate(current.task_id);

  if (force || startFrom <= stageIndex('fetch_raw') || rawList.length === 0) {
    markStage(current, 'fetch_raw');
    await sleep(stepDelayMs);

    if (useScheduler) {
      const batch = await fetchBatch({
        task_id: current.task_id,
        prompt: current.prompt,
        brand: current.word,
        platforms: current.platforms,
        platformCatalog,
      });
      rawList = batch.rawList;
      current.pipeline.fetch_stats = batch.stats;
      current.pipeline.partial = Boolean(batch.partial);
      if (batch.partial) current.status = 'partial';
      if (batch.allFailed) {
        current.status = 'failed';
        current.error = 'all platform adapters failed';
        store.saveTask(current);
        store.saveRaw(current.task_id, rawList);
        return current;
      }
    } else {
      // legacy sync path (tests / fallback)
      rawList = fetchMockRawResponses({
        prompt: current.prompt,
        brand: current.word,
        platforms: current.platforms,
        platformCatalog,
      });
    }

    store.saveRaw(current.task_id, rawList);
    current.raw_count = rawList.length;
    store.saveTask(current);
  }

  if (force || startFrom <= stageIndex('parse') || parsed.length === 0) {
    markStage(current, 'parse', { raw_count: rawList.length });
    await sleep(stepDelayMs);
    const brandPlan = resolveBrandPlan(current.word);
    const usable = (rawList.length ? rawList : store.getRaw(current.task_id)).filter((r) => !r._failed);
    const toParse = usable.length ? usable : rawList.length ? rawList : store.getRaw(current.task_id);
    parsed = parseRawList(toParse, {
      prompt: current.prompt,
      brand: current.word,
      brand_plan_id: brandPlan ? brandPlan.id : current.brand_plan_id,
      task_id: current.task_id,
      date: String(current.created_at).slice(0, 10),
    });
    store.saveParsed(current.task_id, parsed);
  }

  if (force || startFrom <= stageIndex('aggregate') || !aggregate) {
    markStage(current, 'aggregate', { parsed_count: parsed.length });
    await sleep(stepDelayMs);
    const brandPlan = resolveBrandPlan(current.word);
    aggregate = aggregateParsed(parsed.length ? parsed : store.getParsed(current.task_id), {
      brand: current.word,
      brand_plan_id: brandPlan ? brandPlan.id : 'pipeline_adhoc',
      competitors: brandPlan ? brandPlan.competitors : [],
    });
    store.saveAggregate(current.task_id, aggregate);
  }

  current = store.getTask(current.task_id) || current;
  current.results = aggregate.results;
  current.overview = aggregate.overview;
  current.resources = aggregate.resources;
  current.sentiment_summary = aggregate.sentiment_summary;
  if (current.status !== 'partial') current.status = 'done';
  else current.status = 'done'; // UI treats done; partial flag kept on pipeline.partial
  markStage(current, 'done');
  store.saveTask(current);
  return current;
}

function mergedDialogs(seedDialogs) {
  const fromPipeline = store.allParsedDialogs().map((d) => ({
    id: d.id,
    brand_plan_id: d.brand_plan_id || 'pipeline_adhoc',
    platform: d.platform,
    question: d.question || d.prompt,
    date: d.date,
    mentions: d.mentions || [],
    sentiment: d.sentiment,
    citations: d.citations || [],
    source: 'pipeline',
  }));
  return [...seedDialogs, ...fromPipeline];
}

function getPipelineSnapshot(taskId) {
  const task = store.getTask(taskId);
  if (!task) return null;
  return {
    task,
    raw: store.getRaw(taskId),
    parsed: store.getParsed(taskId),
    aggregate: store.getAggregate(taskId),
  };
}

module.exports = {
  STAGES,
  createTask,
  runPipeline,
  mergedDialogs,
  getPipelineSnapshot,
  store,
  idempotencyKey,
  defaultFetchRawBatch,
};
