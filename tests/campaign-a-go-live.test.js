require('./helpers/aura-environment'); // Apps Script global scope: environment module always loaded
// Governed Campaign A GO LIVE (RUN_AURA_CAMPANA_A_GO_LIVE -> v6AuraCampanaAGoLive_): the only path
// from a validated DRY_RUN to real sends. All Gmail/Sheets services are fakes.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
const harness = { require, __dirname, console }; vm.createContext(harness);
vm.runInContext(fs.readFileSync(path.join(root, 'tests/v6-aura-campana-a.test.js'), 'utf8').split('// 1. Tab recognition:')[0], harness);
const ID = 'CMP-CAMPANA-A-HA-PRIORITARIA', FAMILY = 'Reactivation';

function setup(n) {
  const rows = [], accounts = [], opps = [];
  for (let k = 0; k < n; k++) {
    const acc = Math.floor(k / 4), name = 'Account ' + acc;
    if (k % 4 === 0) { accounts.push({ accountId: 'ACC-A' + acc, accountName: name }); opps.push(harness.gmailOpp('ACC-A' + acc, name, 'Owner')); }
    rows.push({ sourceRow: 5 + k, accountName: name, amOwner: 'Owner', contactName: 'Contact ' + k, email: 'c' + k + '@acct' + acc + '.example', country: ['Brazil', 'Mexico', 'United States'][k % 3], capturedAt: '2026-10-02T10:00:00.000Z' });
  }
  const history = Array.from({ length: 109 }, (_, i) => ({ jobId: 'JOB:' + ID + ':HS' + i + ':1', campaignId: ID, accountId: 'ACC-H', contactId: 'HS' + i, email: 'h' + i + '@hist.example', status: 'SENT', playbookId: 'Retention', sequenceStep: 1, htmlBody: '<p>Immutable ' + i + '</p>' }));
  const tables = { MKT_AURA_CAMPANA_A_SOURCE_ROWS: rows, MKT_ACCOUNTS: accounts, MKT_AURA_GMAIL_OPPORTUNITIES: opps, MKT_EMAIL_QUEUE: history.slice(), MKT_CAMPAIGNS: [{ campaignId: ID, campaignType: FAMILY, objective: FAMILY }] };
  const props = { AURA_SEND_MODE: 'DRY_RUN' };
  const ctx = harness.makeContext({ tables, props });
  ctx.PropertiesService = harness.fakePropertiesService(props);
  // A real successful REGENERATE DRY_RUN: build -> preflight -> dispatch (DRY_RUN) -> summary.
  const build = ctx.v6AuraCampanaABuildQueue_();
  const preflight = ctx.v6AuraCampanaAPreflight_();
  const dispatch = ctx.v6AuraCampanaADispatchBatch_();
  ctx.v6AuraCampanaAPersistRunSummary_('RUN-CAMPANA-A-TEST', { status: 'REGENERATE_COMPLETE', sendMode: 'DRY_RUN', build, preflight, dispatch, audit: {} });
  const historyBefore = JSON.stringify(history);
  return { ctx, tables, props, build, dispatch, historyBefore };
}
const campaignJobs = t => t.MKT_EMAIL_QUEUE.filter(j => j.campaignId === ID && j.playbookId === FAMILY);
const statusCounts = rows => rows.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {});
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('happy path: promotes exactly EXPECTED, sends the exact DRY_RUN HTML, always back to DRY_RUN, persisted log', () => {
  const s = setup(24);
  assert.equal(s.dispatch.dryRun, 24);
  const htmlBefore = Object.fromEntries(campaignJobs(s.tables).map(j => [j.jobId, [j.subject, j.htmlBody]]));
  const out = s.ctx.RUN_AURA_CAMPANA_A_GO_LIVE ? s.ctx.RUN_AURA_CAMPANA_A_GO_LIVE() : s.ctx.v6AuraCampanaAGoLive_();
  assert.equal(out.status, 'COMPLETE', out.abortReason);
  assert.deepEqual([out.expected, out.validated, out.promoted, out.preflightWouldSend, out.sent, out.failed], [24, 24, 24, 24, 24, 0]);
  assert.equal(out.sendModeAfter, 'DRY_RUN');
  assert.equal(s.props.AURA_SEND_MODE, 'DRY_RUN');
  assert.deepEqual(statusCounts(campaignJobs(s.tables)), { SENT: 24 });
  assert.equal(s.ctx.__sentEmails.length, 24);
  s.ctx.__sentEmails.forEach(e => {
    const job = campaignJobs(s.tables).find(j => j.email === e.to);
    assert.deepEqual([e.subject, e.options.htmlBody], htmlBefore[job.jobId], 'exact governed personalized HTML, never re-rendered');
  });
  assert(/:CREATIVE:/.test(out.creativeIds) && out.creativeVersions.length > 0);
  assert.equal(JSON.stringify(s.tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Retention')), s.historyBefore, 'historical SENT untouched');
  const log = s.tables.MKT_AURA_CAMPANA_A_GO_LIVE_LOG;
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].status, log[0].expected, log[0].promoted, log[0].sent, log[0].sendModeAfter], ['COMPLETE', 24, 24, 24, 'DRY_RUN']);
  // Rerun never resends: no DRY_RUN candidates left, the count check aborts.
  const again = s.ctx.v6AuraCampanaAGoLive_();
  assert.equal(again.status, 'ABORTED');
  assert(/VALIDATED_COUNT_MISMATCH:0!=24/.test(again.abortReason));
  assert.equal(s.ctx.__sentEmails.length, 24);
  assert.equal(s.props.AURA_SEND_MODE, 'DRY_RUN');
});

test('count mismatch aborts: nothing promoted, nothing sent, DRY_RUN kept', () => {
  const s = setup(12);
  const summary = s.tables.MKT_AURA_CAMPANA_A_RUN_SUMMARY[0]; summary.dispatchDryRun = 11;
  const before = JSON.stringify(s.tables.MKT_EMAIL_QUEUE);
  const out = s.ctx.v6AuraCampanaAGoLive_();
  assert.deepEqual([out.status, out.abortReason, out.promoted, out.sent], ['ABORTED', 'VALIDATED_COUNT_MISMATCH:12!=11', 0, 0]);
  assert.equal(JSON.stringify(s.tables.MKT_EMAIL_QUEUE), before);
  assert.equal(s.ctx.__sentEmails.length, 0);
  assert.equal(s.props.AURA_SEND_MODE, 'DRY_RUN');
});

test('a job whose HTML drifted from the approved creative fails validation and aborts the whole go-live', () => {
  const s = setup(8);
  const victim = campaignJobs(s.tables)[3];
  victim.htmlBody = victim.htmlBody.replace('DGL', 'DGL!');
  victim.recipientRenderedChecksum = s.ctx.v6AuraChecksum_(victim.htmlBody);
  victim.recipientContentChecksum = s.ctx.v6AuraJobContentChecksum_(victim.subject, victim.htmlBody);
  const out = s.ctx.v6AuraCampanaAGoLive_();
  assert.equal(out.status, 'ABORTED');
  assert.equal(out.invalidByReason.GOVERNED_HTML_DRIFT, 1);
  assert.equal(out.promoted, 0);
  assert.equal(s.ctx.__sentEmails.length, 0);
});

test('creative set not approved, unsuccessful DRY_RUN, wrong family or other PENDING work abort before promotion', () => {
  let s = setup(4);
  s.ctx.v6CampaignStudioSetGate_ = () => ({ blocked: true, error: 'CREATIVE_SET_INCOMPLETE' });
  assert.equal(s.ctx.v6AuraCampanaAGoLive_().abortReason, 'CREATIVE_SET_NOT_APPROVED');
  s = setup(4); s.tables.MKT_AURA_CAMPANA_A_RUN_SUMMARY[0].status = 'CREATIVE_SET_INCOMPLETE';
  assert(/LATEST_DRY_RUN_NOT_SUCCESSFUL/.test(s.ctx.v6AuraCampanaAGoLive_().abortReason));
  s = setup(4); s.tables.MKT_EMAIL_QUEUE.push({ jobId: 'OTHER-CAMPAIGN-PENDING', campaignId: 'CMP-OTHER', status: 'PENDING', playbookId: 'Retention' });
  assert(/PENDING_JOBS_ALREADY_IN_QUEUE/.test(s.ctx.v6AuraCampanaAGoLive_().abortReason));
  s = setup(4); campaignJobs(s.tables).forEach(j => { j.playbookId = 'Activation'; });
  assert(/VALIDATED_COUNT_MISMATCH:0!=4/.test(s.ctx.v6AuraCampanaAGoLive_().abortReason), 'old-family jobs are never candidates');
  [s].forEach(x => { assert.equal(x.ctx.__sentEmails.length, 0); assert.equal(x.props.AURA_SEND_MODE, 'DRY_RUN'); });
});

test('preflight not ready after promotion: promotion reverted to DRY_RUN, nothing sent, DRY_RUN kept', () => {
  const s = setup(6);
  s.ctx.v6AuraCampanaAPreflight_ = () => ({ status: 'PREFLIGHT_COMPLETE', totalPending: 6, wouldSend: 5, suppressedByPreflight: 1, readyForLive: true });
  const out = s.ctx.v6AuraCampanaAGoLive_();
  assert.equal(out.status, 'ABORTED');
  assert(/PREFLIGHT_NOT_READY:5\/6/.test(out.abortReason));
  assert.deepEqual(statusCounts(campaignJobs(s.tables)), { DRY_RUN: 6 }, 'promoted jobs reverted');
  assert.equal(s.ctx.__sentEmails.length, 0);
  assert.equal(s.props.AURA_SEND_MODE, 'DRY_RUN');
});

test('a recipient failure still returns AURA_SEND_MODE to DRY_RUN and is reported', () => {
  const s = setup(6);
  let n = 0; const realSend = s.ctx.GmailApp.sendEmail;
  s.ctx.GmailApp.sendEmail = function () { if (++n === 3) throw new Error('GMAIL_QUOTA'); return realSend.apply(this, arguments); };
  const out = s.ctx.v6AuraCampanaAGoLive_();
  assert.equal(out.status, 'COMPLETE_WITH_EXCEPTIONS');
  assert.deepEqual([out.sent, out.failed], [5, 1]);
  assert.equal(s.props.AURA_SEND_MODE, 'DRY_RUN');
  assert.equal(out.sendModeAfter, 'DRY_RUN');
});

test('the shared hourly dispatcher never picks Campaign A PENDING jobs', () => {
  const s = setup(3);
  campaignJobs(s.tables).forEach(j => { j.status = 'PENDING'; });
  s.ctx.auraEnableLiveSending();
  s.ctx.auraProcessEmailQueue(50);
  s.ctx.auraDisableLiveSending();
  assert.equal(s.ctx.__sentEmails.length, 0);
  assert.deepEqual(statusCounts(campaignJobs(s.tables)), { PENDING: 3 });
});

test('the public RUN_AURA_CAMPANA_A_GO_LIVE delegates only to the governed go-live', () => {
  const core = fs.readFileSync(path.join(root, 'backend/apps-script-live-core/DGL_Core.gs'), 'utf8');
  const body = core.slice(core.indexOf('function RUN_AURA_CAMPANA_A_GO_LIVE() {'), core.indexOf('function RUN_AURA_CAMPANA_A_GO_LIVE_TEST'));
  assert(/return v6AuraCampanaAGoLive_\(\);/.test(body));
  assert(!/simulate:\s*false/.test(body));
  const all = ['backend/apps-script-live-core', 'backend/apps-script-legacy-v55', 'backend/apps-script-v6'].flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.gs')).map(f => fs.readFileSync(path.join(root, d, f), 'utf8')));
  assert.equal(all.join('\n').match(/function RUN_AURA_CAMPANA_A_GO_LIVE\(\)/g).length, 1, 'exactly one public GO LIVE');
});

let passed = 0;
for (const [name, fn] of tests) { fn(); passed++; console.log('campaign-a go-live: ' + name + ': PASS'); }
console.log('campaign-a go-live: ALL ' + passed + ' PASS');
