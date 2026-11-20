/**
 * Brand-mention overview metrics.
 * Formulas from docs/geo-metric-dictionary.md plus live monitor chunk display rules.
 *
 * Observed:
 * - refer_rate = valid_rank_count / ai_count
 * - sov = valid_rank_count / sum(brand mentioned-dialog counts)  (brand once per dialog)
 * - avg_rank = sum(ranks) / valid_rank_count
 * - mention_count = sum of per-dialog mention frequencies
 * - positive/neutral/negative_rate = polarity_count / sentiment_count
 *   (live calcSentimentRate: (n/sentiment_count*100).toFixed(2))
 *
 * Label-derived counts (not a closed rate):
 * - top1_mention_count = count(bestRank === 1)   「Top1(首位)提及次数」
 * - top3_mention_count = count(bestRank <= 3)    「Top3(首屏)提及次数」
 * - top10_mention_count = count(bestRank <= 10)  「Top10提及次数」
 *   首屏/Top10 are sibling filters (show_top1/3/10). Ecommerce 「排名第三」 tip is not used.
 *
 * Unknown (do not close):
 * - top*_refer_rate denominator (ai_count vs valid_rank_count). A provisional
 *   count/ai_count is still returned on the existing API field and flagged.
 * - sentiment_score model. Emitted only when dialogs carry score_origin=upstream.
 */

function computeOverview({ dialogs, brandId, brandName, competitorBrandIds = [] }) {
  const pool = dialogs.filter((d) => !brandId || d.brand_plan_id === brandId);
  const ai_count = pool.length;

  const brandMentions = [];
  const polarity = [];
  for (const d of pool) {
    const hits = (d.mentions || []).filter((m) => m.brand === brandName && m.rank != null);
    if (hits.length) {
      const bestRank = Math.min(...hits.map((m) => Number(m.rank) || 99));
      const count = hits.reduce((s, m) => s + (Number(m.count) || 1), 0);
      brandMentions.push({ dialogId: d.id, rank: bestRank, count });
      if (d.sentiment && d.sentiment.label) polarity.push(d.sentiment);
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

  const top1_mention_count = brandMentions.filter((m) => m.rank === 1).length;
  const top3_mention_count = brandMentions.filter((m) => m.rank <= 3).length;
  const top10_mention_count = brandMentions.filter((m) => m.rank <= 10).length;
  // Provisional only. Denominator is not a closed product formula.
  const top1_refer_rate = ai_count ? top1_mention_count / ai_count : 0;
  const top3_refer_rate = ai_count ? top3_mention_count / ai_count : 0;
  const top10_refer_rate = ai_count ? top10_mention_count / ai_count : 0;

  const sentiment_count = polarity.length;
  const positive_count = polarity.filter((s) => s.label === 'positive').length;
  const neutral_count = polarity.filter((s) => s.label === 'neutral').length;
  const negative_count = polarity.filter((s) => s.label === 'negative').length;
  const positive_word_count = polarity.reduce((n, s) => n + (Number(s.positive_word_hits) || 0), 0);
  const negative_word_count = polarity.reduce((n, s) => n + (Number(s.negative_word_hits) || 0), 0);
  const upstreamScores = polarity
    .filter((s) => s.score_origin === 'upstream' && s.score != null && s.score !== '')
    .map((s) => Number(s.score))
    .filter((n) => Number.isFinite(n));
  const sentiment_score = upstreamScores.length
    ? Number((upstreamScores.reduce((a, b) => a + b, 0) / upstreamScores.length).toFixed(1))
    : null;

  return {
    ai_count,
    valid_rank_count,
    refer_rate: round4(refer_rate),
    mention_count,
    sov: round4(sov),
    top1_mention_count,
    top3_mention_count,
    top10_mention_count,
    top1_refer_rate: round4(top1_refer_rate),
    top3_refer_rate: round4(top3_refer_rate),
    top10_refer_rate: round4(top10_refer_rate),
    avg_rank,
    sentiment_count,
    positive_count,
    neutral_count,
    negative_count,
    positive_rate: sentiment_count ? round4(positive_count / sentiment_count) : null,
    neutral_rate: sentiment_count ? round4(neutral_count / sentiment_count) : null,
    negative_rate: sentiment_count ? round4(negative_count / sentiment_count) : null,
    positive_word_count,
    negative_word_count,
    sentiment_score,
    _meta: {
      formulas: {
        refer_rate: 'valid_rank_count / ai_count',
        sov: 'valid_rank_count / sum(per-brand mentioned dialogs)',
        avg_rank: 'sum(rank) / valid_rank_count',
        mention_count: 'sum of brand mention frequencies across dialogs',
        top1_mention_count: 'count(bestRank==1) among ranked mentions of this brand',
        top3_mention_count: 'count(bestRank<=3)',
        top10_mention_count: 'count(bestRank<=10)',
        positive_rate: 'positive_count / sentiment_count',
        neutral_rate: 'neutral_count / sentiment_count',
        negative_rate: 'negative_count / sentiment_count',
        top1_refer_rate: 'PROVISIONAL not closed: top1_mention_count / ai_count',
        top3_refer_rate: 'PROVISIONAL not closed: top3_mention_count / ai_count',
        sentiment_score: 'null unless score_origin=upstream; model unknown (U-02)',
      },
      formula_status: {
        top1_mention_count: 'label_derived',
        top3_mention_count: 'label_derived',
        top10_mention_count: 'label_derived',
        positive_rate: 'observed',
        neutral_rate: 'observed',
        negative_rate: 'observed',
        top1_refer_rate: 'denominator_unknown',
        top3_refer_rate: 'denominator_unknown',
        top10_refer_rate: 'denominator_unknown',
        sentiment_score: 'unknown_model',
        positive_word_count: 'local_lexicon_or_fixture',
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
    top1MentionCount: api.top1_mention_count || 0,
    top3MentionCount: api.top3_mention_count || 0,
    avgRank: api.avg_rank || 0,
    sentimentScore: api.sentiment_score == null ? null : api.sentiment_score,
  };
}

module.exports = { computeOverview, toOverviewStats };
