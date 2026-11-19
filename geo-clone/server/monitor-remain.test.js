const assert = require('assert');
const { monitorBrands } = require('./mock-data');
const {
  dialogRecords,
  contentOptimization,
  brandManagementList,
  reportHistory,
  questionLibrary,
} = require('./monitor-remain');

const brand = monitorBrands[0];

const dialogs = dialogRecords(brand.id);
assert.ok(dialogs.list.length > 0);
assert.ok(dialogs.list[0].prompt);
assert.ok('hot_value' in dialogs.list[0]);

const co = contentOptimization(brand.id);
assert.strictEqual(co.stats.track_count, co.works.length);
assert.ok(co.stats.quote_count <= co.stats.track_count);
assert.ok(co.hotSites.length > 0);
assert.ok(co.hotTags.length > 0);

const mgmt = brandManagementList();
assert.ok(mgmt.list.length >= 1);
assert.ok(mgmt.monitoringSummary.brandCount >= 1);

const reports = reportHistory(brand.id);
assert.ok(reports.list.length >= 1);
assert.ok(reports.list[0].report_name);

const ql = questionLibrary(brand.id);
assert.ok(ql.list.length >= 1);
assert.ok(ql.list.some((q) => q.in_monitor));

console.log('monitor-remain.test.js OK', {
  dialogs: dialogs.total,
  track_count: co.stats.track_count,
  plans: mgmt.list.length,
  reports: reports.total,
  questions: ql.total,
});
