const platforms = [
  {
    id: 'doubao',
    name: '豆包',
    color: '#4e6ef2',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' },
      { id: 'web_expert', label: '网页', tag: '专家', tagType: 'deep' },
      { id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast' },
      { id: 'mobile_expert', label: '手机', tag: '专家', tagType: 'deep', ecommerce: true },
    ],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    color: '#1e3a5f',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' },
      { id: 'web_deep', label: '网页', tag: '深度', tagType: 'deep' },
      { id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast' },
      { id: 'mobile_deep', label: '手机', tag: '深度', tagType: 'deep' },
    ],
  },
  {
    id: 'yuanbao',
    name: '元宝',
    color: '#2da87e',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast', ecommerce: true },
      { id: 'web_deep', label: '网页', tag: '深度', tagType: 'deep' },
      { id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast', ecommerce: true },
      { id: 'mobile_deep', label: '手机', tag: '深度', tagType: 'deep' },
    ],
  },
  {
    id: 'qwen',
    name: '千问',
    color: '#7c5cfc',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' },
      { id: 'web_deep', label: '网页', tag: '深度', tagType: 'deep' },
      { id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast', ecommerce: true },
      { id: 'mobile_deep', label: '手机', tag: '深度', tagType: 'deep' },
    ],
  },
  {
    id: 'baidu',
    name: '百度AI',
    color: '#2932e1',
    modes: [{ id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' }],
  },
  {
    id: 'wenxin',
    name: '文心',
    color: '#2563eb',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast', ecommerce: true },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    color: '#1f1b22',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' },
      { id: 'web_think', label: '网页', tag: '思考', tagType: 'deep' },
      { id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast' },
      { id: 'mobile_think', label: '手机', tag: '思考', tagType: 'deep' },
    ],
  },
  {
    id: 'douyin',
    name: 'AI抖音',
    color: '#111111',
    modes: [
      { id: 'web_fast', label: '网页', tag: '快速', tagType: 'fast' },
      { id: 'web_deep', label: '网页', tag: '深度', tagType: 'deep' },
    ],
  },
  {
    id: 'xhs',
    name: '小红书点点',
    color: '#ff2442',
    modes: [{ id: 'mobile_fast', label: '手机', tag: '快速', tagType: 'fast' }],
  },
];

const seedHistory = [
  {
    task_id: 'example_moutai',
    prompt: '白酒品牌推荐',
    word: '茅台',
    created_at: '2026-09-16 09:53:00',
    isExample: true,
    status: 'done',
    platform_count: 4,
  },
];

const SITE_TYPES = [
  { name: '官网/独立站/行业垂直', rate: 47.74, sites: 1280, articles: 9420, cites: 18320 },
  { name: '门户/自媒体/资讯', rate: 26.04, sites: 860, articles: 5210, cites: 9980 },
  { name: '视频平台', rate: 9.59, sites: 42, articles: 2100, cites: 3680 },
  { name: '电商平台', rate: 6.72, sites: 28, articles: 1560, cites: 2580 },
  { name: '社区/论坛/问答', rate: 5.2, sites: 210, articles: 980, cites: 1990 },
  { name: '地方媒体', rate: 1.93, sites: 320, articles: 410, cites: 740 },
  { name: '中央媒体', rate: 1.32, sites: 18, articles: 260, cites: 510 },
  { name: '政府/事业', rate: 1.2, sites: 95, articles: 180, cites: 460 },
  { name: '教育科研', rate: 0.25, sites: 60, articles: 40, cites: 96 },
];

const TOP_SITES = [
  '抖音', '微信', '小红书', '知乎', '哔哩哔哩', '百度百科', '京东', '天猫',
  '今日头条', '微博', '搜狐', '网易', '36氪', '虎扑', '得物', '拼多多',
  '淘宝', '汽车之家', '什么值得买', '豆瓣', 'CSDN', '简书', '快手', '懂车帝',
  '太平洋电脑网', '中关村在线', '爱奇艺', '优酷', '喜马拉雅', 'QQ音乐',
  '官方网站合集', '行业垂直站A', '行业垂直站B', '地方门户A', '地方门户B',
  '自媒体矩阵A', '自媒体矩阵B', '电商详情页聚合', '百科镜像', '问答聚合',
];

function ecommerceRanking({ industry, platform }) {
  const brands = [
    { brand: '优衣库', cards: 239, mentionRate: 8, avgRank: 2.2, top1: 4, dist: { 豆包: 12.6, 元宝: 64.4, 千问: 23 }, product: '优衣库 轻量蓬松羽绒茄克 · 京东商城' },
    { brand: '骆驼', cards: 186, mentionRate: 7, avgRank: 2.8, top1: 3, dist: { 豆包: 22, 元宝: 48, 千问: 30 }, product: '骆驼 冲锋衣三合一 · 抖音商城' },
    { brand: '伯希和', cards: 142, mentionRate: 6, avgRank: 3.1, top1: 2, dist: { 豆包: 18, 元宝: 52, 千问: 30 }, product: '伯希和 户外软壳夹克 · 天猫' },
    { brand: '迪卡侬', cards: 121, mentionRate: 5, avgRank: 3.4, top1: 2, dist: { 豆包: 30, 元宝: 40, 千问: 30 }, product: '迪卡侬 速干训练短袖 · 京东商城' },
    { brand: '安踏', cards: 98, mentionRate: 4, avgRank: 3.9, top1: 1, dist: { 豆包: 25, 元宝: 45, 千问: 30 }, product: '安踏 氢跑系列跑鞋 · 抖音商城' },
  ].map((b, i) => ({ rank: i + 1, ...b }));

  return {
    title: `GEO电商品牌榜 · ${industry} · 周榜`,
    description: '看哪些品牌商品被AI推荐，并通过商品卡直接连接购买',
    industry,
    platform,
    week: '2026/11/09~2026/11/15',
    industries: ['服装', '家电', '美妆', '个护洗护', '手机', '食品饮料', '宠物', '母婴'],
    subCategories: ['综合榜', '女装', '男装', '运动服饰', '户外服饰', '鞋靴', '贴身内衣&家居服', '童装', '通勤穿搭', '平价服装'],
    tags: ['高端服装', '羽绒服', '冲锋衣'],
    platforms: ['全部平台', '豆包', '元宝', '千问'],
    list: brands,
  };
}

function referenceSources() {
  return {
    title: 'GEO引用来源分布',
    description: '分析大模型引用来源站点与类型，给出排名，反应大模型喜欢引用的站点来源',
    siteTypes: SITE_TYPES,
    topSites: TOP_SITES.map((name, i) => ({
      rank: i + 1,
      name,
      rate: Math.max(1, Math.round((12 - i * 0.28) * 10) / 10),
    })),
  };
}

function createMockTaskResult(task) {
  const citations = [
    { title: '品牌官网介绍页', site: '官网', url: 'https://example.com/brand' },
    { title: '知乎高赞回答：如何选择该品类', site: '知乎', url: 'https://example.com/zhihu' },
    { title: '小红书种草笔记合集', site: '小红书', url: 'https://example.com/xhs' },
    { title: '电商详情页参数对比', site: '京东', url: 'https://example.com/jd' },
  ];
  const results = task.platforms.map((p, idx) => {
    const mentioned = Boolean(task.word) && idx % 2 === 0;
    return {
      platform: p.platformId || p.id || p,
      mode: p.modeId || p.mode || 'web_fast',
      status: 'done',
      answer: mentioned
        ? `根据公开信息，围绕「${task.prompt}」，${task.word} 常被提及为头部选择之一。以下为 mock 生成的引用摘要（非真实模型输出）。`
        : `针对「${task.prompt}」，以下为 mock 平台回答示例，用于演示任务闭环与引用展示。`,
      mentioned,
      mention_rank: mentioned ? (idx % 3) + 1 : null,
      citations: citations.slice(0, 2 + (idx % 3)),
    };
  });
  return { ...task, status: 'done', results };
}

const monitorBrands = [
  {
    id: 'plan_junlebao',
    name: '君乐宝',
    planLabel: '君乐宝-君乐宝优萃宝爱-大小吾图词',
    competitors: ['飞鹤', '伊利', '雀巢'],
  },
  {
    id: 'plan_huggies',
    name: '好奇',
    planLabel: '好奇-小森林系列监测',
    competitors: ['帮宝适', '妙而舒'],
  },
];

/** Seed AI dialogs used to compute rf/overview via dictionary formulas */
function buildMonitorDialogs() {
  const platforms = ['豆包', 'DeepSeek', '元宝', '千问', '文心', 'Kimi', 'AI抖音'];
  const questions = [
    '哪个奶粉品牌适合一段宝宝',
    '国产奶粉推荐',
    '君乐宝优萃怎么样',
    '纸尿裤推荐',
    '敏感肌婴儿纸尿裤',
  ];
  const dialogs = [];
  let id = 1;
  // Junlebao plan — denser mentions
  for (let i = 0; i < 40; i += 1) {
    const platform = platforms[i % platforms.length];
    const mentionedSelf = i % 5 !== 0; // 80% mention rate-ish
    const mentions = [];
    if (mentionedSelf) {
      const rank = [1, 1, 2, 2, 3, 4][i % 6];
      mentions.push({ brand: '君乐宝', rank, count: 1 + (i % 3) });
      if (i % 2 === 0) mentions.push({ brand: '飞鹤', rank: rank === 1 ? 2 : 1, count: 1 });
      if (i % 3 === 0) mentions.push({ brand: '伊利', rank: 3, count: 1 });
    } else {
      mentions.push({ brand: '飞鹤', rank: 1, count: 1 });
      mentions.push({ brand: '雀巢', rank: 2, count: 1 });
    }
    dialogs.push({
      id: `dlg_${id++}`,
      brand_plan_id: 'plan_junlebao',
      platform,
      question: questions[i % 3],
      date: `2026-11-${String(10 + (i % 8)).padStart(2, '0')}`,
      mentions,
    });
  }
  // Huggies plan
  for (let i = 0; i < 24; i += 1) {
    const mentions = [];
    if (i % 4 !== 0) {
      mentions.push({ brand: '好奇', rank: (i % 3) + 1, count: 1 + (i % 2) });
      if (i % 2 === 0) mentions.push({ brand: '帮宝适', rank: 2, count: 1 });
    } else {
      mentions.push({ brand: '帮宝适', rank: 1, count: 1 });
    }
    dialogs.push({
      id: `dlg_${id++}`,
      brand_plan_id: 'plan_huggies',
      platform: platforms[i % platforms.length],
      question: questions[3 + (i % 2)],
      date: `2026-11-${String(12 + (i % 6)).padStart(2, '0')}`,
      mentions,
    });
  }
  return dialogs;
}

const monitorDialogs = buildMonitorDialogs();

function monitorProgress() {
  return {
    status: 'running',
    label: '正在执行',
    done: 492,
    total: 630,
    percent: 78,
    platform_count: 7,
    question_count: 12,
  };
}

function mentionHeatmap({ brandName, dialogs, brandPlanId }) {
  const pool = dialogs.filter((d) => d.brand_plan_id === brandPlanId);
  const questions = [...new Set(pool.map((d) => d.question))];
  const plats = [...new Set(pool.map((d) => d.platform))];
  const cells = [];
  for (const q of questions) {
    for (const p of plats) {
      const subset = pool.filter((d) => d.question === q && d.platform === p);
      const hit = subset.filter((d) => (d.mentions || []).some((m) => m.brand === brandName)).length;
      const rate = subset.length ? hit / subset.length : 0;
      cells.push({ question: q, platform: p, refer_rate: Number(rate.toFixed(4)), ai_count: subset.length });
    }
  }
  return { questions, platforms: plats, cells };
}

function referTrend({ brandName, dialogs, brandPlanId }) {
  const pool = dialogs.filter((d) => d.brand_plan_id === brandPlanId);
  const dates = [...new Set(pool.map((d) => d.date))].sort();
  return dates.map((date) => {
    const day = pool.filter((d) => d.date === date);
    const hit = day.filter((d) => (d.mentions || []).some((m) => m.brand === brandName)).length;
    return {
      date,
      refer_rate: day.length ? Number((hit / day.length).toFixed(4)) : 0,
      ai_count: day.length,
      valid_rank_count: hit,
    };
  });
}

module.exports = {
  platforms,
  seedHistory,
  ecommerceRanking,
  referenceSources,
  createMockTaskResult,
  monitorBrands,
  monitorDialogs,
  monitorProgress,
  mentionHeatmap,
  referTrend,
};
