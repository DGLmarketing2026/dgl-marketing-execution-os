// AURA — "Campana A - HA prioritaria" dedicated pipeline (Phase 1 activation).
//
// DGL asked AURA to work, for this first phase, with EXACTLY ONE tab (65 accounts / 227
// contacts) from the House-Account priority Retention report, ignoring every other tab in the
// same workbook (including Campana B), and to add real per-contact ES/EN/PT language selection
// and generic-name detection that the shared, multi-source Retention pipeline
// (MarketingV6AuraAutomation.gs, MarketingV6AuraEmailDispatcher.gs) does not need and must not
// change for every other campaign. Rather than bolt single-purpose behavior onto shared code,
// this file is a self-contained, dedicated pipeline: it reuses every existing governed engine
// (v6ResolveRecipients_ for suppression/frequency/DNC/exclusion-vetted eligibility,
// v6AuraPolicyApproved_ for approval policy, v6AuraEmailCanonicalReplyTo_/v6AuraEmailValid_/
// v6AuraEmailAccountStopped_/v6AuraEmailJobId_/v6AuraGenerateCopy_/v6AuraEmailHtml_ from the
// email dispatcher and copy engine) and adds nothing new to those engines except the one
// exclusion registered in v6AuraAutoBuildScopesForFamily_ (MarketingV6AuraAutomation.gs) that
// keeps this dedicated pipeline's accounts from ALSO being auto-grouped by the shared,
// multi-source mechanism.

var CAMPANA_A_SHEET_NAME_ = 'Campana A - HA prioritaria';
var CAMPANA_A_CAMPAIGN_ID_ = 'CMP-CAMPANA-A-HA-PRIORITARIA';
var CAMPANA_A_SCOPE_ID_ = 'SCOPE-CAMPANA-A-HA-PRIORITARIA';

// --- Dedicated-account registry ---------------------------------------------------------------
// Read by v6AuraAutoBuildScopesForFamily_ (MarketingV6AuraAutomation.gs, typeof-guarded) so
// these accounts are excluded from the shared, multi-source family scope-builder. Written
// generically (a map of every account any dedicated pipeline currently owns) so a future second
// dedicated pipeline can extend this same function without another change to the shared engine.
function v6AuraCampanaAAccountMap_() {
  var map = {};
  v6Rows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) {
    if (v6AuraEmailText_(r.sourceSheet) === CAMPANA_A_SHEET_NAME_) map[v6AuraEmailText_(r.accountId)] = r;
  });
  return map;
}
function v6AuraDedicatedAccountIds_() {
  var out = {};
  Object.keys(v6AuraCampanaAAccountMap_()).forEach(function (id) { out[id] = true; });
  return out;
}

// --- Name reliability --------------------------------------------------------------------------
// Denylist matches the exact examples DGL gave (Pricing Team, Sales Team, Correo Corporativo,
// Imports, Operations) plus a few equally generic role/mailbox labels already seen in this
// codebase's own contact data conventions. Fails closed to "no name" (never a guess) whenever a
// value looks like a role, a department, a mailbox alias, or is empty -- matching the exact
// output DGL asked for ("Seguimos cerca de la operación de Progeral Corp", never "Team, ...").
var CAMPANA_A_GENERIC_NAME_DENYLIST_ = [
  'pricing team', 'sales team', 'correo corporativo', 'imports', 'operations',
  'team', 'equipo', 'admin', 'administracion', 'administración', 'info', 'support', 'soporte',
  'accounting', 'contabilidad', 'billing', 'facturacion', 'facturación',
  'customer service', 'servicio al cliente', 'logistics', 'logistica', 'logística',
  'imports team', 'operations team', 'accounts payable', 'accounts receivable'
];
function v6AuraCampanaANameReliable_(name) {
  var n = v6AuraEmailText_(name);
  if (!n) return '';
  if (/@/.test(n)) return '';
  var norm = n.toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!norm) return '';
  if (CAMPANA_A_GENERIC_NAME_DENYLIST_.indexOf(norm) >= 0) return '';
  // A single all-caps token of 5+ letters reads as a department/system label (IMPORTS,
  // OPERATIONS) rather than a human name -- fail closed rather than guess.
  if (/^[A-Z]{5,}$/.test(n.trim())) return '';
  return n;
}

// --- Country -> language ------------------------------------------------------------------------
// Exactly the mapping DGL specified: Brazil -> PT; the named Spanish-speaking LATAM markets (plus
// the other, equally Spanish-speaking LATAM countries already implied by "y demás LATAM
// hispanohablante") -> ES; USA/Canada (and any other non-Spanish-speaking market) -> EN. Common
// English/Spanish/Portuguese spellings and ISO-3166 alpha-2 codes are included so a real country
// value in any of those forms resolves correctly; an unmapped value returns '' so the caller
// falls back to EN exactly as specified, never a guess.
var CAMPANA_A_COUNTRY_LANGUAGE_ = {
  BRAZIL: 'PT', BRASIL: 'PT', BR: 'PT',
  MEXICO: 'ES', 'MÉXICO': 'ES', MX: 'ES',
  COLOMBIA: 'ES', CO: 'ES',
  ECUADOR: 'ES', EC: 'ES',
  PERU: 'ES', 'PERÚ': 'ES', PE: 'ES',
  PARAGUAY: 'ES', PY: 'ES',
  'COSTA RICA': 'ES', CR: 'ES',
  'EL SALVADOR': 'ES', SV: 'ES',
  PANAMA: 'ES', 'PANAMÁ': 'ES', PA: 'ES',
  ARGENTINA: 'ES', AR: 'ES',
  CHILE: 'ES', CL: 'ES',
  GUATEMALA: 'ES', GT: 'ES',
  HONDURAS: 'ES', HN: 'ES',
  NICARAGUA: 'ES', NI: 'ES',
  BOLIVIA: 'ES', BO: 'ES',
  'REPUBLICA DOMINICANA': 'ES', 'REPÚBLICA DOMINICANA': 'ES', 'DOMINICAN REPUBLIC': 'ES', DO: 'ES',
  VENEZUELA: 'ES', VE: 'ES',
  URUGUAY: 'ES', UY: 'ES',
  'UNITED STATES': 'EN', 'ESTADOS UNIDOS': 'EN', 'UNITED STATES OF AMERICA': 'EN', USA: 'EN', US: 'EN',
  CANADA: 'EN', 'CANADÁ': 'EN', CA: 'EN'
};
function v6AuraCountryToLanguage_(country) {
  var key = v6AuraEmailText_(country).toUpperCase();
  return key ? (CAMPANA_A_COUNTRY_LANGUAGE_[key] || '') : '';
}
// Priority exactly as specified: (1) an existing reliable language signal on the contact, (2)
// else derive from country, (3) else EN. Checks several plausible existing column-name spellings
// defensively (this V6 schema does not declare a fixed 'country'/'language' column today; real
// production data may carry either under one of these names) rather than assuming one exact
// name -- an absent field simply falls through to the next rule, never a crash, never a guess
// beyond what is actually present.
function v6AuraCampanaAPreferredLanguage_(contact, account) {
  var c = contact || {}, a = account || {};
  var explicit = v6AuraEmailText_(c.preferredLanguage || c.language || c.Idioma || c.idioma || c.Language).toUpperCase();
  if (explicit === 'ES' || explicit === 'EN' || explicit === 'PT') return explicit;
  var country = c.country || c.Country || c['país'] || c.pais || a.country || a.Country || a['país'] || a.pais || '';
  var byCountry = v6AuraCountryToLanguage_(country);
  return byCountry || 'EN';
}
function v6AuraCampanaALanguageCampaignFlag_(lang) {
  return lang === 'EN' ? 'English' : lang === 'PT' ? 'Português (Brasil)' : 'Spanish';
}

// --- No-name-aware subject merge -----------------------------------------------------------
// Every AURA Retention copy template's ONLY use of {{firstName}} is as a leading
// "{{firstName}}, ..." subject clause (MarketingV6AuraCopyEngine.gs) -- headline/body/body2/
// preheader never reference it. So a name-aware subject only needs to handle that one real
// pattern: with no reliable name, drop the "{{firstName}}, " prefix and capitalize what follows
// (DGL's own example: "Team, seguimos cerca de la operación de Progeral Corp" -> "Seguimos cerca
// de la operación de Progeral Corp"), instead of ever sending a fabricated "Team,".
function v6AuraCampanaASubject_(template, vars) {
  var v = vars || {};
  if (v.firstName) return v6AuraEmailMergeTokens_(template, v);
  var m = String(template || '').match(/^\{\{firstName\}\},\s*(.)([\s\S]*)$/);
  if (m) return m[1].toUpperCase() + v6AuraEmailMergeTokens_(m[2], v);
  // Defensive fallback for a future template that doesn't lead with "{{firstName}}, ".
  var merged = v6AuraEmailMergeTokens_(template, Object.assign({}, v, { firstName: '' })).replace(/^,\s*/, '');
  return merged.replace(/^./, function (ch) { return ch.toUpperCase(); });
}

// --- Campaign + scope (idempotent) ----------------------------------------------------------
function v6AuraCampanaAEnsureCampaignAndScope_() {
  var accountMap = v6AuraCampanaAAccountMap_();
  var accountIds = Object.keys(accountMap).filter(Boolean);
  var now = new Date().toISOString();
  v6UpsertByKey_('MKT_CAMPAIGNS', ['campaignId'], {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, scopeId: CAMPANA_A_SCOPE_ID_,
    campaignName: 'Retencion Prioritaria - Campana A (HA)', campaignType: 'Retention', objective: 'Retention',
    service: 'Multiservicio', amOwner: 'Multiple', language: 'Spanish', status: 'AUTO_ACTIVE',
    createdAt: now, updatedAt: now
  });
  v6AuraEnsureCampaignScope_({
    scopeId: CAMPANA_A_SCOPE_ID_, campaignId: CAMPANA_A_CAMPAIGN_ID_,
    opportunityType: 'Retention', campaignType: 'Retention', accountIds: accountIds
  });
  return { accountIds: accountIds, count: accountIds.length };
}

// --- Queue build (idempotent; never rebuilds a job that already exists) ----------------------
function v6AuraCampanaABuildQueue_() {
  v6EnsureContactRecipientSchema_();
  var setup = v6AuraCampanaAEnsureCampaignAndScope_();
  var result = { status: 'QUEUE_BUILD_COMPLETE', campaignId: CAMPANA_A_CAMPAIGN_ID_, accounts: setup.count, recipients: 0, built: 0, skippedExisting: 0, skippedIneligible: 0, blockedNoReplyTo: 0, byLanguage: { ES: 0, EN: 0, PT: 0 } };
  if (!setup.count) return result;

  var accountMap = v6AuraCampanaAAccountMap_();
  var campaign = v6Rows_('MKT_CAMPAIGNS').filter(function (c) { return v6AuraEmailText_(c.campaignId) === CAMPANA_A_CAMPAIGN_ID_; })[0] || {};
  v6ResolveRecipients_({ campaignId: CAMPANA_A_CAMPAIGN_ID_ });
  var recipients = v6Rows_('MKT_AUDIENCES').filter(function (r) {
    return v6AuraEmailText_(r.recordType) === 'RECIPIENT' && v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_ && v6AuraEmailText_(r.eligibilityStatus).toUpperCase() === 'ELIGIBLE';
  });
  result.recipients = recipients.length;

  var existingIds = {};
  v6Rows_('MKT_EMAIL_QUEUE').forEach(function (r) { existingIds[v6AuraEmailText_(r.jobId)] = true; });
  var accountsById = {}; v6Rows_('MKT_ACCOUNTS').forEach(function (a) { accountsById[v6AuraEmailText_(a.accountId)] = a; });
  var contactsById = {}; v6Rows_('MKT_CONTACTS_SECURE').forEach(function (c) { contactsById[v6AuraEmailText_(c.contactId)] = c; });

  var replyTo = v6AuraEmailCanonicalReplyTo_();
  var replyToBlocked = !replyTo;
  var policyApproved = (typeof v6AuraPolicyApproved_ === 'function') ? v6AuraPolicyApproved_('Retention') : true;
  var copyCache = {};
  function copyFor(lang) {
    if (!copyCache[lang]) copyCache[lang] = v6AuraGenerateCopy_({}, Object.assign({}, campaign, { language: v6AuraCampanaALanguageCampaignFlag_(lang) }));
    return copyCache[lang];
  }

  var sequenceStep = 1;
  recipients.forEach(function (r) {
    var accountId = v6AuraEmailText_(r.accountId), contactId = v6AuraEmailText_(r.contactId);
    var jobId = v6AuraEmailJobId_(CAMPANA_A_CAMPAIGN_ID_, contactId, sequenceStep);
    if (existingIds[jobId]) { result.skippedExisting++; return; }
    if (!accountId || !contactId || !v6AuraEmailText_(r.email)) { result.skippedIneligible++; return; }

    var account = accountsById[accountId] || {};
    var contact = contactsById[contactId] || {};
    var gmailOpp = accountMap[accountId] || {};
    var lang = v6AuraCampanaAPreferredLanguage_(contact, account);
    result.byLanguage[lang] = (result.byLanguage[lang] || 0) + 1;
    var reliableName = v6AuraCampanaANameReliable_(contact.firstName);
    var vars = {
      firstName: reliableName, company: v6AuraEmailText_(account.accountName) || v6AuraEmailText_(gmailOpp.accountName) || 'your company',
      service: 'Multiservicio', replyTo: replyTo
    };
    var copy = copyFor(lang);
    var stopped = v6AuraEmailAccountStopped_(accountId);
    var now = new Date().toISOString();
    var country = v6AuraEmailText_(contact.country || contact.Country || account.country || account.Country || '');
    var job = {
      jobId: jobId, campaignId: CAMPANA_A_CAMPAIGN_ID_, audienceId: CAMPANA_A_SCOPE_ID_,
      accountId: accountId, contactId: contactId, email: v6AuraEmailText_(r.email),
      firstName: vars.firstName, company: vars.company, service: vars.service,
      subject: v6AuraCampanaASubject_(copy.subjectA, vars), htmlBody: v6AuraEmailHtml_(campaign, copy, vars),
      replyTo: replyTo,
      status: stopped ? 'STOPPED' : (replyToBlocked ? 'SUPPRESSED' : (policyApproved ? 'PENDING' : 'REVIEW_REQUIRED')),
      gmailDraftId: '', createdAt: now, processedAt: '', error: replyToBlocked ? 'MISSING_REPLY_TO_CONFIGURATION' : '',
      requestId: CAMPANA_A_CAMPAIGN_ID_, amOwner: v6AuraEmailText_(gmailOpp.amOwner) || v6AuraEmailText_(account.amOwner) || '',
      playbookId: 'Retention', sequenceStep: sequenceStep, scheduledAt: now,
      approvalId: policyApproved ? '' : ('APR:' + CAMPANA_A_CAMPAIGN_ID_), approvedAt: '', approvedBy: '',
      stopOnResponse: true, country: country, preferredLanguage: lang
    };
    v6UpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], job);
    existingIds[jobId] = true;
    result.built++;
    if (replyToBlocked) result.blockedNoReplyTo++;
  });
  return result;
}

// --- Dispatch every pending Campana A job (loops the shared 50-per-call dispatcher; safe in
// DRY_RUN since no real send is ever possible, and this loop is only ever used by this
// dedicated, explicitly-invoked pipeline -- never by an automatic trigger). -----------------
function v6AuraCampanaADispatchAll_() {
  var totals = { rounds: 0, processed: 0, sent: 0, failed: 0, suppressed: 0, skipped: 0, stopped: 0, reviewRequired: 0, dryRun: 0 };
  var out;
  do {
    out = auraProcessEmailQueue(50);
    totals.rounds++; totals.processed += out.processed;
    totals.sent += out.sent; totals.failed += out.failed; totals.suppressed += out.suppressed;
    totals.skipped += out.skipped; totals.stopped += out.stopped; totals.reviewRequired += out.reviewRequired; totals.dryRun += out.dryRun;
  } while (out.processed === 50 && totals.rounds < 20);
  return totals;
}

// --- QA: confirm the explicitly-ignored tabs from the SAME workbook were never turned into an
// opportunity. This deliberately does NOT flag every other sourceSheet value in the table --
// a different, already-mapped tab (e.g. 'Retencion prioritaria') legitimately has its own
// historical data from its own past ingestions, and that is correct, expected behavior, not a
// leak. This checks specifically for the tab(s) DGL asked to ignore from this workbook.
var CAMPANA_A_EXPLICITLY_IGNORED_SHEETS_ = ['Campana B'];
function v6AuraCampanaAVerifyOtherTabsIgnored_() {
  var found = {};
  v6Rows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) {
    var s = v6AuraEmailText_(r.sourceSheet);
    if (CAMPANA_A_EXPLICITLY_IGNORED_SHEETS_.indexOf(s) >= 0) found[s] = (found[s] || 0) + 1;
  });
  return { ignoredTabsNeverProcessed: Object.keys(found).length === 0, unexpectedRowsFound: found };
}

// --- Full QA report, scoped strictly to this campaignId --------------------------------------
function v6AuraCampanaAAudit_() {
  var jobs = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_; });
  var base = v6AuraEmailQueueAudit_(function (r) { return v6AuraEmailText_(r.campaignId) === CAMPANA_A_CAMPAIGN_ID_; });
  var byLanguage = { ES: 0, EN: 0, PT: 0 }, byStatus = {};
  var teamFirstNameCount = 0, nonCanonicalReplyToCount = 0, invalidEmailCount = 0;
  // Compared against the real resolved canonical address (never a hardcoded literal here) so
  // this check tracks whatever AURA_GMAIL_SOURCE_MAILBOX is actually configured to, exactly
  // like every job's own replyTo was built from.
  var canonicalReplyTo = v6AuraEmailText_(v6AuraEmailCanonicalReplyTo_()).toLowerCase();
  jobs.forEach(function (j) {
    var lang = v6AuraEmailText_(j.preferredLanguage).toUpperCase();
    if (byLanguage[lang] == null) byLanguage[lang] = 0;
    byLanguage[lang]++;
    byStatus[j.status] = (byStatus[j.status] || 0) + 1;
    if (v6AuraEmailText_(j.firstName) === 'Team') teamFirstNameCount++;
    if (v6AuraEmailText_(j.replyTo).toLowerCase() !== canonicalReplyTo) nonCanonicalReplyToCount++;
    if (!v6AuraEmailValid_(j.email)) invalidEmailCount++;
  });
  return Object.assign({}, base, {
    campaignId: CAMPANA_A_CAMPAIGN_ID_, jobsForCampaignA: jobs.length,
    byLanguage: byLanguage, byStatusForCampaignA: byStatus,
    teamFirstNameCount: teamFirstNameCount, nonCanonicalReplyToCount: nonCanonicalReplyToCount, invalidEmailCount: invalidEmailCount,
    otherTabsIgnored: v6AuraCampanaAVerifyOtherTabsIgnored_()
  });
}

// --- One convenient, no-argument entry point --------------------------------------------------
// Forces/confirms DRY_RUN first (never auraEnableLiveSending), reprocesses recent Gmail messages
// (covers the report having already arrived and been ingested before this tab mapping existed),
// refreshes MKT_OPPORTUNITIES, rebuilds the dedicated campaign/scope/queue, dispatches every
// pending job (still DRY_RUN, so zero real sends), then runs the full QA audit.
function v6AuraCampanaARegenerateDryRun_() {
  auraDisableLiveSending();
  if (typeof v6AuraGmailReprocessRecent_ === 'function') v6AuraGmailReprocessRecent_(45);
  if (typeof v6RefreshOpportunitiesFromReports_ === 'function') v6RefreshOpportunitiesFromReports_();
  var build = v6AuraCampanaABuildQueue_();
  var dispatch = v6AuraCampanaADispatchAll_();
  var audit = v6AuraCampanaAAudit_();
  return { sendMode: v6AuraSendMode_(), build: build, dispatch: dispatch, audit: audit };
}
function RUN_AURA_CAMPANA_A_REGENERATE_DRY_RUN() {
  return v6AuraCampanaARegenerateDryRun_();
}
