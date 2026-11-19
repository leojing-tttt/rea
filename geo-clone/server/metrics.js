/**
 * Brand-mention overview metrics.
 * Formulas from docs/geo-metric-dictionary.md (product tips / FE mapping).
 *
 * Observed:
 * - refer_rate = valid_rank_count / ai_count
 * - sov = valid_rank_count / sum(brand mentioned-dialog counts)  (brand once per dialog)
 * - avg_rank = sum(ranks) / valid_rank_count
 * - mention_count = sum of per-dialog mention frequencies
 *
 * Unknown / provisional:
 * - top1_refer_rate / top3_refer_rate denominators not confirmed in FE tips
 * - sentiment_score algorithm not in FE (seeded mock score)
 */

function computeOverview({ dialogs, brandId, brandName, competitorBrandIds = [] }) {
  const pool = dialogs.filter((d) => !brandId || d.brand_plan_id === brandId);
  const ai_count = pool.length;

  const brandMentions = [];
  for (const d of pool) {
    const hits = (d.mentions || []).filter((m) => m.brand === brandName);
    if (hits.length) {
      const bestRank = Math.min(...hits.map((m) => Number(m.rank) || 99));
      const count = hits.reduce((s, m) => s + (Number(m.count) || 1), 0);
      brandMentions.push({ dialogId: d.id, rank: bestRank, count });
    }
  }

  const valid_rank_count = brandMentions.length;
  const mention_count = brandMentions.reduce((s, m) => s + m.count, 0);
  const rankSum = brandMentions.reduce((s, m) => s + m.rank, 0);
  const avg_rank = valid_rank_count ? Number((rankSum / valid_rank_count).toFixed(2)) : 0;

  const refer_rate = ai_count ? valid_rank_count / ai_count : 0;

  // SOV denominator: all brands' mentioned-dialog counts (unique brand per dialog)
  const brandDialogSets = new Map();
  for (const d of pool) {
    const seen = new Set();
    for (const m of d.mentions || []) {
      if (!m.brand || seen.has(m.brand)) continue;
      seen.add(m.brand);
      if (!brandDialogSets.has(m.brand)) brandDialogSets.set(m.brand, 0);
      brandDialogSets.set(m.brand, brandDialogSets.get(m.brand) + 1);
    }
  }
  // ensure competitors appear even if 0
  for (const id of competitorBrandIds) {
    if (!brandDialogSets.has(id)) brandDialogSets.set(id, 0);
  }
  const allMentionedDialogSum = [...brandDialogSets.values()].reduce((a, b) => a + b, 0);
  const sov = allMentionedDialogSum ? valid_rank_count / allMentionedDialogSum : 0;

  // Provisional Top1/Top3: share of ALL dialogs where brand rank hits threshold.
  // Documented as unknown in product tips — keep labels + provisional flag.
  const top1Hits = brandMentions.filter((m) => m.rank === 1).length;
  const top3Hits = brandMentions.filter((m) => m.rank <= 3).length;
  const top1_refer_rate = ai_count ? top1Hits / ai_count : 0;
  const top3_refer_rate = ai_count ? top3Hits / ai_count : 0;

  // Mock sentiment score (百分制) — algorithm unknown
  const sentiment_score = valid_rank_count
    ? Number((72 + Math.min(20, valid_rank_count) + (avg_rank ? Math.max(0, 8 - avg_rank) : 0)).toFixed(1))
    : 0;

  return {
    ai_count,
    valid_rank_count,
    refer_rate: round4(refer_rate),
    mention_count,
    sov: round4(sov),
    top1_refer_rate: round4(top1_refer_rate),
    top3_refer_rate: round4(top3_refer_rate),
    avg_rank,
    sentiment_score,
    _meta: {
      formulas: {
        refer_rate: 'valid_rank_count / ai_count',
        sov: 'valid_rank_count / sum(per-brand mentioned dialogs)',
        avg_rank: 'sum(rank) / valid_rank_count',
        mention_count: 'sum of brand mention frequencies across dialogs',
        top1_refer_rate: 'PROVISIONAL: count(rank==1) / ai_count',
        top3_refer_rate: 'PROVISIONAL: count(rank<=3) / ai_count',
        sentiment_score: 'MOCK — algorithm unknown in FE',
      },
      brandDialogSets: Object.fromEntries(brandDialogSets),
    },
  };
}

function round4(x) {
  return Number(Number(x).toFixed(4));
}

/** Display helpers matching live FE overview cards */
function toOverviewStats(api) {
  return {
    aiCount: api.ai_count || 0,
    validRankCount: api.valid_rank_count || 0,
    referRate: (100 * (api.refer_rate || 0)).toFixed(0),
    mentionCount: api.mention_count || 0,
    sov: (100 * (api.sov || 0)).toFixed(0),
    top1ReferRate: (100 * (api.top1_refer_rate || 0)).toFixed(0),
    top3ReferRate: (100 * (api.top3_refer_rate || 0)).toFixed(0),
    avgRank: api.avg_rank || 0,
    sentimentScore: api.sentiment_score || 0,
  };
}

module.exports = { computeOverview, toOverviewStats };
