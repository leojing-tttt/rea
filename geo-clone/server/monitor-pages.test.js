const assert = require('assert');
const { monitorBrands } = require('./mock-data');
const {
  computeBrandScore,
  resourceStatistics,
  sentimentOverview,
  dashboardOverview,
} = require('./monitor-pages');
const { computeOverview } = require('./metrics');
const { monitorDialogs } = require('./mock-data');

const brand = monitorBrands[0];

const stats = resourceStatistics(brand.id);
assert.ok(stats.resource_count > 0);
assert.ok(stats.total_log_count >= stats.resource_count);
assert.ok(stats.site_count > 0);

const sent = sentimentOverview(brand.id);
assert.ok(sent.sentiment_count >= 0);
assert.ok(['positive_count', 'neutral_count', 'negative_count'].every((k) => k in sent));

const overview = computeOverview({
  dialogs: monitorDialogs,
  brandId: brand.id,
  brandName: brand.name,
  competitorBrandIds: brand.competitors || [],
});
const score = computeBrandScore(overview);
assert.ok(score.brand_score >= 0 && score.brand_score <= 100);

const dash = dashboardOverview(brand.id);
assert.strictEqual(dash.brand_score, score.brand_score);
assert.ok(dash.resource_count === stats.resource_count);

console.log('monitor-pages.test.js OK', {
  resource_count: stats.resource_count,
  site_count: stats.site_count,
  brand_score: dash.brand_score,
  sentiment_score: sent.sentiment_score,
});
