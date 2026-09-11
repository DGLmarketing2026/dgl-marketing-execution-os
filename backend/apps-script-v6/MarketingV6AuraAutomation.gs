// AURA Automatic Campaign Execution — Existing Account Growth.
//
// Ties together the already-existing engines (report ingestion, AURA bridge,
// recipient resolution, execution gates, pipeline) into one automatic tick
// for Retention, Reactivation, Quoted Not Booked and Cross-Sell, so no
// recurring manual "Prepare Campaign" click, manual account list, manual
// owner selection or manual campaign creation is required for the normal
// path. Every step below delegates to an engine that already exists; this
// file only adds the missing orchestration glue plus automatic reporting.
//
// Safety: this file NEVER sends an email. v6QueueExecution_/v6StartExecution_
// (MarketingV6ExecutionEngine.gs) already fail closed on
// MKT_V6_PROVIDER_READY===false, so every automatic run here can only reach
// QUEUED-but-blocked with reason 'BULK PROVIDER NOT CONFIGURED' — the AURA
// equivalent of "READY TO SEND / SEND PROVIDER REQUIRED". Campaigns are never
// rebuilt later: the same campaignId/executionId is reused idempotently
// (v6UpsertByKey_) every tick, so once real copy is approved and a provider
// is configured, sending only requires clearing that one remaining gate.
//
// campaignId minting: MarketingV6AuraBridge.gs's v6AuraEnsureCampaignScope_
// intentionally leaves campaignId blank ("assigning a campaignId is the
// private backend's job ... not part of this public source pack"). That
// private adapter is not part of this repository, so full automation would
// otherwise dead-end at "scope ready, no campaign". v6AuraEnsureCampaign_
// below closes that gap with a deterministic, idempotent campaignId derived
// from the scopeId, using the same MKT_CAMPAIGNS shape v6RecipientCampaignContext_
// already expects (campaignId, scopeId, campaignType).

var MKT_V6_AURA_SCHEMA = {
  MKT_CAMPAIGNS: ['campaignId', 'scopeId', 'campaignName', 'campaignType', 'objective', 'service', 'amOwner', 'language', 'status', 'createdAt', 'updatedAt'],
  // queued/failed appended (additive-only, v6AcqEnsureSheet_ already appends missing headers
  // to an existing tab): real counts from MKT_EMAIL_QUEUE once MarketingV6AuraEmailDispatcher.gs
  // has built a queue for a campaign, so 'sent' stops being hardcoded and READY/QUEUED/SENT can
  // finally be told apart (see v6AuraReportRow_ below).
  MKT_AURA_EXECUTION_REPORT: ['reportRowId', 'owner', 'campaignFamily', 'service', 'campaignId', 'executionId', 'source', 'detectedAccounts', 'eligibleAccounts', 'suppressedAccounts', 'recipients', 'emailGenerated', 'sent', 'delivered', 'opened', 'bounced', 'clicks', 'spamComplaints', 'replies', 'rfqs', 'quotes', 'loads', 'campaignStart', 'campaignEnd', 'status', 'updatedAt', 'queued', 'failed']
};

var MKT_V6_AURA_FAMILIES = ['Retention', 'Reactivation', 'Cross-Sell', 'QNB'];

function v6AuraNow_() { return new Date().toISOString(); }
function v6AuraEnsureSheet_(name) { return v6AcqEnsureSheet_(name, MKT_V6_AURA_SCHEMA[name]); }
function v6AuraRows_(name) { v6AuraEnsureSheet_(name); return v6Rows_(name); }

// Mirrors the frontend's family()/scopeId() exactly (assets/js/lifecycle-modules-v6.js)
// so a scope generated here and one displayed in Campaign Opportunities always
// resolve to the same scopeId. Do not diverge this from the frontend without
// updating both.
function v6AuraFamilyToken_(v) {
  var x = String(v || '').toUpperCase();
  if (x.indexOf('QUOTE') >= 0 || x.indexOf('QNB') >= 0) return 'QNB';
  if (x.indexOf('RETENTION') >= 0) return 'RETENTION';
  if (x.indexOf('REACTIVATION') >= 0) return 'REACTIVATION';
  if (x.indexOf('CROSS') >= 0) return 'CROSS-SELL';
  if (x.indexOf('NURTURE') >= 0 || x.indexOf('RENEWAL') >= 0) return 'NURTURE';
  return x || 'UNKNOWN';
}
function v6AuraObjectiveLabel_(familyToken) {
  if (familyToken === 'QNB') return 'Quoted Not Booked';
  if (familyToken === 'CROSS-SELL') return 'Cross-Sell';
  if (familyToken === 'RETENTION' || familyToken === 'NURTURE') return 'Retention';
  return 'Reactivation';
}

// --- Automatic scope build, generalized across all four families ----------
// Additive only: reads DETECTED rows from MKT_OPPORTUNITIES (already written
// by v6RefreshOpportunitiesFromReports_), groups by (amOwner, service[,
// qnbWindow for QNB only]) and calls v6AuraEnsureCampaignScope_ per group.
// Supersedes the Retention-only v6AuraAutoBuildRetentionScopes_ in
// MarketingV6AuraBridge.gs (kept there as-is for backward compatibility —
// it now simply produces a subset of what this function produces).
function v6AuraAutoBuildScopesForFamily_(opportunityType) {
  var familyToken = v6AuraFamilyToken_(opportunityType);
  var rows = v6Rows_('MKT_OPPORTUNITIES').filter(function (r) {
    return v6AuraFamilyToken_(r.opportunityType) === familyToken && v6AuraText_(r.eligibilityStatus).toUpperCase() === 'DETECTED';
  });
  var groups = {};
  rows.forEach(function (r) {
    var owner = v6AuraText_(r.amOwner) || 'Unassigned', service = v6AuraText_(r.service) || 'Multiservicio';
    var window = familyToken === 'QNB' ? (v6AuraText_(r.qnbWindow) || '0-14') : '';
    var scopeId = v6AuraScopeId_(owner, familyToken, service, window, '');
    (groups[scopeId] = groups[scopeId] || { owner: owner, service: service, window: window, accountIds: [] });
    var accountId = v6AuraText_(r.accountId);
    if (accountId) groups[scopeId].accountIds.push(accountId);
  });
  var scopesBuilt = 0, accountsScoped = 0, scopes = [];
  Object.keys(groups).forEach(function (scopeId) {
    var g = groups[scopeId], accountIds = g.accountIds.filter(Boolean);
    if (!accountIds.length) return;
    v6AuraEnsureCampaignScope_({ scopeId: scopeId, opportunityType: v6AuraObjectiveLabel_(familyToken), campaignType: v6AuraObjectiveLabel_(familyToken), accountIds: accountIds });
    scopesBuilt++; accountsScoped += accountIds.length;
    scopes.push({ scopeId: scopeId, owner: g.owner, service: g.service, window: g.window, familyToken: familyToken, accountIds: accountIds });
  });
  return { status: 'SCOPES_READY', family: familyToken, scopesBuilt: scopesBuilt, accountsScoped: accountsScoped, scopes: scopes };
}

// --- Automatic campaign creation --------------------------------------------
// Deterministic, idempotent campaignId derived from the scopeId: re-running
// never mints a second campaign for the same governed scope. Matches the
// MKT_CAMPAIGNS shape v6RecipientCampaignContext_ already reads
// (campaignId||id, scopeId||audienceId, campaignType||objective).
function v6AuraDeriveCampaignId_(scopeId) { return 'CMP-' + String(scopeId || '').replace(/^SCOPE-/, ''); }
function v6AuraCampaignName_(owner, familyToken, service, window) {
  var objective = v6AuraObjectiveLabel_(familyToken);
  return objective + (familyToken === 'QNB' && window ? ' · ' + window : '') + ' · ' + service + ' · ' + owner;
}
function v6AuraEnsureCampaign_(scope) {
  var campaignId = v6AuraDeriveCampaignId_(scope.scopeId);
  var existing = v6AuraRows_('MKT_CAMPAIGNS').filter(function (r) { return v6AuraText_(r.campaignId) === campaignId; })[0] || null;
  var now = v6AuraNow_();
  var objective = v6AuraObjectiveLabel_(scope.familyToken);
  var row = {
    campaignId: campaignId, scopeId: scope.scopeId,
    campaignName: v6AuraCampaignName_(scope.owner, scope.familyToken, scope.service, scope.window),
    campaignType: objective, objective: objective, service: scope.service, amOwner: scope.owner,
    language: (existing && existing.language) || 'Spanish', status: 'AUTO_ACTIVE',
    createdAt: (existing && existing.createdAt) || now, updatedAt: now
  };
  v6UpsertByKey_('MKT_CAMPAIGNS', ['campaignId'], row);
  // Stamp the scope with its campaignId too (v6RecipientCampaignContext_ can
  // then resolve either by scopeId or by campaignId->scopeId->scope join).
  v6AuraEnsureCampaignScope_({ scopeId: scope.scopeId, campaignId: campaignId, opportunityType: objective, campaignType: objective, accountIds: [] });
  return row;
}

// --- Automatic execution readiness ------------------------------------------
// Runs the SAME gates a human would hit in Campaign Studio
// (MarketingV6ExecutionEngine.gs's v6ExecutionGates_), automatically, using
// real computed values instead of manual toggles:
//  - marketingApproved: DGL_MARKETING_PLAYBOOKS policy decision (only
//    exception scopes ever require human review; normal QNB/Retention/
//    Reactivation/Cross-Sell scopes are AUTO BY POLICY).
//  - audienceResolved / frequencyStatus: the REAL v6ResolveRecipients_ result
//    for this campaign (reads real MKT_CONTACTS_SECURE — no PII returned to
//    the caller beyond the counts already surfaced by that engine).
//  - archiveConfigured / executionCsvDriveFileId: an audience/execution
//    summary CSV (owner, scope, counts only — no PII) archived to Drive.
// The ONLY gate this can never clear automatically is the bulk provider,
// which is hardcoded MKT_V6_PROVIDER_READY=false — exactly the "SEND
// PROVIDER REQUIRED" terminal-safe state the product requires.
function v6AuraPolicyApproved_(objective) {
  try {
    if (typeof DGL_MARKETING_PLAYBOOKS_REQUIRES_REVIEW_ === 'function') return !DGL_MARKETING_PLAYBOOKS_REQUIRES_REVIEW_(objective);
  } catch (_) { }
  // Normal Existing Account Growth families are never exceptions by default;
  // only an explicit backend policy override would require human review.
  return true;
}
function v6AuraExecutionSummaryCsv_(campaign, audience) {
  var headers = ['campaignId', 'campaignName', 'amOwner', 'service', 'campaignType', 'detectedAccounts', 'eligibleContacts', 'excludedContacts', 'audienceStatus', 'generatedAt'];
  var row = { campaignId: campaign.campaignId, campaignName: campaign.campaignName, amOwner: campaign.amOwner, service: campaign.service, campaignType: campaign.campaignType, detectedAccounts: campaign.detectedAccounts || 0, eligibleContacts: audience.eligibleContactCount || 0, excludedContacts: audience.excludedContactCount || 0, audienceStatus: audience.audienceStatus || '', generatedAt: v6AuraNow_() };
  return v6Csv_(headers, [row]);
}
function v6AuraArchiveExecutionCsv_(campaignId, csv) {
  try {
    var folderId = v6AuraText_(PropertiesService.getScriptProperties().getProperty('AURA_EXECUTION_ARCHIVE_FOLDER_ID')) || (typeof MKT_V6_ARCHIVE !== 'undefined' && MKT_V6_ARCHIVE.results);
    if (!folderId) return { status: 'ARCHIVE FOLDER NOT CONFIGURED', fileId: '' };
    var file = DriveApp.getFolderById(folderId).createFile('aura-execution-' + campaignId + '.csv', csv, MimeType.CSV);
    return { status: 'CSV ARCHIVED', fileId: file.getId() };
  } catch (err) { return { status: 'ARCHIVE ERROR', fileId: '', error: String(err && err.message || err) }; }
}
function v6AuraDeriveExecutionId_(campaignId) { return 'EXEC-' + String(campaignId || '').replace(/^CMP-/, ''); }
function v6AuraPrepareExecution_(scope, campaign) {
  var audience = v6ResolveRecipients_({ campaignId: campaign.campaignId });
  var detectedAccounts = (scope.accountIds || []).length;
  var execution = v6CreateExecution_({
    executionId: v6AuraDeriveExecutionId_(campaign.campaignId),
    campaignId: campaign.campaignId, campaignName: campaign.campaignName, campaignType: campaign.campaignType,
    service: campaign.service, amOwner: campaign.amOwner,
    audienceCounts: { accountCount: detectedAccounts, eligibleContactCount: audience.eligibleContactCount, excludedContactCount: audience.excludedContactCount }
  });
  var csv = v6AuraExecutionSummaryCsv_(Object.assign({}, campaign, { detectedAccounts: detectedAccounts }), audience);
  var archived = v6AuraArchiveExecutionCsv_(campaign.campaignId, csv);
  // v6ExecutionGates_ checks the STORED row's executionCsvDriveFileId, not the
  // queue payload's — the file id must be persisted onto the row first.
  if (archived.fileId) v6UpdateExecutionFiles_(execution.executionId, { executionCsvDriveFileId: archived.fileId });
  // Real subject/body/HTML, generated server-side from the SAME approved
  // copy strategy Campaign Studio uses — no human needs to open Campaign
  // Studio for this to exist. Archived regardless of gate outcome so the
  // email is ready to inspect/approve the moment a provider is configured.
  var email = (typeof v6AuraGenerateAndArchiveEmail_ === 'function') ? v6AuraGenerateAndArchiveEmail_(scope, campaign, execution.executionId) : null;
  var queue = v6QueueExecution_({
    executionId: execution.executionId, campaignId: campaign.campaignId,
    marketingApproved: v6AuraPolicyApproved_(campaign.objective),
    audienceResolved: audience.audienceResolved, frequencyStatus: audience.frequencyStatus,
    archiveConfigured: archived.status === 'CSV ARCHIVED', executionCsvDriveFileId: archived.fileId
  });
  return { executionId: execution.executionId, audience: audience, archive: archived, queue: queue, email: email };
}

// --- Automatic reporting ----------------------------------------------------
// One row per (owner, family, service) campaign, upserted every tick — never
// duplicated, never requires a manual export. Sent/Delivered/Clicks stay 0
// honestly (no bulk provider connected yet); Replies/RFQs/Quotes/Loads are
// real counts from MKT_ACCOUNT_PIPELINE (populated by v6ClassifyResponseEvent_
// as real inbound events arrive) — never fabricated.
// Reads MKT_CONTACTS_SECURE exactly ONCE per tick (not once per account) --
// v6Rows_ does a fresh full-sheet read every call, so calling it inside a
// per-account loop across many scopes/families would re-read the entire
// contacts sheet once per account and turn an hourly tick into a multi-minute
// (or longer) run against real production data volume.
function v6AuraInvalidContactCountsByAccount_() {
  var counts = {};
  v6Rows_('MKT_CONTACTS_SECURE').forEach(function (c) {
    if (v6AuraText_(c.emailStatus).toUpperCase() !== 'INVALID') return;
    var accountId = v6AuraText_(c.accountId);
    counts[accountId] = (counts[accountId] || 0) + 1;
  });
  return counts;
}
// Read-only, one pass per tick (same efficiency discipline as the invalid-
// contact map above): maps accountId -> the sourceReport of its opportunity
// row, so each campaign's Source can be reported without a per-account
// lookup. 'GMAIL_AM_REPORT' comes from MarketingV6AuraGmailIngest.gs; every
// other sourceReport value (LQS_SIN_RESPUESTA, MIGRACION_CAIDAS, CUENTAS,
// FICHA_CLIENTES, MIGRACION_RECUPERADAS) is the pre-existing NOVA/AM-
// Intelligence report source. This file only READS MKT_OPPORTUNITIES; it
// never touches the Gmail ingestion pipeline itself.
function v6AuraAccountSourceMap_() {
  var map = {};
  v6Rows_('MKT_OPPORTUNITIES').forEach(function (r) {
    var accountId = v6AuraText_(r.accountId);
    if (accountId) map[accountId] = v6AuraText_(r.sourceReport);
  });
  return map;
}
function v6AuraScopeSourceLabel_(scope, accountSourceByAccountId) {
  var map = accountSourceByAccountId || {}, gmail = 0, nova = 0;
  (scope.accountIds || []).forEach(function (accountId) {
    var src = map[accountId];
    if (src === 'GMAIL_AM_REPORT') gmail++;
    else if (src) nova++;
  });
  if (gmail && nova) return 'MIXED';
  if (gmail) return 'GMAIL AM REPORT';
  if (nova) return 'NOVA / EXISTING SOURCE';
  return 'UNKNOWN';
}
// Real per-campaign MKT_EMAIL_QUEUE counts (MarketingV6AuraEmailDispatcher.gs). typeof-guarded
// so this file has no hard dependency on the dispatcher being deployed -- a project without it
// gets queueCounts.total===0 for every campaign, which is exactly today's behavior (see below).
function v6AuraQueueCountsForCampaign_(campaignId) {
  var rows = v6Rows_('MKT_EMAIL_QUEUE').filter(function (r) { return v6AuraText_(r.campaignId) === campaignId; });
  var counts = { total: rows.length, pending: 0, sent: 0, failed: 0, dryRun: 0 };
  rows.forEach(function (r) {
    var s = v6AuraText_(r.status).toUpperCase();
    if (s === 'PENDING') counts.pending++;
    else if (s === 'SENT') counts.sent++;
    else if (s === 'FAILED') counts.failed++;
    else if (s === 'DRY_RUN') counts.dryRun++;
  });
  return counts;
}
function v6AuraReportRow_(scope, campaign, prep, invalidCountsByAccount, accountSourceByAccountId) {
  var pipeline = v6Rows_('MKT_ACCOUNT_PIPELINE').filter(function (r) { return v6AuraText_(r.campaignId) === campaign.campaignId; });
  var counts = invalidCountsByAccount || {};
  var bounced = 0;
  (scope.accountIds || []).forEach(function (accountId) {
    bounced += counts[accountId] || 0;
  });
  var replies = pipeline.filter(function (r) { return !!r.responseAt; }).length;
  var rfqs = pipeline.filter(function (r) { return !!r.rfqAt; }).length;
  var quotes = pipeline.filter(function (r) { return !!r.quoteAt; }).length;
  var loads = pipeline.filter(function (r) { return !!r.loadAt; }).length;
  // Real send state (MarketingV6AuraEmailDispatcher.gs) always wins once a queue exists for
  // this campaign -- today that is only ever true for Retention (the only family the queue
  // builder runs for), so QNB/Reactivation/Cross-Sell fall straight through to the exact same
  // gate-based 'SEND PROVIDER REQUIRED' status this function has always reported (queueCounts
  // stays {total:0,...} for them, unchanged behavior, no regression).
  var queueCounts = v6AuraQueueCountsForCampaign_(campaign.campaignId);
  var status;
  if (!queueCounts.total) {
    status = prep.queue && prep.queue.status === 'BLOCKED' && (prep.queue.reasons || []).length === 1 && prep.queue.reasons[0] === 'BULK PROVIDER NOT CONFIGURED'
      ? 'READY TO SEND · SEND PROVIDER REQUIRED'
      : (prep.queue && prep.queue.status) || 'PREPARING';
  } else if (queueCounts.sent > 0) {
    status = queueCounts.pending > 0 ? 'SENDING' : 'ACTIVE';
  } else if (queueCounts.dryRun > 0) {
    status = 'READY TO SEND · DRY RUN VALIDATED';
  } else {
    status = 'QUEUED';
  }
  var now = v6AuraNow_();
  var row = {
    reportRowId: campaign.campaignId, owner: campaign.amOwner, campaignFamily: campaign.objective, service: campaign.service,
    campaignId: campaign.campaignId, executionId: prep.executionId, source: v6AuraScopeSourceLabel_(scope, accountSourceByAccountId),
    detectedAccounts: (scope.accountIds || []).length, eligibleAccounts: (scope.accountIds || []).length, suppressedAccounts: 0,
    recipients: prep.audience.eligibleContactCount || 0, emailGenerated: !!prep.email,
    // Delivered/Opened/Clicks/Spam Complaints stay honestly 0 until a delivery-tracking
    // integration exists -- never fabricated engagement. sent/queued/failed below are real,
    // never hardcoded, once a queue exists for this campaign.
    sent: queueCounts.sent, delivered: 0, opened: 0, bounced: bounced, clicks: 0, spamComplaints: 0,
    replies: replies, rfqs: rfqs, quotes: quotes, loads: loads,
    campaignStart: campaign.createdAt, campaignEnd: '', status: status, updatedAt: now,
    queued: queueCounts.pending, failed: queueCounts.failed
  };
  v6UpsertByKey_('MKT_AURA_EXECUTION_REPORT', ['reportRowId'], row);
  return row;
}
function v6AuraOwnerCsv_(owner) {
  var rows = v6AuraRows_('MKT_AURA_EXECUTION_REPORT').filter(function (r) { return v6AuraText_(r.owner) === owner; });
  return v6Csv_(MKT_V6_AURA_SCHEMA.MKT_AURA_EXECUTION_REPORT, rows);
}
function v6AuraConsolidatedCsv_() {
  return v6Csv_(MKT_V6_AURA_SCHEMA.MKT_AURA_EXECUTION_REPORT, v6AuraRows_('MKT_AURA_EXECUTION_REPORT'));
}
function v6AuraArchiveReports_(rows) {
  var owners = {}; rows.forEach(function (r) { owners[r.owner] = true; });
  var archived = [];
  Object.keys(owners).forEach(function (owner) {
    var csv = v6AuraOwnerCsv_(owner), archive = v6AuraArchiveExecutionCsv_('owner-' + v6AuraText_(owner).replace(/[^A-Za-z0-9]+/g, '-'), csv);
    archived.push({ owner: owner, archive: archive });
  });
  var consolidated = v6AuraArchiveExecutionCsv_('consolidated', v6AuraConsolidatedCsv_());
  return { byOwner: archived, consolidated: consolidated };
}

// --- Main tick: signal -> scope -> campaign -> recipients -> execution -----
// -> report, for all four Existing Account Growth families. Safe to call
// repeatedly (hourly trigger, same as Acquisition's v6AcqAutomationTick_) —
// every step below is an idempotent upsert keyed on a deterministic id, so
// re-running never duplicates scopes, campaigns, executions or report rows.
function v6AuraAutomationTick_() {
  v6AuraEnsureSheet_('MKT_CAMPAIGNS'); v6AuraEnsureSheet_('MKT_AURA_EXECUTION_REPORT');
  var refresh = v6RefreshOpportunitiesFromReports_();
  var invalidCountsByAccount = v6AuraInvalidContactCountsByAccount_();
  var accountSourceByAccountId = v6AuraAccountSourceMap_();
  var families = {}, campaignsProcessed = 0, blockedOnProvider = 0, reportRows = [];
  MKT_V6_AURA_FAMILIES.forEach(function (opportunityType) {
    var built = v6AuraAutoBuildScopesForFamily_(opportunityType);
    families[built.family] = { scopesBuilt: built.scopesBuilt, accountsScoped: built.accountsScoped };
    built.scopes.forEach(function (scope) {
      var campaign = v6AuraEnsureCampaign_(scope);
      // Real Gmail-send queue build (MarketingV6AuraEmailDispatcher.gs), Retention only for
      // now -- the one family DGL asked to activate for real (see that file's header comment).
      // typeof-guarded and wrapped so a project without the dispatcher, or one build failure,
      // never breaks the rest of this hourly tick. Must run BEFORE v6AuraPrepareExecution_/
      // v6AuraReportRow_ below so a newly-built queue is reflected in this SAME tick's report
      // row instead of lagging one hour behind.
      if (built.family === 'RETENTION' && typeof v6AuraBuildEmailQueueForCampaign_ === 'function') {
        try { v6AuraBuildEmailQueueForCampaign_(campaign); } catch (err) { /* non-fatal: report falls back to pre-queue state */ }
      }
      var prep = v6AuraPrepareExecution_(scope, campaign);
      var reportRow = v6AuraReportRow_(scope, campaign, prep, invalidCountsByAccount, accountSourceByAccountId);
      reportRows.push(reportRow);
      campaignsProcessed++;
      if (prep.queue && prep.queue.status === 'BLOCKED' && (prep.queue.reasons || []).indexOf('BULK PROVIDER NOT CONFIGURED') >= 0) blockedOnProvider++;
    });
  });
  var archived = v6AuraArchiveReports_(reportRows);
  return {
    status: 'AURA_TICK_COMPLETE', syncedAt: refresh.syncedAt, families: families,
    campaignsProcessed: campaignsProcessed, readyToSendPendingProvider: blockedOnProvider,
    report: { rows: reportRows.length, archive: archived }
  };
}

function v6AuraAutomaticReportStatus_() {
  var rows = v6AuraRows_('MKT_AURA_EXECUTION_REPORT');
  var byOwner = {};
  rows.forEach(function (r) { byOwner[r.owner] = (byOwner[r.owner] || 0) + 1; });
  return { status: 'OK', totalCampaigns: rows.length, owners: Object.keys(byOwner).length, byOwner: byOwner };
}

// --- Live AURA reporting for Marketing OS -----------------------------------
// Read-only projection of MKT_AURA_EXECUTION_REPORT (the real source of truth
// for what AURA has actually done). Returns ONLY safe operational fields --
// never an account name, contact name, email, phone, price or credit value --
// matching the same safe-aggregate discipline already used by
// v6SafeOpportunityResponse_ / v6Opportunities_. campaignFamily here is the
// same human-readable objective label v6AuraEnsureCampaign_ already writes
// ('Retention' | 'Reactivation' | 'Quoted Not Booked' | 'Cross-Sell'), so the
// Marketing OS can group/filter without any extra mapping.
var MKT_V6_AURA_REPORT_SAFE_FIELDS = ['owner', 'campaignFamily', 'service', 'campaignId', 'executionId', 'source', 'detectedAccounts', 'eligibleAccounts', 'suppressedAccounts', 'recipients', 'emailGenerated', 'sent', 'delivered', 'opened', 'bounced', 'clicks', 'spamComplaints', 'replies', 'rfqs', 'quotes', 'loads', 'campaignStart', 'campaignEnd', 'status', 'updatedAt', 'queued', 'failed'];
function v6AuraExecutionReport_() {
  var rows = v6AuraRows_('MKT_AURA_EXECUTION_REPORT');
  var records = rows.map(function (r) {
    var out = {};
    MKT_V6_AURA_REPORT_SAFE_FIELDS.forEach(function (f) { out[f] = r[f] === undefined || r[f] === null ? '' : r[f]; });
    return out;
  });
  var owners = {}, campaigns = records.length, readyToSend = 0, blocked = 0, recipients = 0, eligibleAccounts = 0, suppressedAccounts = 0;
  var sent = 0, delivered = 0, opened = 0, clicked = 0, bounced = 0, spamComplaints = 0, replies = 0, rfqs = 0, quotes = 0, loads = 0, lastUpdated = '', queued = 0, failed = 0;
  var byFamily = { Retention: 0, Reactivation: 0, QNB: 0, 'Cross-Sell': 0 };
  records.forEach(function (r) {
    owners[v6AuraText_(r.owner) || 'Unassigned'] = true;
    var status = v6AuraText_(r.status).toUpperCase();
    if (status.indexOf('READY TO SEND') === 0) readyToSend++;
    else if (status === 'BLOCKED') blocked++;
    var familyToken = v6AuraFamilyToken_(r.campaignFamily);
    var familyLabel = familyToken === 'QNB' ? 'QNB' : familyToken === 'CROSS-SELL' ? 'Cross-Sell' : familyToken === 'REACTIVATION' ? 'Reactivation' : 'Retention';
    byFamily[familyLabel] = (byFamily[familyLabel] || 0) + 1;
    recipients += Number(r.recipients) || 0;
    eligibleAccounts += Number(r.eligibleAccounts) || 0;
    suppressedAccounts += Number(r.suppressedAccounts) || 0;
    sent += Number(r.sent) || 0;
    delivered += Number(r.delivered) || 0;
    opened += Number(r.opened) || 0;
    clicked += Number(r.clicks) || 0;
    bounced += Number(r.bounced) || 0;
    spamComplaints += Number(r.spamComplaints) || 0;
    replies += Number(r.replies) || 0;
    rfqs += Number(r.rfqs) || 0;
    quotes += Number(r.quotes) || 0;
    loads += Number(r.loads) || 0;
    queued += Number(r.queued) || 0;
    failed += Number(r.failed) || 0;
    if (r.updatedAt && String(r.updatedAt) > lastUpdated) lastUpdated = String(r.updatedAt);
  });
  return {
    summary: {
      campaigns: campaigns, readyToSend: readyToSend, blocked: blocked, recipients: recipients,
      eligibleAccounts: eligibleAccounts, suppressedAccounts: suppressedAccounts, owners: Object.keys(owners).length,
      byFamily: byFamily,
      sent: sent, delivered: delivered, opened: opened, clicked: clicked, bounced: bounced, spamComplaints: spamComplaints,
      replies: replies, rfqs: rfqs, quotes: quotes, loads: loads, queued: queued, failed: failed,
      lastUpdated: lastUpdated, lastAuraRun: lastUpdated
    },
    records: records
  };
}

// --- Gmail Data Source panel (read-only projection over MKT_AURA_INGEST_LOG) -
// Never modifies MarketingV6AuraGmailIngest.gs or its ingestion logic -- this
// only reads the log table that file already writes, via its existing
// v6AuraGmailRows_/v6AuraGmailSourceMailbox_ helpers.
function v6AuraGmailAmOwnerName_() {
  return v6AuraText_(PropertiesService.getScriptProperties().getProperty('AURA_GMAIL_AM_OWNER_NAME'));
}
function v6AuraGmailPanelStatus_() {
  var log = v6AuraGmailRows_('MKT_AURA_INGEST_LOG');
  var mailbox = v6AuraGmailSourceMailbox_(), amOwnerName = v6AuraGmailAmOwnerName_();
  if (!log.length) {
    return { status: 'NO_REPORT_RECEIVED', mailbox: mailbox, amOwnerName: amOwnerName };
  }
  var latest = log.reduce(function (a, b) { return v6AuraText_(b.receivedAt) > v6AuraText_(a.receivedAt) ? b : a; });
  return {
    status: 'OK', mailbox: mailbox, amOwnerName: amOwnerName,
    lastReceivedAt: latest.receivedAt, lastProcessedAt: latest.processedAt,
    attachmentsProcessed: Number(latest.attachmentCount) || 0,
    rowsParsed: Number(latest.rowsParsed) || 0, rowsAccepted: Number(latest.rowsAccepted) || 0, rowsRejected: Number(latest.rowsRejected) || 0,
    opportunitiesCreated: Number(latest.opportunitiesCreated) || 0, opportunitiesUpdated: Number(latest.opportunitiesUpdated) || 0,
    lastIngestStatus: v6AuraGmailText_(latest.status)
  };
}

// --- Ingest history table (safe columns only: no messageId/threadId/senderHash/errorCode) ---
var MKT_V6_AURA_INGEST_HISTORY_LIMIT = 50;
function v6AuraIngestHistory_() {
  var log = v6AuraGmailRows_('MKT_AURA_INGEST_LOG');
  var rows = log.slice().sort(function (a, b) { return v6AuraGmailText_(b.receivedAt).localeCompare(v6AuraGmailText_(a.receivedAt)); }).slice(0, MKT_V6_AURA_INGEST_HISTORY_LIMIT);
  return {
    rows: rows.map(function (r) {
      return {
        receivedAt: r.receivedAt, processedAt: r.processedAt, subject: r.subject, files: r.sourceFiles,
        rowsParsed: Number(r.rowsParsed) || 0, rowsAccepted: Number(r.rowsAccepted) || 0, rowsRejected: Number(r.rowsRejected) || 0,
        opportunities: (Number(r.opportunitiesCreated) || 0) + (Number(r.opportunitiesUpdated) || 0),
        status: r.status
      };
    })
  };
}

// --- Source breakdown: Gmail AM Report vs NOVA / Existing source ------------
function v6AuraGmailSourceBreakdown_() {
  var rows = v6Rows_('MKT_OPPORTUNITIES');
  var gmail = { opportunities: 0, lastUpdated: '' }, nova = { opportunities: 0, lastUpdated: '' };
  rows.forEach(function (r) {
    var bucket = v6AuraText_(r.sourceReport) === 'GMAIL_AM_REPORT' ? gmail : nova;
    bucket.opportunities++;
    var updatedAt = v6AuraText_(r.updatedAt) || v6AuraText_(r.detectedAt);
    if (updatedAt > bucket.lastUpdated) bucket.lastUpdated = updatedAt;
  });
  return {
    gmail: { label: 'GMAIL AM REPORT', opportunities: gmail.opportunities, lastUpdated: gmail.lastUpdated, status: gmail.opportunities ? 'ACTIVE' : 'NO DATA' },
    nova: { label: 'NOVA / EXISTING SOURCE', opportunities: nova.opportunities, lastUpdated: nova.lastUpdated, status: nova.opportunities ? 'ACTIVE' : 'NO DATA' }
  };
}
