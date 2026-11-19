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
console.log('metrics.test.js OK', {
  ai_count: o.ai_count,
  valid_rank_count: o.valid_rank_count,
  refer_rate: o.refer_rate,
  sov: o.sov,
  avg_rank: o.avg_rank,
  mention_count: o.mention_count,
});
