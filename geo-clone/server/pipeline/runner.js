const { store } = require('./store');
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

/**
 * Create task record and persist (stage: created).
 */
function createTask({ prompt, brand, platforms: selected, points_cost }) {
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
  task.pipeline.stages.push({ name: stage, at: new Date().toISOString(), ...extra });
  store.saveTask(task);
  return task;
}

/**
 * Run: 存原文 → 解析 → 聚合. Mutates and persists task.
 * @returns {Promise<object>} completed task
 */
async function runPipeline(task, { stepDelayMs = 200 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  markStage(task, 'fetch_raw');
  await sleep(stepDelayMs);
  const rawList = fetchMockRawResponses({
    prompt: task.prompt,
    brand: task.word,
    platforms: task.platforms,
    platformCatalog,
  });
  store.saveRaw(task.task_id, rawList);
  task.raw_count = rawList.length;
  store.saveTask(task);

  markStage(task, 'parse', { raw_count: rawList.length });
  await sleep(stepDelayMs);
  const brandPlan = resolveBrandPlan(task.word);
  const parsed = parseRawList(rawList, {
    prompt: task.prompt,
    brand: task.word,
    brand_plan_id: brandPlan ? brandPlan.id : task.brand_plan_id,
    task_id: task.task_id,
    date: task.created_at.slice(0, 10),
  });
  store.saveParsed(task.task_id, parsed);

  markStage(task, 'aggregate', { parsed_count: parsed.length });
  await sleep(stepDelayMs);
  const aggregate = aggregateParsed(parsed, {
    brand: task.word,
    brand_plan_id: brandPlan ? brandPlan.id : 'pipeline_adhoc',
    competitors: brandPlan ? brandPlan.competitors : [],
  });
  store.saveAggregate(task.task_id, aggregate);

  task.results = aggregate.results;
  task.overview = aggregate.overview;
  task.resources = aggregate.resources;
  task.sentiment_summary = aggregate.sentiment_summary;
  task.status = 'done';
  markStage(task, 'done');
  store.saveTask(task);
  return task;
}

/**
 * Dialog pool for monitor metrics: seed dialogs + pipeline-produced dialogs.
 */
function mergedDialogs(seedDialogs) {
  const fromPipeline = store.allParsedDialogs().map((d) => ({
    id: d.id,
    brand_plan_id: d.brand_plan_id || 'pipeline_adhoc',
    platform: d.platform,
    question: d.question || d.prompt,
    date: d.date,
    mentions: d.mentions || [],
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
};
