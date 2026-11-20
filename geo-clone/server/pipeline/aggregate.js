const { computeOverview } = require('../metrics');

/**
 * Aggregate parsed platform dialogs into dictionary overview shapes.
 * Also build UI-facing search results from parsed rows.
 */

function toUiResults(parsedList) {
  return (parsedList || []).map((d) => ({
    platform: d.platform_id || d.platform,
    mode: d.mode,
    status: 'done',
    answer: d.answer_excerpt || '',
    mentioned: Boolean(d.mentioned),
    mention_rank: d.mention_rank,
    citations: d.citations || [],
    sentiment: d.sentiment || null,
    mentions: d.mentions || [],
  }));
}

/**
 * @param {object[]} parsedList
 * @param {{ brand?: string, brand_plan_id?: string, competitors?: string[] }} opts
 */
function aggregateParsed(parsedList, opts = {}) {
  const brandName = opts.brand || '';
  const dialogs = (parsedList || []).map((d) => ({
    id: d.id,
    brand_plan_id: opts.brand_plan_id || d.brand_plan_id || 'pipeline_adhoc',
    platform: d.platform,
    question: d.question || d.prompt,
    date: d.date,
    mentions: d.mentions || [],
    sentiment: d.sentiment,
    citations: d.citations || [],
    task_id: d.task_id,
    source: 'pipeline',
  }));

  const overview = computeOverview({
    dialogs,
    brandId: opts.brand_plan_id || 'pipeline_adhoc',
    brandName: brandName || '__none__',
    competitorBrandIds: opts.competitors || [],
  });

  // citation rollup (structured)
  const allCites = dialogs.flatMap((d) => d.citations || []);
  const sites = new Set(allCites.map((c) => c.site));
  const total_log_count = allCites.reduce((s, c) => s + (c.log_count || 1), 0);
  const byType = new Map();
  for (const c of allCites) {
    const key = c.site_type_key || 'other';
    if (!byType.has(key)) {
      byType.set(key, {
        key,
        name: c.site_type || key,
        site_count: new Set(),
        resource_count: 0,
        log_count: 0,
      });
    }
    const row = byType.get(key);
    row.site_count.add(c.site);
    row.resource_count += 1;
    row.log_count += c.log_count || 1;
  }
  const site_categories = [...byType.values()].map((r) => ({
    name: r.name,
    key: r.key,
    site_count: r.site_count.size,
    resource_count: r.resource_count,
    log_count: r.log_count,
    rate: total_log_count ? Number((r.log_count / total_log_count).toFixed(4)) : 0,
  }));

  const sentimentBuckets = { positive: 0, neutral: 0, negative: 0 };
  let labeled = 0;
  for (const d of parsedList || []) {
    const label = d.sentiment && d.sentiment.label;
    if (!label || sentimentBuckets[label] == null) continue;
    sentimentBuckets[label] += 1;
    labeled += 1;
  }

  return {
    overview,
    dialogs,
    results: toUiResults(parsedList),
    resources: {
      resource_count: allCites.length,
      total_log_count,
      site_count: sites.size,
      site_categories,
      citations: allCites,
    },
    sentiment_summary: {
      sentiment_count: labeled,
      ...sentimentBuckets,
      positive_rate: labeled ? Number((sentimentBuckets.positive / labeled).toFixed(4)) : null,
      neutral_rate: labeled ? Number((sentimentBuckets.neutral / labeled).toFixed(4)) : null,
      negative_rate: labeled ? Number((sentimentBuckets.negative / labeled).toFixed(4)) : null,
      avg_score: null,
      _score_status: 'unknown_model',
    },
    _meta: {
      pipeline: 'task→raw→parse→aggregate',
      dialog_count: dialogs.length,
    },
  };
}

module.exports = { aggregateParsed, toUiResults };
