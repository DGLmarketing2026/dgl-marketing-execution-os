// Campaign Studio V6 selector + workspace (2026-10-02): the campaign wall of giant buttons is
// replaced by a searchable, filterable compact list; the workspace preview is the renderer's own
// HTML; inspecting another visual system never approves or revokes anything.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const ID = 'CMP-CAMPANA-A-HA-PRIORITARIA';

function makeDom() {
  // Minimal element model: enough for innerHTML-driven rendering and querySelector lookups.
  const listeners = [];
  const el = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  return { el, listeners };
}
function browser(adapter) {
  const window = { location: { hash: '#/campaign-studio' }, addEventListener() {}, history: { replaceState: (a, b, h) => { window.location.hash = h; } }, DGL_MARKETING_BACKEND_ADAPTER_V55: adapter };
  const store = {};
  const doc = { getElementById: () => null, addEventListener() {}, documentElement: {}, head: null };
  const b = { window, document: doc, URLSearchParams, MutationObserver: class { observe() {} }, sessionStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; } }, setTimeout, clearTimeout, console };
  window.document = doc; window.sessionStorage = b.sessionStorage;
  vm.createContext(b);
  ['creative-library-v5', 'creative-render-v5', 'copy-engine-v5', 'copy-experience-v1', 'campaign-studio-v6'].forEach(n => vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', n + '.js'), 'utf8'), b, { filename: n + '.js' }));
  return window;
}
const campaigns = [
  { campaignId: ID, campaignName: 'Activation Prioritaria - Campana A (HA)', objective: 'Activation', service: 'Multiservicio', amOwner: 'Luis Simoes', status: 'AUTO_ACTIVE' },
  { campaignId: 'CMP-RET-1', campaignName: 'Retention FTL Q4', objective: 'Retention', service: 'FTL', amOwner: 'Fabian Lopez', status: 'DRAFT' },
  { campaignId: 'CMP-QNB-1', campaignName: 'QNB Drayage follow-up', objective: 'Quoted Not Booked', service: 'Drayage', amOwner: 'Luis Simoes', status: 'ACTIVE' }
];
for (let i = 0; i < 60; i++) campaigns.push({ campaignId: 'CMP-BULK-' + i, campaignName: 'Bulk campaign ' + i, objective: 'Reactivation', service: 'LTL', amOwner: 'Owner ' + (i % 3), status: 'DRAFT' });
const context = { campaignId: ID, campaignName: 'Activation Prioritaria - Campana A (HA)', campaignType: 'Activation', objective: 'Activation', service: 'Multiservicio', messageAngle: 'Current Movement', audienceId: 'SCOPE-CAMPANA-A-HA-PRIORITARIA', playbookId: 'ACTIVATION_ACCOUNT', language: 'MULTILINGUAL', audienceResolved: true, eligibleContacts: 139, excludedContacts: 88, requiredLanguages: ['ES', 'EN', 'PT'], approvedCreativeVariants: {}, creativeSetStatus: 'CREATIVE_SET_INCOMPLETE' };
let calls;
function adapter() {
  calls = { list: 0, context: 0, revoke: 0, approve: 0 };
  return {
    isConnected: () => true,
    campaignStudioList: async () => { calls.list++; return { campaigns }; },
    campaignStudioContext: async () => { calls.context++; return context; },
    getLatestApprovedCreative: async () => null,
    revokeApprovedCreative: async () => { calls.revoke++; },
    approveCreative: async () => { calls.approve++; }
  };
}

(async () => {
  // 1. Selector: compact list with search and filters -- not a wall of .btn campaign buttons.
  let window = browser(adapter());
  const S = window.DGL_CAMPAIGN_STUDIO_V6;
  const mount = { innerHTML: '', querySelector: () => null, querySelectorAll: () => [] };
  await S.render(mount, '');
  assert(mount.innerHTML.includes('data-search') && mount.innerHTML.includes('data-filter="objective"') && mount.innerHTML.includes('data-filter="service"') && mount.innerHTML.includes('data-filter="owner"') && mount.innerHTML.includes('data-filter="status"'), 'search + objective/service/owner/status filters');
  assert(!/class="btn" data-campaign=/.test(mount.innerHTML), 'no giant campaign buttons');
  assert((mount.innerHTML.match(/class="cs6-row[^"]*" data-campaign=/g) || []).length === campaigns.length, 'every campaign is one compact row');
  const list = campaigns.map(S.normalizeCampaign);
  assert.deepEqual(S.filterCampaigns(list, { q: 'campana a' }).map(c => c.campaignId), [ID]);
  assert.deepEqual(S.filterCampaigns(list, { objective: 'Quoted Not Booked' }).map(c => c.campaignId), ['CMP-QNB-1']);
  assert.equal(S.filterCampaigns(list, { owner: 'Luis Simoes' }).length, 2);
  assert.equal(S.filterCampaigns(list, { service: 'LTL', status: 'DRAFT' }).length, 60);
  assert.equal(S.filterCampaigns(list, { q: 'zzz' }).length, 0);
  // Session cache: the list is fetched once.
  await S.render(mount, '');
  assert.equal(calls.list, 1, 'campaign list loaded once per session');
  console.log('campaign-studio selector test 1 (compact searchable/filterable list, cached): PASS');

  // 2. Campaign A workspace: context, auto system + why, EN/ES/PT, actual renderer HTML.
  window = browser(adapter());
  const S2 = window.DGL_CAMPAIGN_STUDIO_V6;
  let frame = { srcdoc: '' };
  const ws = { innerHTML: '', querySelector: sel => sel === '[data-preview]' ? frame : null, querySelectorAll: () => [] };
  await S2.render(ws, ID);
  const m = S2.getState();
  assert(ws.innerHTML.includes('Activation Prioritaria') && ws.innerHTML.includes('Current Movement') && ws.innerHTML.includes('Multiservicio'), 'campaign context');
  assert(ws.innerHTML.includes('Design selected automatically') && ws.innerHTML.includes('GROUND_CAPACITY_ASK'), 'auto system with reason');
  assert.equal(m.layout, 'split-hero');
  for (const l of ['EN', 'ES', 'PT']) {
    S2.selectLanguage(m, l);
    const html = S2.previewHtml(m);
    assert.equal(html, S2.emailHtml(m, l), l + ': preview is exactly the governed renderer HTML');
    assert(html.includes('<!--dgl-system:split-hero-->'));
    assert(!/Multiservicio|\{\{service\}\}|SUMEMOS|LET'S MOVE AGAIN|Previous Relationship/i.test(html), l + ': Activation copy only');
  }
  assert(frame.srcdoc.includes('<!--dgl-system:split-hero-->'), 'the workspace iframe receives the renderer HTML');
  // 3. Gallery inspection: preview-only, no revoke/approve, approval disabled while inspecting.
  m.inspect = 'route-intelligence';
  assert(S2.previewHtml(m).includes('<!--dgl-system:route-intelligence-->'));
  assert.equal(m.layout, 'split-hero');
  assert.deepEqual([calls.revoke, calls.approve], [0, 0]);
  m.inspect = null;
  assert.equal(calls.context, 1, 'context loaded once');
  console.log('campaign-studio selector test 2 (Campaign A workspace, EN/ES/PT actual renderer HTML, preview-only gallery): PASS');
})().catch(err => { console.error(err); process.exit(1); });
