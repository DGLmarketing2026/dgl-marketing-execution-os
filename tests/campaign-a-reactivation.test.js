// Campaign A family correction (2026-10-02): the authoritative source tab states
// "Campana A -- Reactivacion HA prioritaria (90+ dias sin carga)", so CMP-CAMPANA-A-HA-PRIORITARIA
// is REACTIVATION / Previous Relationship. Copy is the existing Reactivation family made
// service-neutral (Multiservicio stays internal context only), {{firstName}} / {{company}} stay for
// AURA's per-recipient merge, and earlier never-SENT Activation jobs are never reused.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');

// 1. Backend canonical context.
(function canonicalContextTest() {
  const ctx = { String, Number, Object, Array, Error, JSON, Date };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'backend/apps-script-v6/MarketingV6CampaignStudio.gs'), 'utf8'), ctx);
  const a = ctx.v6CampaignStudioCanonicalA_();
  assert.deepEqual([a.campaignName, a.campaignType, a.objective, a.messageAngle, a.playbookId, a.service], ['Reactivacion HA prioritaria - Campana A', 'Reactivation', 'Reactivation', 'Previous Relationship', 'REACTIVATION_ACCOUNT', 'Multiservicio']);
  const src = fs.readFileSync(path.join(root, 'backend/apps-script-v6/MarketingV6AuraCampanaA.gs'), 'utf8');
  assert(/var CAMPANA_A_JOB_FAMILY_ = 'Reactivation';/.test(src));
  assert(!/v6AuraCampanaAResolveRecipients_\([^)]*'Activation'/.test(src), 'audience is resolved as Reactivation');
  console.log('campaign-a reactivation test 1 (canonical context is Reactivation / Previous Relationship): PASS');
})();

// 2. Customer copy and the governed Campaign Studio preview.
(function copyAndPreviewTest() {
  const window = { location: { hash: '' }, addEventListener() {} };
  const doc = { getElementById: () => null, addEventListener() {}, documentElement: {} };
  const b = { window, document: doc, URLSearchParams, MutationObserver: class { observe() {} }, sessionStorage: { getItem: () => null, setItem() {} }, console };
  window.document = doc; vm.createContext(b);
  ['creative-library-v5', 'creative-render-v5', 'copy-engine-v5', 'copy-experience-v1', 'campaign-studio-v6'].forEach(n => vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', n + '.js'), 'utf8'), b));
  const S = window.DGL_CAMPAIGN_STUDIO_V6;
  const m = S.createModel({ campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', campaignName: 'Reactivacion HA prioritaria - Campana A', campaignType: 'Reactivation', objective: 'Reactivation', service: 'Multiservicio', messageAngle: 'Previous Relationship', requiredLanguages: ['ES', 'EN', 'PT'], approvedCreativeVariants: {} });
  assert.equal(m.selection.rule, 'OBJECTIVE_RECOMMENDED');
  assert(window.DGL_CREATIVE_LIBRARY_V5.CREATIVE_SYSTEMS[m.layout], 'auto-selected from the existing library');
  const expected = { EN: ['LET\'S MOVE AGAIN.', 'SEND A SHIPMENT', 'ground moves'], ES: ['VOLVAMOS A MOVER CARGA.', 'ENVIAR MOVIMIENTO', 'movimientos terrestres'], PT: ['VAMOS VOLTAR A MOVIMENTAR CARGA.', 'ENVIAR EMBARQUE', 'embarques terrestres'] };
  for (const l of ['EN', 'ES', 'PT']) {
    const c = m.variants[l].copy, html = S.emailHtml(m, l), all = JSON.stringify(c) + html;
    assert.equal(c.headline, expected[l][0]); assert.equal(c.cta, expected[l][1]);
    assert(c.body.includes(expected[l][2]) && c.body.includes('{{company}}'), l + ' neutral reactivation body keeps {{company}}');
    assert(c.subjectA.startsWith('{{firstName}}, '), l + ' subject keeps {{firstName}}');
    assert(!/Multiservicio|\{\{service\}\}|SUMEMOS|ANYTHING MOVING|MOVIMIENTO EN PUERTA|EMBARQUE EM VISTA|Current Movement/i.test(all), l + ': no Activation copy, no service leakage');
    assert(!/\bReactivation\b|\bActivation\b/.test(html), l + ': no internal family labels in the customer HTML');
  }
  // A specific service keeps the existing service-specific Reactivation template unchanged.
  const ftl = window.DGL_COPY_ENGINE_V5.generate({ objective: 'Reactivation', service: 'FTL', angle: 'Previous Relationship', language: 'EN' });
  assert(/FTL/.test(JSON.stringify(ftl)));
  console.log('campaign-a reactivation test 2 (service-neutral Reactivation copy EN/ES/PT with {{firstName}}/{{company}}; no Activation copy): PASS');
})();
