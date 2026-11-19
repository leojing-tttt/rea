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

  // citation rollup
  const allCites = dialogs.flatMap((d) => d.citations || []);
  const sites = new Set(allCites.map((c) => c.site));
  const sentimentBuckets = { positive: 0, neutral: 0, negative: 0 };
  for (const d of parsedList || []) {
    const label = (d.sentiment && d.sentiment.label) || 'neutral';
    if (sentimentBuckets[label] != null) sentimentBuckets[label] += 1;
    else sentimentBuckets.neutral += 1;
  }

  return {
    overview,
    dialogs,
    results: toUiResults(parsedList),
    resources: {
      resource_count: allCites.length,
      total_log_count: allCites.length,
      site_count: sites.size,
    },
    sentiment_summary: {
      sentiment_count: (parsedList || []).length,
      ...sentimentBuckets,
      avg_score:
        (parsedList || []).length === 0
          ? 0
          : Number(
              (
                (parsedList || []).reduce((s, d) => s + ((d.sentiment && d.sentiment.score) || 0), 0) /
                parsedList.length
              ).toFixed(1)
            ),
      _stub: true,
    },
    _meta: {
      pipeline: 'task→raw→parse→aggregate',
      dialog_count: dialogs.length,
    },
  };
}

module.exports = { aggregateParsed, toUiResults };
