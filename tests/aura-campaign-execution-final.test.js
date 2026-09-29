// AURA campaign execution (final) regression suite -- 2026-09-29.
// Campaign A: execution unit = CONTACT / EMAIL, source counts derived dynamically from the data rows
// (structural validation, no hardcoded count), account-level states never suppress an explicit source contact, frequency is
// contact-level, duplicate audit is family-aware, the premium V5 visual systems render the governed
// V6 creative, and ONE final governed HTML flows preview -> approval -> test draft -> DRY_RUN ->
// dispatch. All Gmail/Sheets services are fakes: zero real emails.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, 'backend/apps-script-v6', n + '.gs'), 'utf8');
const readJs = n => fs.readFileSync(path.join(root, 'assets/js', n + '.js'), 'utf8');
// Reuse the legacy suite's fake external services (same approach as campaign-studio-governed.test.js).
const harness = { require, __dirname, console }; vm.createContext(harness);
vm.runInContext(fs.readFileSync(path.join(root, 'tests/v6-aura-campana-a.test.js'), 'utf8').split('// 1. Tab recognition:')[0], harness);

const ID = 'CMP-CAMPANA-A-HA-PRIORITARIA';
const COUNTRIES = ['Brazil', 'Mexico', 'United States'];
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('aura-campaign-execution-final: ' + name + ': PASS'); }

// Real governance engines (contact exclusions, frequency) on top of the harness table fakes.
function loadRealGovernance(ctx) {
  const keep = { v6UpsertByKey_: ctx.v6UpsertByKey_, v6BatchUpsertByKey_: ctx.v6BatchUpsertByKey_, v6Rows_: ctx.v6Rows_ };
  vm.runInContext(read('MarketingV6FrequencyControl'), ctx);
  vm.runInContext(read('MarketingV6RecipientResolution'), ctx);
  Object.assign(ctx, keep);
}
// Real-shaped source mirroring the verified live tab: 224 contact rows (contact + email; 4
// contacts per company on the same domain, every 10th account has no AM owner and is rejected at
// account level by the report parser) plus 3 account-only rows with no contact and no email.
const ACCOUNT_ONLY = ['Mack Farms', 'North American Freight Forwarding Inc.', 'Ruhe Logistic SA de CV MExico'];
function sourceFixture(n) {
  const rows = [], accounts = [], opps = [];
  for (let k = 0; k < n; k++) {
    const acc = Math.floor(k / 4), name = 'Account ' + acc;
    if (k % 4 === 0) {
      accounts.push({ accountId: 'ACC-A' + acc, accountName: name });
      if (acc % 10 !== 0) opps.push(harness.gmailOpp('ACC-A' + acc, name, 'Owner ' + acc));
    }
    rows.push({ sourceRow: 5 + k, accountName: name, amOwner: acc % 10 === 0 ? '' : 'Owner ' + acc, contactName: 'Contact ' + k, email: 'c' + k + '@acct' + acc + '.example', country: COUNTRIES[k % 3], capturedAt: '2026-09-29T10:00:00.000Z' });
  }
  ACCOUNT_ONLY.forEach((name, i) => {
    accounts.push({ accountId: 'ACC-ONLY-' + i, accountName: name });
    opps.push(harness.gmailOpp('ACC-ONLY-' + i, name, 'Owner'));
    rows.push({ sourceRow: 5 + n + i, accountName: name, amOwner: 'Owner', contactName: '', email: '', country: 'Mexico', capturedAt: '2026-09-29T10:00:00.000Z' });
  });
  return { rows, accounts, opps };
}
// Contact-level hard safety and account-level states, all inside the source contacts.
function campaignATables(n) {
  const f = sourceFixture(n === undefined ? 224 : n);
  const cs = (k, extra) => Object.assign({ contactId: 'CS-' + k, accountId: 'ACC-A' + Math.floor(k / 4), firstName: 'Contact' + k, email: f.rows[k].email }, extra);
  if (n !== 0) f.rows[3].email = 'not-an-email';
  return {
    MKT_AURA_CAMPANA_A_SOURCE_ROWS: f.rows.concat([{ sourceRow: 999, accountName: 'Stale Co', contactName: 'Old', email: 'old@stale.example', capturedAt: '2026-09-01T00:00:00.000Z' }]),
    MKT_ACCOUNTS: f.accounts, MKT_AURA_GMAIL_OPPORTUNITIES: f.opps,
    MKT_CONTACTS_SECURE: n === 0 ? [] : [cs(0, { doNotContact: true }), cs(1, { emailStatus: 'BOUNCED' }), cs(2, { emailStatus: 'INVALID' }), cs(4), cs(8), cs(9)],
    MKT_EXCLUSIONS: [
      { accountId: 'ACC-A1', contactId: 'CS-4', reasonCode: 'CONTACT_OPT_OUT', active: true },
      { accountId: 'ACC-A3', contactId: '', reasonCode: 'SUPPRESSED', active: true },
      { accountId: 'ACC-A4', contactId: '', reasonCode: 'OWNER REQUIRED', active: true },
      { accountId: 'ACC-A6', contactId: '', reasonCode: 'CLOSED', active: true }
    ],
    MKT_ACCOUNT_PIPELINE: [
      { accountId: 'ACC-A5', currentStage: 'CLOSED / SUPPRESSED', nextAction: 'SUPPRESSED: OWNER REQUIRED' },
      { accountId: 'ACC-A7', currentStage: 'CAMPAIGN ACTIVE', campaignId: ID }
    ],
    MKT_FREQUENCY_LEDGER: [{ accountId: 'ACC-A2', contactId: 'CS-8', activeCampaignId: 'CMP-OTHER-QNB', lastCampaignType: 'QNB', lastMarketingTouchAt: new Date(Date.now() - 20 * 86400000).toISOString(), touches30d: 1 }],
    MKT_CAMPAIGNS: [{ campaignId: ID, campaignType: 'Activation', objective: 'Activation' }]
  };
}
function campaignAContext(tables, opts) {
  const props = Object.assign({ AURA_SEND_MODE: 'DRY_RUN' }, (opts || {}).props);
  const ctx = harness.makeContext(Object.assign({ tables, props }, opts));
  loadRealGovernance(ctx);
  return ctx;
}
const jobs = tables => (tables.MKT_EMAIL_QUEUE || []).filter(j => j.playbookId === 'Activation');
const BUILT = 218; // 224 email rows - DNC - hard bounce - 2 invalid - contact opt-out - contact frequency

// ---- Source & contact-level execution -------------------------------------------------------
test('source counts are derived dynamically: 227 data / 224 contact / 224 email / 3 unsendable', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  assert.equal(typeof ctx.v6AuraCampanaAExpectedSourceContacts_, 'undefined', 'no hardcoded expected contact count');
  assert.equal(typeof ctx.CAMPANA_A_EXPECTED_SOURCE_CONTACTS_, 'undefined');
  const gate = ctx.v6AuraCampanaASourceGate_();
  assert.deepEqual([gate.ok, gate.status, gate.SOURCE_DATA_ROWS, gate.SOURCE_CONTACT_ROWS, gate.SOURCE_EMAIL_ROWS, gate.UNSENDABLE_SOURCE_ROWS], [true, 'SOURCE_OK', 227, 224, 224, 3], 'stale rows of an older capture never count');
  assert.deepEqual(gate.missingContactEmail.map(r => r.accountName), ACCOUNT_ONLY);
  assert(gate.missingContactEmail.every(r => r.reason === 'SOURCE_MISSING_CONTACT_EMAIL'));
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.status, 'QUEUE_BUILD_COMPLETE');
  assert.deepEqual([build.sourceStats.SOURCE_DATA_ROWS, build.sourceStats.SOURCE_CONTACT_ROWS, build.sourceStats.SOURCE_EMAIL_ROWS, build.sourceStats.UNSENDABLE_SOURCE_ROWS], [227, 224, 224, 3]);
  assert.equal(build.candidates, 227, 'every source data row is exactly one candidate');
  assert.equal(build.recipients + Object.values(build.excludedByReason).reduce((a, b) => a + b, 0), 227);
  assert.deepEqual(JSON.parse(JSON.stringify(build.excludedByReason)), { SOURCE_MISSING_CONTACT_EMAIL: 3, DO_NOT_CONTACT: 1, HARD_BOUNCE: 1, EMAIL_INVALID: 2, EXCLUSION_CONTACT_OPT_OUT: 1, FREQUENCY_HIGHER_PRIORITY: 1 });
  assert.equal(build.built, BUILT);
  assert.equal(tables.MKT_AUDIENCES.length, 227, 'one audience record per source data row');
  assert.deepEqual(tables.MKT_AUDIENCES.filter(a => a.exclusionReason === 'SOURCE_MISSING_CONTACT_EMAIL').map(a => a.accountId).sort(), ['ACC-ONLY-0', 'ACC-ONLY-1', 'ACC-ONLY-2']);
  assert(!jobs(tables).some(j => /^ACC-ONLY-/.test(j.accountId)), 'no email is ever fabricated');
});

test('source validation is structural, never a hardcoded count', () => {
  const small = campaignATables(40), ctxSmall = campaignAContext(small);
  const b = ctxSmall.v6AuraCampanaABuildQueue_();
  assert.equal(b.status, 'QUEUE_BUILD_COMPLETE', 'any row count is valid when the structure is valid');
  assert.deepEqual([b.sourceStats.SOURCE_DATA_ROWS, b.sourceStats.SOURCE_EMAIL_ROWS, b.sourceStats.UNSENDABLE_SOURCE_ROWS], [43, 40, 3]);
  const broken = campaignATables();
  broken.MKT_AURA_CAMPANA_A_SOURCE_ROWS[10].accountName = '';
  const ctxBroken = campaignAContext(broken);
  const bb = ctxBroken.v6AuraCampanaABuildQueue_();
  assert.equal(bb.status, 'SOURCE_STRUCTURE_INVALID');
  assert.equal((broken.MKT_EMAIL_QUEUE || []).length, 0);
  assert.equal(ctxBroken.v6AuraCampanaADispatchBatch_().status, 'SOURCE_STRUCTURE_INVALID');
  assert.equal(ctxBroken.v6AuraCampanaAAudit_().clean, false);
  assert.equal(campaignAContext(campaignATables(0)).v6AuraCampanaASourceGate_().status, 'SOURCE_NO_EMAILS');
  assert.equal(campaignAContext({ MKT_AURA_CAMPANA_A_SOURCE_ROWS: [] }).v6AuraCampanaASourceGate_().status, 'SOURCE_EMPTY');
});

test('every distinct valid email is one independent recipient', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  // Same email listed under two different accounts: one recipient, the repeat is reported.
  tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS[50].email = tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS[60].email;
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.candidates, 227);
  assert.equal(build.excludedByReason.DUPLICATE_SOURCE_CONTACT, 1);
  const emails = jobs(tables).map(j => j.email);
  assert.equal(new Set(emails).size, emails.length);
  assert.equal(emails.length, BUILT - 1);
});

test('same-account contacts stay independent recipients (no collapse by account/domain/company)', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_();
  const acc10 = jobs(tables).filter(j => j.accountId === 'ACC-A10');
  assert.equal(acc10.length, 4);
  assert.equal(new Set(acc10.map(j => j.contactId)).size, 4);
  assert.equal(new Set(acc10.map(j => j.email)).size, 4);
  assert.equal(new Set(jobs(tables).map(j => j.jobId)).size, jobs(tables).length);
});

test('CLOSED account does not automatically suppress an explicit source contact', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_();
  const closedPipeline = jobs(tables).filter(j => j.accountId === 'ACC-A5');
  assert.equal(closedPipeline.length, 4);
  closedPipeline.forEach(j => { assert.equal(j.status, 'PENDING'); assert.equal(j.accountStatusOverride, 'CLOSED / SUPPRESSED'); });
  assert.equal(jobs(tables).filter(j => j.accountId === 'ACC-A6' && j.status === 'PENDING').length, 4, 'account-wide CLOSED exclusion is ignored');
  assert(jobs(tables).filter(j => j.accountId === 'ACC-A7').every(j => j.status === 'PENDING'), 'CAMPAIGN ACTIVE is an account marketing state, not a contact stop');
  ctx.v6AuraCampanaAPreflight_();
  const dispatch = ctx.v6AuraCampanaADispatchBatch_();
  assert.equal(dispatch.stopped, 0);
  assert(jobs(tables).filter(j => j.accountId === 'ACC-A5').every(j => j.status === 'DRY_RUN'));
});

test('SUPPRESSED account does not automatically suppress an explicit source contact', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_();
  assert.equal(jobs(tables).filter(j => j.accountId === 'ACC-A3' && j.status === 'PENDING').length, 4);
  assert.equal(ctx.v6AuraCampanaAContactExclusion_(tables.MKT_EXCLUSIONS, 'ACC-A3', 'X', 'x@acct3.example', new Date()), null);
});

test('OWNER REQUIRED account does not automatically suppress an explicit source contact', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_();
  // ACC-A0/10/20 have no AM owner: rejected by the account-level report parser, still in scope.
  [0, 10, 20].forEach(a => assert(!tables.MKT_AURA_GMAIL_OPPORTUNITIES.some(o => o.accountId === 'ACC-A' + a)));
  assert.equal(jobs(tables).filter(j => j.accountId === 'ACC-A10').length, 4);
  assert.equal(jobs(tables).filter(j => j.accountId === 'ACC-A4' && j.status === 'PENDING').length, 4, 'account-wide OWNER REQUIRED exclusion is ignored');
});

test('frequency control is contact-level', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.excludedByReason.FREQUENCY_HIGHER_PRIORITY, 1);
  const acc2 = jobs(tables).filter(j => j.accountId === 'ACC-A2').map(j => j.contactId).sort();
  assert.deepEqual(acc2, ['CAMPANA-A-' + ctx.v6HashKey_('ACC-A2|c10@acct2.example'), 'CAMPANA-A-' + ctx.v6HashKey_('ACC-A2|c11@acct2.example'), 'CS-9'].sort(), 'only CS-8 is blocked; its colleagues are not');
  // Shared engine: contact-scoped gate ignores other contacts' active campaigns; account scope unchanged.
  const ledger = [{ accountId: 'ACC-X', contactId: 'OTHER', activeCampaignId: 'CMP-OTHER', lastCampaignType: 'QNB', lastMarketingTouchAt: new Date().toISOString(), touches30d: 3 }];
  assert.equal(ctx.v6FrequencyStatus_({ accountId: 'ACC-X', contactId: 'ME', campaignId: ID, campaignType: 'Activation' }, ledger).status, 'CLEAR');
  assert.notEqual(ctx.v6FrequencyStatus_({ accountId: 'ACC-X', campaignId: ID, campaignType: 'Activation' }, ledger).status, 'CLEAR');
  assert.equal(ctx.v6FrequencyStatus_({ accountId: 'ACC-X', contactId: 'OTHER', campaignId: ID, campaignType: 'Activation' }, ledger).eligible, false);
});

test('true DNC blocked', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.excludedByReason.DO_NOT_CONTACT, 1);
  assert(!jobs(tables).some(j => j.contactId === 'CS-0'));
  // An account-wide DNC exclusion is NOT an account status: it still blocks.
  assert(ctx.v6AuraCampanaAContactExclusion_([{ accountId: 'ACC-A1', reasonCode: 'DNC', active: true }], 'ACC-A1', 'CS-4', 'c4@acct1.example', new Date()));
  // Email-keyed contact exclusion blocks that email only.
  const byEmail = [{ email: 'c5@acct1.example', reasonCode: 'UNSUBSCRIBED', active: true }];
  assert(ctx.v6AuraCampanaAContactExclusion_(byEmail, 'ACC-A1', 'Y', 'c5@acct1.example', new Date()));
  assert.equal(ctx.v6AuraCampanaAContactExclusion_(byEmail, 'ACC-A1', 'Z', 'c6@acct1.example', new Date()), null);
});

test('invalid email blocked', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.excludedByReason.EMAIL_INVALID, 2);
  assert(!jobs(tables).some(j => j.contactId === 'CS-2' || j.email === 'not-an-email'));
});

test('hard bounce blocked', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_();
  assert(!jobs(tables).some(j => j.contactId === 'CS-1'));
  assert.equal(tables.MKT_AUDIENCES.filter(a => a.exclusionReason === 'HARD_BOUNCE').length, 1);
});

test('duplicate source rows for the same contact are excluded, never double-queued', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS[20].email = tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS[21].email;
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.candidates, 227);
  assert.equal(build.excludedByReason.DUPLICATE_SOURCE_CONTACT, 1);
  assert.equal(tables.MKT_AUDIENCES.length, 227);
});

// ---- Duplicate audit / history --------------------------------------------------------------
function historicalQueue(contactIds) {
  const rows = [];
  for (let i = 0; i < 109; i++) rows.push({ jobId: 'JOB:' + ID + ':' + (contactIds[i] || 'HS' + i) + ':1', campaignId: ID, accountId: 'ACC-A' + Math.floor(i / 4), contactId: contactIds[i] || 'HS' + i, status: 'SENT', playbookId: 'Retention', sequenceStep: 1, subject: 'Historical ' + i, htmlBody: '<p>Immutable ' + i + '</p>' });
  return rows;
}
test('cross-family Retention/Activation is not duplicate; same-family duplicate detection still works', () => {
  const ctx = campaignAContext({});
  const retention = { jobId: 'J-R', campaignId: ID, accountId: 'A', contactId: 'C', sequenceStep: 1, playbookId: 'Retention', status: 'SENT' };
  const activation = Object.assign({}, retention, { jobId: 'J-A', playbookId: 'Activation', status: 'PENDING' });
  assert.notEqual(ctx.v6AuraJobDuplicateKey_(retention), ctx.v6AuraJobDuplicateKey_(activation));
  assert.equal(ctx.v6AuraJobDuplicateKey_(activation), ctx.v6AuraJobDuplicateKey_(Object.assign({}, activation, { jobId: 'J-A2', playbookId: 'ACTIVATION' })));
  assert.equal(ctx.v6AuraNormalizeCampaignFamily_('Quoted Not Booked'), 'QUOTED_NOT_BOOKED');
  assert.equal(ctx.v6AuraNormalizeCampaignFamily_('Cross-Sell'), 'CROSS_SELL');
  assert.equal(ctx.v6AuraNormalizeCampaignFamily_('Something else'), '');
  const tables = { MKT_EMAIL_QUEUE: [retention, activation] };
  const audit = campaignAContext(tables).v6AuraEmailQueueAudit_(r => r.campaignId === ID);
  assert.equal(audit.duplicateJobKeys, 0);
  const dupTables = { MKT_EMAIL_QUEUE: [activation, Object.assign({}, activation, { jobId: 'J-A2' })] };
  assert.equal(campaignAContext(dupTables).v6AuraEmailQueueAudit_(r => r.campaignId === ID).duplicateJobKeys, 1);
  // Dispatch: historical Retention SENT does not skip the Activation job; a SENT Activation does.
  const tablesB = campaignATables(), ctxB = campaignAContext(tablesB);
  ctxB.v6AuraCampanaABuildQueue_();
  const target = jobs(tablesB)[0];
  tablesB.MKT_EMAIL_QUEUE.push(Object.assign({}, target, { jobId: 'JOB:' + ID + ':' + target.contactId + ':1', playbookId: 'Retention', status: 'SENT' }));
  const second = jobs(tablesB)[1];
  tablesB.MKT_EMAIL_QUEUE.push(Object.assign({}, second, { jobId: 'JOB:OTHER-ACTIVATION-ID', status: 'SENT' }));
  ctxB.v6AuraCampanaADispatchBatch_();
  assert.equal(tablesB.MKT_EMAIL_QUEUE.find(j => j.jobId === target.jobId).status, 'DRY_RUN');
  const skipped = tablesB.MKT_EMAIL_QUEUE.find(j => j.jobId === second.jobId);
  assert.deepEqual([skipped.status, skipped.error], ['SKIPPED', 'ALREADY_SENT_DUPLICATE']);
});

test('historical 109 SENT preserved byte-for-byte and repeated DRY_RUN build is idempotent', () => {
  const tables = campaignATables();
  const firstIds = tables.MKT_CONTACTS_SECURE.map(c => c.contactId);
  tables.MKT_EMAIL_QUEUE = historicalQueue(firstIds);
  const history = JSON.stringify(tables.MKT_EMAIL_QUEUE);
  const ctx = campaignAContext(tables);
  const run = () => { const b = ctx.v6AuraCampanaABuildQueue_(); ctx.v6AuraCampanaAPreflight_(); ctx.v6AuraCampanaADispatchBatch_(); return b; };
  const first = run();
  assert.equal(first.built, BUILT);
  const afterFirst = JSON.stringify(tables.MKT_EMAIL_QUEUE);
  const second = run();
  assert.equal(second.built, 0);
  assert.equal(second.skippedExisting, BUILT);
  assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE), afterFirst, 'a repeated DRY_RUN changes nothing');
  assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.slice(0, 109)), history, 'historical 109 SENT rows unchanged');
  assert.equal(tables.MKT_EMAIL_QUEUE.filter(j => j.status === 'SENT').length, 109);
  assert.equal(ctx.__sentEmails.length, 0);
});

// ---- Frontend: copy isolation, premium visual systems, intake --------------------------------
function browser() {
  const window = { location: { hash: '#/campaign-studio' }, addEventListener() {}, DGL_MARKETING_BACKEND_ADAPTER_V55: { revokeApprovedCreative: async () => {} } };
  const doc = { getElementById: () => null, addEventListener() {}, documentElement: {}, querySelector: () => null, querySelectorAll: () => [] };
  const b = { window, document: doc, URLSearchParams, MutationObserver: class { observe() {} }, sessionStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout, console };
  window.document = doc;
  vm.createContext(b);
  ['creative-library-v5', 'creative-render-v5', 'copy-engine-v5', 'copy-experience-v1', 'campaign-studio-v6'].forEach(n => vm.runInContext(readJs(n), b, { filename: n + '.js' }));
  return window;
}
const W = browser(), Lib = W.DGL_CREATIVE_LIBRARY_V5, Render = W.DGL_CREATIVE_RENDER_V5, Studio = W.DGL_CAMPAIGN_STUDIO_V6, Copy = W.DGL_COPY_ENGINE_V5;
const LANGS = ['ES', 'EN', 'PT'];
const ctxFor = (objective, extra) => Object.assign({ campaignId: 'CMP-' + objective, campaignName: objective, objective, campaignType: objective, service: objective === 'Activation' ? 'Multiservicio' : 'FTL', messageAngle: Lib.OBJECTIVES[Lib.normalizeObjective(objective)].defaultAngle, requiredLanguages: LANGS, approvedCreativeVariants: {}, audienceResolved: true }, extra);

test('Activation never inherits Reactivation copy (intake names, all languages, fail-closed)', () => {
  for (const objective of ['Activation', 'ACTIVATION', 'activation']) for (const language of LANGS) {
    const c = Copy.generate({ objective, service: 'Multiservicio', angle: 'Current Movement', language, ctaIntent: 'Send Requirement' });
    const all = JSON.stringify(c);
    assert(!/Multiservicio|\{\{service\}\}|LET'S MOVE AGAIN|previously had the opportunity|Previous Relationship/i.test(all), objective + ' ' + language);
    assert.equal(c.cta, { ES: 'ENVIAR REQUERIMIENTO', EN: 'SEND A REQUIREMENT', PT: 'ENVIAR REQUERIMENTO' }[language]);
  }
  const reactivation = Copy.generate({ objective: 'REACTIVATION', service: 'FTL', angle: 'Previous Relationship', language: 'EN' });
  assert.notEqual(reactivation.subjectA, Copy.generate({ objective: 'Activation', language: 'EN' }).subjectA);
  // If the Activation table is unavailable the wrapper throws instead of falling through.
  const w2 = browser(); const lib = w2.DGL_CREATIVE_LIBRARY_V5; const svc = lib.SERVICES; lib.SERVICES = null;
  assert.throws(() => w2.DGL_COPY_ENGINE_V5.generate({ objective: 'Activation', language: 'EN' }), /ACTIVATION_COPY_UNAVAILABLE/);
  lib.SERVICES = svc;
  // Governed backend gate still rejects Reactivation/Retention vocabulary for Campaign A.
  const ctx = campaignAContext({});
  assert.equal(ctx.v6CampaignStudioVariantValid_({ campaignId: ID, status: 'APPROVED', logoUrl: ctx.V6_STUDIO_LOGO_, htmlBody: '<img src="' + ctx.V6_STUDIO_LOGO_ + '">Multiservicio', subject: 'x' }), false);
});

test('premium V5 visual systems work in governed V6 (no generic renderer regression)', () => {
  const signatures = { 'editorial-white': 'width="58%"', 'split-hero': 'width="52%"', 'route-intelligence': 'ROUTE INTELLIGENCE', 'service-architecture': 'border-top:3px solid #77B82A', 'case-proof': 'CASE / PROOF', 'executive-minimal': 'DIRECT COMMERCIAL NOTE' };
  Object.keys(Lib.CREATIVE_SYSTEMS).forEach(id => assert(signatures[id], 'every canonical system is covered: ' + id));
  for (const objective of ['Activation', 'Retention', 'Reactivation']) {
    const m = Studio.createModel(ctxFor(objective));
    for (const id of Object.keys(signatures)) {
      m.layout = id;
      for (const language of LANGS) {
        const html = Studio.emailHtml(m, language);
        assert(html.includes(signatures[id]), objective + ' ' + id + ' ' + language);
        assert(html.includes('border-radius'), 'premium container');
        assert(html.includes('src="' + Render.OFFICIAL_LOGO + '"'));
        // case-proof is the canonical V5 proof layout: its NEXT STEP is text, not a button (unchanged design).
        if (id !== 'case-proof') assert(/href="mailto:info@dglus\.com\?subject=/.test(html), objective + ' ' + id + ' CTA');
        assert(!/(src|href)="assets\//.test(html), 'absolute assets only');
        assert(!html.includes('Su aliado de transporte terrestre.') && !html.includes('padding:24px 36px;border-bottom:4px solid #77B82A'), 'old generic V6 renderer is gone');
        if (id !== 'executive-minimal') assert(/src="https:\/\/dglmarketing2026\.github\.io\/dgl-marketing-execution-os\/assets\/creative\//.test(html), 'photographic hero asset');
        if (objective === 'Activation') assert(!/Multiservicio|\{\{service\}\}/.test(html), 'Activation premium creative stays service-neutral: ' + id);
      }
    }
  }
  // The V6 creative is the shared renderer's output -- one renderer, not a second design.
  const m = Studio.createModel(ctxFor('Activation'));
  const c = m.variants.ES.copy;
  assert.equal(Studio.emailHtml(m, 'ES'), Render.render({ creativeSystem: 'editorial-white', objective: 'Activation', service: 'Multiservicio', angle: 'Current Movement', lane: '', heroUrl: '', logoUrl: Render.OFFICIAL_LOGO, serviceDisplay: 'DGL Ground Solutions' }, c, { ctaSubject: 'Requerimiento terrestre' }));
});

test('automatic premium layout selection and the single intake question', () => {
  const expected = { Activation: 'editorial-white', Retention: 'editorial-white', Reactivation: 'editorial-white', 'Quoted Not Booked': 'executive-minimal', 'Cross-Sell': 'service-architecture' };
  for (const [objective, system] of Object.entries(expected)) {
    assert.equal(Studio.createModel(ctxFor(objective)).layout, system, objective);
    assert.equal(Render.systemFor(objective), system);
  }
  assert.equal(Studio.createModel(ctxFor('Quoted Not Booked', { objective: 'QUOTED_NOT_BOOKED' })).layout, 'executive-minimal');
  assert.equal(Studio.INTAKE_QUESTION, 'WHAT TYPE OF CAMPAIGN IS THIS?');
  assert.deepEqual(Array.from(Studio.INTAKE_OPTIONS), ['ACTIVATION', 'RETENTION', 'REACTIVATION', 'QUOTED_NOT_BOOKED', 'CROSS_SELL']);
  const ctx = campaignAContext({});
  const backendSystems = { ACTIVATION: 'editorial-white', RETENTION: 'editorial-white', REACTIVATION: 'editorial-white', QUOTED_NOT_BOOKED: 'executive-minimal', CROSS_SELL: 'service-architecture' };
  for (const [type, system] of Object.entries(backendSystems)) {
    const plan = ctx.v6AuraCampaignIntake_({ campaignType: type.toLowerCase().replace(/_/g, ' ') });
    assert.equal(plan.campaignType, type);
    assert.deepEqual(Array.from(plan.manualQuestions), ['WHAT TYPE OF CAMPAIGN IS THIS?'], 'the ONLY manual campaign-level question');
    assert.equal(plan.automatic.creativeSystem, system);
    assert.equal(plan.automatic.creativeSystem, Render.systemFor(plan.automatic.objective), 'backend and frontend agree');
    assert.deepEqual([plan.automatic.language, plan.automatic.executionUnit, plan.automatic.layout, plan.automatic.copy, plan.automatic.cta], ['AUTO_PER_CONTACT', 'CONTACT_EMAIL', 'AUTO', 'FAMILY_ONLY', 'AUTO']);
    assert.equal(plan.governance.campaignStudio, 'PRESENT');
  }
  assert.throws(() => ctx.v6AuraCampaignIntake_({}), /CAMPAIGN_TYPE_REQUIRED/);
  assert.throws(() => ctx.v6AuraCampaignIntake_({ campaignType: 'Nurture blast' }), /CAMPAIGN_TYPE_INVALID/);
});

test('automatic language per contact (EN / ES / PT)', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  const build = ctx.v6AuraCampanaABuildQueue_();
  jobs(tables).forEach(j => {
    const row = tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS.find(r => r.sourceRow === Number(j.sourceRow));
    assert.equal(j.preferredLanguage, { Brazil: 'PT', Mexico: 'ES', 'United States': 'EN' }[row.country]);
    assert.equal(j.languageSource, 'CAMPANA_A_TAB_COUNTRY');
  });
  assert.equal(build.byLanguage.ES + build.byLanguage.EN + build.byLanguage.PT, BUILT);
  assert(build.byLanguage.ES > 0 && build.byLanguage.EN > 0 && build.byLanguage.PT > 0);
});

// ---- ONE final governed HTML ----------------------------------------------------------------
test('PREVIEW = GOVERNED = TEST DRAFT = DRY_RUN = DISPATCH HTML (checksums fail closed)', () => {
  const tables = campaignATables();
  const ctx = campaignAContext(tables, { noDefaultCreative: true });
  const png = Array.from(fs.readFileSync(path.join(root, 'assets/brand/dgl-logo-white.png')));
  ctx.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getBlob: () => ({ getBytes: () => png }) }) };
  const model = Studio.createModel(ctxFor('Activation', { campaignId: ID }));
  const preview = {};
  for (const language of LANGS) {
    const v = model.variants[language];
    preview[language] = Studio.emailHtml(model, language);
    const record = ctx.v6AuraApproveCreative_({ campaignId: ID, language, subject: v.copy.subjectA, preheader: v.copy.preheader, htmlBody: preview[language], textBody: [v.copy.headline, v.copy.body, v.copy.body2, v.copy.cta].join('\n\n'), templateId: model.layout, logoUrl: Render.OFFICIAL_LOGO, approvedBy: 'Marketing', creativeCopy: v.copy });
    const stored = tables.MKT_CAMPAIGN_CREATIVES.find(r => r.creativeId === record.creativeId);
    assert.equal(stored.htmlBody, preview[language], 'GOVERNED == PREVIEW (stored verbatim)');
    assert.equal(stored.templateId, 'editorial-white');
    ctx.GmailApp.createDraft = (to, subject, text, opts) => ({ getId: () => 'DRAFT-' + language, getMessage: () => ({ getBody: () => opts.htmlBody }) });
    const draft = ctx.v6AuraVerifyAndCreateTestDraft_({ campaignId: ID, draft: { language, subject: stored.subject, htmlBody: preview[language] } });
    assert.equal(draft.match, true, 'TEST DRAFT == GOVERNED');
  }
  ctx.v6AuraCampanaABuildQueue_();
  const built = jobs(tables);
  assert.equal(built.length, BUILT);
  for (const j of built) {
    const creative = tables.MKT_CAMPAIGN_CREATIVES.find(c => c.creativeId === j.creativeId);
    assert.equal(creative.htmlBody, preview[j.preferredLanguage]);
    assert.equal(j.htmlBody, ctx.v6AuraCreativePersonalize_(preview[j.preferredLanguage], { firstName: j.firstName, company: j.company, service: j.service }), 'DRY_RUN job == GOVERNED + token merge only');
    assert.equal(j.renderContract, 'GOVERNED_TOKEN_MERGE_V1');
    assert(!/Multiservicio|\{\{\w+\}\}/.test(j.htmlBody + j.subject));
  }
  const before = JSON.stringify(built.map(j => [j.jobId, j.htmlBody, j.subject]));
  ctx.v6AuraCampanaADispatchBatch_();
  assert.equal(JSON.stringify(jobs(tables).map(j => [j.jobId, j.htmlBody, j.subject])), before, 'DRY_RUN never re-renders');
  assert(jobs(tables).every(j => j.status === 'DRY_RUN'));
  // LIVE dispatch (fake transport) sends exactly the governed bytes.
  jobs(tables).slice(0, 3).forEach(j => { j.status = 'PENDING'; });
  ctx.auraEnableLiveSending();
  ctx.v6AuraCampanaADispatchBatch_();
  assert.equal(ctx.__sentEmails.length, 3);
  ctx.__sentEmails.forEach(e => { const j = jobs(tables).find(x => x.email === e.to); assert.equal(e.options.htmlBody, j.htmlBody); assert.equal(e.subject, j.subject); });
  ctx.auraDisableLiveSending();
  // Downstream redesign with consistently updated job checksums is still caught (fail closed).
  const victim = jobs(tables)[10];
  victim.status = 'PENDING';
  victim.htmlBody = victim.htmlBody.replace('border-radius:16px', 'border-radius:0');
  victim.recipientRenderedChecksum = ctx.v6AuraChecksum_(victim.htmlBody);
  victim.recipientContentChecksum = ctx.v6AuraJobContentChecksum_(victim.subject, victim.htmlBody);
  ctx.v6AuraCampanaADispatchBatch_();
  const blocked = tables.MKT_EMAIL_QUEUE.find(j => j.jobId === victim.jobId);
  assert.deepEqual([blocked.status, blocked.error], ['BLOCKED', 'GOVERNED_HTML_DRIFT']);
  const legacy = jobs(tables)[11];
  legacy.status = 'PENDING'; legacy.renderContract = '';
  ctx.v6AuraCampanaADispatchBatch_();
  const legacyAfter = tables.MKT_EMAIL_QUEUE.find(j => j.jobId === legacy.jobId);
  assert.deepEqual([legacyAfter.status, legacyAfter.error], ['BLOCKED', 'GOVERNED_RENDER_CONTRACT_MISSING']);
  ctx.__sentEmails.length = 0;
});

test('real emails sent by this suite: 0 (fake transport only, DRY_RUN default)', () => {
  const tables = campaignATables(), ctx = campaignAContext(tables);
  ctx.v6AuraCampanaABuildQueue_(); ctx.v6AuraCampanaADispatchBatch_();
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN');
  assert.equal(ctx.__sentEmails.length, 0);
});

console.log('aura-campaign-execution-final: ALL ' + passed + ' PASS');
