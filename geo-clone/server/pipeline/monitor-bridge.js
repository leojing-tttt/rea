/**
 * Prefer pipeline-parsed artifacts for monitor page shapes.
 * When pipeline has data for a brand: use it as primary (seed as fallback/supplement).
 * When empty: return seed with _pipeline.empty marker.
 */

const { store } = require('./store');
const { computeOverview } = require('../metrics');
const { computeBrandScore } = require('../monitor-pages');
const { monitorBrands, monitorDialogs, mentionHeatmap, referTrend } = require('../mock-data');

function resolveBrand(brandPlanId) {
  return monitorBrands.find((b) => b.id === brandPlanId) || monitorBrands[0];
}

/**
 * Pipeline dialogs for a brand plan (by brand_plan_id or mention of brand name).
 */
function pipelineDialogsForBrand(brand) {
  return store
    .allParsedDialogs()
    .filter((d) => {
      if (d.brand_plan_id === brand.id) return true;
      const names = new Set((d.mentions || []).map((m) => m.brand));
      if (d.mentions_full) {
        for (const m of d.mentions_full) names.add(m.brand);
      }
      return names.has(brand.name);
    })
    .map((d) => ({
      id: d.id,
      brand_plan_id: brand.id,
      platform: d.platform,
      question: d.question || d.prompt,
      date: d.date,
      mentions: d.mentions || [],
      mentions_full: d.mentions_full,
      sentiment: d.sentiment,
      citations: d.citations || [],
      mention_mode: d.mention_mode,
      source: 'pipeline',
      task_id: d.task_id,
    }));
}

function pipelineCitationsForBrand(brand) {
  const dialogIds = new Set(pipelineDialogsForBrand(brand).map((d) => d.task_id));
  return store.allCitations().filter((c) => {
    if (c.brand_plan_id === brand.id) return true;
    return dialogIds.has(c.task_id);
  });
}

/** Combined dialog pool: pipeline first, then seed (dedupe by id). */
function combinedDialogs(brand, { pipelineFirst = true } = {}) {
  const pipe = pipelineDialogsForBrand(brand);
  const seed = monitorDialogs
    .filter((d) => d.brand_plan_id === brand.id)
    .map((d) => ({ ...d, source: d.source || 'seed' }));
  if (!pipe.length) return { dialogs: seed, _pipeline: { dialogs: 0, mode: 'seed_only' } };
  if (pipelineFirst) {
    const ids = new Set(pipe.map((d) => d.id));
    const rest = seed.filter((d) => !ids.has(d.id));
    return {
      dialogs: [...pipe, ...rest],
      _pipeline: { dialogs: pipe.length, seed: rest.length, mode: 'pipeline_primary' },
    };
  }
  return {
    dialogs: [...seed, ...pipe],
    _pipeline: { dialogs: pipe.length, seed: seed.length, mode: 'seed_primary' },
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
    domain: c.domain,
    source: 'pipeline',
  }));
}

/**
 * Resource stats: prefer accurate union of seed articles + pipeline cites.
 */
function mergeResourceStatistics(seedStats, brandPlanId, seedArticles = []) {
  const brand = resolveBrand(brandPlanId);
  const pipeArticles = buildPipelineArticles(brand);
  const all = [...pipeArticles, ...seedArticles];
  if (!pipeArticles.length) {
    return { ...seedStats, _pipeline: { citation_count: 0, mode: 'seed_only' } };
  }
  const sites = new Set(all.map((a) => a.site));
  return {
    total_log_count: all.reduce((s, a) => s + (a.log_count || 1), 0),
    resource_count: all.length,
    site_count: sites.size,
    _pipeline: {
      citation_count: pipeArticles.length,
      seed_count: seedArticles.length,
      sites: [...new Set(pipeArticles.map((a) => a.site))],
      mode: 'pipeline_merged',
    },
  };
}

function mergeArticleList(seedList, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pipe = buildPipelineArticles(brand);
  return {
    list: [...pipe, ...(seedList || [])],
    _pipeline: { articles: pipe.length, mode: pipe.length ? 'pipeline_merged' : 'seed_only' },
  };
}

function mergeSiteCategory(seed, brandPlanId, seedArticles = []) {
  const brand = resolveBrand(brandPlanId);
  const pipe = buildPipelineArticles(brand);
  const all = [...pipe, ...seedArticles];
  if (!pipe.length) return { ...seed, _pipeline: { articles: 0 } };

  const byType = new Map();
  for (const a of all) {
    const key = a.site_type_key || 'other';
    if (!byType.has(key)) {
      byType.set(key, {
        name: a.site_type || key,
        key,
        sites: new Set(),
        resource_count: 0,
        log_count: 0,
      });
    }
    const row = byType.get(key);
    row.sites.add(a.site);
    row.resource_count += 1;
    row.log_count += a.log_count || 1;
  }
  const total = [...byType.values()].reduce((s, r) => s + r.log_count, 0) || 1;
  const list = [...byType.values()]
    .map((r) => ({
      name: r.name,
      key: r.key,
      site_count: r.sites.size,
      resource_count: r.resource_count,
      log_count: r.log_count,
      rate: Number((r.log_count / total).toFixed(4)),
    }))
    .sort((a, b) => b.rate - a.rate);
  return { list, _pipeline: { articles: pipe.length, mode: 'pipeline_merged' } };
}

function mergeSiteRanking(seed, brandPlanId, seedArticles = []) {
  const brand = resolveBrand(brandPlanId);
  const pipe = buildPipelineArticles(brand);
  const all = [...pipe, ...seedArticles];
  if (!pipe.length) return { ...seed, _pipeline: { articles: 0 } };
  const bySite = new Map();
  for (const a of all) {
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
    row.log_count += a.log_count || 1;
  }
  const total = [...bySite.values()].reduce((s, r) => s + r.log_count, 0) || 1;
  const list = [...bySite.values()]
    .map((r) => ({ ...r, rate: Number((r.log_count / total).toFixed(4)) }))
    .sort((a, b) => b.log_count - a.log_count);
  return { list, _pipeline: { articles: pipe.length, mode: 'pipeline_merged' } };
}

function mergeSentimentOverview(seedOverview, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const { dialogs, _pipeline } = combinedDialogs(brand);
  if (!_pipeline.dialogs) {
    return { ...seedOverview, _pipeline };
  }

  const buckets = { positive: 0, neutral: 0, negative: 0 };
  let scoreSum = 0;
  let scored = 0;
  let hasBrand = 0;
  for (const d of dialogs) {
    if (d.source === 'pipeline') {
      const label = (d.sentiment && d.sentiment.label) || 'neutral';
      buckets[label] = (buckets[label] || 0) + 1;
      if (d.sentiment && d.sentiment.score != null) {
        scoreSum += d.sentiment.score;
        scored += 1;
      }
      if ((d.mentions || []).some((m) => m.brand === brand.name)) hasBrand += 1;
    }
  }

  const pipeOnly = dialogs.filter((d) => d.source === 'pipeline');
  const overview = computeOverview({
    dialogs: pipeOnly.length ? pipeOnly : dialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });

  const negative_count = buckets.negative;
  const sentiment_count = pipeOnly.length || seedOverview.sentiment_count || 0;

  return {
    monitor_days: seedOverview.monitor_days || 30,
    sentiment_count: sentiment_count || overview.valid_rank_count,
    sentiment_score:
      scored > 0
        ? Number((scoreSum / scored).toFixed(1))
        : overview.sentiment_score || seedOverview.sentiment_score,
    positive_count: buckets.positive || seedOverview.positive_count || 0,
    neutral_count: buckets.neutral || seedOverview.neutral_count || 0,
    negative_count: negative_count || seedOverview.negative_count || 0,
    positive_mention_count: seedOverview.positive_mention_count,
    negative_mention_count: seedOverview.negative_mention_count,
    has_brand_count: hasBrand || overview.valid_rank_count,
    res_positive_count: seedOverview.res_positive_count,
    res_negative_count: seedOverview.res_negative_count,
    negative_mention_rate: sentiment_count
      ? Number((negative_count / sentiment_count).toFixed(4))
      : seedOverview.negative_mention_rate,
    _meta: {
      ...(seedOverview._meta || {}),
      sentiment_score: 'pipeline keyword stub / seed mock — algorithm unknown (U-02)',
      negative_mention_rate: 'PROVISIONAL: negative_count / sentiment_count',
    },
    _pipeline,
  };
}

function mergeSentimentTrend(seedTrend, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pipe = pipelineDialogsForBrand(brand);
  if (!pipe.length) return { ...seedTrend, _pipeline: { dialogs: 0 } };
  const dates = [...new Set(pipe.map((d) => d.date))].sort();
  const series = dates.map((date) => {
    const day = pipe.filter((d) => d.date === date);
    const buckets = { positive: 0, neutral: 0, negative: 0 };
    let scoreSum = 0;
    for (const d of day) {
      const label = (d.sentiment && d.sentiment.label) || 'neutral';
      buckets[label] += 1;
      scoreSum += (d.sentiment && d.sentiment.score) || 0;
    }
    return {
      date,
      sentiment_score: day.length ? Number((scoreSum / day.length).toFixed(1)) : 0,
      positive_count: buckets.positive,
      negative_count: buckets.negative,
      neutral_count: buckets.neutral,
    };
  });
  // append seed dates not in pipeline
  const seedSeries = (seedTrend && seedTrend.series) || [];
  const dateSet = new Set(dates);
  for (const row of seedSeries) {
    if (!dateSet.has(row.date)) series.push(row);
  }
  series.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return { series, _pipeline: { dialogs: pipe.length, mode: 'pipeline_merged' } };
}

function mergeSentimentPlatforms(seedPayload, brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const pipe = pipelineDialogsForBrand(brand);
  if (!pipe.length) return { ...seedPayload, _pipeline: { dialogs: 0 } };
  const platforms = [...new Set(pipe.map((d) => d.platform))];
  const list = platforms.map((platform) => {
    const subset = pipe.filter((d) => d.platform === platform);
    const buckets = { positive: 0, neutral: 0, negative: 0 };
    let scoreSum = 0;
    for (const d of subset) {
      const label = (d.sentiment && d.sentiment.label) || 'neutral';
      buckets[label] += 1;
      scoreSum += (d.sentiment && d.sentiment.score) || 0;
    }
    return {
      platform,
      sentiment_count: subset.length,
      sentiment_score: subset.length ? Number((scoreSum / subset.length).toFixed(1)) : 0,
      positive_count: buckets.positive,
      neutral_count: buckets.neutral,
      negative_count: buckets.negative,
      source: 'pipeline',
    };
  });
  // merge seed platforms not present
  const seen = new Set(platforms);
  for (const row of (seedPayload && seedPayload.list) || []) {
    if (!seen.has(row.platform)) list.push({ ...row, source: 'seed' });
  }
  return { list, _pipeline: { dialogs: pipe.length, mode: 'pipeline_merged' } };
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
      mention_mode: d.mention_mode || null,
      source: 'pipeline',
    };
  });
  const list = [...pipeRows, ...(seedPayload.list || [])];
  return {
    list,
    total: list.length,
    _pipeline: { dialogs: pipeRows.length, mode: pipeRows.length ? 'pipeline_merged' : 'seed_only' },
  };
}

/**
 * Brand mentions overview — pipeline-primary when available.
 */
function brandMentionsOverview(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const { dialogs, _pipeline } = combinedDialogs(brand);
  const overview = computeOverview({
    dialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  overview._meta = overview._meta || {};
  overview._meta.dialog_sources = _pipeline;
  overview._pipeline = _pipeline;
  return overview;
}

function brandMentionsHeatmap(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const { dialogs, _pipeline } = combinedDialogs(brand);
  const data = mentionHeatmap({
    brandName: brand.name,
    dialogs,
    brandPlanId: brand.id,
  });
  return { ...data, _pipeline };
}

function brandMentionsReferTrend(brandPlanId) {
  const brand = resolveBrand(brandPlanId);
  const { dialogs, _pipeline } = combinedDialogs(brand);
  return {
    series: referTrend({ brandName: brand.name, dialogs, brandPlanId: brand.id }),
    _pipeline,
  };
}

function dashboardFromPipeline(brandPlanId, seedDashboard) {
  const brand = resolveBrand(brandPlanId);
  const { dialogs, _pipeline } = combinedDialogs(brand);
  const overview = computeOverview({
    dialogs,
    brandId: brand.id,
    brandName: brand.name,
    competitorBrandIds: brand.competitors || [],
  });
  const score = computeBrandScore(overview);
  const cites = pipelineCitationsForBrand(brand);
  const resources = {
    resource_count: (seedDashboard && seedDashboard.resource_count) || 0,
    total_log_count: (seedDashboard && seedDashboard.total_log_count) || 0,
    site_count: (seedDashboard && seedDashboard.site_count) || 0,
  };
  if (cites.length) {
    resources.resource_count += cites.length;
    resources.total_log_count += cites.reduce((s, c) => s + (c.log_count || 1), 0);
    resources.site_count += new Set(cites.map((c) => c.site)).size;
  }
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
    _meta: {
      ...score._meta,
      brand_score_note: 'weights observed; rank/sentiment normalize provisional (U-03)',
    },
    _pipeline,
  };
}

function dashboardPlatformsFromPipeline(brandPlanId, seedList) {
  const brand = resolveBrand(brandPlanId);
  const pipe = pipelineDialogsForBrand(brand);
  if (!pipe.length) {
    return { list: seedList || [], _pipeline: { dialogs: 0, mode: 'seed_only' } };
  }
  const { dialogs } = combinedDialogs(brand);
  const platforms = [...new Set(dialogs.map((d) => d.platform))];
  const list = platforms.map((platform) => {
    const subset = dialogs.filter((d) => d.platform === platform);
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
  return { list, _pipeline: { dialogs: pipe.length, mode: 'pipeline_primary' } };
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
  combinedDialogs,
  mergeResourceStatistics,
  mergeArticleList,
  mergeSiteCategory,
  mergeSiteRanking,
  mergeSentimentOverview,
  mergeSentimentTrend,
  mergeSentimentPlatforms,
  mergeDialogRecords,
  brandMentionsOverview,
  brandMentionsHeatmap,
  brandMentionsReferTrend,
  dashboardFromPipeline,
  dashboardPlatformsFromPipeline,
  pipelineOverviewForBrand,
  buildPipelineArticles,
};
