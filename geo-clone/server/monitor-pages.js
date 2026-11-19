const { computeOverview } = require('./metrics');
const { monitorBrands, monitorDialogs } = require('./mock-data');

const SITE_TYPES = [
  { name: '官网/独立站/行业垂直', key: 'official' },
  { name: '门户/自媒体/资讯', key: 'portal' },
  { name: '视频平台', key: 'video' },
  { name: '电商平台', key: 'ecommerce' },
  { name: '社区/论坛/问答', key: 'community' },
  { name: '地方媒体', key: 'local' },
  { name: '中央媒体', key: 'central' },
];

const CITE_SITES = [
  { site: '抖音', type: 'video' },
  { site: '小红书', type: 'community' },
  { site: '知乎', type: 'community' },
  { site: '微信', type: 'portal' },
  { site: '京东', type: 'ecommerce' },
  { site: '天猫', type: 'ecommerce' },
  { site: '品牌官网', type: 'official' },
  { site: '哔哩哔哩', type: 'video' },
  { site: '今日头条', type: 'portal' },
  { site: '百度百科', type: 'official' },
  { site: '什么值得买', type: 'ecommerce' },
  { site: '微博', type: 'portal' },
];

/**
 * Brand score (dictionary BS-01, observed weights).
 * avg_rank / sentiment normalization: provisional (documented unknown).
 */
function computeBrandScore(overview) {
  const refer = overview.refer_rate || 0;
  const x = overview.mention_count || 0;
  const mentionScore = (1 + (99 * x) / (x + 10)) / 100; // normalize 1–100-ish to ~0–1
  const avg = overview.avg_rank || 0;
  // provisional: better rank → higher contribution
  const rankTerm = avg > 0 ? Math.min(1, Math.max(0, (6 - avg) / 5)) : 0;
  const sentimentTerm = Math.min(1, Math.max(0, (overview.sentiment_score || 0) / 100));
  const score =
    refer * 0.75 + mentionScore * 0.1 + rankTerm * 0.1 + sentimentTerm * 0.05;
  return {
    brand_score: Number((score * 100).toFixed(1)),
    _meta: {
      formula: '0.75*refer_rate + 0.1*mentionScore + 0.1*rankTerm + 0.05*sentimentTerm',
      mentionScore: Number(mentionScore.toFixed(4)),
      rankTerm: Number(rankTerm.toFixed(4)),
      sentimentTerm: Number(sentimentTerm.toFixed(4)),
      provisional: ['rankTerm', 'sentimentTerm', 'mentionScore scaling'],
    },
  };
}

function resolveBrand(brandPlanId) {
  return monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
}

function buildCitationSeed(brand) {
  // Deterministic pseudo citations tied to brand plan
  const articles = [];
  let id = 1;
  for (let i = 0; i < 36; i += 1) {
    const site = CITE_SITES[i % CITE_SITES.length];
    const type = SITE_TYPES.find((t) => t.key === site.type) || SITE_TYPES[0];
    articles.push({
      id: `art_${brand.id}_${id++}`,
      title: `${brand.name}相关引用文章 ${i + 1}`,
      site: site.site,
      site_type: type.name,
      site_type_key: type.key,
      log_count: 3 + ((i * 7) % 40),
      platform: ['豆包', 'DeepSeek', '元宝', '千问', 'Kimi'][i % 5],
      date: `2026-11-${String(10 + (i % 8)).padStart(2, '0')}`,
      sentiment: i % 5 === 0 ? 'negative' : i % 3 === 0 ? 'neutral' : 'positive',
    });
  }
  return articles;
}

function resourceStatistics(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const articles = buildCitationSeed(brand);
  const sites = new Set(articles.map((a) => a.site));
  const total_log_count = articles.reduce((s, a) => s + a.log_count, 0);
  return {
    total_log_count,
    resource_count: articles.length,
    site_count: sites.size,
  };
}

function resourceSiteCategory(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const articles = buildCitationSeed(brand);
  const totalLogs = articles.reduce((s, a) => s + a.log_count, 0) || 1;
  const byType = new Map();
  for (const a of articles) {
    if (!byType.has(a.site_type_key)) {
      byType.set(a.site_type_key, {
        name: a.site_type,
        key: a.site_type_key,
        site_count: new Set(),
        resource_count: 0,
        log_count: 0,
      });
    }
    const row = byType.get(a.site_type_key);
    row.site_count.add(a.site);
    row.resource_count += 1;
    row.log_count += a.log_count;
  }
  const list = [...byType.values()].map((r) => ({
    name: r.name,
    key: r.key,
    site_count: r.site_count.size,
    resource_count: r.resource_count,
    log_count: r.log_count,
    rate: Number((r.log_count / totalLogs).toFixed(4)),
  }));
  list.sort((a, b) => b.rate - a.rate);
  return { list };
}

function resourceSiteRanking(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const articles = buildCitationSeed(brand);
  const bySite = new Map();
  for (const a of articles) {
    if (!bySite.has(a.site)) {
      bySite.set(a.site, {
        site: a.site,
        site_type: a.site_type,
        resource_count: 0,
        log_count: 0,
      });
    }
    const row = bySite.get(a.site);
    row.resource_count += 1;
    row.log_count += a.log_count;
  }
  const total = [...bySite.values()].reduce((s, r) => s + r.log_count, 0) || 1;
  const list = [...bySite.values()]
    .map((r) => ({
      ...r,
      rate: Number((r.log_count / total).toFixed(4)),
    }))
    .sort((a, b) => b.log_count - a.log_count);
  return { list };
}

function resourceArticleList(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  return { list: buildCitationSeed(brand) };
}

function sentimentOverview(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const overview = computeOverview({
    dialogs: monitorDialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  const articles = buildCitationSeed(brand);
  const sentiment_count = overview.valid_rank_count;
  // polarity from mock article sentiments + dialog ranks
  const positive_count = Math.round(sentiment_count * 0.55);
  const negative_count = Math.round(sentiment_count * 0.15);
  const neutral_count = Math.max(0, sentiment_count - positive_count - negative_count);
  const positive_mention_count = Math.round(overview.mention_count * 0.6);
  const negative_mention_count = Math.round(overview.mention_count * 0.12);
  const res_positive_count = articles.filter((a) => a.sentiment === 'positive').length;
  const res_negative_count = articles.filter((a) => a.sentiment === 'negative').length;
  const negative_mention_rate = overview.valid_rank_count
    ? Number((negative_count / overview.valid_rank_count).toFixed(4))
    : 0;

  return {
    monitor_days: 30,
    sentiment_count,
    sentiment_score: overview.sentiment_score,
    positive_count,
    neutral_count,
    negative_count,
    positive_mention_count,
    negative_mention_count,
    has_brand_count: overview.valid_rank_count,
    res_positive_count,
    res_negative_count,
    negative_mention_rate,
    _meta: {
      negative_mention_rate: 'PROVISIONAL: negative_count / valid_rank_count',
      sentiment_score: 'MOCK — algorithm unknown',
    },
  };
}

function sentimentTrend(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
  const dates = [...new Set(pool.map((d) => d.date))].sort();
  return {
    series: dates.map((date) => {
      const day = pool.filter((d) => d.date === date);
      const o = computeOverview({
        dialogs: day,
        brandId: brand.id,
        brandName: brand.name,
        competitorBrandIds: brand.competitors || [],
      });
      return {
        date,
        sentiment_score: o.sentiment_score,
        positive_count: Math.round(o.valid_rank_count * 0.55),
        negative_count: Math.round(o.valid_rank_count * 0.15),
        neutral_count: Math.max(0, o.valid_rank_count - Math.round(o.valid_rank_count * 0.7)),
      };
    }),
  };
}

function sentimentPlatforms(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
  const platforms = [...new Set(pool.map((d) => d.platform))];
  const list = platforms.map((platform) => {
    const subset = pool.filter((d) => d.platform === platform);
    const o = computeOverview({
      dialogs: subset,
      brandId: brand.id,
      brandName: brand.name,
      competitorBrandIds: brand.competitors || [],
    });
    return {
      platform,
      sentiment_count: o.valid_rank_count,
      sentiment_score: o.sentiment_score,
      positive_count: Math.round(o.valid_rank_count * 0.55),
      neutral_count: Math.round(o.valid_rank_count * 0.3),
      negative_count: Math.round(o.valid_rank_count * 0.15),
    };
  });
  return { list };
}

function dashboardOverview(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const overview = computeOverview({
    dialogs: monitorDialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  const score = computeBrandScore(overview);
  const resources = resourceStatistics(brandPlanId);
  return {
    brand_id: brand.id,
    brand_name: brand.name,
    plan_label: brand.planLabel,
    brand_score: score.brand_score,
    refer_rate: overview.refer_rate,
    sov: overview.sov,
    avg_rank: overview.avg_rank,
    mention_count: overview.mention_count,
    ai_count: overview.ai_count,
    valid_rank_count: overview.valid_rank_count,
    sentiment_score: overview.sentiment_score,
    resource_count: resources.resource_count,
    total_log_count: resources.total_log_count,
    site_count: resources.site_count,
    _meta: score._meta,
  };
}

function dashboardPlatforms(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pool = monitorDialogs.filter((d) => d.brand_plan_id === brand.id);
  const platforms = [...new Set(pool.map((d) => d.platform))];
  const list = platforms.map((platform) => {
    const subset = pool.filter((d) => d.platform === platform);
    const o = computeOverview({
      dialogs: subset,
      brandId: brand.id,
      brandName: brand.name,
      competitorBrandIds: brand.competitors || [],
    });
    const score = computeBrandScore(o);
    return {
      platform,
      brand_score: score.brand_score,
      refer_rate: o.refer_rate,
      sov: o.sov,
      avg_rank: o.avg_rank,
      mention_count: o.mention_count,
      ai_count: o.ai_count,
      valid_rank_count: o.valid_rank_count,
    };
  });
  return { list };
}

module.exports = {
  computeBrandScore,
  resourceStatistics,
  resourceSiteCategory,
  resourceSiteRanking,
  resourceArticleList,
  sentimentOverview,
  sentimentTrend,
  sentimentPlatforms,
  dashboardOverview,
  dashboardPlatforms,
};
