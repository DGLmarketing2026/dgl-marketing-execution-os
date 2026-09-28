// Regression: Campaign A (CMP-CAMPANA-A-HA-PRIORITARIA) changed family from historical Retention to
// Activation under the SAME campaignId. The real DRY_RUN built 0 of 140 eligible recipients because
// every Activation jobId (JOB:<campaignId>:<contactId>:1) collided with a historical Retention row.
const assert = require('assert'), fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.resolve(__dirname, '..');
// Reuse only the legacy suite's fake external services (same approach as campaign-studio-governed.test.js).
const harness = { require, __dirname, console }; vm.createContext(harness);
vm.runInContext(fs.readFileSync(path.join(root, 'tests/v6-aura-campana-a.test.js'), 'utf8').split('// 1. Tab recognition:')[0], harness);

const ID = 'CMP-CAMPANA-A-HA-PRIORITARIA', LANGS = ['ES', 'EN', 'PT'];
const legacyId = contactId => 'JOB:' + ID + ':' + contactId + ':1';
const activationId = contactId => 'JOB:' + ID + ':ACTIVATION:' + contactId + ':1';

// Real-shaped historical queue: 109 SENT + 152 STOPPED + 1 FAILED, all Retention, all keyed by the
// legacy id format -- and the three current Activation recipients (C0..C2) are among the SENT rows.
function historicalQueue() {
  const rows = [];
  const push = (contactId, status) => rows.push({ jobId: legacyId(contactId), campaignId: ID, accountId: 'ACC-1', contactId, status, playbookId: 'Retention', sequenceStep: 1, subject: 'Historical ' + contactId, htmlBody: '<p>Immutable ' + contactId + '</p>' });
  for (let i = 0; i < 109; i++) push(i < 3 ? 'C' + i : 'HS' + i, 'SENT');
  for (let i = 0; i < 152; i++) push('HT' + i, 'STOPPED');
  push('HF0', 'FAILED');
  return rows;
}
function fixtureTables(extraQueue) {
  return {
    MKT_AURA_GMAIL_OPPORTUNITIES: [harness.gmailOpp('ACC-1', 'Fixture Company', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Fixture Company' }],
    MKT_CONTACTS_SECURE: LANGS.map((l, i) => ({ contactId: 'C' + i, accountId: 'ACC-1', firstName: 'Person', email: 'private' + i + '@example.test', preferredLanguage: l })),
    MKT_EMAIL_QUEUE: historicalQueue().concat(extraQueue || [])
  };
}
const PROPS = () => ({ AURA_SEND_MODE: 'DRY_RUN', AURA_REPLY_TO: 'info@dglus.com' });
const historical = tables => JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Retention'));
const statusCounts = rows => rows.reduce((m, r) => (m[r.status] = (m[r.status] || 0) + 1, m), {});

// 1. Retention + Activation coexist: historical Retention ids no longer block Activation.
(function coexistenceTest() {
  const tables = fixtureTables(), before = historical(tables), props = PROPS();
  const ctx = harness.makeContext({ tables, props });
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.status, 'QUEUE_BUILD_COMPLETE');
  assert.equal(build.recipients, 3);
  assert.equal(build.built, 3, 'Activation must no longer be skipped because of historical Retention jobIds');
  assert.equal(build.skippedExisting, 0);
  assert.equal(build.crossFamilyHistoricalIgnored, 3);
  const activation = tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Activation');
  assert.deepEqual(activation.map(j => j.jobId).sort(), ['C0', 'C1', 'C2'].map(activationId));
  assert.deepEqual(activation.map(j => j.preferredLanguage).sort(), ['EN', 'ES', 'PT']);
  assert.equal(historical(tables), before, 'historical Retention rows must be byte-for-byte unchanged');
  assert.deepEqual(statusCounts(tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Retention')), { SENT: 109, STOPPED: 152, FAILED: 1 });
  assert.equal(ctx.__sentEmails.length, 0);
  assert.equal(props.AURA_SEND_MODE, 'DRY_RUN');
  console.log('campana-a jobid test 1 (Retention + Activation coexist; 109 SENT/152 STOPPED/1 FAILED untouched): PASS');
})();

// 2. Repeated Activation builds are idempotent: deterministic ids, no duplicate jobs.
(function idempotencyTest() {
  const tables = fixtureTables(), before = historical(tables);
  const ctx = harness.makeContext({ tables, props: PROPS() });
  ctx.v6AuraCampanaABuildQueue_();
  const afterFirst = JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Activation').map(j => j.jobId).sort());
  const length = tables.MKT_EMAIL_QUEUE.length;
  const second = ctx.v6AuraCampanaABuildQueue_();
  const third = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(second.built, 0); assert.equal(second.skippedExisting, 3);
  assert.equal(third.built, 0); assert.equal(third.skippedExisting, 3);
  assert.equal(tables.MKT_EMAIL_QUEUE.length, length, 'repeated builds must never add rows');
  assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Activation').map(j => j.jobId).sort()), afterFirst);
  assert.equal(new Set(tables.MKT_EMAIL_QUEUE.map(j => j.jobId)).size, tables.MKT_EMAIL_QUEUE.length, 'jobIds stay unique');
  assert.equal(historical(tables), before);
  assert.equal(ctx.v6AuraCampanaAJobId_('Activation', 'C0', 1), activationId('C0'));
  assert.equal(ctx.v6AuraCampanaAJobId_('Activation', 'C0', 1), ctx.v6AuraCampanaAJobId_('Activation', 'C0', 1));
  assert.notEqual(ctx.v6AuraCampanaAJobId_('Activation', 'C0', 1), ctx.v6AuraEmailJobId_(ID, 'C0', 1));
  console.log('campana-a jobid test 2 (repeated Activation builds are idempotent, never duplicate): PASS');
})();

// 3. A pre-namespacing Activation job (legacy id, playbookId Activation) still counts as built.
(function legacyActivationHonoredTest() {
  const legacyActivation = { jobId: legacyId('C3'), campaignId: ID, accountId: 'ACC-1', contactId: 'C3', status: 'PENDING', playbookId: 'Activation', sequenceStep: 1 };
  const tables = fixtureTables([legacyActivation]);
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'C3', accountId: 'ACC-1', firstName: 'Person', email: 'private3@example.test', preferredLanguage: 'EN' });
  const ctx = harness.makeContext({ tables, props: PROPS() });
  const build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 3);
  assert.equal(build.skippedExisting, 1, 'a legacy-format Activation job must not be rebuilt');
  assert.equal(tables.MKT_EMAIL_QUEUE.filter(j => j.contactId === 'C3' && j.playbookId === 'Activation').length, 1);
  console.log('campana-a jobid test 3 (legacy-format Activation jobs are still honored as already built): PASS');
})();

// 4. Creative gate stays fail-closed with Retention history present.
(function creativeGateTest() {
  // 4a. Real set gate (no approved ES/EN/PT creatives, no set approval) -> nothing built.
  let tables = fixtureTables(), before = JSON.stringify(tables.MKT_EMAIL_QUEUE);
  let ctx = harness.makeContext({ tables, noDefaultCreative: true, props: PROPS() });
  const cellAdapter = ctx.v6CampaignStudioPatchCampaign_;
  vm.runInContext(fs.readFileSync(path.join(root, 'backend/apps-script-v6/MarketingV6CampaignStudio.gs'), 'utf8'), ctx); // restore REAL gate
  ctx.v6CampaignStudioPatchCampaign_ = cellAdapter; // keep only the fake sheet storage adapter
  let build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.status, 'CREATIVE_SET_INCOMPLETE');
  assert.equal(build.built, 0);
  assert.equal(JSON.stringify(tables.MKT_EMAIL_QUEUE), before, 'a blocked build must not write the queue at all');
  assert.equal(ctx.__sentEmails.length, 0);

  // 4b. Per-language: only ES approved -> EN/PT recipients blocked, never queued with fallback content.
  tables = fixtureTables();
  ctx = harness.makeContext({ tables, props: PROPS() });
  tables.MKT_CAMPAIGN_CREATIVES = tables.MKT_CAMPAIGN_CREATIVES.filter(c => c.language === 'Spanish');
  build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1);
  assert.equal(build.blockedCreative, 2);
  assert.deepEqual(tables.MKT_EMAIL_QUEUE.filter(j => j.playbookId === 'Activation').map(j => j.preferredLanguage), ['ES']);
  assert.equal(ctx.__sentEmails.length, 0);
  console.log('campana-a jobid test 4 (missing set approval / per-language creative fails closed): PASS');
})();
