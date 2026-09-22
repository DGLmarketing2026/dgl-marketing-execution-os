const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = name => fs.readFileSync(path.join(root, 'backend/apps-script-v6', name), 'utf8');
const copyEngineSource = src('MarketingV6AuraCopyEngine.gs');
const dispatcherSource = src('MarketingV6AuraEmailDispatcher.gs');
const creativeApprovalSource = src('MarketingV6AuraCreativeApproval.gs');

function fakePropertiesService(store) {
  store = store || {};
  return { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setProperty: function (k, v) { store[k] = v; return this; } }; } };
}
function fakeScriptApp(state) {
  state.triggers = state.triggers || [];
  return {
    getProjectTriggers: function () { return state.triggers.slice(); },
    deleteTrigger: function (t) { state.triggers = state.triggers.filter(function (x) { return x !== t; }); },
    newTrigger: function (handler) {
      return { timeBased: function () { return { everyHours: function () { return { create: function () { var t = { getHandlerFunction: function () { return handler; } }; state.triggers.push(t); return t; } }; } }; } };
    }
  };
}

// Minimal, behavior-accurate stand-ins for the engines this file defers to elsewhere in the
// real project (MarketingV6RecipientResolution.gs, MarketingV6FrequencyControl.gs,
// MarketingV6Pipeline.gs, MarketingV6AuraAutomation.gs) -- this test isolates the dispatcher/
// queue-builder, it does not re-verify those engines' own internal rules (each has its own
// dedicated test file already).
function makeContext(opts) {
  opts = opts || {};
  var tables = opts.tables || {};
  var props = opts.props || {};
  var scriptState = opts.scriptState || {};
  var sentEmails = [];
  var touchCalls = [];
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON, RegExp: RegExp,
    PropertiesService: fakePropertiesService(props),
    ScriptApp: fakeScriptApp(scriptState),
    GmailApp: { sendEmail: function (to, subject, text, options) { sentEmails.push({ to: to, subject: subject, text: text, options: options }); } },
    DGL_CONFIG: { DEFAULT_SENDER_NAME: 'DGL' }
  };
  vm.createContext(ctx);
  vm.runInContext(copyEngineSource, ctx, { filename: 'MarketingV6AuraCopyEngine.gs' });
  vm.runInContext(dispatcherSource, ctx, { filename: 'MarketingV6AuraEmailDispatcher.gs' });
  vm.runInContext(creativeApprovalSource, ctx, { filename: 'MarketingV6AuraCreativeApproval.gs' });

  ctx.v6AuraText_ = function (v) { return String(v == null ? '' : v).trim(); };
  ctx.v6AuraNow_ = function () { return new Date().toISOString(); };
  ctx.v6Rows_ = function (name) { return (tables[name] || []).map(function (r) { return Object.assign({}, r); }); };
  ctx.v6UpsertByKey_ = function (name, keys, record) {
    var rows = tables[name] || (tables[name] = []);
    var at = rows.findIndex(function (row) { return keys.every(function (k) { return String(row[k] || '') === String(record[k] || ''); }); });
    if (at < 0) rows.push(Object.assign({}, record)); else rows[at] = Object.assign({}, record);
    return record;
  };
  ctx.v6EnsureContactRecipientSchema_ = function () { return { status: 'SCHEMA READY' }; };
  // MarketingV6AuraCreativeApproval.gs's own ensure function opens a real SpreadsheetApp -- this
  // test isolates queue-build/dispatch behavior against MKT_CAMPAIGN_CREATIVES via v6Rows_/
  // v6UpsertByKey_ exactly like every other table, so the real sheet-creation call is stubbed
  // out the same way v6EnsureContactRecipientSchema_ is above.
  ctx.v6AuraEnsureCampaignCreativesSheet_ = function () { return { status: 'ALREADY_EXISTS' }; };
  ctx.v6AuraDeriveExecutionId_ = function (campaignId) { return 'EXEC-' + String(campaignId || '').replace(/^CMP-/, ''); };
  ctx.v6AuraPolicyApproved_ = opts.policyApproved === false ? function () { return false; } : function () { return true; };
  ctx.v6FrequencyStatus_ = opts.frequencyStatus || function () { return { eligible: true, status: 'CLEAR' }; };
  ctx.v6RecipientEmailValid_ = function (email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase()); };
  ctx.v6RecipientActiveExclusion_ = opts.activeExclusion || function () { return null; };
  ctx.v6PipelineAdvanced_ = function (stage) { return ['CAMPAIGN ACTIVE', 'RESPONDED', 'RFQ RECEIVED', 'QUOTED', 'LOAD / REACTIVATED', 'RETAINED / EXPANDED', 'COOLDOWN / NURTURE'].indexOf(String(stage || '').toUpperCase()) >= 0; };
  ctx.v6RecordMarketingTouch_ = function (payload) { touchCalls.push(payload); return {}; };
  // v6AuraQueueCountsForCampaign_ / v6AuraExecutionReport_ live in MarketingV6AuraAutomation.gs
  // (not loaded here -- that file has its own test coverage). Minimal, real-logic stand-in so
  // v6AuraRefreshExecutionReportStatusOnly_/v6AuraRetentionDashboard_ behave correctly in
  // isolation.
  ctx.v6AuraQueueCountsForCampaign_ = function (campaignId) {
    var rows = (tables.MKT_EMAIL_QUEUE || []).filter(function (r) { return String(r.campaignId) === String(campaignId); });
    var c = { total: rows.length, pending: 0, sent: 0, failed: 0, dryRun: 0 };
    rows.forEach(function (r) {
      var s = String(r.status || '').toUpperCase();
      if (s === 'PENDING') c.pending++; else if (s === 'SENT') c.sent++; else if (s === 'FAILED') c.failed++; else if (s === 'DRY_RUN') c.dryRun++;
    });
    return c;
  };
  ctx.v6AuraExecutionReport_ = function () { return { summary: {}, records: tables.MKT_AURA_EXECUTION_REPORT || [] }; };

  ctx.__tables = tables; ctx.__props = props; ctx.__script = scriptState; ctx.__sentEmails = sentEmails; ctx.__touchCalls = touchCalls;
  return ctx;
}

function campaign(over) {
  return Object.assign({ campaignId: 'CMP-RET-1', scopeId: 'SCOPE-RET-1', campaignName: 'Retention · FTL · Owner A', campaignType: 'Retention', objective: 'Retention', service: 'FTL', amOwner: 'Owner A', language: 'Spanish', status: 'AUTO_ACTIVE' }, over || {});
}
function eligibleAudienceRow(over) {
  return Object.assign({ audienceRecipientId: 'AUD:CMP-RET-1:CON-1', recordType: 'RECIPIENT', campaignId: 'CMP-RET-1', scopeId: 'SCOPE-RET-1', accountId: 'ACC-1', contactId: 'CON-1', email: 'contact@shipperco.com', eligibilityStatus: 'ELIGIBLE' }, over || {});
}

// Iniciativa 2 test helpers -- a real, checksum-consistent approved creative and a real,
// checksum-consistent queued job derived from it, built via the loaded module's OWN
// v6AuraChecksum_ (never a duplicated/hand-rolled checksum in test code, so these fixtures can
// never silently drift from the real algorithm).
function makeApprovedCreative(ctx, over) {
  var rec = Object.assign({
    creativeId: 'CMP-RET-1:CREATIVE:1', campaignId: 'CMP-RET-1', templateId: 'editorial',
    creativeVersion: 1, subject: '{{firstName}}, seguimos cerca de {{company}}', preheader: 'Preheader',
    htmlBody: '<p>Hola {{firstName}} de {{company}} ({{service}})</p><a href="mailto:info@dglus.com?subject=RE">ENVIAR MOVIMIENTO</a> DGL Freight Broker',
    textBody: 'Hola {{firstName}}', heroUrl: '', logoUrl: '', language: 'Spanish',
    approvedAt: new Date().toISOString(), approvedBy: 'Marketing', approvalId: 'CAPR:CMP-RET-1:1',
    createdAt: new Date().toISOString()
  }, over || {});
  rec.htmlChecksum = ctx.v6AuraChecksum_(rec.htmlBody);
  return rec;
}
function jobFromCreative(ctx, creative, over) {
  var job = Object.assign({
    jobId: 'JOB:CMP-RET-1:CON-1:1', campaignId: creative.campaignId, accountId: 'ACC-1', contactId: 'CON-1',
    email: 'contact@shipperco.com', subject: 'x', htmlBody: creative.htmlBody, replyTo: 'am@dglus.com', status: 'PENDING', sequenceStep: 1,
    creativeId: creative.creativeId, creativeVersion: creative.creativeVersion, creativeApprovalId: creative.approvalId,
    htmlChecksum: creative.htmlChecksum
  }, over || {});
  job.recipientRenderedChecksum = ctx.v6AuraChecksum_(job.htmlBody);
  return job;
}

// 1. Building the queue for an eligible recipient, with a valid approved creative on file,
// produces exactly one real, personalized PENDING job (subject/htmlBody carry the real
// firstName/company, not the generic sample) -- sourced from the APPROVED CREATIVE, never from
// v6AuraEmailHtml_() (Iniciativa 2 punto 3).
(function buildsRealPersonalizedPendingJobTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables });
  var creative = makeApprovedCreative(ctx, {});
  tables.MKT_CAMPAIGN_CREATIVES = [creative];
  var result = ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  assert.equal(result.built, 1);
  assert(!result.blockedCreative);
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.status, 'PENDING');
  assert.equal(job.firstName, 'Maria');
  assert.equal(job.company, 'Shipper Co');
  assert(job.subject.indexOf('Maria') >= 0, 'subject must be merged with the real firstName');
  assert(job.htmlBody.indexOf('Shipper Co') >= 0, 'htmlBody must be merged with the real company name');
  assert(job.htmlBody.indexOf('{{') < 0, 'no unmerged {{token}} may reach a real job');
  assert.equal(job.stopOnResponse, true);
  assert.equal(job.creativeId, creative.creativeId, 'the job must record exactly which approved creative produced it');
  assert.equal(job.creativeVersion, 1);
  assert.equal(job.creativeApprovalId, creative.approvalId);
  assert.equal(job.htmlChecksum, creative.htmlChecksum, 'the job must carry the approved template checksum');
  assert.equal(job.recipientRenderedChecksum, ctx.v6AuraChecksum_(job.htmlBody), 'the job must carry the checksum of its own personalized htmlBody');
  console.log('dispatcher test 1 (build produces a real personalized PENDING job from the approved creative): PASS');
})();

// 2. A non-ELIGIBLE audience row (SUPPRESSED/REVIEW-required at the recipient-resolution layer)
// never reaches the queue at all -- this file trusts v6ResolveRecipients_'s own gate completely.
(function nonEligibleRowNeverQueuedTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow({ eligibilityStatus: 'EXCLUDED', exclusionReason: 'FREQUENCY_CAP' })], MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var ctx = makeContext({ tables: tables });
  var result = ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  assert.equal(result.built, 0);
  assert.equal((tables.MKT_EMAIL_QUEUE || []).length, 0);
  console.log('dispatcher test 2 (a non-ELIGIBLE recipient row is never queued): PASS');
})();

// 3. Building the queue twice for the same campaign never duplicates or rebuilds an existing
// job -- idempotent by deterministic jobId, matching the codebase's run_id/action-key rule.
(function buildIsIdempotentTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables });
  tables.MKT_CAMPAIGN_CREATIVES = [makeApprovedCreative(ctx, {})];
  ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  tables.MKT_EMAIL_QUEUE[0].status = 'SENT'; // simulate the dispatcher having already sent it
  var second = ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  assert.equal(second.built, 0);
  assert.equal(second.skippedExisting, 1);
  assert.equal(tables.MKT_EMAIL_QUEUE.length, 1);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'SENT', 'a re-run must never reset an already-SENT job back to PENDING');
  console.log('dispatcher test 3 (queue build is idempotent, never resets a terminal job): PASS');
})();

// 4. Policy-review campaigns queue as REVIEW_REQUIRED, never PENDING -- so the dispatcher can
// never send them without a real approval being recorded first.
(function policyNotApprovedQueuesReviewRequiredTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables, policyApproved: false });
  tables.MKT_CAMPAIGN_CREATIVES = [makeApprovedCreative(ctx, {})];
  ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.status, 'REVIEW_REQUIRED');
  assert(job.approvalId, 'a review-required job must carry an approvalId to be actionable later');
  console.log('dispatcher test 4 (policy-review campaign queues REVIEW_REQUIRED, not PENDING): PASS');
})();

// 5. DRY_RUN (the default with AURA_SEND_MODE unset) processes every gate but never calls
// GmailApp.sendEmail -- job lands on status DRY_RUN, not SENT.
(function dryRunNeverSendsTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = { MKT_CAMPAIGN_CREATIVES: [creative], MKT_EMAIL_QUEUE: [jobFromCreative(ctx0, creative, {})] };
  var ctx = makeContext({ tables: tables });
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN', 'default send mode must be DRY_RUN when the property is unset');
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.dryRun, 1);
  assert.equal(out.sent, 0);
  assert.equal(out.blockedCreative, 0);
  assert.equal(ctx.__sentEmails.length, 0, 'DRY_RUN must never call GmailApp.sendEmail');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'DRY_RUN');
  console.log('dispatcher test 5 (DRY_RUN validates everything, including the creative-approval chain, but never sends): PASS');
})();

// 6. LIVE mode (only reachable via the explicit auraEnableLiveSending() switch) actually sends,
// records the frequency-ledger touch and the MKT_TOUCHES row, and marks the job SENT -- and the
// exact bytes GmailApp receives are job.htmlBody verbatim (the dispatcher never re-renders).
(function liveModeSendsAndRecordsTouchTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = { MKT_CAMPAIGN_CREATIVES: [creative], MKT_EMAIL_QUEUE: [jobFromCreative(ctx0, creative, { playbookId: 'Retention' })] };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  assert.equal(ctx.v6AuraSendMode_(), 'LIVE');
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.sent, 1);
  assert.equal(ctx.__sentEmails.length, 1);
  assert.equal(ctx.__sentEmails[0].to, 'contact@shipperco.com');
  assert.equal(ctx.__sentEmails[0].options.name, 'DGL');
  assert.equal(ctx.__sentEmails[0].options.htmlBody, tables.MKT_EMAIL_QUEUE[0].htmlBody, 'the dispatcher must transport job.htmlBody exactly, never a re-render');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'SENT');
  assert.equal(ctx.__touchCalls.length, 1, 'a real send must record a frequency-ledger touch');
  assert.equal((tables.MKT_TOUCHES || []).length, 1, 'a real send must log an MKT_TOUCHES row');
  ctx.auraDisableLiveSending();
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN', 'auraDisableLiveSending must switch back to DRY_RUN');
  console.log('dispatcher test 6 (LIVE mode sends the exact queued HTML, records touch, and can be disabled again): PASS');
})();

// 7. An active MKT_EXCLUSIONS row suppresses the job at dispatch time even if it was queued
// before the exclusion existed -- never sent.
(function activeExclusionSuppressesAtDispatchTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = { MKT_CAMPAIGN_CREATIVES: [creative], MKT_EMAIL_QUEUE: [jobFromCreative(ctx0, creative, {})] };
  var ctx = makeContext({ tables: tables, activeExclusion: function () { return { reasonCode: 'UNSUBSCRIBE' }; } });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.suppressed, 1);
  assert.equal(out.sent, 0);
  assert.equal(ctx.__sentEmails.length, 0);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'SUPPRESSED');
  console.log('dispatcher test 7 (an active exclusion suppresses a job at dispatch time, never sent): PASS');
})();

// 8. An account that already responded (MKT_ACCOUNT_PIPELINE currentStage RESPONDED) stops
// automation for that account -- the job is marked STOPPED, never sent, regardless of mode.
(function respondedAccountStopsAutomationTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = {
    MKT_CAMPAIGN_CREATIVES: [creative],
    MKT_EMAIL_QUEUE: [jobFromCreative(ctx0, creative, {})],
    MKT_ACCOUNT_PIPELINE: [{ accountId: 'ACC-1', currentStage: 'RESPONDED' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.stopped, 1);
  assert.equal(ctx.__sentEmails.length, 0);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'STOPPED');
  console.log('dispatcher test 8 (stopOnResponse: a RESPONDED account never receives a queued send): PASS');
})();

// 9. Frequency cap blocks the send (SKIPPED), reusing v6FrequencyStatus_ verbatim -- no
// duplicated frequency logic in this file.
(function frequencyCapSkipsTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = { MKT_CAMPAIGN_CREATIVES: [creative], MKT_EMAIL_QUEUE: [jobFromCreative(ctx0, creative, {})] };
  var ctx = makeContext({ tables: tables, frequencyStatus: function () { return { eligible: false, status: 'FREQUENCY CAP' }; } });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.skipped, 1);
  assert.equal(ctx.__sentEmails.length, 0);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'SKIPPED');
  console.log('dispatcher test 9 (frequency cap skips the send, no duplicated frequency logic): PASS');
})();

// 10. Duplicate prevention: if another row for the same (campaignId, accountId, contactId,
// sequenceStep) already reached SENT, a second PENDING job for that exact combination is
// never sent, even under LIVE mode.
(function duplicateSentNeverDoubleSendsTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = {
    MKT_CAMPAIGN_CREATIVES: [creative],
    MKT_EMAIL_QUEUE: [
      jobFromCreative(ctx0, creative, { status: 'SENT' }),
      jobFromCreative(ctx0, creative, { jobId: 'JOB:CMP-RET-1:CON-1:1:RETRY' })
    ]
  };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.skipped, 1);
  assert.equal(ctx.__sentEmails.length, 0, 'a second job for an already-SENT (campaign,account,contact,step) must never send');
  console.log('dispatcher test 10 (duplicate-sent guard prevents a real double-send): PASS');
})();

// 11. auraInstallTriggers is idempotent: installs exactly one hourly trigger, a second call
// never installs a duplicate.
(function installTriggersIdempotentTest() {
  var scriptState = {};
  var ctx = makeContext({ scriptState: scriptState });
  var first = ctx.auraInstallTriggers();
  assert.equal(first.status, 'TRIGGER_INSTALLED');
  assert.equal(scriptState.triggers.length, 1);
  var second = ctx.auraInstallTriggers();
  assert.equal(second.status, 'TRIGGER_EXISTS');
  assert.equal(scriptState.triggers.length, 1, 'a second install call must never duplicate the dispatcher trigger');
  console.log('dispatcher test 11 (auraInstallTriggers is idempotent, never duplicates): PASS');
})();

// 12. The pre-LIVE audit reports a clean bill of health for a genuinely well-formed job: no
// findings, zero real sends detected, masked email in output, no internal classification label
// visible either (Iniciativa 2 punto 8).
(function auditCleanJobTest() {
  var tables = {
    MKT_EMAIL_QUEUE: [{ jobId: 'JOB:CMP-RET-1:CON-1:1', campaignId: 'CMP-RET-1', accountId: 'ACC-1', contactId: 'CON-1', email: 'maria@shipperco.com', firstName: 'Maria', company: 'Shipper Co', service: 'FTL', subject: 'Maria, seguimos cerca de Shipper Co', htmlBody: '<p>Hola Maria de Shipper Co</p><a href="mailto:am@dglus.com?subject=RE%20Maria%2C%20seguimos%20cerca">ENVIAR MOVIMIENTO</a> DGL Freight Broker', replyTo: 'am@dglus.com', status: 'DRY_RUN', sequenceStep: 1, playbookId: 'Retention' }],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria', email: 'maria@shipperco.com' }]
  };
  var ctx = makeContext({ tables: tables });
  var audit = ctx.v6AuraEmailQueueAudit_();
  assert.equal(audit.jobsChecked, 1);
  assert.equal(audit.realSendsDetected, 0);
  assert.equal(audit.clean, true, 'a well-formed DRY_RUN job must produce zero findings');
  assert.equal(audit.findings.length, 0);
  console.log('dispatcher test 12 (pre-LIVE audit: a well-formed job is reported clean): PASS');
})();

// 13. The pre-LIVE audit detects every category of real problem it was asked to catch: generic
// fallback content, an unmerged {{token}}, a broken href="#" CTA, a missing signature/replyTo, a
// mismatch against the real account/contact record, a duplicate job key, and -- the one truly
// critical case -- a job that already shows a real SENT status.
(function auditDetectsRealProblemsTest() {
  var tables = {
    MKT_EMAIL_QUEUE: [
      { jobId: 'JOB:CMP-RET-1:CON-1:1', campaignId: 'CMP-RET-1', accountId: 'ACC-1', contactId: 'CON-1', email: 'wrong@otherbroker.com', firstName: 'Team', company: 'your company', service: 'freight', subject: 'Hi {{firstName}}', htmlBody: '<p>Hi {{firstName}} from {{company}}</p><a href="#">Click</a>', replyTo: '', status: 'DRY_RUN', sequenceStep: 1, playbookId: 'Retention' },
      { jobId: 'JOB:CMP-RET-1:CON-2:1', campaignId: 'CMP-RET-1', accountId: 'ACC-2', contactId: 'CON-2', email: 'sent@shipperco.com', firstName: 'Ana', company: 'Shipper Co', service: 'FTL', subject: 'Ana, hola', htmlBody: '<p>Ana content DGL</p>', replyTo: 'am@dglus.com', status: 'SENT', sequenceStep: 1, playbookId: 'Retention' },
      { jobId: 'JOB:CMP-RET-1:CON-3:1', campaignId: 'CMP-RET-1', accountId: 'ACC-3', contactId: 'CON-3', email: 'carlos@shipperco.com', firstName: 'Carlos', company: 'Shipper Co', service: 'FTL', subject: 'Carlos, hola', htmlBody: '<p>Carlos content DGL</p>', replyTo: 'am@dglus.com', status: 'DRY_RUN', sequenceStep: 1, playbookId: 'Retention' },
      { jobId: 'JOB:CMP-RET-1:CON-3:1:DUP', campaignId: 'CMP-RET-1', accountId: 'ACC-3', contactId: 'CON-3', email: 'carlos@shipperco.com', firstName: 'Carlos', company: 'Shipper Co', service: 'FTL', subject: 'Carlos, hola otra vez', htmlBody: '<p>Carlos content DGL</p>', replyTo: 'am@dglus.com', status: 'PENDING', sequenceStep: 1, playbookId: 'Retention' }
    ],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Real Shipper Inc' }, { accountId: 'ACC-2', accountName: 'Shipper Co' }, { accountId: 'ACC-3', accountName: 'Shipper Co' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Real Contact', email: 'real@realshipper.com' }, { contactId: 'CON-2', firstName: 'Ana', email: 'sent@shipperco.com' }, { contactId: 'CON-3', firstName: 'Carlos', email: 'carlos@shipperco.com' }]
  };
  var ctx = makeContext({ tables: tables });
  var audit = ctx.v6AuraEmailQueueAudit_();
  assert.equal(audit.jobsChecked, 4);
  assert.equal(audit.realSendsDetected, 1, 'the one SENT job must be flagged as a real send');
  assert(audit.realSendsDetectedWarning, 'a real send must produce a CRITICAL warning string');
  assert.equal(audit.duplicateJobKeys, 1);
  var job1 = audit.findings.filter(function (f) { return f.jobId === 'JOB:CMP-RET-1:CON-1:1'; })[0];
  assert(job1, 'the generic/broken/mismatched job must appear in findings');
  assert(job1.email.indexOf('***') >= 0, 'the audit must mask the local part of every email');
  ['GENERIC_COMPANY_FALLBACK_USED', 'GENERIC_FIRSTNAME_FALLBACK_USED', 'GENERIC_SERVICE_FALLBACK_USED', 'UNMERGED_TOKEN_IN_SUBJECT', 'UNMERGED_TOKEN_IN_HTML_BODY', 'BROKEN_CTA_HREF', 'CTA_NOT_FUNCTIONAL', 'MISSING_REPLY_TO', 'EMAIL_MISMATCH_WITH_CONTACT_RECORD', 'COMPANY_MISMATCH_WITH_ACCOUNT_RECORD', 'FIRSTNAME_MISMATCH_WITH_CONTACT_RECORD'].forEach(function (code) {
    assert(job1.issues.indexOf(code) >= 0, 'missing expected finding: ' + code);
  });
  var dupJobs = audit.findings.filter(function (f) { return f.jobId.indexOf('CON-3') >= 0; });
  assert(dupJobs.length >= 1 && dupJobs.some(function (f) { return f.issues.indexOf('DUPLICATE_JOB_KEY') >= 0; }), 'the duplicated (campaign,account,contact,step) pair must be flagged');
  assert.equal(audit.clean, false);
  console.log('dispatcher test 13 (pre-LIVE audit: every real problem category is detected, including a real SENT job): PASS');
})();

// 14. With no Script Property configured, a freshly built job still resolves the canonical
// fallback reply-to ('info@dglus.com', the same real DGL mailbox MarketingV6AuraGmailIngest.gs
// already uses) -- independent of, and unaffected by, the Iniciativa 2 creative-approval gate.
(function buildResolvesCanonicalReplyToTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables });
  tables.MKT_CAMPAIGN_CREATIVES = [makeApprovedCreative(ctx, {})];
  ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.replyTo, 'info@dglus.com', 'with no Script Property set, the hardcoded canonical fallback must be used, never left empty');
  assert.equal(job.status, 'PENDING');
  assert(/href="mailto:info@dglus\.com\?subject=/.test(job.htmlBody), 'the CTA in the approved creative fixture (a real mailto: link) must reach the job unchanged');
  console.log('dispatcher test 14 (build resolves the canonical reply-to; approved-creative HTML reaches the job unchanged): PASS');
})();

// 15. If the configured reply-to Script Property is invalid (not a real email), the job is
// built as SUPPRESSED / MISSING_REPLY_TO_CONFIGURATION -- never PENDING -- and the dispatcher
// refuses to send it even under LIVE mode (defense in depth).
(function invalidConfiguredReplyToBlocksLiveTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables, props: { AURA_GMAIL_SOURCE_MAILBOX: 'not-an-email' } });
  tables.MKT_CAMPAIGN_CREATIVES = [makeApprovedCreative(ctx, {})];
  ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.status, 'SUPPRESSED');
  assert.equal(job.error, 'MISSING_REPLY_TO_CONFIGURATION');
  assert.equal(job.replyTo, '', 'an invalid configured value must never be used as-is; it must resolve to empty, never a guessed address');
  // Force it to PENDING to prove the dispatcher's own independent, defense-in-depth check also
  // refuses to send it, not just the build-time gate.
  job.status = 'PENDING';
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.sent, 0);
  assert.equal(ctx.__sentEmails.length, 0, 'a job with no valid reply-to must never be sent, even under LIVE');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].error, 'MISSING_REPLY_TO_CONFIGURATION');
  console.log('dispatcher test 15 (an invalid/missing configured reply-to blocks LIVE, build-time and dispatch-time): PASS');
})();

// 16. v6AuraRepairEmailQueueContent_ fixes an existing job built BEFORE this reply-to/CTA fix
// existed (empty replyTo, href="#") in place -- without creating a second row -- while never
// touching a job already SENT. Content is repaired from the approved creative, never from
// v6AuraEmailHtml_().
(function repairFixesExistingBrokenJobsTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = {
    MKT_CAMPAIGNS: [campaign()],
    MKT_CAMPAIGN_CREATIVES: [creative],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }, { accountId: 'ACC-2', accountName: 'Other Co' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }, { contactId: 'CON-2', firstName: 'Ana' }],
    MKT_EMAIL_QUEUE: [
      { jobId: 'JOB:CMP-RET-1:CON-1:1', campaignId: 'CMP-RET-1', accountId: 'ACC-1', contactId: 'CON-1', email: 'maria@shipperco.com', firstName: 'Maria', company: 'Shipper Co', service: 'FTL', subject: 'old subject', htmlBody: '<p>old</p><a href="#">Click</a>', replyTo: '', status: 'PENDING', sequenceStep: 1, playbookId: 'Retention' },
      { jobId: 'JOB:CMP-RET-1:CON-2:1', campaignId: 'CMP-RET-1', accountId: 'ACC-2', contactId: 'CON-2', email: 'ana@otherco.com', firstName: 'Ana', company: 'Other Co', service: 'FTL', subject: 'already sent', htmlBody: '<p>already sent</p><a href="#">Click</a>', replyTo: '', status: 'SENT', sequenceStep: 1, playbookId: 'Retention' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  var result = ctx.v6AuraRepairEmailQueueContent_();
  assert.equal(result.repaired, 1, 'only the non-SENT job may be repaired');
  var fixed = tables.MKT_EMAIL_QUEUE.filter(function (r) { return r.jobId === 'JOB:CMP-RET-1:CON-1:1'; })[0];
  assert.equal(fixed.replyTo, 'info@dglus.com');
  assert(fixed.htmlBody.indexOf('href="#"') < 0, 'a repaired job must carry the approved creative\'s real content, not the old placeholder CTA');
  assert(/href="mailto:info@dglus\.com\?subject=/.test(fixed.htmlBody));
  assert.equal(fixed.status, 'PENDING');
  assert.equal(fixed.creativeId, creative.creativeId, 'a repaired job must be traceable to the approved creative it was repaired from');
  assert.equal(fixed.recipientRenderedChecksum, ctx.v6AuraChecksum_(fixed.htmlBody));
  var untouched = tables.MKT_EMAIL_QUEUE.filter(function (r) { return r.jobId === 'JOB:CMP-RET-1:CON-2:1'; })[0];
  assert.equal(untouched.status, 'SENT', 'a job already SENT must never be modified by the repair');
  assert.equal(untouched.replyTo, '', 'send history must remain exactly as it was, including a since-fixed field');
  assert.equal(tables.MKT_EMAIL_QUEUE.length, 2, 'repair must update rows in place, never create a new one');
  console.log('dispatcher test 16 (repair fixes existing broken jobs from the approved creative in place, never touches a SENT job): PASS');
})();

// 17. v6AuraRegenerateRetentionDryRun_ forces/confirms DRY_RUN, runs repair -> build -> dispatch
// -> audit in one call, and returns the flat {sendMode, queued, dryRun, clean,
// realSendsDetected, findings} shape -- with zero real sends, even if LIVE was left on.
(function regenerateForcesDryRunAndReturnsFlatShapeTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var tables = {
    MKT_CAMPAIGNS: [campaign()],
    MKT_CAMPAIGN_CREATIVES: [creative],
    MKT_ACCOUNTS: [{ accountId: 'ACC-9', accountName: 'Shipper Co' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-9', firstName: 'Old', email: 'old@shipperco.com' }],
    MKT_EMAIL_QUEUE: [{ jobId: 'JOB:CMP-RET-1:CON-9:1', campaignId: 'CMP-RET-1', accountId: 'ACC-9', contactId: 'CON-9', email: 'old@shipperco.com', firstName: 'Old', company: 'Shipper Co', service: 'FTL', subject: 'old', htmlBody: '<p>old</p><a href="#">Click</a>', replyTo: '', status: 'PENDING', sequenceStep: 1, playbookId: 'Retention' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending(); // deliberately left LIVE from a prior call
  var out = ctx.v6AuraRegenerateRetentionDryRun_();
  assert.equal(out.sendMode, 'DRY_RUN', 'regenerate must force DRY_RUN even if LIVE was left on');
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN');
  assert.equal(ctx.__sentEmails.length, 0, 'regenerate must never produce a real send, even recovering from a LIVE mode left on');
  assert.equal(out.realSendsDetected, 0);
  assert.equal(out.clean, true);
  assert.equal(out.queued, 1);
  assert.equal(out.dryRun, 1);
  assert.deepEqual(out.findings, []);
  var repairedJob = tables.MKT_EMAIL_QUEUE.filter(function (r) { return r.jobId === 'JOB:CMP-RET-1:CON-9:1'; })[0];
  assert.equal(repairedJob.replyTo, 'info@dglus.com');
  assert.equal(repairedJob.status, 'DRY_RUN', 'the repaired-then-rebuilt-then-dispatched job must land on DRY_RUN, not SENT');
  console.log('dispatcher test 17 (regenerate runs repair+build+dispatch+audit without ever touching AURA_SEND_MODE): PASS');
})();

// 18. Iniciativa 2 punto 2 -- with NO approved creative on file for the campaign, the builder
// produces ZERO jobs and reports CREATIVE_NOT_APPROVED. v6AuraEmailHtml_() is never called as a
// production fallback.
(function buildBlocksWhenNoApprovedCreativeTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables });
  var result = ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  assert.equal(result.built, 0);
  assert.equal(result.blockedCreative, true);
  assert.equal(result.blockedReason, 'CREATIVE_NOT_APPROVED');
  assert.equal((tables.MKT_EMAIL_QUEUE || []).length, 0, 'no job with missing/unapproved content may ever be written');
  console.log('dispatcher test 18 (build blocks with CREATIVE_NOT_APPROVED when no approved creative exists): PASS');
})();

// 19. Iniciativa 2 punto 2 -- a corrupted/tampered approved-creative row (its stored
// htmlChecksum no longer matches its own htmlBody) also blocks the build, with
// CREATIVE_VERSION_MISMATCH, never a silent fallback to the drifted content.
(function buildBlocksWhenChecksumMismatchTest() {
  var tables = { MKT_AUDIENCES: [eligibleAudienceRow()], MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Shipper Co' }], MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', firstName: 'Maria' }] };
  var ctx = makeContext({ tables: tables });
  var creative = makeApprovedCreative(ctx, {});
  creative.htmlBody = creative.htmlBody + '<script>tampered</script>'; // drift AFTER the checksum was computed
  tables.MKT_CAMPAIGN_CREATIVES = [creative];
  var result = ctx.v6AuraBuildEmailQueueForCampaign_(campaign());
  assert.equal(result.built, 0);
  assert.equal(result.blockedCreative, true);
  assert.equal(result.blockedReason, 'CREATIVE_VERSION_MISMATCH');
  assert.equal((tables.MKT_EMAIL_QUEUE || []).length, 0);
  console.log('dispatcher test 19 (build blocks with CREATIVE_VERSION_MISMATCH when the stored checksum no longer matches): PASS');
})();

// 20. Iniciativa 2 punto 2/5 -- dispatch-time defense in depth: a job that reached PENDING
// without ever carrying a creativeId/creativeApprovalId (e.g. a legacy row from before this
// change) is blocked at send time too, never sent, even under LIVE.
(function dispatchBlocksJobWithNoCreativeReferenceTest() {
  var tables = { MKT_EMAIL_QUEUE: [{ jobId: 'JOB:LEGACY:1', campaignId: 'CMP-RET-1', accountId: 'ACC-1', contactId: 'CON-1', email: 'contact@shipperco.com', subject: 'x', htmlBody: '<p>legacy content, no creative reference</p>', replyTo: 'am@dglus.com', status: 'PENDING', sequenceStep: 1 }] };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.sent, 0);
  assert.equal(out.blockedCreative, 1);
  assert.equal(ctx.__sentEmails.length, 0, 'a job with no creative-approval reference must never be sent, even under LIVE');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'BLOCKED');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].error, 'CREATIVE_NOT_APPROVED');
  console.log('dispatcher test 20 (dispatch-time defense in depth blocks a job with no creative-approval reference, even under LIVE): PASS');
})();

// 21. Iniciativa 2 punto 2/5 -- dispatch-time defense in depth: a job whose htmlBody was
// altered AFTER it was queued (its recipientRenderedChecksum no longer matches) is blocked at
// send time, never sent -- catches tampering/drift the build-time gate could never see.
(function dispatchBlocksJobWithDriftedHtmlTest() {
  var ctx0 = makeContext({});
  var creative = makeApprovedCreative(ctx0, {});
  var job = jobFromCreative(ctx0, creative, {});
  job.htmlBody = job.htmlBody + '<p>drifted after queueing</p>'; // never recompute recipientRenderedChecksum
  var tables = { MKT_CAMPAIGN_CREATIVES: [creative], MKT_EMAIL_QUEUE: [job] };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.auraProcessEmailQueue();
  assert.equal(out.sent, 0);
  assert.equal(out.blockedCreative, 1);
  assert.equal(ctx.__sentEmails.length, 0);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'BLOCKED');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].error, 'CREATIVE_VERSION_MISMATCH');
  console.log('dispatcher test 21 (dispatch-time defense in depth blocks a job whose htmlBody drifted after queueing): PASS');
})();

console.log('V6 AURA email dispatcher (queue build + DRY_RUN/LIVE dispatch + gates + Iniciativa 2 creative approval): ALL PASS');
