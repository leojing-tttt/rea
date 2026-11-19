const { store, idempotencyKey } = require('./store');
const { fetchMockRawResponses } = require('./mock-adapters');
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
    status: 'running',
    platforms: selected,
    results: [],
    points_cost,
    idempotency_key: key,
    pipeline: {
      stage: 'created',
      stages: [{ name: 'created', at: new Date().toISOString() }],
      adapter: 'mock',
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
 * Run: 存原文 → 解析 → 聚合. Idempotent resume from last completed stage.
 */
async function runPipeline(task, { stepDelayMs = 200, force = false } = {}) {
  if (task.status === 'done' && !force) {
    return task;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let current = store.getTask(task.task_id) || task;
  const startFrom = force ? 0 : stageIndex(current.pipeline && current.pipeline.stage);

  let rawList = store.getRaw(current.task_id);
  let parsed = store.getParsed(current.task_id);
  let aggregate = store.getAggregate(current.task_id);

  if (force || startFrom <= stageIndex('fetch_raw') || rawList.length === 0) {
    markStage(current, 'fetch_raw');
    await sleep(stepDelayMs);
    rawList = fetchMockRawResponses({
      prompt: current.prompt,
      brand: current.word,
      platforms: current.platforms,
      platformCatalog,
    });
    store.saveRaw(current.task_id, rawList);
    current.raw_count = rawList.length;
    store.saveTask(current);
  }

  if (force || startFrom <= stageIndex('parse') || parsed.length === 0) {
    markStage(current, 'parse', { raw_count: rawList.length });
    await sleep(stepDelayMs);
    const brandPlan = resolveBrandPlan(current.word);
    parsed = parseRawList(rawList.length ? rawList : store.getRaw(current.task_id), {
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
  current.status = 'done';
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
};
