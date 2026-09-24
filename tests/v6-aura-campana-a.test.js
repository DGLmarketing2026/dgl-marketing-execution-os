const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const src = name => fs.readFileSync(path.join(root, 'backend/apps-script-v6', name), 'utf8');
const gmailIngestSource = src('MarketingV6AuraGmailIngest.gs');
const copyEngineSource = src('MarketingV6AuraCopyEngine.gs');
const dispatcherSource = src('MarketingV6AuraEmailDispatcher.gs');
const creativeApprovalSource = src('MarketingV6AuraCreativeApproval.gs');
const campanaASource = src('MarketingV6AuraCampanaA.gs');

function fakePropertiesService(store) {
  store = store || {};
  return { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setProperty: function (k, v) { store[k] = v; return this; }, deleteProperty: function (k) { delete store[k]; return this; } }; } };
}
// spec: {throws: true} to simulate an inaccessible spreadsheet, or {sheets: {sheetName: values2D}}
// to simulate a real, readable workbook. Defaults to an accessible spreadsheet with NO tabs at
// all (TAB_NOT_FOUND) -- close to the real-world default of "nothing configured yet" and, for
// tests that don't care about the ingest step (they seed MKT_AURA_GMAIL_OPPORTUNITIES directly),
// this fails gracefully rather than throwing.
function fakeSpreadsheetApp(spec) {
  spec = spec || {};
  return {
    openById: function (id) {
      if (spec.throws) throw new Error('SPREADSHEET NOT ACCESSIBLE: ' + id);
      var sheets = spec.sheets || {};
      return {
        getSheetByName: function (name) {
          if (!Object.prototype.hasOwnProperty.call(sheets, name)) return null;
          var values = sheets[name];
          return { getDataRange: function () { return { getValues: function () { return values; } }; } };
        },
        getSheets: function () { return Object.keys(sheets).map(function (n) { return { getName: function () { return n; } }; }); }
      };
    }
  };
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
  var loggedLines = [];
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON,
    console: { log: function (line) { loggedLines.push(line); } },
    PropertiesService: fakePropertiesService(props),
    SpreadsheetApp: fakeSpreadsheetApp(opts.spreadsheetApp),
    ScriptApp: (function () {
      var triggers = (opts.scriptState || (opts.scriptState = {})).triggers || (opts.scriptState.triggers = []);
      var nextId = 1;
      return {
        getProjectTriggers: function () { return triggers.slice(); },
        deleteTrigger: function (t) { triggers = triggers.filter(function (x) { return x !== t; }); opts.scriptState.triggers = triggers; },
        newTrigger: function (handler) {
          return { timeBased: function () { return { everyHours: function (h) { return { create: function () { var id = 'TRIGGER-' + (nextId++); var trig = { getHandlerFunction: function () { return handler; }, getUniqueId: function () { return id; }, _everyHours: h }; triggers.push(trig); return trig; } }; } }; } };
        }
      };
    })(),
    GmailApp: { sendEmail: function (to, subject, text, options) { sentEmails.push({ to: to, subject: subject, text: text, options: options }); } },
    DGL_CONFIG: { DEFAULT_SENDER_NAME: 'DGL' },
    Utilities: { getUuid: (function () { var n = 0; return function () { n++; return String(n).padStart(8, '0') + '-0000-0000-0000-000000000000'; }; })() }
  };
  ctx.LockService={getScriptLock:()=>({waitLock(){},releaseLock(){}})};
  vm.createContext(ctx);
  vm.runInContext(src('MarketingV6CampaignStudio.gs'),ctx);
  vm.runInContext(gmailIngestSource, ctx, { filename: 'MarketingV6AuraGmailIngest.gs' });
  vm.runInContext(copyEngineSource, ctx, { filename: 'MarketingV6AuraCopyEngine.gs' });
  vm.runInContext(dispatcherSource, ctx, { filename: 'MarketingV6AuraEmailDispatcher.gs' });
  vm.runInContext(creativeApprovalSource, ctx, { filename: 'MarketingV6AuraCreativeApproval.gs' });
  vm.runInContext(campanaASource, ctx, { filename: 'MarketingV6AuraCampanaA.gs' });

  var callCounts = { v6Rows_: {}, v6UpsertByKey_: {}, v6BatchUpsertByKey_: {} };
  function bump(bucket, name) { bucket[name] = (bucket[name] || 0) + 1; }
  ctx.v6AuraText_ = function (v) { return String(v == null ? '' : v).trim(); };
  ctx.v6Rows_ = function (name) { bump(callCounts.v6Rows_, name); return (tables[name] || []).map(function (r) { return Object.assign({}, r); }); };
  ctx.v6UpsertByKey_ = function (name, keys, record) {
    bump(callCounts.v6UpsertByKey_, name);
    var rows = tables[name] || (tables[name] = []);
    var at = rows.findIndex(function (row) { return keys.every(function (k) { return String(row[k] || '') === String(record[k] || ''); }); });
    if (at < 0) rows.push(Object.assign({}, record)); else rows[at] = Object.assign({}, record);
    return record;
  };
  // Mirrors v6BatchUpsertByKey_'s real semantics (MarketingV6FrequencyControl.gs): ONE
  // read+merge+write against the SAME `tables` array regardless of how many records are passed
  // -- so a caller switching from N v6UpsertByKey_ calls to one v6BatchUpsertByKey_ call produces
  // identical final table contents, and __callCounts below can prove the call-count reduction
  // DGL asked this pass to report.
  ctx.v6BatchUpsertByKey_ = function (name, keys, records) {
    bump(callCounts.v6BatchUpsertByKey_, name);
    var rows = tables[name] || (tables[name] = []);
    var indexByKey = {};
    rows.forEach(function (row, i) { indexByKey[keys.map(function (k) { return String(row[k] || ''); }).join('')] = i; });
    var created = 0, updated = 0;
    (records || []).forEach(function (record) {
      var key = keys.map(function (k) { return String(record[k] || ''); }).join('');
      var copy = Object.assign({}, record);
      if (Object.prototype.hasOwnProperty.call(indexByKey, key)) { rows[indexByKey[key]] = copy; updated++; }
      else { rows.push(copy); indexByKey[key] = rows.length - 1; created++; }
    });
    return { created: created, updated: updated };
  };
  ctx.v6EnsureContactRecipientSchema_ = function () { return { status: 'SCHEMA READY' }; };
  ctx.v6AuraCampanaAEnsureRunSummarySheet_ = function () { return { status: 'ALREADY_EXISTS' }; };
  // Same stub pattern as v6EnsureContactRecipientSchema_ above -- MarketingV6AuraCreativeApproval.gs's
  // own ensure function opens a real SpreadsheetApp; this file isolates queue-build behavior
  // against MKT_CAMPAIGN_CREATIVES via v6Rows_/v6UpsertByKey_ exactly like every other table.
  ctx.v6AuraEnsureCampaignCreativesSheet_ = function () { return { status: 'ALREADY_EXISTS' }; };
  ctx.v6AuraEnsureCampaignScope_ = function (p) {
    var scopeRows = tables.MKT_CAMPAIGN_SCOPES || (tables.MKT_CAMPAIGN_SCOPES = []);
    scopeRows.push({ scopeId: p.scopeId, campaignId: p.campaignId });
    var accRows = tables.MKT_SCOPE_ACCOUNTS || (tables.MKT_SCOPE_ACCOUNTS = []);
    (p.accountIds || []).forEach(function (id) { accRows.push({ scopeId: p.scopeId, campaignId: p.campaignId, accountId: id, eligibilityStatus: 'ELIGIBLE' }); });
    return { status: 'SCOPE_READY' };
  };
  ctx.v6AuraDeriveExecutionId_ = function (campaignId) { return 'EXEC-' + campaignId; };
  // Real v6AuraGmailUpsertOpportunity_ (MarketingV6AuraGmailIngest.gs) derives a deterministic
  // accountId via v6NormAccount_/v6HashKey_ (MarketingV6ReportIngestion.gs, not loaded here --
  // out of scope for this file). A simple, deterministic stand-in is enough: same normalized
  // name always maps to the same accountId, which is all the real upsert logic depends on.
  ctx.v6NormAccount_ = function (v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  ctx.v6HashKey_ = function (text) { var s = String(text || ''), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'H' + Math.abs(h).toString(16).toUpperCase(); };
  // v6AuraGmailRows_/v6AuraGmailEnsureSheet_ (MarketingV6AuraGmailIngest.gs) normally ensure the
  // real sheet's headers via v6AcqEnsureSheet_ (MarketingV6AcquisitionEngine.gs, not loaded here
  // -- out of scope). Table existence is already handled by the stubbed v6Rows_/v6UpsertByKey_
  // above, so this only needs to be a harmless no-op.
  ctx.v6AcqEnsureSheet_ = function () { return null; };
  ctx.v6AuraPolicyApproved_ = opts.policyApproved === false ? function () { return false; } : function () { return true; };
  ctx.v6FrequencyStatus_ = function () { return { eligible: true, status: 'CLEAR' }; };
  ctx.v6RecipientEmailValid_ = function (email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').toLowerCase()); };
  ctx.v6RecipientActiveExclusion_ = function () { return null; };
  ctx.v6PipelineAdvanced_ = function (stage) { return ['CAMPAIGN ACTIVE', 'RESPONDED', 'RFQ RECEIVED', 'QUOTED', 'LOAD / REACTIVATED', 'RETAINED / EXPANDED', 'COOLDOWN / NURTURE'].indexOf(String(stage || '').toUpperCase()) >= 0; };
  ctx.v6RecordMarketingTouch_ = function () { return {}; };
  ctx.v6RefreshOpportunitiesFromReports_ = function () { return { status: 'REFRESHED' }; };
  // Iniciativa 2 -- v6AuraCampanaABuildQueue_ now requires a valid approved creative (per
  // recipient language) before it will build ANY job (see MarketingV6AuraCreativeApproval.gs).
  // Every test in this file that predates that change assumes the queue simply builds from
  // v6AuraGenerateCopy_/v6AuraEmailHtml_, so a default, checksum-consistent approved creative is
  // seeded here for all three Campana A languages (ES/EN/PT) unless the caller either already
  // supplied its own MKT_CAMPAIGN_CREATIVES rows or explicitly opts out (opts.noDefaultCreative)
  // to exercise the CREATIVE_NOT_APPROVED/CREATIVE_VERSION_MISMATCH blocking path itself.
  if (!opts.noDefaultCreative && !tables.MKT_CAMPAIGN_CREATIVES) {
    var creativeTemplates = [
      { language: 'Spanish', subject: '{{firstName}}, ¿tiene un movimiento en puerta?', htmlBody: '<p>Hola {{firstName}} de {{company}}, movimiento terrestre.</p><a href="mailto:info@dglus.com?subject=RE%20Movimiento">ENVIAR MOVIMIENTO</a> DGL Freight Broker' },
      { language: 'English', subject: '{{firstName}}, do you have a shipment moving?', htmlBody: '<p>Hi {{firstName}} from {{company}}, ground movement.</p><a href="mailto:info@dglus.com?subject=RE%20Movement">SEND MOVEMENT</a> DGL Freight Broker' },
      { language: 'Português (Brasil)', subject: '{{firstName}}, tem um embarque em andamento?', htmlBody: '<p>Ola {{firstName}} de {{company}}, embarque terrestre.</p><a href="mailto:info@dglus.com?subject=RE%20Embarque">ENVIAR EMBARQUE</a> DGL Freight Broker' }
    ];
    tables.MKT_CAMPAIGN_CREATIVES = creativeTemplates.map(function (t, i) {
      var rec = {
        creativeId: 'CMP-CAMPANA-A-HA-PRIORITARIA:CREATIVE:' + (i + 1), campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA',
        templateId: 'editorial', creativeVersion: i + 1, subject: t.subject, preheader: 'Preheader',
        htmlBody: '<img src="'+ctx.V6_STUDIO_LOGO_+'">'+t.htmlBody, textBody: 'Text body', heroUrl: '', logoUrl: ctx.V6_STUDIO_LOGO_, language: t.language,
        approvedAt: new Date().toISOString(), approvedBy: 'Marketing',
        approvalId: 'CAPR:CMP-CAMPANA-A-HA-PRIORITARIA:' + (i + 1), createdAt: new Date().toISOString()
      };
      rec.htmlChecksum = ctx.v6AuraChecksum_(rec.htmlBody);
  rec.contentChecksum = ctx.v6AuraCanonicalContentChecksum_(rec.subject, rec.htmlBody, rec.textBody, rec.templateId, rec.creativeVersion);
      return rec;
    });
  }
  // These legacy mechanics tests isolate the complete-set gate. Its real implementation
  // is exercised with real approval/revocation/context functions in campaign-studio-governed.test.js.
  ctx.v6CampaignStudioSetGate_=()=>({blocked:false,context:{approvedCreativeVariants:Object.fromEntries(["ES","EN","PT"].map(l=>[l,ctx.v6AuraLatestApprovedCreativeForLanguage_("CMP-CAMPANA-A-HA-PRIORITARIA",l)]))}});
  // Cell storage adapter: retain all foreign properties, matching the real sheet adapter.
  ctx.v6CampaignStudioPatchCampaign_=(id,p)=>{const rows=tables.MKT_CAMPAIGNS||(tables.MKT_CAMPAIGNS=[]);let row=rows.find(r=>r.campaignId===id);if(!row){row={createdAt:new Date().toISOString()};rows.push(row);}Object.assign(row,p);};
  ctx.__tables = tables; ctx.__sentEmails = sentEmails; ctx.__loggedLines = loggedLines; ctx.__callCounts = callCounts;
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
  assert.equal(parsedA.family, 'Activation');
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
  assert(jobs.every(j=>j.playbookId==='Activation'), 'future jobs must stay Activation');
  assert.equal(tables.MKT_CAMPAIGNS[0].campaignType, 'Activation');
  assert.equal(tables.MKT_CAMPAIGNS[0].objective, 'Activation');
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
// subject drops the leading "{{firstName}}, " clause and capitalizes what follows -- while a
// real, reliable name still personalizes normally. Campana A generates ACTIVATION copy (not
// Retention -- see the 'Retention'->'Activation' runtime fix), so the expected subject text below
// is the real MKT_V6_AURA_ACTIVATION["Current Movement"].es subjectA template, service defaults
// to 'Multiservicio' (Campana A's fixed campaign-level service).
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
  // This test's whole point is the no-name-subject transformation (v6AuraCampanaASubject_,
  // unchanged by Iniciativa 2), so the approved-creative fixture carries the real Activation
  // subjectA template's exact wording -- "{{firstName}}, ...{{service}}..." -- as a FIXED literal
  // rather than a fresh v6AuraGenerateCopy_() call, since that engine can select among more than
  // one real variant non-deterministically and this test needs one specific, known template.
  var realTemplateCreative = {
    creativeId: 'CMP-CAMPANA-A-HA-PRIORITARIA:CREATIVE:TEST6', campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA',
    templateId: 'editorial', creativeVersion: 99, subject: '{{firstName}}, ¿tiene algún movimiento para estos días?', preheader: 'Preheader',
    htmlBody: '<p>{{firstName}} {{company}}</p><a href="mailto:info@dglus.com?subject=RE">ENVIAR MOVIMIENTO</a> DGL Freight Broker',
    textBody: 'Text body', heroUrl: '', logoUrl: '', language: 'Spanish',
    approvedAt: new Date().toISOString(), approvedBy: 'Marketing', approvalId: 'CAPR:TEST6', createdAt: new Date().toISOString()
  };
  realTemplateCreative.logoUrl=ctx.V6_STUDIO_LOGO_;
  realTemplateCreative.htmlBody='<img src="'+ctx.V6_STUDIO_LOGO_+'">'+realTemplateCreative.htmlBody;
  realTemplateCreative.contentChecksum=ctx.v6AuraCanonicalContentChecksum_(realTemplateCreative.subject,realTemplateCreative.htmlBody,realTemplateCreative.textBody,realTemplateCreative.templateId,realTemplateCreative.creativeVersion);
  realTemplateCreative.htmlChecksum = ctx.v6AuraChecksum_(realTemplateCreative.htmlBody);
  tables.MKT_CAMPAIGN_CREATIVES = [realTemplateCreative];
  ctx.v6AuraCampanaABuildQueue_();
  var genericJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-GENERIC'; })[0];
  assert.equal(genericJob.firstName, '', 'a generic role/mailbox name must never be used, and never fall back to a fabricated "Team"');
  assert.equal(genericJob.subject, '¿tiene algún movimiento para estos días?', 'the no-name subject must drop the leading "{{firstName}}, " clause from the real Activation subjectA template, with no fabricated "Team,"');
  assert(genericJob.subject.indexOf('Team') < 0);
  var realJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-REAL'; })[0];
  assert.equal(realJob.firstName, 'Sofia');
  assert.equal(realJob.subject, 'Sofia, ¿tiene algún movimiento para estos días?');
  console.log('campana-a test 6 (generic names never used; real names personalize; no-name subject uses the real Activation template, no fallback to Retention): PASS');
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

// 8. Suppression (a real DNC contact, excluded by v6AuraCampanaAResolveRecipients_'s own governed
// check) and stopOnResponse (an already-RESPONDED account) both still hold under the new
// tab-primary resolver -- neither protection was weakened by making the tab the primary source.
(function suppressionAndStopStillHoldTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner'), gmailOpp('ACC-2', 'Responded Co', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }, { accountId: 'ACC-2', accountName: 'Responded Co' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-SUPPRESSED', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia', doNotContact: true },
      { contactId: 'CON-STOPPED', accountId: 'ACC-2', firstName: 'Ana', email: 'ana@respondedco.com', country: 'Colombia' }
    ],
    MKT_ACCOUNT_PIPELINE: [{ accountId: 'ACC-2', currentStage: 'RESPONDED' }]
  };
  var ctx = makeContext({ tables: tables });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'a real DNC contact must never be queued, even sourced only from MKT_CONTACTS_SECURE');
  assert.equal(build.excludedByReason.DO_NOT_CONTACT, 1);
  var stoppedJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-STOPPED'; })[0];
  assert.equal(stoppedJob.status, 'STOPPED', 'an already-RESPONDED account must never receive a queued send, even freshly built');
  console.log('campana-a test 8 (suppression (real DNC) and stopOnResponse both still hold under the new tab-primary resolver): PASS');
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

// 12. RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN logs the full result AND a flat summary carrying
// every field DGL asked to see in the execution log (Cloud Logging retention for a given run is
// not always available, so this is the one place a human running it from the editor can read
// the outcome) -- while still returning the exact same result v6AuraCampanaARegenerateDryRun_
// itself produces, unchanged.
(function wrapperLogsResultTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  var ctx = makeContext({ tables: tables });
  var result = ctx.RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN();
  assert.equal(result.sendMode, 'DRY_RUN', 'the wrapper must still return the exact same result unchanged');
  // v6AuraCampanaARegenerateDryRun_ (and every function it calls) now ALSO logs real-time
  // START/END stage markers as they happen (v6AuraCampanaALog_) -- these are plain strings, not
  // JSON, and land BEFORE the wrapper's own two JSON.stringify calls (the full result, then the
  // flat summary), which are always the LAST two lines logged.
  assert(ctx.__loggedLines.length > 2, 'real-time per-stage log lines must be present in addition to the final full-result/summary logs');
  var jsonLines = ctx.__loggedLines.slice(-2);
  var full = JSON.parse(jsonLines[0]);
  assert.equal(full.build.recipients, 1);
  var summary = JSON.parse(jsonLines[1]);
  ['sendMode', 'recipients', 'built', 'blockedNoReplyTo', 'dispatchSuppressed', 'dispatchFailed', 'invalidEmailCount', 'duplicateJobKeys', 'byLanguage', 'realSendsDetected', 'findings'].forEach(function (key) {
    assert(key in summary, 'summary log is missing required field: ' + key);
  });
  assert.equal(summary.realSendsDetected, 0);
  assert.equal(summary.built, 1);
  console.log('campana-a test 12 (RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN logs the full result and a flat summary with every required field): PASS');
})();

// 12b. Performance-diagnosis requirement (2026-09-16, second production timeout at the same
// ~30-minute duration): every named stage logs a real-time START line the moment it begins and
// an END line the moment it finishes, IN ORDER -- so a run that times out mid-execution is
// diagnosable from the Apps Script execution transcript alone (the last START line with no
// matching END line names exactly where it got stuck), not just from a profile object a timed-out
// run never returns.
(function realTimeStageMarkersLoggedInOrderTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValues([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  // A successful direct-spreadsheet ingest (status OK below) is required to exercise
  // PARSE_START/END and the GMAIL_REPROCESS_SKIPPED path -- seed the real account/contact under
  // whatever real accountId the ingest actually derives, exactly like test 18 above.
  var ingest = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(ingest.status, 'OK', 'sanity check: this test requires a real, successful ingest to exercise every stage');
  var realAccountId = ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-1', accountId: realAccountId, firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' });
  ctx.__loggedLines.length = 0; // this test only cares about markers from the regenerate call below
  ctx.v6AuraCampanaARegenerateDryRun_();
  var lines = ctx.__loggedLines;
  var expectedInOrder = [
    'REGENERATE_START', 'TRIGGER_INSTALL_START', 'TRIGGER_INSTALL_END',
    'SOURCE_READ_START', 'SOURCE_READ_END', 'PARSE_START', 'PARSE_END',
    'MATCH_START', 'MATCH_END', 'ELIGIBILITY_START', 'ELIGIBILITY_END',
    'MATCH_START (per-contact index preload)', 'MATCH_END (per-contact index preload',
    'LANGUAGE_START', 'LANGUAGE_END', 'ELIGIBILITY_END (per-contact', 'COPY_END',
    'QUEUE_WRITE_START', 'QUEUE_WRITE_END',
    'PREFLIGHT_START', 'PREFLIGHT_END', 'DISPATCH_START', 'DISPATCH_END',
    'AUDIT_START', 'AUDIT_END', 'REGENERATE_END'
  ];
  var lastIndex = -1;
  expectedInOrder.forEach(function (marker) {
    var idx = lines.findIndex(function (line, i) { return i > lastIndex && line.indexOf(marker) >= 0; });
    assert(idx >= 0, 'expected stage marker not found (or out of order) after index ' + lastIndex + ': ' + marker);
    lastIndex = idx;
  });
  // The Gmail reprocess fallback must be explicitly logged as SKIPPED (not silently omitted)
  // when the direct spreadsheet read already succeeded -- proves the redundant-work elimination
  // is visible, not just assumed.
  assert(lines.some(function (l) { return l.indexOf('GMAIL_REPROCESS_SKIPPED') >= 0; }), 'a successful direct ingest must log that the Gmail reprocess fallback was skipped as redundant');
  console.log('campana-a test 12b (every named stage logs a real-time START/END marker in order, and the redundant Gmail-reprocess fallback is explicitly logged as skipped): PASS');
})();

function campanaASheetValues(dataRows) {
  return [['Marketing DGL Report'], ['Summary line'], [], ['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad']].concat(dataRows);
}
// A version of the same real layout with extra, plausible per-row columns (País, Contacto,
// Email) -- used to test the diagnostic capture/traceability pieces without assuming these are
// the ONLY real header names (the code checks several candidates; these are simply one concrete,
// realistic example used for testing).
function campanaASheetValuesWithContacts(dataRows) {
  return [['Marketing DGL Report'], ['Summary line'], [], ['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad', 'País', 'Contacto', 'Email']].concat(dataRows);
}

// 13. The source spreadsheet id resolves from the Script Property when configured, and falls
// back to the real, Drive-confirmed default id when it is not -- mirroring the established
// AURA_GMAIL_SOURCE_MAILBOX property+fallback pattern.
(function resolveSourceSpreadsheetIdTest() {
  var ctx1 = makeContext({});
  assert.equal(ctx1.v6AuraCampanaAResolveSourceSpreadsheetId_(), '1GlYvjGKfhCWxPHoNzjEGDz--dT6t7WV4w2YAXvEXJ_c');
  var ctx2 = makeContext({ props: { CAMPANA_A_SOURCE_SPREADSHEET_ID: 'CUSTOM-ID-123' } });
  assert.equal(ctx2.v6AuraCampanaAResolveSourceSpreadsheetId_(), 'CUSTOM-ID-123', 'an explicitly configured property must override the default');
  console.log('campana-a test 13 (source spreadsheet id resolves from property, falls back to the real default): PASS');
})();

// 14. An inaccessible spreadsheet fails closed with a specific, distinguishable status -- never
// a silent zero.
(function ingestSpreadsheetNotAccessibleTest() {
  var ctx = makeContext({ spreadsheetApp: { throws: true } });
  var out = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(out.status, 'SPREADSHEET_NOT_ACCESSIBLE');
  console.log('campana-a test 14 (an inaccessible source spreadsheet fails closed with SPREADSHEET_NOT_ACCESSIBLE): PASS');
})();

// 15. A spreadsheet that opens fine but has no tab by this exact name fails closed with
// TAB_NOT_FOUND and lists the tabs that DO exist, for diagnosis.
(function ingestTabNotFoundTest() {
  var ctx = makeContext({ spreadsheetApp: { sheets: { 'Campana B': campanaASheetValues([]) } } });
  var out = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(out.status, 'TAB_NOT_FOUND');
  assert.deepEqual(out.availableSheets, ['Campana B']);
  console.log('campana-a test 15 (a missing exact-name tab fails closed with TAB_NOT_FOUND, listing what does exist): PASS');
})();

// 16. The real happy path: reading the live source spreadsheet directly ingests real rows into
// MKT_AURA_GMAIL_OPPORTUNITIES with the correct sourceSheet, which the rest of the pipeline
// (account map, queue build) then picks up exactly as if it had arrived by email -- proving this
// is dynamic, not a copy-pasted fixture.
(function ingestFromSpreadsheetFullPipelineTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValues([
    ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High'],
    ['Shipper Co', 'Ana Ruiz', 'HA priority', 'High']
  ]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  var ingest = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(ingest.status, 'OK');
  assert.equal(ingest.accepted, 2);
  assert.equal(ingest.created, 2);
  var opp = tables.MKT_AURA_GMAIL_OPPORTUNITIES.filter(function (r) { return r.accountName === 'Progeral Corp'; })[0];
  assert.equal(opp.sourceSheet, 'Campana A - HA prioritaria');
  assert.equal(opp.amOwner, 'Luis Simoes');
  var accountMap = ctx.v6AuraCampanaAAccountMap_();
  assert.equal(Object.keys(accountMap).length, 2, 'both real rows read directly from the spreadsheet must be picked up by the account registry');
  console.log('campana-a test 16 (reading the live source spreadsheet directly ingests real rows the rest of the pipeline picks up): PASS');
})();

// 17. Fail-closed end to end: when the source resolves to zero accounts (nothing ingested), the
// full regenerate reports status SOURCE_EMPTY_OR_NOT_FOUND at the top level and the audit is
// NEVER reported clean:true just because there happened to be no findings among zero jobs.
(function failClosedOnEmptySourceTest() {
  var ctx = makeContext({ spreadsheetApp: { sheets: {} } });
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(out.status, 'SOURCE_EMPTY_OR_NOT_FOUND');
  assert.equal(out.build.accounts, 0);
  assert.equal(out.audit.sourceStatus, 'SOURCE_EMPTY_OR_NOT_FOUND');
  assert.equal(out.audit.clean, false, 'an empty/unreachable source must never be reported as a clean audit');
  console.log('campana-a test 17 (zero accounts from the source fails closed: SOURCE_EMPTY_OR_NOT_FOUND, audit never clean:true): PASS');
})();

// 18. Full end-to-end regenerate against a real, readable source: real accounts, real
// recipients, real jobs, status REGENERATE_COMPLETE, still zero real sends.
(function fullEndToEndRegenerateWithRealSourceTest() {
  var tables = {
    MKT_ACCOUNTS: [{ accountId: 'ACC-PROGERAL', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-PROGERAL', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  // v6AuraGmailOpportunityId_ derives accountId as 'ACC-' + hash(normalized account name); to
  // keep this test independent of that exact hash function, seed the contact under whatever
  // accountId the real ingest actually produced.
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': campanaASheetValues([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High']]) } } });
  var ingested = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_CONTACTS_SECURE[0].accountId = realAccountId;
  tables.MKT_ACCOUNTS[0].accountId = realAccountId;
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(out.status, 'REGENERATE_COMPLETE');
  assert.equal(out.build.accounts, 1);
  assert.equal(out.build.recipients, 1);
  assert.equal(out.build.built, 1);
  assert.equal(out.audit.sourceStatus, 'SOURCE_OK');
  assert.equal(out.audit.realSendsDetected, 0);
  assert.equal(ctx.__sentEmails.length, 0);
  console.log('campana-a test 18 (full end-to-end regenerate against a real readable source produces real accounts/recipients/jobs, zero real sends): PASS');
})();

// 19. The ingest captures every real header name found in the tab (headersFound) and persists a
// diagnostic row per source row -- including a country column, under whatever real name it has
// -- BEFORE any accept/reject decision, so nothing is silently lost even if it turns out
// unused downstream.
(function sourceRowsCapturedWithRealHeadersTest() {
  var tables = {};
  var sheetValues = campanaASheetValuesWithContacts([
    ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Brasil', 'Joao Silva', 'joao@progeral.com']
  ]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  var ingest = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(ingest.status, 'OK');
  assert.deepEqual(ingest.headersFound, ['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad', 'País', 'Contacto', 'Email']);
  assert.equal(ingest.rowsWithCountry, 1);
  assert.equal(ingest.rowsWithContactOrEmail, 1);
  var sourceRow = tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS[0];
  assert.equal(sourceRow.country, 'Brasil');
  assert.equal(sourceRow.countryHeader, 'País');
  assert.equal(sourceRow.email, 'joao@progeral.com');
  assert.equal(sourceRow.contactName, 'Joao Silva');
  console.log('campana-a test 19 (real headers and per-row country/contact/email are captured before any accept/reject decision): PASS');
})();

// 20. Language traceability: the tab's own country column is used as the primary country source
// (per DGL's instruction), ahead of whatever MKT_CONTACTS_SECURE/MKT_ACCOUNTS may or may not
// carry, and every job records languageSource/languageReason -- never a bare, unexplained value.
(function languageTraceabilityTabCountryPrimaryTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Brasil', '', '']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp', country: 'United States' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-1', accountId: realAccountId, firstName: 'Joao', email: 'joao@progeral.com' });
  ctx.v6AuraCampanaABuildQueue_();
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.preferredLanguage, 'PT', 'the tab\'s own country (Brasil) must win over the MKT_ACCOUNTS country (United States)');
  assert.equal(job.languageSource, 'CAMPANA_A_TAB_COUNTRY');
  assert(job.languageReason.indexOf('Brasil') >= 0, 'the reason must name the real value that drove the decision');
  console.log('campana-a test 20 (the Campana A tab\'s own country is the primary source, ahead of the matched account\'s record, with a named reason): PASS');
})();

// 21. Broadened language-value normalization: a real contact-level 'language' field spelled out
// in full ('Spanish') still resolves correctly, and is still ranked ahead of the tab's country.
(function languageValueNormalizationTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Brasil', '', '']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-1', accountId: realAccountId, firstName: 'Joao', email: 'joao@progeral.com', language: 'Spanish' });
  ctx.v6AuraCampanaABuildQueue_();
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.preferredLanguage, 'ES', "a full-word value ('Spanish') must be recognized, not just the bare 'ES' code");
  assert.equal(job.languageSource, 'CONTACT_EXPLICIT_SIGNAL');
  console.log('campana-a test 21 (a full-word language value like Spanish/English/Portuguese is recognized, still ranked above the tab country): PASS');
})();

// 22. STOPPED breakdown reports exact, real counts by stage and by the prior campaignId that
// produced the stop -- never a guessed percentage -- reading back exactly what
// v6AuraCampanaABuildQueue_ captured onto each job, without changing what counts as stopped.
(function stoppedBreakdownRealCountsTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Responded Co', 'Owner'), gmailOpp('ACC-2', 'Quoted Co', 'Owner'), gmailOpp('ACC-3', 'Active Co', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Responded Co' }, { accountId: 'ACC-2', accountName: 'Quoted Co' }, { accountId: 'ACC-3', accountName: 'Active Co' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-1', accountId: 'ACC-1', firstName: 'A', email: 'a@respondedco.com', country: 'USA' },
      { contactId: 'CON-2', accountId: 'ACC-2', firstName: 'B', email: 'b@quotedco.com', country: 'USA' },
      { contactId: 'CON-3', accountId: 'ACC-3', firstName: 'C', email: 'c@activeco.com', country: 'USA' }
    ],
    MKT_ACCOUNT_PIPELINE: [
      { accountId: 'ACC-1', currentStage: 'RESPONDED', responseAt: '2026-06-01T00:00:00Z', campaignId: 'CMP-OLD-QNB-1' },
      { accountId: 'ACC-2', currentStage: 'QUOTED', responseAt: '2026-05-15T00:00:00Z', campaignId: 'CMP-OLD-QNB-1' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6AuraCampanaABuildQueue_();
  var breakdown = ctx.v6AuraCampanaAStoppedBreakdown_();
  assert.equal(breakdown.totalStopped, 2);
  assert.equal(breakdown.byStage.RESPONDED, 1);
  assert.equal(breakdown.byStage.QUOTED, 1);
  assert.equal(breakdown.byPriorCampaignId['CMP-OLD-QNB-1'], 2, 'both stops must be traceable to the exact prior campaignId that produced them');
  var activeJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.accountId === 'ACC-3'; })[0];
  assert.equal(activeJob.status, 'PENDING', 'an account with no advanced pipeline stage must never be reported as stopped');
  console.log('campana-a test 22 (STOPPED breakdown reports exact real counts by stage and by the prior campaign that caused it): PASS');
})();

// 23. Match report: a real, deterministic normalized-name match recovers a legitimate spelling
// difference (a missing "Corp" suffix), while a genuinely different/unmatched account name is
// reported with a real reason -- never a silent join, never a fuzzy guess.
(function matchReportDeterministicNormalizationTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-MATCH', 'Progeral Corp', 'Owner'), gmailOpp('ACC-NOMATCH', 'Totally Unknown Company', 'Owner')],
    // MKT_ACCOUNTS spells the SAME real company without "Corp" -- a legitimate difference this
    // deterministic normalizer must recover, without ever guessing across two different names.
    MKT_ACCOUNTS: [{ accountId: 'ACC-REAL-1', accountName: 'Progeral' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-REAL-1', firstName: 'Maria', email: 'maria@progeral.com' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6EnsureContactRecipientSchema_ = function () { return { status: 'SCHEMA READY' }; };
  ctx.v6AuraCampanaAEnsureRunSummarySheet_ = function () { return { status: 'ALREADY_EXISTS' }; };
  // Seed MKT_AURA_CAMPANA_A_SOURCE_ROWS directly, as the ingest step would have written it.
  tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS = [
    { sourceRow: 5, accountName: 'Progeral Corp', amOwner: 'Owner', contactName: '', email: '', country: '' },
    { sourceRow: 6, accountName: 'Totally Unknown Company', amOwner: 'Owner', contactName: '', email: '', country: '' }
  ];
  var report = ctx.v6AuraCampanaAMatchReport_();
  assert.equal(report.sourceAccountCount, 2);
  assert.equal(report.accountsMatched, 1, 'the normalized-name match must recover "Progeral Corp" vs "Progeral"');
  assert.equal(report.accountsUnmatched, 1);
  assert.equal(report.unmatchedAccounts[0].accountName, 'Totally Unknown Company');
  assert(report.unmatchedAccounts[0].reason, 'every unmatched account must carry a real reason, not just a count');
  console.log('campana-a test 23 (match report recovers a legitimate "Corp" spelling difference deterministically, reports a real unmatched account with a reason): PASS');
})();

// 24. Match report evaluates whether the tab itself already provides usable contact columns
// (email) -- the concrete signal for "can Campana A work directly with these contacts without
// depending on a NOVA account-hash match."
(function matchReportEvaluatesDirectContactAvailabilityTest() {
  var tables = { MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')], MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  tables.MKT_AURA_CAMPANA_A_SOURCE_ROWS = [{ sourceRow: 5, accountName: 'Progeral Corp', amOwner: 'Owner', contactName: 'Joao Silva', email: 'joao@progeral.com', country: 'Brasil' }];
  var ctx = makeContext({ tables: tables });
  var report = ctx.v6AuraCampanaAMatchReport_();
  assert.equal(report.tabProvidesContactColumns, true);
  assert.equal(report.sourceContactCount, 1);
  assert.equal(report.contactsMatched, 0, 'no MKT_CONTACTS_SECURE row exists yet for this account, so this real email is currently unmatched');
  assert.equal(report.unmatchedContacts[0].reason, 'NO_CONTACTS_SECURE_ROWS_FOR_ACCOUNT');
  console.log('campana-a test 24 (match report correctly evaluates whether the tab already provides usable contact/email columns): PASS');
})();

// 25. The real recipient-gap fix: an account whose MKT_ACCOUNTS name legitimately differs from
// the tab's spelling only by a corporate suffix ("Progeral" vs "Progeral Corp") is now scoped by
// its REAL account id, so v6ResolveRecipients_ actually finds and queues its real contact --
// not just reported as a diagnostic, a genuine recipient recovery.
(function realAccountResolutionRecoversRecipientTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValues([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var hashAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  // The REAL account in MKT_ACCOUNTS/MKT_CONTACTS_SECURE uses a DIFFERENT id (as it would coming
  // from NOVA) and a legitimately different spelling of the same company -- no "Corp" suffix.
  var realAccountId = 'ACC-NOVA-REAL-42';
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-REAL-1', accountId: realAccountId, firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' });
  assert.notEqual(hashAccountId, realAccountId, 'sanity check: the hash id and the real NOVA id must genuinely differ for this test to be meaningful');

  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'the real contact must be recovered and queued via normalized-name matching, not silently dropped');
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.accountId, realAccountId, 'the job must be scoped under the REAL MKT_ACCOUNTS id, not the hash id, so downstream stage/frequency/pipeline lookups work correctly');
  assert.equal(job.company, 'Progeral');
  assert.equal(job.email, 'maria@progeral.com');

  var dedicated = ctx.v6AuraDedicatedAccountIds_();
  assert(dedicated[hashAccountId], 'the hash id must still be excluded from the shared family pipeline');
  assert(dedicated[realAccountId], 'the resolved real id must ALSO be excluded from the shared family pipeline');
  console.log('campana-a test 25 (a legitimate account-name spelling difference now recovers the real contact into the queue, not just a diagnostic report): PASS');
})();

// 26. The governed stale-cross-family override: a RESPONDED stage from a DIFFERENT campaign
// family, more than 90 days old, no longer blocks Campana A (whose real family is Activation,
// not Retention -- see the 'Retention'->'Activation' runtime fix) -- but a recent one, a
// same-family(Activation) one, and a CLOSED/SUPPRESSED or LOAD/RETAINED stage are never
// overridden. Every decision is captured on the job for audit.
(function staleCrossFamilyOverrideTest() {
  function scenario(pipelineRow, priorCampaignRow) {
    var tables = {
      MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Old Response Co', 'Owner')],
      MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Old Response Co' }],
      MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Ana', email: 'ana@oldresponseco.com', country: 'USA' }],
      MKT_ACCOUNT_PIPELINE: [Object.assign({ accountId: 'ACC-1' }, pipelineRow)],
      MKT_CAMPAIGNS: priorCampaignRow ? [priorCampaignRow] : []
    };
    var ctx = makeContext({ tables: tables });
    ctx.v6AuraCampanaABuildQueue_();
    return tables.MKT_EMAIL_QUEUE[0];
  }
  var oldDate = new Date(Date.now() - 120 * 86400000).toISOString();
  var recentDate = new Date(Date.now() - 10 * 86400000).toISOString();

  // (a) Stale (120d) RESPONDED from a DIFFERENT family (QNB) -> overridden, job proceeds.
  var overridden = scenario(
    { currentStage: 'RESPONDED', responseAt: oldDate, campaignId: 'CMP-OLD-QNB' },
    { campaignId: 'CMP-OLD-QNB', objective: 'Quoted Not Booked' }
  );
  assert.notEqual(overridden.status, 'STOPPED', 'a stale, cross-family response must no longer block Campana A');
  assert.equal(overridden.stopOverrideApplied, 'YES');
  assert.equal(overridden.stopOverrideReason, 'STALE_CROSS_FAMILY_RESPONSE');

  // (b) Recent (10d) RESPONDED from a different family -> NOT overridden (too recent).
  var recent = scenario(
    { currentStage: 'RESPONDED', responseAt: recentDate, campaignId: 'CMP-OLD-QNB' },
    { campaignId: 'CMP-OLD-QNB', objective: 'Quoted Not Booked' }
  );
  assert.equal(recent.status, 'STOPPED', 'a recent response must still block, regardless of family');
  assert.equal(recent.stopOverrideApplied, 'NO');
  assert.equal(recent.stopOverrideReason, 'RESPONSE_NOT_YET_STALE');

  // (c) Stale RESPONDED, but from the SAME family (Activation -- Campana A's own family) -> NOT
  // overridden.
  var sameFamily = scenario(
    { currentStage: 'RESPONDED', responseAt: oldDate, campaignId: 'CMP-OLD-ACTIVATION' },
    { campaignId: 'CMP-OLD-ACTIVATION', objective: 'Activation' }
  );
  assert.equal(sameFamily.status, 'STOPPED', 'a still-active Activation-family response must never be overridden by this rule');
  assert.equal(sameFamily.stopOverrideReason, 'SAME_FAMILY_ACTIVATION_STILL_ACTIVE');

  // (d) CLOSED / SUPPRESSED, even if old and cross-family -> NEVER overridden (hard stop).
  var closed = scenario(
    { currentStage: 'CLOSED / SUPPRESSED', responseAt: oldDate, campaignId: 'CMP-OLD-QNB' },
    { campaignId: 'CMP-OLD-QNB', objective: 'Quoted Not Booked' }
  );
  assert.equal(closed.status, 'STOPPED', 'CLOSED / SUPPRESSED must always be a hard stop, never overridden');
  assert.equal(closed.stopOverrideReason, 'HARD_STOP_CLOSED_SUPPRESSED');

  // (e) LOAD / REACTIVATED (an ongoing, successful relationship), old and cross-family -> NEVER
  // overridden -- this is a real engaged account, not a stale one-off response.
  var engaged = scenario(
    { currentStage: 'LOAD / REACTIVATED', responseAt: oldDate, campaignId: 'CMP-OLD-QNB' },
    { campaignId: 'CMP-OLD-QNB', objective: 'Quoted Not Booked' }
  );
  assert.equal(engaged.status, 'STOPPED', 'an ongoing engaged relationship (LOAD/REACTIVATED) must never be overridden');
  assert.equal(engaged.stopOverrideReason, 'STAGE_NOT_ELIGIBLE_FOR_OVERRIDE');

  console.log('campana-a test 26 (governed stale-cross-family override: only a stale, different-family, non-terminal response is overridden -- never CLOSED/SUPPRESSED or an ongoing engaged relationship): PASS');
})();

// 27. v6AuraCampanaAStoppedBreakdown_ reports override statistics accurately.
(function stoppedBreakdownReportsOverridesTest() {
  var oldDate = new Date(Date.now() - 120 * 86400000).toISOString();
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Overridden Co', 'Owner'), gmailOpp('ACC-2', 'Still Stopped Co', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Overridden Co' }, { accountId: 'ACC-2', accountName: 'Still Stopped Co' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-1', accountId: 'ACC-1', firstName: 'A', email: 'a@overriddenco.com', country: 'USA' },
      { contactId: 'CON-2', accountId: 'ACC-2', firstName: 'B', email: 'b@stillstoppedco.com', country: 'USA' }
    ],
    MKT_ACCOUNT_PIPELINE: [
      { accountId: 'ACC-1', currentStage: 'RESPONDED', responseAt: oldDate, campaignId: 'CMP-OLD-QNB' },
      { accountId: 'ACC-2', currentStage: 'CLOSED / SUPPRESSED', responseAt: oldDate, campaignId: 'CMP-OLD-QNB' }
    ],
    MKT_CAMPAIGNS: [{ campaignId: 'CMP-OLD-QNB', objective: 'Quoted Not Booked' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.v6AuraCampanaABuildQueue_();
  var breakdown = ctx.v6AuraCampanaAStoppedBreakdown_();
  assert.equal(breakdown.totalStopped, 1, 'only the CLOSED/SUPPRESSED account remains stopped');
  assert.equal(breakdown.totalOverridden, 1, 'the stale cross-family RESPONDED account must be counted as overridden');
  assert.equal(breakdown.byOverrideReason.STALE_CROSS_FAMILY_RESPONSE, 1);
  assert.equal(breakdown.byOverrideReason.HARD_STOP_CLOSED_SUPPRESSED, 1);
  console.log('campana-a test 27 (STOPPED breakdown reports accurate override counts and reasons): PASS');
})();

// 28. Preflight: a job that fails a real check (invalid email) is individually suppressed with a
// specific reason and does NOT block any other job in the campaign; a job that passes everything
// is counted toward wouldSend and its real language, and readyForLive reflects the real outcome.
(function preflightSuppressesOnlyTheFailingJobTest() {
  var tables = {
    MKT_EMAIL_QUEUE: [
      { jobId: 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:CON-BAD:1', campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', accountId: 'ACC-1', contactId: 'CON-BAD', email: 'not-an-email', replyTo: 'info@dglus.com', status: 'PENDING', preferredLanguage: 'ES' },
      { jobId: 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:CON-GOOD:1', campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', accountId: 'ACC-2', contactId: 'CON-GOOD', email: 'good@shipperco.com', replyTo: 'info@dglus.com', status: 'PENDING', preferredLanguage: 'EN' }
    ]
  };
  var ctx = makeContext({ tables: tables });
  var preflight = ctx.v6AuraCampanaAPreflight_();
  assert.equal(preflight.totalPending, 2);
  assert.equal(preflight.suppressedByPreflight, 1);
  assert.equal(preflight.wouldSend, 1);
  assert.equal(preflight.byLanguage.EN, 1);
  assert.equal(preflight.readyForLive, true, 'at least one safely-determined job exists, so the campaign is ready for live review');
  var badJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-BAD'; })[0];
  assert.equal(badJob.status, 'SUPPRESSED');
  assert(badJob.error.indexOf('INVALID_EMAIL') >= 0);
  var goodJob = tables.MKT_EMAIL_QUEUE.filter(function (j) { return j.contactId === 'CON-GOOD'; })[0];
  assert.equal(goodJob.status, 'PENDING', 'a job that fails preflight must never affect a different, valid job in the same campaign');
  console.log('campana-a test 28 (preflight suppresses only the failing job, by specific reason, without blocking the rest of the campaign): PASS');
})();

// 29. Preflight reports readyForLive:false when every pending job fails, and runs automatically
// inside the regenerate cycle, before dispatch, without ever touching AURA_SEND_MODE.
(function preflightNotReadyWhenAllFailTest() {
  var tables = {
    MKT_EMAIL_QUEUE: [{ jobId: 'JOB:X:CON-BAD:1', campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', accountId: 'ACC-1', contactId: 'CON-BAD', email: 'nope', replyTo: '', status: 'PENDING', preferredLanguage: 'ES' }]
  };
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: {} } });
  var preflight = ctx.v6AuraCampanaAPreflight_();
  assert.equal(preflight.readyForLive, false);
  assert.equal(preflight.wouldSend, 0);

  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(out.sendMode, 'DRY_RUN');
  assert(out.preflight, 'the regenerate cycle must run preflight automatically, before dispatch');
  console.log('campana-a test 29 (preflight correctly reports not-ready-for-live when nothing is safely sendable, and runs automatically inside regenerate): PASS');
})();

// 30. Regenerate installs the dispatcher's hourly trigger (idempotently -- never duplicated on a
// second run), so the one manual execution DGL runs also confirms automation is wired, without a
// second manual step.
(function regenerateInstallsDispatcherTriggerIdempotentlyTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  var scriptState = {};
  var ctx = makeContext({ tables: tables, scriptState: scriptState });
  var first = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(first.triggerStatus.status, 'TRIGGER_INSTALLED');
  assert.equal(scriptState.triggers.length, 1);
  var second = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(second.triggerStatus.status, 'TRIGGER_EXISTS');
  assert.equal(scriptState.triggers.length, 1, 'a second regenerate call must never install a duplicate dispatcher trigger');
  console.log('campana-a test 30 (regenerate installs the dispatcher trigger idempotently, never duplicated): PASS');
})();

// 31. Performance regression guard for the 2026-09-16 production timeout (227 contacts took 30
// minutes): with a realistically large number of accounts/contacts, MKT_EMAIL_QUEUE must be
// written via exactly ONE v6BatchUpsertByKey_ call, NEVER via a per-contact v6UpsertByKey_ call
// -- proving the O(n^2) growing-table upsert loop that caused the real incident is gone, not just
// individually fast in a small test.
(function batchedWriteCallCountScalesTest() {
  var N = 150;
  var tables = { MKT_AURA_GMAIL_OPPORTUNITIES: [], MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  for (var i = 0; i < N; i++) {
    var accountId = 'ACC-' + i;
    tables.MKT_AURA_GMAIL_OPPORTUNITIES.push(gmailOpp(accountId, 'Account ' + i, 'Owner'));
    tables.MKT_ACCOUNTS.push({ accountId: accountId, accountName: 'Account ' + i });
    tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-' + i, accountId: accountId, firstName: 'Person' + i, email: 'person' + i + '@account' + i + '.com', country: 'Colombia' });
  }
  var ctx = makeContext({ tables: tables });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, N, 'every synthetic contact must be built');
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_EMAIL_QUEUE, 1, 'MKT_EMAIL_QUEUE must be written via exactly one batch call, regardless of contact count');
  assert(!ctx.__callCounts.v6UpsertByKey_.MKT_EMAIL_QUEUE, 'MKT_EMAIL_QUEUE must never be written via a per-contact v6UpsertByKey_ call');
  assert.equal(ctx.__callCounts.v6Rows_.MKT_ACCOUNTS, 1, 'MKT_ACCOUNTS must be read exactly once regardless of account count, never once per account');
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_AURA_GMAIL_OPPORTUNITIES, undefined, 'this test seeds opportunities directly, so ingest batching is exercised separately (test 32)');
  console.log('campana-a test 31 (performance regression guard: MKT_EMAIL_QUEUE written via one batch call and MKT_ACCOUNTS read once, regardless of contact count -- the O(n^2) upsert loop that caused the real production timeout is gone): PASS');
})();

// 32. The direct-spreadsheet ingest path (the OTHER real hotspot: previously one
// v6AuraGmailUpsertOpportunity_ call per source row, each its own two full-table reads) now
// writes MKT_AURA_GMAIL_OPPORTUNITIES via exactly one batch call for many source rows.
(function ingestBatchesOpportunityWritesTest() {
  var N = 80;
  var rows = [];
  for (var i = 0; i < N; i++) rows.push(['Account ' + i, 'Owner ' + i, 'HA priority', 'High']);
  var tables = {};
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': campanaASheetValues(rows) } } });
  var ingest = ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  assert.equal(ingest.status, 'OK');
  assert.equal(ingest.created, N);
  assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length, N);
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_AURA_GMAIL_OPPORTUNITIES, 1, 'every accepted source row must be written via exactly one batch call, never one upsert per row');
  assert(!ctx.__callCounts.v6UpsertByKey_ || !ctx.__callCounts.v6UpsertByKey_.MKT_AURA_GMAIL_OPPORTUNITIES, 'MKT_AURA_GMAIL_OPPORTUNITIES must never be written via a per-row v6UpsertByKey_ call from this ingest path');
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_AURA_CAMPANA_A_SOURCE_ROWS, 1, 'source-row diagnostics must also be persisted via one batch call, never one per row');
  console.log('campana-a test 32 (direct-spreadsheet ingest writes both MKT_AURA_GMAIL_OPPORTUNITIES and MKT_AURA_CAMPANA_A_SOURCE_ROWS via one batch call each, regardless of source row count): PASS');
})();

// 33. Every phase of a full regenerate reports a real, present timing field (SOURCE_READ_MS,
// PARSE_MS, MATCH_MS, LANGUAGE_MS, ELIGIBILITY_MS, COPY_MS, QUEUE_WRITE_MS, AUDIT_MS, TOTAL_MS) --
// the exact profiling breakdown DGL asked for so a future slowdown can be diagnosed by phase
// instead of guessed at.
(function profilingFieldsPresentTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-1', accountId: 'ACC-1', firstName: 'Maria', email: 'maria@progeral.com', country: 'Colombia' }]
  };
  var ctx = makeContext({ tables: tables });
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  ['SOURCE_READ_MS', 'PARSE_MS', 'MATCH_MS', 'LANGUAGE_MS', 'ELIGIBILITY_MS', 'COPY_MS', 'QUEUE_WRITE_MS', 'AUDIT_MS', 'TOTAL_MS'].forEach(function (key) {
    assert(typeof out.profile[key] === 'number' && out.profile[key] >= 0, 'profile.' + key + ' must be a real, present, non-negative timing in milliseconds');
  });
  console.log('campana-a test 33 (every required profiling field -- SOURCE_READ_MS through TOTAL_MS -- is present on the regenerate result): PASS');
})();

// 34. Checkpoint save: when the time budget is exceeded (here, forced via an explicit
// non-positive CAMPANA_A_BUILD_TIME_BUDGET_MS override), the build stops cleanly before
// processing any further contact, persists a resumable checkpoint, and reports
// CHECKPOINTED_TIME_BUDGET_EXCEEDED instead of silently truncating or losing track of progress.
(function checkpointSavesOnBudgetExceededTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Account One', 'Owner'), gmailOpp('ACC-2', 'Account Two', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Account One' }, { accountId: 'ACC-2', accountName: 'Account Two' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-1', accountId: 'ACC-1', firstName: 'A', email: 'a@one.com', country: 'Colombia' },
      { contactId: 'CON-2', accountId: 'ACC-2', firstName: 'B', email: 'b@two.com', country: 'Colombia' }
    ]
  };
  var ctx = makeContext({ tables: tables, props: { CAMPANA_A_BUILD_TIME_BUDGET_MS: '-1' } });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.status, 'CHECKPOINTED_TIME_BUDGET_EXCEEDED', 'a negative/zero budget must force an immediate, deterministic checkpoint before any contact is processed');
  assert.equal(build.built, 0);
  assert(build.checkpoint, 'a checkpointed result must report resume information');
  assert.equal(build.checkpoint.resumeFromIndex, 0);
  assert.equal(build.checkpoint.totalRecipients, 2);
  assert.equal((tables.MKT_EMAIL_QUEUE || []).length, 0, 'nothing may be written while checkpointed with zero contacts processed');
  console.log('campana-a test 34 (an exceeded time budget checkpoints cleanly before processing further contacts, reporting resume information, never silently losing progress): PASS');
})();

// 35. Checkpoint resume: a pre-existing checkpoint taken against the SAME campaign and the SAME
// total recipient count resumes from the saved index -- contacts before it are never
// reprocessed -- and completes normally, clearing the checkpoint so the NEXT call starts fresh.
(function checkpointResumesFromSavedIndexTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Account One', 'Owner'), gmailOpp('ACC-2', 'Account Two', 'Owner'), gmailOpp('ACC-3', 'Account Three', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Account One' }, { accountId: 'ACC-2', accountName: 'Account Two' }, { accountId: 'ACC-3', accountName: 'Account Three' }],
    MKT_CONTACTS_SECURE: [
      { contactId: 'CON-1', accountId: 'ACC-1', firstName: 'A', email: 'a@one.com', country: 'Colombia' },
      { contactId: 'CON-2', accountId: 'ACC-2', firstName: 'B', email: 'b@two.com', country: 'Colombia' },
      { contactId: 'CON-3', accountId: 'ACC-3', firstName: 'C', email: 'c@three.com', country: 'Colombia' }
    ]
  };
  var props = { CAMPANA_A_BUILD_CHECKPOINT: JSON.stringify({ campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', totalRecipients: 3, lastProcessedIndex: 2, checkpointedAt: new Date().toISOString() }) };
  var ctx = makeContext({ tables: tables, props: props });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.status, 'QUEUE_BUILD_COMPLETE', 'a resumed build that finishes within budget must report normal completion, not CHECKPOINTED');
  assert.equal(build.built, 1, 'only the recipient at/after the saved checkpoint index must be processed -- the first two must never be reprocessed');
  assert.equal(tables.MKT_EMAIL_QUEUE.length, 1);
  assert.equal(tables.MKT_EMAIL_QUEUE[0].contactId, 'CON-3', 'resume must continue from the saved index, not restart from zero');
  assert.equal(props.CAMPANA_A_BUILD_CHECKPOINT, undefined, 'a successfully completed build must clear the checkpoint so the next call starts fresh');
  console.log('campana-a test 35 (a saved checkpoint resumes from the exact saved index without reprocessing earlier recipients, and clears itself on successful completion): PASS');
})();

// 36. Root-cause fix (2026-09-16, third finding): a contact present ONLY on the Campana A tab
// (a real, explicitly-listed, well-formed email with no MKT_CONTACTS_SECURE record at all) is a
// full recipient -- never silently dropped for lack of a NOVA sync -- personalized from the
// tab's own contactName/country, tagged recipientSource: CAMPANA_A_SOURCE (this pipeline's
// required CONTACT_SOURCE_ONLY marker).
(function tabOnlyContactBecomesRealRecipientTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Brasil', 'Joao Silva', 'joao@progeral.com']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  // Deliberately NO MKT_CONTACTS_SECURE row for this contact at all -- the exact real-world gap.
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'a tab-only contact must never be dropped for lack of a MKT_CONTACTS_SECURE match');
  assert.equal(build.recipientSourceBreakdown.CAMPANA_A_SOURCE, 1);
  assert.equal(build.recipientSourceBreakdown.MERGED, 0);
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.email, 'joao@progeral.com');
  assert.equal(job.firstName, 'Joao Silva', "the tab's own contactName must personalize a tab-only recipient");
  assert.equal(job.preferredLanguage, 'PT', "the tab's own country must still resolve language for a tab-only recipient");
  assert.equal(job.recipientSource, 'CAMPANA_A_SOURCE');
  console.log('campana-a test 36 (a contact present only on the Campana A tab is a real, personalized recipient, never silently dropped): PASS');
})();

// 37. Deterministic merge: the SAME email present on the tab AND in MKT_CONTACTS_SECURE for the
// same real account merges into one MERGED recipient -- MKT_CONTACTS_SECURE's firstName wins
// (the more governed record) when both have one, and the merge is by EXACT email match only,
// never fuzzy (a similar-but-different email on the tab must stay a SEPARATE candidate).
(function deterministicMergeAndNoFuzzyMatchTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Colombia', 'Joao Silva', 'joao@progeral.com']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-REAL', accountId: realAccountId, firstName: 'João', email: 'JOAO@progeral.com' });
  // A similar-but-different email on a SEPARATE account's contact must never fuzzy-merge with
  // the tab row above -- it must remain its own, separate CONTACTS_SECURE-sourced candidate.
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'the same email (case-insensitive exact match) on the tab and in MKT_CONTACTS_SECURE must merge into exactly one recipient, never two');
  assert.equal(build.recipientSourceBreakdown.MERGED, 1);
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.contactId, 'CON-REAL', 'a merged recipient must use the real MKT_CONTACTS_SECURE contactId, not a synthesized one');
  assert.equal(job.firstName, 'João', "MKT_CONTACTS_SECURE's firstName must win in a deterministic merge over the tab's own contactName");
  assert.equal(job.recipientSource, 'MERGED');
  console.log('campana-a test 37 (a tab email and a MKT_CONTACTS_SECURE email that match exactly, case-insensitively, merge into one MERGED recipient; MKT_CONTACTS_SECURE firstName wins): PASS');
})();

// 38. A real DNC flag on the MATCHED MKT_CONTACTS_SECURE contact still blocks the MERGED
// recipient -- enrichment/governance from MKT_CONTACTS_SECURE is preserved, not just personalization.
(function mergedRecipientStillGovernedByContactsSecureDncTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Colombia', 'Joao Silva', 'joao@progeral.com']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-REAL', accountId: realAccountId, firstName: 'Joao', email: 'joao@progeral.com', doNotContact: true });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 0, 'a real DNC flag on the matched MKT_CONTACTS_SECURE record must still block the recipient, even though the tab explicitly lists the same email');
  assert.equal(build.excludedByReason.DO_NOT_CONTACT, 1);
  console.log('campana-a test 38 (MKT_CONTACTS_SECURE DNC still governs a MERGED recipient -- enrichment does not weaken governance): PASS');
})();

// 39. A malformed email explicitly present on the tab is still excluded (strict format
// validation is never relaxed just because the value came from the authoritative current source).
(function tabOnlyInvalidEmailStillExcludedTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Colombia', 'Joao Silva', 'not-an-email']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Progeral Corp' });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 0, 'strict email format validation must still apply, even to a value taken verbatim from the authoritative tab');
  assert.equal(build.excludedByReason.EMAIL_INVALID, 1);
  console.log('campana-a test 39 (a malformed tab email is still excluded by strict format validation, never relaxed): PASS');
})();

// 40. Account-level protections (stopOnResponse / account pipeline stage) still fully apply to a
// CAMPANA_A_SOURCE-only recipient, since they are keyed by accountId, independent of which table
// produced the contactId -- a tab-only contact of an already-RESPONDED account is still STOPPED.
(function sourceOnlyRecipientStillStoppedByAccountPipelineTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([['Responded Co', 'Owner', 'HA priority', 'High', 'USA', 'Ana Lopez', 'ana@respondedco.com']]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var realAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: realAccountId, accountName: 'Responded Co' });
  tables.MKT_ACCOUNT_PIPELINE = [{ accountId: realAccountId, currentStage: 'RESPONDED' }];
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1, 'a tab-only contact must still be built as a job so its STOPPED status is recorded and auditable');
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.status, 'STOPPED', 'stopOnResponse must still apply to a tab-only recipient -- it is keyed by accountId, not by which table produced the contact');
  assert.equal(job.recipientSource, 'CAMPANA_A_SOURCE');
  console.log('campana-a test 40 (account-level stopOnResponse still fully protects a CAMPANA_A_SOURCE-only recipient): PASS');
})();

// 41. A contact known only in MKT_CONTACTS_SECURE (not listed with an email on this particular
// tab extract) is still included -- the tab becoming primary never removes a previously-included,
// real, governed recipient.
(function contactsSecureOnlyRecipientStillIncludedTest() {
  var tables = {
    MKT_AURA_GMAIL_OPPORTUNITIES: [gmailOpp('ACC-1', 'Progeral Corp', 'Owner')],
    MKT_ACCOUNTS: [{ accountId: 'ACC-1', accountName: 'Progeral Corp' }],
    MKT_CONTACTS_SECURE: [{ contactId: 'CON-NOVA', accountId: 'ACC-1', firstName: 'Carla', email: 'carla@progeral.com', country: 'Colombia' }]
  };
  var ctx = makeContext({ tables: tables });
  var build = ctx.v6AuraCampanaABuildQueue_();
  assert.equal(build.built, 1);
  assert.equal(build.recipientSourceBreakdown.CONTACTS_SECURE, 1);
  var job = tables.MKT_EMAIL_QUEUE[0];
  assert.equal(job.contactId, 'CON-NOVA');
  assert.equal(job.recipientSource, 'CONTACTS_SECURE');
  console.log('campana-a test 41 (a contact known only in MKT_CONTACTS_SECURE, not on this tab extract, is still included -- the tab never removes a previously-included recipient): PASS');
})();

// 42. v6AuraCampanaAAudit_ reports an accurate byRecipientSource breakdown computed from the
// durable job records themselves.
(function auditReportsRecipientSourceBreakdownTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([
    ['Source Only Co', 'Owner', 'HA priority', 'High', 'USA', 'Alex Source', 'alex@sourceonly.com'],
    ['Merged Co', 'Owner', 'HA priority', 'High', 'USA', 'Sam Merged', 'sam@mergedco.com']
  ]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  ctx.v6AuraCampanaAIngestFromSpreadsheet_();
  var mergedAccountId = tables.MKT_AURA_GMAIL_OPPORTUNITIES.filter(function (o) { return o.accountName === 'Merged Co'; })[0].accountId;
  tables.MKT_ACCOUNTS.push({ accountId: mergedAccountId, accountName: 'Merged Co' });
  tables.MKT_CONTACTS_SECURE.push({ contactId: 'CON-MERGED', accountId: mergedAccountId, firstName: 'Sam', email: 'sam@mergedco.com' });
  ctx.v6AuraCampanaABuildQueue_();
  var audit = ctx.v6AuraCampanaAAudit_();
  assert.equal(audit.byRecipientSource.CAMPANA_A_SOURCE, 1);
  assert.equal(audit.byRecipientSource.MERGED, 1);
  console.log('campana-a test 42 (the audit reports an accurate byRecipientSource breakdown from the durable job records): PASS');
})();

// 42b. Iniciativa 2 punto 2/5 -- Campana A's OWN dedicated dispatch batch
// (v6AuraCampanaADispatchBatch_) re-validates the creative-approval chain at send time too, the
// same defense in depth as the shared auraProcessEmailQueue. A PENDING job with no
// creativeId/creativeApprovalId (e.g. a legacy row) is blocked, never sent, even under LIVE.
(function campanaADispatchBlocksJobWithNoCreativeReferenceTest() {
  var tables = {
    MKT_EMAIL_QUEUE: [{ jobId: 'JOB:LEGACY:CAMPANA-A:1', campaignId: 'CMP-CAMPANA-A-HA-PRIORITARIA', accountId: 'ACC-1', contactId: 'CON-1', email: 'contact@shipperco.com', subject: 'x', htmlBody: '<p>legacy, no creative reference</p>', replyTo: 'info@dglus.com', status: 'PENDING', sequenceStep: 1, preferredLanguage: 'ES' }]
  };
  var ctx = makeContext({ tables: tables });
  ctx.auraEnableLiveSending();
  var out = ctx.v6AuraCampanaADispatchBatch_();
  assert.equal(out.sent, 0);
  assert.equal(out.blockedCreative, 1);
  assert.equal(ctx.__sentEmails.length, 0, 'a Campana A job with no creative-approval reference must never be sent, even under LIVE');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].status, 'BLOCKED');
  assert.equal(tables.MKT_EMAIL_QUEUE[0].error, 'CREATIVE_NOT_APPROVED');
  console.log('campana-a test 42b (Campana A\'s own dispatch batch blocks a job with no creative-approval reference, even under LIVE): PASS');
})();

// 43. Durable run-summary audit trail (2026-09-16, third finding): the Apps Script execution log
// is ephemeral and its panel truncated to only the final matchReport section for a completed,
// non-erroring run -- DGL asked to never depend on it. Every regenerate call now persists one
// full row to MKT_AURA_CAMPANA_A_RUN_SUMMARY, readable via v6AuraCampanaALatestRunSummary_
// without the log and without re-running anything.
(function runSummaryPersistedDurablyTest() {
  var tables = { MKT_ACCOUNTS: [], MKT_CONTACTS_SECURE: [] };
  var sheetValues = campanaASheetValuesWithContacts([
    ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High', 'Brasil', 'Joao Silva', 'joao@progeral.com'],
    ['Shipper Co', 'Ana Ruiz', 'HA priority', 'High', 'Colombia', '', 'not-an-email']
  ]);
  var ctx = makeContext({ tables: tables, spreadsheetApp: { sheets: { 'Campana A - HA prioritaria': sheetValues } } });
  var out = ctx.v6AuraCampanaARegenerateDryRun_();
  assert(out.runId, 'the regenerate result must carry a real runId');
  var persisted = ctx.__tables.MKT_AURA_CAMPANA_A_RUN_SUMMARY;
  assert.equal(persisted.length, 1, 'exactly one durable row must be written per run');
  var row = persisted[0];
  assert.equal(row.runId, out.runId);
  assert.equal(row.sourceAccounts, out.build.accounts);
  assert.equal(row.sourceContacts, out.build.sourceContacts);
  assert.equal(row.recipients, out.build.recipients);
  assert.equal(row.recipientsCampanaASourceOnly, out.build.recipientSourceBreakdown.CAMPANA_A_SOURCE);
  assert.equal(row.byLanguagePt, out.build.byLanguage.PT);
  assert.equal(row.invalidEmailCount, out.audit.invalidEmailCount);
  assert.equal(row.realSendsDetected, 0);
  assert(row.matchReportNote.indexOf('DIAGNOSTIC ONLY') >= 0, 'the durable row must itself state that the match report is diagnostic-only, not a gate');

  var latest = ctx.v6AuraCampanaALatestRunSummary_();
  assert.equal(latest.found, true);
  assert.equal(latest.status, out.status, "the reader must expose the run's own outcome status, not a generic wrapper value");
  assert.equal(latest.runId, out.runId, 'the latest-run reader must return this exact run, not a stale one');

  // A second run must persist a SECOND row (never overwrite/lose the prior run's audit trail),
  // and the reader must then return the newer one.
  var out2 = ctx.v6AuraCampanaARegenerateDryRun_();
  assert.equal(ctx.__tables.MKT_AURA_CAMPANA_A_RUN_SUMMARY.length, 2, 'a second run must add a second durable row, never overwrite the first');
  assert.equal(ctx.v6AuraCampanaALatestRunSummary_().runId, out2.runId);
  console.log('campana-a test 43 (every run persists a full, durable audit row -- readable without the Apps Script execution log, never overwritten by a later run): PASS');
})();

console.log('V6 AURA Campana A (dedicated tab, per-contact language, name reliability): ALL PASS');

(function historicalFamilyAuditTest(){
 const ctx=makeContext({tables:{MKT_CAMPAIGNS:[{campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',campaignType:'Activation'}],MKT_EMAIL_QUEUE:[{jobId:'historical',campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',accountId:'A',email:'old@example.com',status:'SENT',playbookId:'Retention'}]}});
 const audit=ctx.v6AuraCampanaAAudit_();assert.equal(audit.currentCanonicalFamily,'Activation');assert.deepEqual(Array.from(audit.historicalSentFamilies),['Retention']);assert.equal(audit.historicalSentRecipientJobs,1);assert.equal(audit.historicalUniqueAccounts,1);
 console.log('PASS separate current canonical and historical sent family audit');
})();
