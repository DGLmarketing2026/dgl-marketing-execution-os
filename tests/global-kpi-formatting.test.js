const assert = require('assert'), fs = require('fs'), vm = require('vm');
const window = {};
vm.runInNewContext(fs.readFileSync('components/kpi-cards.js', 'utf8'), { window });
const { formatValue, kpiCard } = window.DGL_UI;
for (const value of [null, undefined, '', ' ', 'NaN', 'Infinity', '-Infinity', 'undefined', 'null', 'N/A', NaN, Infinity, -Infinity]) {
  for (const format of [undefined, 'currency', 'currency-compact', 'percent', 'multiplier']) {
    assert.equal(formatValue(value, format), 'N/A');
    const html = kpiCard({ value, format, label: 'KPI', delta: value });
    assert(!html.includes('NaN'));
    assert(!html.includes('Infinity'));
  }
}
for (const value of ['RUN-4C091A1B', '2026-09-23 10:30']) {
  assert.equal(formatValue(value), value);
  assert(kpiCard({ value, label: 'KPI' }).includes(value));
  for (const format of ['currency', 'currency-compact', 'percent', 'multiplier']) assert.equal(formatValue(value, format), 'N/A');
}
for (const value of [1234, '1234']) {
  assert.equal(formatValue(value), '1,234');
  assert.equal(formatValue(value, 'currency'), '$1,234');
  assert.equal(formatValue(value, 'currency-compact'), '$1K');
  assert.equal(formatValue(value, 'percent'), '1234.0%');
  assert.equal(formatValue(value, 'multiplier'), '1234.0x');
}
assert.equal(formatValue(0), '0');
assert.equal(formatValue(-1.5), '-1.5');
assert.equal(formatValue('1e999'), 'N/A');
assert(!kpiCard({ value: '<script>bad</script>', label: 'KPI' }).includes('<script>'));
assert(kpiCard({ label: 'Queued (DRY_RUN)', value: undefined }).includes('<div class="kpi-value">N/A</div>'));
// Exercise AURA with the real shared renderer, including a missing queued metric.
window.document = { addEventListener() {} }; window.addEventListener = () => {};
window.DGL_MARKETING_BACKEND_ADAPTER_V55 = {
  isConnected: () => true,
  v6AuraEmailPerformance: async () => null,
  v6AuraRetentionDashboard: async () => ({ runId: 'RUN-4C091A1B', lastRun: '2026-09-23 10:30' }),
  v6AuraCampanaAAudit: async () => ({ byStatusForCampaignA: {} })
};
vm.runInNewContext(fs.readFileSync('assets/js/aura-dashboard-v1.js', 'utf8'), { window });
const mount = { innerHTML: '', querySelector: () => null };
window.DGL_MODULE_RENDERERS['aura-overview'](mount).then(() => {
  assert(!mount.innerHTML.includes('NaN'));
  assert(mount.innerHTML.includes('RUN-4C091A1B'));
  assert(mount.innerHTML.includes('2026-09-23 10:30'));
  assert(/kpi-value">N\/A<\/div>\s*<div class="kpi-label">Queued \(DRY_RUN\)/.test(mount.innerHTML));
  console.log('PASS global KPI formats and real AURA integration');
}).catch(error => { console.error(error); process.exitCode = 1; });
