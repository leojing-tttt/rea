const { monitorBrands, monitorDialogs } = require('./mock-data');

const QUESTION_TYPES = ['品牌认知', '产品对比', '购买决策', '使用体验', '其他'];

function resolveBrand(brandPlanId) {
  return monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
}

/** AI 对话记录 — columns from live tasks table + monitor_record fields */
function dialogRecords(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
  const list = pool.map((d, i) => {
    const self = (d.mentions || []).find((m) => m.brand === brand.name);
    const brands = (d.mentions || []).map((m) => m.brand).join('、');
    const mentionCount = (d.mentions || []).reduce((s, m) => s + (m.count || 1), 0);
    return {
      id: d.id,
      prompt: d.question,
      created_at: `${d.date} ${String(8 + (i % 10)).padStart(2, '0')}:${String((i * 7) % 60).padStart(2, '0')}:00`,
      platform: d.platform,
      category: QUESTION_TYPES[i % QUESTION_TYPES.length],
      hot_value: 40 + ((i * 13) % 60),
      mention_brands: brands,
      brand_words_count: mentionCount,
      min_rank: self ? self.rank : null,
      source_count: self ? 1 + (i % 4) : 0,
      sentiment: (d.sentiment && d.sentiment.label) || null,
      sentiment_score: null,
      positive_word_hits: (d.sentiment && d.sentiment.positive_word_hits) || 0,
      negative_word_hits: (d.sentiment && d.sentiment.negative_word_hits) || 0,
      answer_excerpt: '',
    };
  });
  return { list, total: list.length };
}

/**
 * 作品引用追踪 — stats:{track_count,quote_count,question_count,total_count}
 * + Top10 site / tag tables (observed column props).
 */
function contentOptimization(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const works = [];
  const sites = ['抖音', '小红书', '知乎', '微信', '京东', '天猫', '品牌官网', '什么值得买', '微博', '哔哩哔哩'];
  const tags = ['种草', '测评', '功效', '价格', '口碑', '母婴', '配方', '对比', '避雷', '复购'];
  for (let i = 0; i < 18; i += 1) {
    const cited = i % 3 !== 0;
    works.push({
      id: `work_${brand.id}_${i + 1}`,
      article_title: `${brand.name}追踪作品 ${i + 1}`,
      site: sites[i % sites.length],
      domain: `${sites[i % sites.length].replace(/\s/g, '')}.example.com`.toLowerCase(),
      category: ['视频平台', '社区/论坛/问答', '电商平台', '门户/自媒体/资讯', '官网/独立站/行业垂直'][i % 5],
      tags: [tags[i % tags.length], tags[(i + 3) % tags.length]],
      publish_time: `2026-11-${String(5 + (i % 12)).padStart(2, '0')}`,
      first_quote_time: cited ? `2026-11-${String(10 + (i % 8)).padStart(2, '0')}` : null,
      platforms_str: cited ? '豆包、DeepSeek、元宝' : '',
      question_count: cited ? 1 + (i % 5) : 0,
      article_quote_count: cited ? 2 + (i % 8) : 0,
      pinned: i < 3,
    });
  }
  const quoted = works.filter((w) => w.article_quote_count > 0);
  const stats = {
    track_count: works.length,
    quote_count: quoted.length,
    question_count: quoted.reduce((s, w) => s + w.question_count, 0),
    total_count: quoted.reduce((s, w) => s + w.article_quote_count, 0),
  };

  const bySite = new Map();
  for (const w of works) {
    if (!bySite.has(w.site)) {
      bySite.set(w.site, {
        site_name: w.site,
        domain: w.domain,
        site_type: w.category,
        track_count: 0,
        quote_count: 0,
      });
    }
    const row = bySite.get(w.site);
    row.track_count += 1;
    if (w.article_quote_count) row.quote_count += 1;
  }
  const hotSites = [...bySite.values()]
    .map((r) => ({
      ...r,
      rate: r.track_count ? Number((r.quote_count / r.track_count).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.rate - a.rate || b.quote_count - a.quote_count)
    .slice(0, 10);

  const byTag = new Map();
  for (const w of works) {
    for (const tag of w.tags) {
      if (!byTag.has(tag)) byTag.set(tag, { tag_name: tag, track_count: 0, quote_count: 0 });
      const row = byTag.get(tag);
      row.track_count += 1;
      if (w.article_quote_count) row.quote_count += 1;
    }
  }
  const hotTags = [...byTag.values()]
    .map((r) => ({
      ...r,
      rate: r.track_count ? Number((r.quote_count / r.track_count).toFixed(4)) : 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  return { stats, works, hotSites, hotTags };
}

/** 品牌监测设置 — plan list + summary */
function brandManagementList() {
  const list = monitorBrands.map((b, i) => {
    const dialogs = monitorDialogs.filter((d) => d.brand_plan_id === b.id);
    const questions = [...new Set(dialogs.map((d) => d.question))];
    const platforms = [...new Set(dialogs.map((d) => d.platform))];
    return {
      id: b.id,
      name: b.name,
      plan_label: b.planLabel,
      core_word: b.name,
      competitors: b.competitors || [],
      words: [b.name, ...(b.competitors || [])],
      questions,
      platforms,
      monitor_status: i === 0 ? 'running' : 'paused',
      monitor_type: i === 0 ? '监测中' : '已暂停',
      created_at: '2026-10-12 14:20:00',
      creator: '企业管理员',
      points_per_task: 2 * platforms.length,
      question_count: questions.length,
      platform_count: platforms.length,
      frequency: '每日',
    };
  });
  const monitoringSummary = {
    brandCount: list.length,
    questionCount: list.reduce((s, p) => s + p.question_count, 0),
    totalPoints: list.reduce((s, p) => s + p.points_per_task * p.question_count, 0),
    runningCount: list.filter((p) => p.monitor_status === 'running').length,
  };
  return { list, monitoringSummary };
}

function brandPlanDetail(brandPlanId) {
  const { list } = brandManagementList();
  const plan = list.find((p) => p.id === brandPlanId) || list[0];
  return {
    ...plan,
    change_log: [
      {
        time: '2026-11-10 09:12:00',
        modifierName: '企业管理员',
        modifierPhone: '138****8000',
        modifierRole: '管理员',
        action: '更新监测问题',
      },
      {
        time: '2026-10-12 14:20:00',
        modifierName: '企业管理员',
        modifierPhone: '138****8000',
        modifierRole: '管理员',
        action: '创建监测计划',
      },
    ],
  };
}

/** 导出数据与报告 — report history columns observed */
function reportHistory(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const list = [
    {
      id: 'rpt_1',
      report_name: `${brand.name}-品牌监测周报`,
      brand_library_name: brand.name,
      platforms: '全部平台',
      platform: '监测报告',
      created_at: '2026-11-17 18:30:00',
      points: 12,
      status: 'ready',
      share_url: null,
    },
    {
      id: 'rpt_2',
      report_name: `${brand.name}-提及率导出`,
      brand_library_name: brand.name,
      platforms: '豆包,DeepSeek,元宝',
      platform: '数据导出',
      created_at: '2026-11-15 11:05:00',
      points: 4,
      status: 'ready',
      share_url: null,
    },
    {
      id: 'rpt_3',
      report_name: `${brand.name}-日报`,
      brand_library_name: brand.name,
      platforms: '全部平台',
      platform: '日报',
      created_at: '2026-11-14 08:00:00',
      points: 2,
      status: 'ready',
      share_url: `/dailyReport/mock/${brand.id}`,
    },
  ];
  return { list, total: list.length };
}

function reportGenerate(body = {}) {
  const brand = resolveBrand(body.brand_plan_id);
  const id = `rpt_${Date.now()}`;
  return {
    id,
    report_name: body.report_name || `${brand.name}-自定义报告`,
    brand_library_name: brand.name,
    platforms: body.platforms || '全部平台',
    platform: body.type || '监测报告',
    created_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    points: body.points || 8,
    status: 'ready',
    _meta: { mock: true, note: 'export/report_gen is mock — no real PDF' },
  };
}

/** AI 问题库 — library/list shape */
function questionLibrary(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
  const prompts = [...new Set(pool.map((d) => d.question))];
  const list = prompts.map((prompt, i) => ({
    id: `ql_${brand.id}_${i + 1}`,
    prompt,
    type: QUESTION_TYPES[i % QUESTION_TYPES.length],
    hot_value: 55 + i * 7,
    favorite: i % 2 === 0,
    in_monitor: true,
    platform_count: 7,
    created_at: `2026-10-${String(20 + i).padStart(2, '0')} 10:00:00`,
  }));
  // extras not yet in monitor
  list.push({
    id: `ql_${brand.id}_extra`,
    prompt: `${brand.name}和竞品怎么选`,
    type: '产品对比',
    hot_value: 48,
    favorite: false,
    in_monitor: false,
    platform_count: 0,
    created_at: '2026-11-01 16:22:00',
  });
  return { list, total: list.length };
}

module.exports = {
  dialogRecords,
  contentOptimization,
  brandManagementList,
  brandPlanDetail,
  reportHistory,
  reportGenerate,
  questionLibrary,
};
