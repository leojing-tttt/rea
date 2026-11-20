const assert = require('assert');
const { computeOverview } = require('./metrics');
const { monitorDialogs, monitorBrands } = require('./mock-data');

const brand = monitorBrands[0];
const o = computeOverview({
  dialogs: monitorDialogs,
  brandId: brand.id,
  brandName: brand.name,
  competitorBrandIds: brand.competitors,
});

assert.strictEqual(o.refer_rate, Number((o.valid_rank_count / o.ai_count).toFixed(4)));
assert.ok(o.ai_count > 0);
assert.ok(o.valid_rank_count > 0);
assert.ok(o.sov > 0 && o.sov <= 1);
assert.ok(o.avg_rank > 0);

// Label-derived TopN counts + observed polarity rates. Rate denominators and
// sentiment_score model stay unknown (see formula_status).
const sample = [
  {
    id: 's1',
    brand_plan_id: 'b',
    mentions: [{ brand: 'A', rank: 1, count: 2 }],
    sentiment: { label: 'positive', positive_word_hits: 2, negative_word_hits: 0, classifier: 'fixture' },
  },
  {
    id: 's2',
    brand_plan_id: 'b',
    mentions: [{ brand: 'A', rank: 2, count: 1 }],
    sentiment: { label: 'negative', positive_word_hits: 0, negative_word_hits: 3, classifier: 'fixture' },
  },
  {
    id: 's3',
    brand_plan_id: 'b',
    mentions: [{ brand: 'A', rank: 4, count: 1 }],
    sentiment: { label: 'neutral', positive_word_hits: 1, negative_word_hits: 1, classifier: 'fixture' },
  },
  {
    id: 's4',
    brand_plan_id: 'b',
    mentions: [{ brand: 'B', rank: 1, count: 1 }],
    sentiment: { label: 'positive', positive_word_hits: 9, negative_word_hits: 9, classifier: 'fixture' },
  },
  {
    id: 's5',
    brand_plan_id: 'b',
    mentions: [{ brand: 'A', rank: 3, count: 1 }],
    sentiment: { label: 'positive', score: 88, score_origin: 'upstream' },
  },
];
const s = computeOverview({
  dialogs: sample,
  brandId: 'b',
  brandName: 'A',
});
assert.strictEqual(s.ai_count, 5);
assert.strictEqual(s.valid_rank_count, 4);
assert.strictEqual(s.top1_mention_count, 1);
assert.strictEqual(s.top3_mention_count, 3);
assert.strictEqual(s.top10_mention_count, 4);
assert.strictEqual(s.sentiment_count, 4);
assert.strictEqual(s.positive_count, 2);
assert.strictEqual(s.neutral_count, 1);
assert.strictEqual(s.negative_count, 1);
assert.strictEqual(s.positive_rate, Number((2 / 4).toFixed(4)));
assert.strictEqual(s.neutral_rate, Number((1 / 4).toFixed(4)));
assert.strictEqual(s.negative_rate, Number((1 / 4).toFixed(4)));
assert.strictEqual(s.positive_word_count, 3);
assert.strictEqual(s.negative_word_count, 4);
// Upstream score only. Keyword/fixture labels do not invent sentiment_score.
assert.strictEqual(s.sentiment_score, 88);
assert.strictEqual(s._meta.formula_status.top1_refer_rate, 'denominator_unknown');
assert.strictEqual(s._meta.formula_status.top3_refer_rate, 'denominator_unknown');
assert.strictEqual(s._meta.formula_status.sentiment_score, 'unknown_model');
assert.strictEqual(s._meta.formula_status.positive_rate, 'observed');
assert.strictEqual(s._meta.formula_status.top1_mention_count, 'label_derived');
// Provisional rate is still emitted for the existing overview field, and equals count/ai_count.
assert.strictEqual(s.top1_refer_rate, Number((1 / 5).toFixed(4)));
assert.strictEqual(s.top3_refer_rate, Number((3 / 5).toFixed(4)));

const noUpstream = computeOverview({
  dialogs: sample.filter((d) => d.id !== 's5'),
  brandId: 'b',
  brandName: 'A',
});
assert.strictEqual(noUpstream.sentiment_score, null);

console.log('metrics.test.js OK', {
  ai_count: o.ai_count,
  valid_rank_count: o.valid_rank_count,
  refer_rate: o.refer_rate,
  sov: o.sov,
  avg_rank: o.avg_rank,
  mention_count: o.mention_count,
  top1_mention_count: s.top1_mention_count,
  positive_rate: s.positive_rate,
  sentiment_score: s.sentiment_score,
});
