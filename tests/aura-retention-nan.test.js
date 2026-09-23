const assert = require('assert'), fs = require('fs'), vm = require('vm');
const source = fs.readFileSync('assets/js/aura-dashboard-v1.js', 'utf8');

async function render(value, sharedRenderer) {
  const cards = [];
  const window = {
    document: { addEventListener() {} }, addEventListener() {},
    DGL_MARKETING_BACKEND_ADAPTER_V55: {
      isConnected: () => true,
      v6AuraEmailPerformance: async () => null,
      v6AuraRetentionDashboard: async () => ({ runId: 'NaN', lastRun: 'NaN', detected: value })
    }
  };
  if (sharedRenderer) window.DGL_UI = { kpiCard(card) {
    cards.push(card);
    return `<article>${card.label}: ${card.value}</article>`;
  } };
  vm.runInNewContext(source, { window, console, Number, Set });
  const mount = { innerHTML: '', querySelector: () => null };
  await window.DGL_MODULE_RENDERERS['aura-overview'](mount);
  assert(!mount.innerHTML.includes('NaN'), 'Overview must never render literal NaN');
  if (sharedRenderer) {
    const latest = label => cards.filter(c => c.label === label).at(-1).value;
    assert.equal(latest('Run ID (última corrida Retention)'), 'N/A');
    assert.equal(latest('Última ejecución'), 'N/A');
    return latest('Detectadas (Retention pilot)');
  }
  assert(mount.innerHTML.includes('N/A'));
}

(async () => {
  for (const value of ['NaN', 'Infinity', '-Infinity', 'undefined', 'null', '', '   ', ' NaN ']) {
    assert.strictEqual(await render(value, true), 'N/A');
    await render(value, false);
  }
  for (const value of [0, 1, -5, 1.25, '0', '42']) {
    assert.strictEqual(await render(value, true), value, 'Real numeric values must stay unchanged');
  }
  console.log('PASS: retention string NaN sanitized in both renderers; numeric values unchanged');
})().catch(error => { console.error(error); process.exitCode = 1; });
