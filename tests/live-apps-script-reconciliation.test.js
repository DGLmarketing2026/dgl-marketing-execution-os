// Live Apps Script reconciliation guard. The backend directories below are, together, the
// complete file set a future `clasp push` sends to the live project -- clasp replaces the whole
// remote project, so anything missing here would be DELETED from production. These tests pin
// that production parity, the single web-app entrypoint, the public WordPress lead intake, the
// public-repo PII/secret policy, and that the reconciliation never regressed PR #9 / PR #11.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const PUSH_DIRS = ['backend/apps-script-live-core', 'backend/apps-script-legacy-v55', 'backend/apps-script-v6'];
const pushFiles = PUSH_DIRS.flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.gs')).map(f => path.join(d, f)));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').split('\r').join('');

// Exact live-only production files that must stay in the push set (see PR description).
const LIVE_ONLY_FILES = [
  'backend/apps-script-live-core/AURA_CANON.gs', 'backend/apps-script-live-core/DGL_Core.gs',
  'backend/apps-script-live-core/MarketingApiAdapter.gs', 'backend/apps-script-live-core/MarketingAudienceEngine.gs',
  'backend/apps-script-live-core/MarketingDataHub.gs', 'backend/apps-script-live-core/MarketingEmailEngine.gs',
  'backend/apps-script-live-core/MarketingImport.gs', 'backend/apps-script-live-core/MarketingV6AuraCampanaACatchup.gs',
  'backend/apps-script-live-core/MarketingV6ManualRunner.gs',
  'backend/apps-script-legacy-v55/MarketingV55RecipientResolver.gs', 'backend/apps-script-legacy-v55/MarketingV55TestDraft.gs'
];

function fakeProps(store) {
  return { getScriptProperties: () => ({
    getProperty: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty(k, v) { store[k] = String(v); return this; }, deleteProperty(k) { delete store[k]; return this; }
  }) };
}
// Loads every push file into ONE context, exactly like the Apps Script V8 runtime does.
function loadProject(props) {
  const ctx = {
    console: { log() {}, error() {} }, Logger: { log() {} },
    PropertiesService: fakeProps(props || {}),
    ContentService: { MimeType: { JSON: 'JSON', JAVASCRIPT: 'JS' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    Utilities: { getUuid: (() => { let n = 0; return () => 'UUID-' + (++n) + '-0000'; })(), base64Encode: s => s, formatDate: d => d.toISOString() }
  };
  vm.createContext(ctx);
  const source = pushFiles.map(f => read(f)).join('\n;\n');
  vm.runInContext(source, ctx, { filename: 'apps-script-project.gs' });
  return ctx;
}

// 1. Production parity: every live-only file is present in the push set and is loadable together
// with the rest of the project (a duplicate top-level const/let would throw here).
(function productionParity() {
  LIVE_ONLY_FILES.forEach(f => assert(fs.existsSync(path.join(root, f)), 'live-only production file missing from the push set: ' + f));
  const ctx = loadProject({ DGL_SPREADSHEET_ID: 'fixture-sheet' });
  ['doGet', 'doPost', 'handleMarketingV55Api_', 'v6AcqSubmitLead_', 'v6WpQaLeadsCleanup_', 'RUN_AURA_CAMPANA_A_CATCHUP_PREFLIGHT',
   'rebuildMarketingAudiences', 'handleMarketingApi_', 'setupMarketingDataHub', 'previewMarketingImport', 'createMarketingV55TestDraft_',
   'resolveMarketingV55Recipients_', 'runV6RefreshOpportunities', 'AURA_CANON_INFO', 'v6CreateExecution_'].forEach(fn =>
    assert.equal(typeof ctx[fn], 'function', fn + ' must exist in the reconciled project'));
  console.log('reconciliation test 1 (all live-only production files present, project loads as one namespace): PASS');
})();

// 2. No function is declared twice across the project (Apps Script would silently keep the last).
(function noDuplicateDeclarations() {
  const seen = {};
  pushFiles.forEach(f => {
    const re = /^\s*function\s+([A-Za-z0-9_$]+)\s*\(/gm; let m;
    while ((m = re.exec(read(f)))) (seen[m[1]] = seen[m[1]] || []).push(path.basename(f));
  });
  const dupes = Object.keys(seen).filter(k => seen[k].length > 1).map(k => k + ' @ ' + seen[k].join(', '));
  assert.deepEqual(dupes, [], 'duplicate top-level functions:\n' + dupes.join('\n'));
  console.log('reconciliation test 2 (no duplicate top-level function across the push set): PASS');
})();

// 3. Exactly one doGet and one doPost web-app entrypoint across the push set, both in DGL_Core.
(function singleEntrypoints() {
  ['doGet', 'doPost'].forEach(fn => {
    const owners = pushFiles.filter(f => new RegExp('^\\s*function\\s+' + fn + '\\s*\\(', 'm').test(read(f)));
    assert.deepEqual(owners.map(f => path.basename(f)), ['DGL_Core.gs'], fn + ' must be declared exactly once, in DGL_Core.gs');
  });
  console.log('reconciliation test 3 (exactly one doGet and one doPost, both in DGL_Core): PASS');
})();

// 4-6. Public WordPress lead intake through the real doPost entrypoint.
function leadHarness(pageStatus) {
  const ctx = loadProject({ DGL_SPREADSHEET_ID: 'fixture-sheet' });
  const tables = { MKT_ACQ_LEADS: [], MKT_ACQ_QA_LEADS: [], MKT_ACQ_WP_PAGES: [{ landingPageId: 'LP-1', status: pageStatus, service: 'FTL', cycleId: 'CYCLE-1' }], MKT_ACQ_LANDING_PAGES: [{ landingPageId: 'LP-1', signalId: 'SIG-1' }] };
  ctx.handleMarketingV55Api_ = () => null; // non-V55 actions fall through to DGL_Core's router, as live
  ctx.v6WpFindRow_ = (t, keys, q) => tables[t].find(r => keys.every(k => String(r[k]) === String(q[k]))) || null;
  ctx.v6AcqRows_ = t => (tables[t] || []).map(r => Object.assign({}, r));
  ctx.v6WpUpsert_ = (t, keys, rec) => { tables[t].push(Object.assign({}, rec)); return rec; };
  ctx.v6AcqUpsert_ = (t, keys, rec) => { tables[t].push(Object.assign({}, rec)); return rec; };
  ctx.logError_ = () => {};
  const post = params => JSON.parse(ctx.doPost({ parameter: Object.assign({ action: 'submitLead' }, params) }).text);
  return { ctx, tables, post };
}
const validLead = { landingPageId: 'LP-1', email: 'Prospect@Example.test', firstName: 'Pat', lastName: 'Lee', company: 'Fixture Co', utm_source: 'google', utm_campaign: 'cmp' };

(function publishedLeadIsRecorded() {
  const h = leadHarness('PUBLISHED');
  const res = h.post(validLead);
  assert.equal(res.ok, true, 'submitLead must not require the API key (public form endpoint)');
  assert.equal(res.result.status, 'OK'); assert.equal(res.result.qa, false);
  assert.equal(h.tables.MKT_ACQ_LEADS.length, 1); assert.equal(h.tables.MKT_ACQ_QA_LEADS.length, 0);
  const lead = h.tables.MKT_ACQ_LEADS[0];
  assert.equal(lead.email, 'prospect@example.test'); assert.equal(lead.signalId, 'SIG-1');
  assert.equal(lead.cycleId, 'CYCLE-1'); assert.equal(lead.validationStatus, 'NEW'); assert.equal(lead.utmSource, 'google');
  console.log('reconciliation test 4 (published landing page: lead recorded in MKT_ACQ_LEADS via doPost submitLead): PASS');
})();

(function qaLeadIsIsolated() {
  const h = leadHarness('PRIVATE_QA');
  const res = h.post(Object.assign({ qaRunId: 'QA-RUN-1' }, validLead));
  assert.equal(res.result.status, 'OK'); assert.equal(res.result.qa, true);
  assert.equal(h.tables.MKT_ACQ_QA_LEADS.length, 1, 'QA page lead goes to MKT_ACQ_QA_LEADS');
  assert.equal(h.tables.MKT_ACQ_LEADS.length, 0, 'QA page lead must never reach MKT_ACQ_LEADS / Salesforce routing');
  assert.equal(h.tables.MKT_ACQ_QA_LEADS[0].qaRunId, 'QA-RUN-1');
  // QA routing is decided server-side from the page status, never from a client flag.
  const h2 = leadHarness('PUBLISHED');
  assert.equal(h2.post(Object.assign({ qa: '1' }, validLead)).result.qa, false, 'a client-supplied qa flag must not divert a published lead');
  console.log('reconciliation test 5 (PRIVATE_QA page: lead isolated to MKT_ACQ_QA_LEADS; client qa flag ignored): PASS');
})();

(function honeypotAndValidationReject() {
  const h = leadHarness('PUBLISHED');
  const cases = [
    [Object.assign({ website: 'http://spam.test' }, validLead), 'spam signal detected'],
    [Object.assign({}, validLead, { landingPageId: '' }), 'missing landingPageId'],
    [Object.assign({}, validLead, { email: 'not-an-email' }), 'invalid or missing email'],
    [Object.assign({}, validLead, { company: '' }), 'missing company'],
    [Object.assign({}, validLead, { firstName: '', lastName: '' }), 'missing name'],
    [Object.assign({}, validLead, { landingPageId: 'LP-UNKNOWN' }), 'unknown landing page']
  ];
  cases.forEach(([params, reason]) => {
    const res = h.post(params);
    assert.equal(res.result.status, 'REJECTED'); assert.equal(res.result.reason, reason);
  });
  assert.equal(h.tables.MKT_ACQ_LEADS.length + h.tables.MKT_ACQ_QA_LEADS.length, 0, 'rejected submissions must write nothing');
  console.log('reconciliation test 6 (honeypot + invalid submissions rejected, nothing written): PASS');
})();

// 7. Other API actions still require the API key (submitLead/health are the only public ones).
(function apiKeyStillEnforced() {
  const ctx = loadProject({ DGL_SPREADSHEET_ID: 'fixture-sheet', DGL_API_KEY: 'fixture-key' });
  ctx.handleMarketingV55Api_ = () => null; ctx.logError_ = () => {};
  const res = JSON.parse(ctx.doPost({ parameter: { action: 'dashboard', apiKey: 'wrong' } }).text);
  assert.equal(res.ok, false, 'non-public actions must still be rejected without the API key');
  assert.equal(JSON.parse(ctx.doGet({ parameter: { action: 'health' } }).text).result.status, 'online');
  console.log('reconciliation test 7 (API key still enforced for non-public actions; health public): PASS');
})();

// 8. Public-repo policy: no customer/employee emails, contact/job hash ids, Google file ids or
// secrets in any reconciled live file; former hardcoded values now come from Script Properties.
(function noPiiOrSecrets() {
  const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9.-]+)?/g;
  const ALLOWED = { 'backend/apps-script-v6/MarketingV6AcquisitionWordPress.gs': ['qa-synthetic@dglus.com'] };
  const reconciled = LIVE_ONLY_FILES.concat(['backend/apps-script-live-core/LiveCoreConfig.gs', 'backend/apps-script-v6/MarketingV6AcquisitionEngine.gs', 'backend/apps-script-v6/MarketingV6AcquisitionWordPress.gs']);
  const problems = [];
  reconciled.forEach(f => {
    const s = read(f);
    (s.match(EMAIL_RE) || []).forEach(m => { if (!(ALLOWED[f] || []).includes(m.toLowerCase())) problems.push(f + ': email ' + m.replace(/^[^@]+/, '***')); });
    if (/CON-[A-F0-9]{12}|CAMPANA-A-[A-F0-9]{12}/.test(s)) problems.push(f + ': contact/job hash id');
    if (/['"]1[A-Za-z0-9_-]{40,}['"]/.test(s)) problems.push(f + ': Google file/script id');
    if (/(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]{12,}['"]/i.test(s)) problems.push(f + ': hardcoded secret');
  });
  assert.deepEqual(problems, [], 'PII/secret policy violations:\n' + problems.join('\n'));
  const core = read('backend/apps-script-live-core/DGL_Core.gs');
  assert(/SPREADSHEET_ID: v6LiveCoreScriptProperty_\("DGL_SPREADSHEET_ID"\)/.test(core), 'DGL_CONFIG.SPREADSHEET_ID must come from Script Properties');
  console.log('reconciliation test 8 (no PII/ids/secrets in reconciled files; config via Script Properties): PASS');
})();

// 9. Moved-to-config lookups fail closed and preserve behavior when configured.
(function configLookupsFailClosed() {
  let ctx = loadProject({});
  assert.equal(vm.runInContext('DGL_CONFIG.SPREADSHEET_ID', ctx), '');
  assert.throws(() => ctx.getSpreadsheet_(), /SPREADSHEET_ID is empty/, 'missing DGL_SPREADSHEET_ID must fail closed');
  assert.equal(ctx.v6LiveCoreDiagSuspectEmailMatch_('anyone@example.test'), false, 'unset suspect fragment must never match every row');
  assert.deepEqual(Array.from(ctx.v6LiveCoreJsonListProperty_('AURA_DIAG_STRAY_JOB_IDS')), []);
  assert.equal(ctx.v6LiveCoreAmReportSender_(), '');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.runV6AuraLuisRecon())), { status: 'MISSING_CONFIG', property: 'AURA_AM_REPORT_SENDER' });
  ctx = loadProject({ DGL_SPREADSHEET_ID: 'sheet-1', AURA_DIAG_SUSPECT_EMAIL_FRAGMENT: 'held@', AURA_DIAG_STRAY_JOB_IDS: '["JOB:A","JOB:B"]', AURA_GMAIL_ALLOWED_SENDERS: 'am@example.test', AURA_GMAIL_SOURCE_MAILBOX: 'inbox@example.test' });
  assert.equal(vm.runInContext('DGL_CONFIG.SPREADSHEET_ID', ctx), 'sheet-1');
  assert.equal(ctx.v6LiveCoreDiagSuspectEmailMatch_(' Held@Example.test '), true);
  assert.equal(ctx.v6LiveCoreDiagSuspectEmailMatch_('other@example.test'), false);
  assert.deepEqual(Array.from(ctx.v6LiveCoreJsonListProperty_('AURA_DIAG_STRAY_JOB_IDS')), ['JOB:A', 'JOB:B']);
  assert.equal(ctx.v6LiveCoreAmReportSender_(), 'am@example.test', 'AM sender falls back to the first allowed Gmail sender');
  let query = '';
  ctx.GmailApp = { search: q => { query = q; return []; } };
  ctx.runV6AuraLuisRecon();
  assert.equal(query, 'from:am@example.test to:inbox@example.test', 'recon query rebuilt from the configured mailboxes');
  console.log('reconciliation test 9 (moved-to-config values fail closed when unset, behave identically when set): PASS');
})();

// 10. PR #9 governance and PR #11 Activation jobId fix preserved (main won over older live code).
(function governanceAndJobIdPreserved() {
  const campanaA = read('backend/apps-script-v6/MarketingV6AuraCampanaA.gs');
  assert(/v6CampaignStudioSetGate_\(CAMPANA_A_CAMPAIGN_ID_\)/.test(campanaA), 'PR #9 creative-set gate must remain in the Campaign A build');
  assert(/function v6AuraCampanaABuildQueue_\(\) \{return v6CampaignStudioLocked_/.test(campanaA), 'PR #9 locked build must remain');
  const ctx = loadProject({ DGL_SPREADSHEET_ID: 'fixture-sheet' });
  ['v6CampaignStudioSetGate_', 'v6CampaignStudioApproveSet_', 'v6CampaignStudioTestDraft_', 'v6CampaignStudioDurableSet_'].forEach(fn =>
    assert.equal(typeof ctx[fn], 'function', 'PR #9 ' + fn + ' must remain'));
  assert.equal(ctx.v6AuraCampanaAJobId_('Activation', 'CON-1', 1), 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:ACTIVATION:CON-1:1', 'PR #11 namespaced Activation jobId must remain');
  assert.equal(ctx.v6AuraCampanaAJobAlreadyBuilt_({ 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:CON-1:1': { playbookId: 'Retention' } }, 'Activation', 'CON-1', 1), false);
  assert.equal(ctx.v6AuraCampanaAJobAlreadyBuilt_({ 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:CON-1:1': { playbookId: 'Activation' } }, 'Activation', 'CON-1', 1), true);
  console.log('reconciliation test 10 (PR #9 governance + PR #11 Activation jobId fix preserved): PASS');
})();
