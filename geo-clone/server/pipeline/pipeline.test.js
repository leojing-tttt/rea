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
  idempotencyKey,
} = require('./index');
const { platforms } = require('../mock-data');

async function main() {
  // --- deepened parse ---
  const sample = [
    '综合公开信息，可参考以下品牌排序：',
    '1. 君乐宝',
    '2. 飞鹤',
    '3. 伊利',
    '',
    '君乐宝（优萃系列也常被提及） 口碑不错，推荐指数较高。',
    '参考来源：',
    '- 【知乎】品类选购经验分享 (https://example.com/zhihu?i=0)',
    '- [真实使用体验合集](https://example.com/xhs?i=1)',
  ].join('\n');

  const mentions = parseMentions(sample);
  assert.strictEqual(mentions[0].brand, '君乐宝');
  assert.strictEqual(mentions[0].rank, 1);
  assert.ok(mentions[0].count >= 2, 'inline alias/body should bump count');
  assert.ok(mentions.some((m) => m.brand === '飞鹤'));

  const cites = parseCitations(sample);
  assert.ok(cites.length >= 2);
  assert.ok(cites.some((c) => c.source === 'bracket_cite'));
  assert.ok(cites.some((c) => c.source === 'markdown_link'));
  assert.ok(cites[0].site_type_key);
  assert.ok(cites[0].host || cites[0].url);

  const sent = parseSentiment(sample);
  assert.strictEqual(sent.label, 'positive');

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

  const parsed = parseRawList(raw, {
    prompt: '国产奶粉推荐',
    brand: '君乐宝',
    brand_plan_id: 'plan_junlebao',
    task_id: 'test_task_deepen',
    date: '2026-11-19',
  });
  assert.ok(parsed.every((p) => Array.isArray(p.citations)));
  assert.ok(parsed.some((p) => (p.citations || []).some((c) => c.site_type_key)));

  const agg = aggregateParsed(parsed, {
    brand: '君乐宝',
    brand_plan_id: 'plan_junlebao',
    competitors: ['飞鹤', '伊利'],
  });
  assert.ok(agg.resources.site_categories);
  assert.ok(agg.overview.ai_count === 3);

  // --- idempotency ---
  const key = idempotencyKey({
    prompt: '幂等测试问题',
    brand: '君乐宝',
    platforms: selected,
  });
  assert.strictEqual(
    key,
    idempotencyKey({ prompt: '幂等测试问题', brand: '君乐宝', platforms: selected })
  );

  const task = createTask({
    prompt: '幂等测试问题',
    brand: '君乐宝',
    platforms: selected,
    points_cost: 6,
    idempotent: true,
  });
  const done = await runPipeline(task, { stepDelayMs: 0 });
  assert.strictEqual(done.status, 'done');

  const replay = createTask({
    prompt: '幂等测试问题',
    brand: '君乐宝',
    platforms: selected,
    points_cost: 6,
    idempotent: true,
  });
  assert.ok(replay._idempotent_hit, 'second create should hit idempotency');
  assert.strictEqual(replay.task_id, done.task_id);

  // resume should no-op
  const again = await runPipeline(replay, { stepDelayMs: 0 });
  assert.strictEqual(again.status, 'done');
  assert.strictEqual(again.task_id, done.task_id);

  const snap = getPipelineSnapshot(done.task_id);
  assert.ok(snap.parsed[0].mentions_full || snap.parsed[0].mentions);

  console.log('pipeline.test.js OK', {
    refer_rate: done.overview.refer_rate,
    citation_fields: Object.keys(cites[0]),
    idempotent_hit: Boolean(replay._idempotent_hit),
    stages: done.pipeline.stages.map((s) => s.name),
    store_tasks: store.listTasks().length,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
