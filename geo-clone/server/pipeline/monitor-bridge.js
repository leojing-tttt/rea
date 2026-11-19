/**
 * Blend pipeline-parsed artifacts into monitor page shapes.
 */
const { store } = require('./store');
const { computeOverview } = require('../metrics');
const { monitorBrands } = require('../mock-data');

function resolveBrand(brandPlanId) {
  return monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
}

function pipelineDialogsForBrand(brand) {
  return store
    .allParsedDialogs()
    .filter((d) => d.brand_plan_id === brand.id || (!d.brand_plan_id && d.mentions_full))
    .filter((d) => {
      if (d.brand_plan_id === brand.id) return true;
      // adhoc tasks matching brand name via mentions
      return (d.mentions || []).some((m) => m.brand === brand.name);
    })
    .map((d) => ({
      id: d.id,
      brand_plan_id: brand.id,
      platform: d.platform,
      question: d.question || d.prompt,
      date: d.date,
      mentions: d.mentions || [],
      sentiment: d.sentiment,
      citations: d.citations || [],
      source: 'pipeline',
    }));
}

function pipelineCitationsForBrand(brand) {
  return store
    .allCitations()
    .filter((c) => {
      if (c.brand_plan_id === brand.id) return true;
      // include cites from dialogs that mention this brand
      return true;
    })
    .filter((c) => {
      // Prefer brand_plan match; else keep cites from dialogs mentioning brand
      if (c.brand_plan_id === brand.id) return true;
      const dialogs = store.allParsedDialogs().filter((d) => d.task_id === c.task_id);
      return dialogs.some(
        (d) =>
          (d.mentions || []).some((m) => m.brand === brand.name) ||
          d.brand_plan_id === brand.id
      );
    });
}

/**
 * Merge seed articles with pipeline citations → resource statistics shape.
 */
function mergeResourceStatistics(seedStats, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const cites = pipelineCitationsForBrand(brand);
  if (!cites.length) {
    return { ...seedStats, _pipeline: { citation_count: 0 } };
  }
  const pipeSites = new Set(cites.map((c) => c.site));
  return {
    total_log_count: (seedStats.total_log_count || 0) + cites.reduce((s, c) => s + (c.log_count || 1), 0),
    resource_count: (seedStats.resource_count || 0) + cites.length,
    site_count: (seedStats.site_count || 0) + pipeSites.size,
    _pipeline: {
      citation_count: cites.length,
      sites: [...pipeSites],
    },
  };
}

function buildPipelineArticles(brand) {
  return pipelineCitationsForBrand(brand).map((c, i) => ({
    id: `pipe_art_${c.task_id}_${i}`,
    title: c.title,
    site: c.site,
    site_type: c.site_type || '其他',
    site_type_key: c.site_type_key || 'other',
    log_count: c.log_count || 1,
    platform: c.platform || '—',
    date: c.date || '2026-11-19',
    sentiment: c.sentiment || 'neutral',
    url: c.url,
    host: c.host,
    source: 'pipeline',
  }));
}

function mergeArticleList(seedList, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pipe = buildPipelineArticles(brand);
  return { list: [...pipe, ...seedList] };
}

function mergeSiteCategory(seed, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const articles = buildPipelineArticles(brand);
  if (!articles.length) return seed;
  const byType = new Map();
  for (const row of seed.list || []) {
    byType.set(row.key, {
      ...row,
      _sites: new Set(),
    });
  }
  for (const a of articles) {
    const key = a.site_type_key || 'other';
    if (!byType.has(key)) {
      byType.set(key, {
        name: a.site_type,
        key,
        site_count: 0,
        resource_count: 0,
        log_count: 0,
        rate: 0,
        _sites: new Set(),
      });
    }
    const row = byType.get(key);
    row.resource_count += 1;
    row.log_count += a.log_count || 1;
    row._sites.add(a.site);
  }
  const total = [...byType.values()].reduce((s, r) => s + r.log_count, 0) || 1;
  const list = [...byType.values()].map((r) => ({
    name: r.name,
    key: r.key,
    site_count: Math.max(r.site_count || 0, (r._sites && r._sites.size) || 0),
    resource_count: r.resource_count,
    log_count: r.log_count,
    rate: Number((r.log_count / total).toFixed(4)),
  }));
  list.sort((a, b) => b.rate - a.rate);
  return { list, _pipeline: { articles: articles.length } };
}

function mergeSentimentOverview(seedOverview, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const dialogs = pipelineDialogsForBrand(brand);
  if (!dialogs.length) return { ...seedOverview, _pipeline: { dialogs: 0 } };

  const buckets = { positive: 0, neutral: 0, negative: 0 };
  let scoreSum = 0;
  for (const d of dialogs) {
    const label = (d.sentiment && d.sentiment.label) || 'neutral';
    buckets[label] = (buckets[label] || 0) + 1;
    scoreSum += (d.sentiment && d.sentiment.score) || 0;
  }
  return {
    ...seedOverview,
    sentiment_count: (seedOverview.sentiment_count || 0) + dialogs.length,
    positive_count: (seedOverview.positive_count || 0) + buckets.positive,
    neutral_count: (seedOverview.neutral_count || 0) + buckets.neutral,
    negative_count: (seedOverview.negative_count || 0) + buckets.negative,
    sentiment_score:
      dialogs.length > 0
        ? Number((((seedOverview.sentiment_score || 0) + scoreSum / dialogs.length) / 2).toFixed(1))
        : seedOverview.sentiment_score,
    _pipeline: { dialogs: dialogs.length, buckets },
  };
}

function mergeDialogRecords(seedPayload, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const dialogs = pipelineDialogsForBrand(brand);
  const pipeRows = dialogs.map((d, i) => {
    const self = (d.mentions || []).find((m) => m.brand === brand.name);
    return {
      id: d.id,
      prompt: d.question,
      created_at: `${d.date} 12:${String(i % 60).padStart(2, '0')}:00`,
      platform: d.platform,
      category: '流水线',
      hot_value: 50,
      mention_brands: (d.mentions || []).map((m) => m.brand).join('、'),
      brand_words_count: (d.mentions || []).reduce((s, m) => s + (m.count || 1), 0),
      min_rank: self ? self.rank : null,
      source_count: (d.citations || []).length,
      sentiment: (d.sentiment && d.sentiment.label) || 'neutral',
      sentiment_score: (d.sentiment && d.sentiment.score) || null,
      source: 'pipeline',
    };
  });
  const list = [...pipeRows, ...(seedPayload.list || [])];
  return { list, total: list.length, _pipeline: { dialogs: pipeRows.length } };
}

function pipelineOverviewForBrand(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const dialogs = pipelineDialogsForBrand(brand);
  if (!dialogs.length) return null;
  return computeOverview({
    dialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
}

module.exports = {
  pipelineDialogsForBrand,
  pipelineCitationsForBrand,
  mergeResourceStatistics,
  mergeArticleList,
  mergeSiteCategory,
  mergeSentimentOverview,
  mergeDialogRecords,
  pipelineOverviewForBrand,
  buildPipelineArticles,
};
