const assert = require('assert');
const {
  parseMentions,
  parseCitations,
  parseRawItem,
  focusMentionMode,
  PARSE_UNKNOWNS,
} = require('./parse');
const {
  combinedDialogs,
  brandMentionsOverview,
  mergeResourceStatistics,
  mergeSentimentOverview,
  dashboardFromPipeline,
  mergeDialogRecords,
  mergeSiteRanking,
} = require('./monitor-bridge');
const { createTask, runPipeline, store } = require('./runner');
const { monitorBrands } = require('../mock-data');

async function main() {
  // --- ranked vs inline ---
  const text = [
    '1. 优萃',
    '2. 飞鹤',
    '3. 伊利',
    '',
    '君乐宝（优萃系列也常被提及） 口碑不错，推荐指数较高。',
    '参考来源：',
    '- 【知乎】经验 (https://example.com/zhihu?i=0)',
    '- [值友口碑](https://example.com/smzdm?i=1)',
    '- 另见 https://example.com/bare-extra',
  ].join('\n');

  const mentions = parseMentions(text);
  const jun = mentions.find((m) => m.brand === '君乐宝');
  assert.ok(jun, '优萃 alias should normalize to 君乐宝');
  assert.strictEqual(jun.mention_kind, 'ranked');
  assert.strictEqual(jun.rank, 1);
  assert.ok(jun.inline_count >= 1, 'body should add inline_count');
  assert.ok(mentions.every((m) => m.mention_kind === 'ranked' || m.mention_kind === 'inline_only'));

  const cites = parseCitations(text);
  assert.ok(cites.length >= 3, 'bracket + markdown + bare');
  assert.ok(cites.some((c) => c.source === 'bare_url'));
  assert.ok(cites.some((c) => c.site === '什么值得买' || c.domain));
  assert.ok(cites.every((c) => c.site_type_key && c.log_count === 1));

  const parsed = parseRawItem(
    { raw_text: text, platform: '豆包', platform_id: 'doubao', mode: 'web_fast' },
    { prompt: '国产奶粉推荐', brand: '君乐宝', brand_plan_id: 'plan_junlebao', task_id: 't_parse_a' }
  );
  assert.strictEqual(parsed.mention_mode, 'ranked');
  assert.strictEqual(focusMentionMode(parsed.mentions_full, '君乐宝'), 'ranked');
  assert.ok(parsed._parse_meta.unknowns.sentiment_score);
  assert.ok(PARSE_UNKNOWNS.sentiment_score);

  // inline-only focus
  const inlineOnly = parseRawItem(
    {
      raw_text: '综合来看飞鹤不错。\n- 【京东】对比 (https://example.com/jd?i=0)',
      platform: 'Kimi',
      platform_id: 'kimi',
      mode: 'web_fast',
    },
    { prompt: '纸尿裤', brand: '好奇', brand_plan_id: 'plan_huggies', task_id: 't_inline' }
  );
  // 好奇 not in text
  assert.strictEqual(inlineOnly.mention_mode, 'none');

  // --- seed a real pipeline task then bridge ---
  const brand = monitorBrands[0];
  const task = createTask({
    prompt: `parse_monitor_a_${Date.now()}`,
    brand: brand.name,
    platforms: [
      { platformId: 'doubao', modeId: 'web_fast' },
      { platformId: 'deepseek', modeId: 'web_fast' },
      { platformId: 'yuanbao', modeId: 'web_fast' },
    ],
    points_cost: 6,
    idempotent: false,
  });
  const done = await runPipeline(task, { stepDelayMs: 0 });
  assert.strictEqual(done.status, 'done');
  assert.ok(store.getParsed(task.task_id).length >= 2);

  const { dialogs, _pipeline } = combinedDialogs(brand);
  assert.ok(_pipeline.dialogs >= 2, 'pipeline dialogs should be visible to bridge');
  assert.ok(dialogs.some((d) => d.source === 'pipeline'));

  const overview = brandMentionsOverview(brand.id);
  assert.ok(overview.ai_count >= _pipeline.dialogs);
  assert.ok(overview._pipeline.mode === 'pipeline_primary');
  assert.ok(overview.refer_rate >= 0 && overview.refer_rate <= 1);

  const seedStats = { total_log_count: 10, resource_count: 5, site_count: 3 };
  const seedArticles = [
    { site: '知乎', site_type: '社区/论坛/问答', site_type_key: 'community', log_count: 2 },
  ];
  const resources = mergeResourceStatistics(seedStats, brand.id, seedArticles);
  assert.ok(resources._pipeline.citation_count > 0);
  assert.ok(resources.resource_count > seedStats.resource_count);

  const ranking = mergeSiteRanking({ list: [] }, brand.id, seedArticles);
  assert.ok(ranking.list.length > 0);

  const sent = mergeSentimentOverview(
    {
      monitor_days: 30,
      sentiment_count: 0,
      sentiment_score: 0,
      positive_count: 0,
      neutral_count: 0,
      negative_count: 0,
    },
    brand.id
  );
  assert.ok(sent._pipeline.dialogs > 0);
  assert.ok(sent.sentiment_count > 0);

  const dash = dashboardFromPipeline(brand.id, {
    resource_count: 36,
    total_log_count: 100,
    site_count: 12,
  });
  assert.ok(dash.brand_score != null);
  assert.ok(dash._pipeline.dialogs > 0);

  const tasks = mergeDialogRecords({ list: [{ id: 'seed1', prompt: 'seed' }] }, brand.id);
  assert.ok(tasks._pipeline.dialogs > 0);
  assert.ok(tasks.list[0].source === 'pipeline');

  console.log('parse-bridge.test.js OK', {
    mention_kind: jun.mention_kind,
    cites: cites.length,
    pipeline_dialogs: _pipeline.dialogs,
    refer_rate: overview.refer_rate,
    brand_score: dash.brand_score,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
