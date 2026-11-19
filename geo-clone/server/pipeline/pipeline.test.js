const assert = require('assert');
const {
  createTask,
  runPipeline,
  fetchMockRawResponses,
  parseRawList,
  parseMentions,
  parseCitations,
  parseSentiment,
  aggregateParsed,
  store,
  getPipelineSnapshot,
} = require('./index');
const { platforms } = require('../mock-data');

async function main() {
  // --- parse unit ---
  const sample = [
    '综合公开信息，可参考以下品牌排序：',
    '1. 君乐宝',
    '2. 飞鹤',
    '3. 伊利',
    '',
    '君乐宝 口碑不错，推荐指数较高。',
    '参考来源：',
    '- 【知乎】品类选购经验分享 (https://example.com/zhihu?i=0)',
    '- 【小红书】真实使用体验合集 (https://example.com/xhs?i=1)',
  ].join('\n');

  const mentions = parseMentions(sample);
  assert.strictEqual(mentions[0].brand, '君乐宝');
  assert.strictEqual(mentions[0].rank, 1);
  assert.ok(mentions.some((m) => m.brand === '飞鹤'));

  const cites = parseCitations(sample);
  assert.ok(cites.length >= 2);
  assert.strictEqual(cites[0].site, '知乎');

  const sent = parseSentiment(sample);
  assert.strictEqual(sent.label, 'positive');
  assert.ok(sent.score > 50);

  // --- mock adapter → parse → aggregate ---
  const selected = [
    { platformId: 'doubao', modeId: 'web_fast' },
    { platformId: 'deepseek', modeId: 'web_fast' },
    { platformId: 'yuanbao', modeId: 'web_fast' },
  ];
  const raw = fetchMockRawResponses({
    prompt: '国产奶粉推荐',
    brand: '君乐宝',
    platforms: selected,
    platformCatalog: platforms,
  });
  assert.strictEqual(raw.length, 3);
  assert.ok(raw[0].raw_text.includes('国产奶粉推荐'));
  assert.strictEqual(raw[0].adapter, 'mock');

  const parsed = parseRawList(raw, {
    prompt: '国产奶粉推荐',
    brand: '君乐宝',
    brand_plan_id: 'plan_junlebao',
    task_id: 'test_task',
    date: '2026-11-19',
  });
  assert.strictEqual(parsed.length, 3);
  assert.ok(parsed.every((p) => Array.isArray(p.mentions)));
  assert.ok(parsed.every((p) => Array.isArray(p.citations)));

  const agg = aggregateParsed(parsed, {
    brand: '君乐宝',
    brand_plan_id: 'plan_junlebao',
    competitors: ['飞鹤', '伊利'],
  });
  assert.ok(agg.overview.ai_count === 3);
  assert.ok(agg.overview.refer_rate >= 0 && agg.overview.refer_rate <= 1);
  assert.ok(agg.results.length === 3);
  assert.ok(agg.resources.site_count >= 0);

  // --- full runner with persistence ---
  const task = createTask({
    prompt: '哪个奶粉品牌适合一段宝宝',
    brand: '君乐宝',
    platforms: selected,
    points_cost: 6,
  });
  assert.strictEqual(task.pipeline.stage, 'created');
  assert.ok(store.getTask(task.task_id));

  const done = await runPipeline(task, { stepDelayMs: 0 });
  assert.strictEqual(done.status, 'done');
  assert.strictEqual(done.pipeline.stage, 'done');
  assert.ok(done.overview);
  assert.ok(done.results.length === 3);
  assert.ok(store.getRaw(task.task_id).length === 3);
  assert.ok(store.getParsed(task.task_id).length === 3);
  assert.ok(store.getAggregate(task.task_id));

  const snap = getPipelineSnapshot(task.task_id);
  assert.ok(snap.raw[0].raw_text);
  assert.ok(snap.parsed[0].mentions);
  assert.ok(snap.aggregate.overview);

  // disk artifacts
  const fs = require('fs');
  const path = require('path');
  const { DATA_ROOT } = require('./store');
  const rawFile = path.join(DATA_ROOT, task.task_id, 'raw', 'doubao.json');
  assert.ok(fs.existsSync(rawFile), 'raw file should be persisted');

  console.log('pipeline.test.js OK', {
    refer_rate: done.overview.refer_rate,
    mention_count: done.overview.mention_count,
    ai_count: done.overview.ai_count,
    stages: done.pipeline.stages.map((s) => s.name),
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
