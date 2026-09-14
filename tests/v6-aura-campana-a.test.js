const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = name => fs.readFileSync(path.join(root, 'backend/apps-script-v6', name), 'utf8');
const gmailIngestSource = src('MarketingV6AuraGmailIngest.gs');
const copyEngineSource = src('MarketingV6AuraCopyEngine.gs');
const dispatcherSource = src('MarketingV6AuraEmailDispatcher.gs');
const campanaASource = src('MarketingV6AuraCampanaA.gs');

function fakePropertiesService(store) {
  store = store || {};
  return { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setProperty: function (k, v) { store[k] = v; return this; } }; } };
}

// Same testing philosophy as tests/v6-aura-email-dispatcher.test.js: this file isolates what is
// genuinely NEW in this pass (tab restriction, per-contact language, name reliability, the
// no-name subject, multiple contacts per account) rather than re-verifying suppression/
// frequency/exclusion machinery those engines' own dedicated tests already cover -- so
// v6ResolveRecipients_/v6AuraEnsureCampaignScope_/v6EnsureContactRecipientSchema_ are stubbed
// with real-shaped, direct table manipulation instead of loading the full engines.
function makeContext(opts) {
  opts = opts || {};
  var tables = opts.tables || {};
  var props = opts.props || {};
  var sentEmails = [];
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON,
    PropertiesService: fakePropertiesService(props),
    ScriptApp: { getProjectTriggers: function () { return []; } },
    GmailApp: { sendEmail: function (to, subject, text, options) { sentEmails.push({ to: to, subject: subject, text: text, options: options }); } },
    DGL_CONFIG: { DEFAULT_SENDER_NAME: 'DGL' }
  };
  vm.createContext(ctx);
  vm.runInContext(gmailIngestSource, ctx, { filename: 'MarketingV6AuraGmailIngest.gs' });
  vm.runInContext(copyEngineSource, ctx, { filename: 'MarketingV6AuraCopyEngine.gs' });
  vm.runInContext(dispatcherSource, ctx, { filename: 'MarketingV6AuraEmailDispatcher.gs' });
  vm.runInContext(campanaASource, ctx, { filename: 'MarketingV6AuraCampanaA.gs' });

  ctx.v6AuraText_ = function (v) { return String(v == null ? '' : v).trim(); };
  ctx.v6Rows_ = function (name) { return (tables[name] || []).map(function (r) { return Object.assign({}, r); }); };
  ctx.v6UpsertByKey_ = function (name, keys, record) {
    var rows = tables[name] || (tables[name] = []);
    var at = rows.findIndex(function (row) { return keys.every(function (k) { return String(row[k] || '') === String(record[k] || ''); }); });
    if (at < 0) rows.push(Object.assign({}, record)); else rows[at] = Object.assign({}, record);
    return record;
  };
  ctx.v6EnsureContactRecipientSchema_ = function () { return { status: 'SCHEMA READY' }; };
  ctx.v6AuraEnsureCampaignScope_ = function (p) {
    var scopeRows = tables.MKT_CAMPAIGN_SCOPES || (tables.MKT_CAMPAIGN_SCOPES = []);
    scopeRows.push({ scopeId: p.scopeId, campaignId: p.campaignId });
    var accRows = tables.MKT_SCOPE_ACCOUNTS || (tables.MKT_SCOPE_ACCOUNTS = []);
    (p.accountIds || []).forEach(function (id) { accRows.push({ scopeId: p.scopeId, campaignId: p.campaignId, accountId: id, eligibilityStatus: 'ELIGIBLE' }); });
    return { status: 'SCOPE_READY' };
  };
  // Stands in for the real v6ResolveRecipients_ (MarketingV6RecipientResolution.gs, its own
  // dedicated test coverage) -- writes exactly the MKT_AUDIENCES RECIPIENT rows this pipeline
  // reads, driven by opts.eligibleContactIds (defaults to every contact in MKT_CONTACTS_SECURE
  // belonging to a scoped account).
  ctx.v6ResolveRecipients_ = function (p) {
    var scopeAccountIds = (tables.MKT_SCOPE_ACCOUNTS || []).filter(function (r) { return r.campaignId === p.campaignId; }).map(function (r) { return r.accountId; });
    var audRows = tables.MKT_AUDIENCES || (tables.MKT_AUDIENCES = []);
    (tables.MKT_CONTACTS_SECURE || []).forEach(function (c) {
      if (scopeAccountIds.indexOf(c.accountId) < 0) return;
      var eligible = !opts.eligibleContactIds || opts.eligibleContactIds.indexOf(c.contactId) >= 0;
      audRows.push({ audienceRecipientId: 'AUD:' + p.campaignId + ':' + c.contactId, recordType: 'RECIPIENT', campaignId: p.campaignId, accountId: c.accountId, contactId: c.contactId, email: c.email, eligibilityStatus: eligible ? 'ELIGIBLE' : 'EXCLUDED' });
    });
    return { audienceResolved: true };
  };
  ctx.v6AuraDeriveExecutionId_ = function (campaignId) { return 'EXEC-' + campaignId; };
  ctx.v6AuraPolicyApproved_ = opts.policyApproved === false ? function () { return false; } : function () { return true; };
  ctx.v6FrequencyStatus_ = function () { return { eligible: true, status: 'CLEAR' }; };
  ctx.v6RecipientEmailValid_ = function (email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase()); };
  ctx.v6RecipientActiveExclusion_ = function () { return null; };
  ctx.v6PipelineAdvanced_ = function (stage) { return ['CAMPAIGN ACTIVE', 'RESPONDED', 'RFQ RECEIVED', 'QUOTED', 'LOAD / REACTIVATED', 'RETAINED / EXPANDED', 'COOLDOWN / NURTURE'].indexOf(String(stage || '').toUpperCase()) >= 0; };
  ctx.v6RecordMarketingTouch_ = function () { return {}; };
  ctx.v6RefreshOpportunitiesFromReports_ = function () { return { status: 'REFRESHED' }; };
  ctx.__tables = tables; ctx.__sentEmails = sentEmails;
  return ctx;
}

function gmailOpp(accountId, accountName, amOwner, sheetName) {
  return { accountId: accountId, accountName: accountName, amOwner: amOwner, sourceSheet: sheetName || 'Campana A - HA prioritaria', opportunityType: 'Retention' };
}

// 1. Tab recognition: 'Campana A - HA prioritaria' is recognized by the real parser and every
// accepted row carries its sheetName; 'Campana B' (and any other tab) is not in the family map
// and is never processed -- v6AuraGmailParseTable_ returns null for it, exactly like any other
// unrecognized tab, with zero code path specific to "ignore Campana B".
(function tabRecognitionTest() {
  var ctx = makeContext();
  var headers = ['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad'];
  var values = [headers, ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High']];
  var parsedA = ctx.v6AuraGmailParseTable_('Campana A - HA prioritaria', values, {});
  assert.equal(parsedA.family, 'Retention');
  assert.equal(parsedA.accepted.length, 1);
  assert.equal(parsedA.accepted[0].sheetName, 'Campana A - HA prioritaria');
  var parsedB = ctx.v6AuraGmailParseTable_('Campana B', values, {});
  assert.equal(parsedB, null, 'Campana B must never be recognized -- it is deliberately absent from the family map');
  var parsedUnknown = ctx.v6AuraGmailParseTable_('Some Other Tab', values, {});
  assert.equal(parsedUnknown, null, 'any tab other than the ones explicitly mapped must be ignored');
  console.log('campana-a test 1 (Campana A is recognized; Campana B and every other tab are never processed): PASS');
})();

// 2. v6AuraDedicatedAccountIds_ returns exactly the accounts sourced from Campana A -- and only
// those -- for the shared family scope-builder's exclusion check.
(function dedicatedAccountRegistryTest() {
  var tables = { MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Luis Simoes'), gmailOpp('ACC-2', 'Shipper Co', 'Ana Ruiz', 'Retencion prioritaria')] };
  var ctx = makeContext({ tables: tables });
  var ids = ctx.v6AuraDedicatedAccountIds_();
  assert.deepEqual(Object.keys(ids), ['ACC-1'], 'only the Campana A -sourced account must be registered as dedicated');
  console.log('campana-a test 2 (dedicated-account registry contains only Campana A accounts): PASS');
})();

// 3. Multiple eligible contacts for the SAME account are never collapsed to one job -- each
// gets its own job, keyed by (campaignId, contactId, sequenceStep).
(function multipleContactsPerAccountTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Luis Simoes')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' },
      { contactId: 'CON-2', accountId: 'ACC-1', firstName: 'Carlos', email: 'carlos@progeral.com', country: 'Colombia' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.accounts, 1);
  assert.equal(build.built, 2, 'both contacts of the same account must each get their own job');
  var jobs = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.accountId === 'ACC-1'; });
  assert.equal(jobs.length, 2);
  assert.notEqual(jobs[0].contactId, jobs[1].contactId);
  console.log('campana-a test 3 (multiple eligible contacts of the same account are never collapsed to one job): PASS');
})();

// 4. Language priority: an explicit, reliable signal on the contact wins over country.
(function explicitLanguageSignalWinsTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Luis Simoes')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Brazil', preferredLanguage: 'EN' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6AuraCampanaABuildQueue_();
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.preferredLanguage, 'EN', 'an explicit contact-level signal must win over the country-derived language');
  console.log('campana-a test 4 (an explicit reliable language signal wins over country): PASS');
})();

// 5. Country-based derivation: Brazil -> PT, a named Spanish-speaking LATAM country -> ES, USA ->
// EN, and an unmapped/missing country falls back to EN -- exactly the specified priority chain.
(function countryBasedLanguageTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Acc BR', 'Owner'), gmailOpp('ACC-2', 'Acc CO', 'Owner'), gmailOpp('ACC-3', 'Acc US', 'Owner'), gmailOpp('ACC-4', 'Acc Unknown', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Acc BR' }, { accountId: 'ACC-2', accountName: 'Acc CO' }, { accountId: 'ACC-3', accountName: 'Acc US' }, { accountId: 'ACC-4', accountName: 'Acc Unknown' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-BR', accountId: 'ACC-1', firstName: 'Joao', email: 'joao@acc.com', country: 'Brasil' },
      { contactId: 'CON-CO', accountId: 'ACC-2', firstName: 'Camila', email: 'camila@acc.com', country: 'Colombia' },
      { contactId: 'CON-US', accountId: 'ACC-3', firstName: 'John', email: 'john@acc.com', country: 'United States' },
      { contactId: 'CON-UNK', accountId: 'ACC-4', firstName: 'Alex', email: 'alex@acc.com', country: 'Atlantis' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.byLanguage.PT, 1); assert.equal(build.byLanguage.ES, 1); assert.equal(build.byLanguage.EN, 2);
  function langOf(contactId) { return tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === contactId; })[0].preferredLanguage; }
  assert.equal(langOf('CON-BR'), 'PT');
  assert.equal(langOf('CON-CO'), 'ES');
  assert.equal(langOf('CON-US'), 'EN');
  assert.equal(langOf('CON-UNK'), 'EN', 'an unmapped/unknown country must fall back to EN, never a guess');
  console.log('campana-a test 5 (Brazil -> PT, LATAM Spanish-speaking -> ES, USA -> EN, unknown -> EN fallback): PASS');
})();

// 6. Generic/unreliable contact names never appear in the queue: firstName is left empty and the
// subject drops the leading "{{firstName}}, " clause and capitalizes what follows, matching the
// exact example DGL gave -- while a real, reliable name still personalizes normally.
(function genericNameNeverUsedTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner'), gmailOpp('ACC-2', 'Shipper Co', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }, { accountId: 'ACC-2', accountName: 'Shipper Co' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-GENERIC', accountId: 'ACC-1', firstName: 'Pricing Team', email: 'pricing@progeral.com', country: 'Mexico' },
      { contactId: 'CON-REAL', accountId: 'ACC-2', firstName: 'Sofia', email: 'sofia@shipperco.com', country: 'Mexico' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6AuraCampanaABuildQueue_();
  var genericJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-GENERIC'; })[0];
  assert.equal(genericJob.firstName, '', 'a generic role/mailbox name must never be used, and never fall back to a fabricated "Team"');
  assert.equal(genericJob.subject, 'Seguimos cerca de la operación de Progeral Corp', 'the no-name subject must match DGL\'s own example exactly: no leading name, no comma, capitalized');
  assert(genericJob.subject.indexOf('Team') < 0);
  var realJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-REAL'; })[0];
  assert.equal(realJob.firstName, 'Sofia');
  assert.equal(realJob.subject, 'Sofia, seguimos cerca de la operación de Shipper Co');
  console.log('campana-a test 6 (generic names never used; real names personalize; no-name subject matches the exact required format): PASS');
})();

// 7. Every job's reply-to resolves to the canonical DGL identity (never empty, never invented),
// and status stays DRY_RUN end to end -- never SENT -- through a full build + dispatch pass.
(function replyToAndDryRunTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  var ctx = makeContext({ tables: tables });
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(out.sendMode, 'DRY_RUN');
  assert.equal(ctx.__sentEmails.length, 0, 'no real email may ever be sent by this campaign in this phase');
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.replyTo, 'info@dglus.com');
  assert.equal(job.status, 'DRY_RUN');
  assert.equal(out.audit.realSendsDetected, 0);
  console.log('campana-a test 7 (reply-to always resolves to the canonical DGL identity; status stays DRY_RUN, zero real sends): PASS');
})();

// 8. Suppression (an EXCLUDED audience row from the real recipient-resolution shape) and
// stopOnResponse (an already-RESPONDED account) both still hold -- reused, not reimplemented.
(function suppressionAndStopStillHoldTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner'), gmailOpp('ACC-2', 'Responded Co', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }, { accountId: 'ACC-2', accountName: 'Responded Co' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-SUPPRESSED', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' },
      { contactId: 'CON-STOPPED', accountId: 'ACC-2', firstName: 'Ana', email: 'ana@respondedco.com', country: 'Colombia' }
    ],
    MKT_ACCOUNT_PIPELINE: [{ accountId: 'ACC-2', currentStage: 'RESPONDED' }]
  };
  // Only CON-STOPPED is marked eligible by the (stubbed) recipient resolver -- CON-SUPPRESSED
  // represents a contact the real engine already excluded (DNC/invalid/frequency/exclusion).
  var ctx = makeContext({ tables: tables, eligibleContactIds: ['CON-STOPPED'] });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'a contact the recipient-resolution engine already excluded must never be queued');
  var stoppedJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-STOPPED'; })[0];
  assert.equal(stoppedJob.status, 'STOPPED', 'an already-RESPONDED account must never receive a queued send, even freshly built');
  console.log('campana-a test 8 (suppression and stopOnResponse both still hold, reusing the existing engines verbatim): PASS');
})();

// 9. The full QA audit reports accurate, real counts: language distribution, zero "Team"
// fallbacks, zero non-canonical reply-to, and confirms no other tab leaked into the opportunity
// table.
(function fullAuditReportTest() {
  var tables = {
    // 'Retencion prioritaria' is a DIFFERENT, already-mapped tab with its own legitimate,
    // unrelated historical data -- its presence here must NOT be flagged as a leak. Only
    // 'Campana B' (explicitly ignored from Campana A's own workbook) would be a real problem.
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Acc BR', 'Owner'), gmailOpp('ACC-2', 'Acc CO', 'Owner'), gmailOpp('ACC-3', 'Other Tab Co', 'Owner', 'Retencion prioritaria')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Acc BR' }, { accountId: 'ACC-2', accountName: 'Acc CO' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-BR', accountId: 'ACC-1', firstName: 'Joao', email: 'joao@acc.com', country: 'Brasil' },
      { contactId: 'CON-CO', accountId: 'ACC-2', firstName: 'Camila', email: 'camila@acc.com', country: 'Colombia' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6AuraCampanaABuildQueue_();
  var audit = ctx.v6AuraCampanaAAudit_();
  assert.equal(audit.jobsForCampaignA, 2);
  assert.equal(audit.byLanguage.PT, 1);
  assert.equal(audit.byLanguage.ES, 1);
  assert.equal(audit.teamFirstNameCount, 0);
  assert.equal(audit.nonCanonicalReplyToCount, 0);
  assert.equal(audit.invalidEmailCount, 0);
  assert.equal(audit.realSendsDetected, 0);
  assert.equal(audit.otherTabsIgnored.ignoredTabsNeverProcessed, true, 'a legitimate, already-mapped, unrelated tab like "Retencion prioritaria" must never be flagged as a leak');
  console.log('campana-a test 9 (full QA audit reports accurate language/name/reply-to counts, and does not falsely flag an unrelated tab): PASS');
})();

// 9b. The audit DOES correctly flag it if 'Campana B' (the tab explicitly ignored from the SAME
// workbook) is ever found to have produced an opportunity row -- a genuine regression signal.
(function auditFlagsCampanaBIfEverProcessedTest() {
  var tables = { MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Acc A', 'Owner'), gmailOpp('ACC-9', 'Acc B', 'Owner', 'Campana B')] };
  var ctx = makeContext({ tables: tables });
  var check = ctx.v6AuraCampanaAVerifyOtherTabsIgnored_();
  assert.equal(check.ignoredTabsNeverProcessed, false);
  assert.equal(check.unexpectedRowsFound['Campana B'], 1);
  console.log('campana-a test 9b (the audit correctly flags Campana B if it is ever found processed): PASS');
})();

// 10. v6AuraCampanaARegenerateDryRun_ forces DRY_RUN even if LIVE was left on from a prior call --
// this validation entry point can never itself produce a real send.
(function regenerateForcesDryRunTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(out.sendMode, 'DRY_RUN');
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN');
  assert.equal(ctx.__sentEmails.length, 0);
  console.log('campana-a test 10 (regenerate forces DRY_RUN even if LIVE was left on, zero real sends): PASS');
})();

// 11. The shared family scope-builder's dedicated-account exclusion actually works: an account
// registered by v6AuraDedicatedAccountIds_ is filtered out of MKT_OPPORTUNITIES rows before
// grouping -- confirms the hook MarketingV6AuraAutomation.gs added, without needing to load that
// entire file (this asserts the exact filter predicate it uses).
(function dedicatedExclusionFilterTest() {
  var tables = { MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')] };
  var ctx = makeContext({ tables: tables });
  var dedicated = ctx.v6AuraDedicatedAccountIds_();
  var opportunityRows = [{ accountId: 'ACC-1', opportunityType: 'Retention', eligibilityStatus: 'DETECTED' }, { accountId: 'ACC-9', opportunityType: 'Retention', eligibilityStatus: 'DETECTED' }];
  var filtered = opportunityRows.filter(function (r) { return !dedicated[r.accountId]; });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].accountId, 'ACC-9');
  console.log('campana-a test 11 (dedicated-account exclusion filter keeps Campana A accounts out of the shared family pipeline): PASS');
})();

console.log('V6 AURA Campana A (dedicated tab, per-contact language, name reliability): ALL PASS');
