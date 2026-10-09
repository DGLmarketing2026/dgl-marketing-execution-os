// AURA Gmail Ingestion — canonical recurring source for Existing Account Growth.
//
// Luis Simoes (Team Leader, Account Management) sends a periodic AM report to
// info@dglus.com. This file automatically discovers that email, parses its
// XLSX attachment (or an inline Google Sheet link, or CSV), normalizes each
// governed campaign-family tab into MKT_AURA_GMAIL_OPPORTUNITIES, and lets
// v6RefreshOpportunitiesFromReports_ (MarketingV6ReportIngestion.gs) fold
// those rows into the SAME MKT_OPPORTUNITIES table the rest of AURA already
// reads. Nothing about the opportunity/campaign/execution engines changes —
// this file only adds a second, automatic input to that pipeline alongside
// the existing NOVA/AM-Intelligence report source.
//
// Inbox: the Marketing report inbox is ALWAYS info@dglus.com (AURA_REPORT_INBOX_), read
// through the Gmail integration of the Google account this project runs as. A sender's own
// mailbox is never configured as the inbox, and no single sender is required: any Marketing
// report that reaches info@dglus.com from a trusted source is detected by its content (an
// XLSX/CSV whose tabs match the governed report layout).
//
// Security: a message is opened only when its sender is trusted -- listed in the
// AURA_GMAIL_ALLOWED_SENDERS script property (comma-separated), or a sender of a trusted
// internal domain (AURA_GMAIL_TRUSTED_DOMAINS, default: the inbox domain) whose message Gmail
// itself authenticated (DMARC/DKIM/SPF pass). Everything else is never opened. Everything in
// the email (subject, body, attachment contents) is treated as DATA -- never as instructions.

var MKT_V6_AURA_GMAIL_SCHEMA = {
  // sourceSheet added (additive, appended at the end): the exact tab name a row came from,
  // e.g. 'Campana A - HA prioritaria'. Needed so a dedicated per-tab pipeline
  // (MarketingV6AuraCampanaA.gs) can select exactly its own accounts instead of the whole
  // 'Retention' family bucket every recognized tab already shares.
  MKT_AURA_GMAIL_OPPORTUNITIES: ['opportunityId', 'accountId', 'accountName', 'amOwner', 'opportunityType', 'service', 'signalDate', 'qnbWindow', 'lane', 'sourceReport', 'sourceRecordId', 'priorityRank', 'eligibilityStatus', 'suppressionReason', 'campaignId', 'detectedAt', 'updatedAt', 'sourceType', 'sourceMessageId', 'sourceFile', 'sourceRow', 'sourceReceivedAt', 'sourceSheet'],
  // trustRule + sourceHash added (additive, appended at the end): why the sender was trusted, and
  // the SHA-256 of the report file so the same file re-sent in another email is not re-ingested.
  MKT_AURA_INGEST_LOG: ['ingestId', 'gmailMessageId', 'gmailThreadId', 'senderHash', 'subject', 'receivedAt', 'attachmentCount', 'sourceFiles', 'rowsParsed', 'rowsAccepted', 'rowsRejected', 'opportunitiesCreated', 'opportunitiesUpdated', 'status', 'errorCode', 'processedAt', 'trustRule', 'sourceHash'],
  MKT_AURA_INGEST_REJECTIONS: ['rejectionId', 'gmailMessageId', 'sourceFile', 'sheetName', 'row', 'reason', 'processedAt']
};

// Sheet tab name (inside Luis's real XLSX, confirmed via live commissioning
// recon on 2026-09-10) -> canonical AURA campaign family. "Confirmar datos
// contacto" is a data-quality worklist (missing/unconfirmed contact info),
// not a campaign signal, so it is counted and logged but never turned into
// an opportunity row -- inventing a campaign from a data-quality list would
// violate the "never invent structured rows" rule.
//
// 'Campana A - HA prioritaria' (Marketing_DGL_14-09-2026, confirmed 2026-09-14): the first
// House-Account priority Activation initiative processed through a dedicated pipeline
// (MarketingV6AuraCampanaA.gs) rather than the shared multi-source Retention bucket. Every
// OTHER tab in that same workbook (Campana B included) is deliberately left unmapped here, so
// v6AuraGmailParseTable_ returns null for it and it is never turned into an opportunity --
// exactly the "ignore every other tab" requirement, enforced structurally, not by a manual
// skip check.
var MKT_V6_AURA_GMAIL_SHEET_FAMILY = {
  'Retencion prioritaria': 'Retention',
  'Fidelizacion general': 'Retention',
  'Nurture-Reactivacion': 'Reactivation',
  'Recuperacion FTL': 'Reactivation',
  'Promocion dirigida': 'Cross-Sell',
  'Expansion de servicio': 'Cross-Sell',
  'Campana A - HA prioritaria': 'Activation'
};
var MKT_V6_AURA_GMAIL_DATA_QUALITY_SHEETS = ['Confirmar datos contacto'];

function v6AuraGmailText_(v) { return String(v == null ? '' : v).trim(); }
function v6AuraGmailNow_() { return new Date().toISOString(); }
function v6AuraGmailEnsureSheet_(name) { return v6AcqEnsureSheet_(name, MKT_V6_AURA_GMAIL_SCHEMA[name]); }
function v6AuraGmailRows_(name) { v6AuraGmailEnsureSheet_(name); return v6Rows_(name); }

function v6AuraGmailSourceMailbox_() {
  return v6AuraGmailText_(PropertiesService.getScriptProperties().getProperty('AURA_GMAIL_SOURCE_MAILBOX')) || 'info@dglus.com';
}
function v6AuraGmailAllowedSenders_() {
  var raw = v6AuraGmailText_(PropertiesService.getScriptProperties().getProperty('AURA_GMAIL_ALLOWED_SENDERS'));
  if (!raw) return [];
  return raw.split(',').map(function (s) { return v6AuraGmailText_(s).toLowerCase(); }).filter(Boolean);
}
function v6AuraGmailExtractEmail_(fromHeader) {
  var m = /<([^>]+)>/.exec(fromHeader || '');
  return (m ? m[1] : String(fromHeader || '')).trim().toLowerCase();
}
function v6AuraGmailSenderAllowed_(fromHeader, allowed) {
  var email = v6AuraGmailExtractEmail_(fromHeader);
  return !!email && allowed.indexOf(email) >= 0;
}

// --- Report inbox + sender trust -------------------------------------------------
var AURA_REPORT_INBOX_ = 'info@dglus.com';
function v6AuraReportInbox_() { return AURA_REPORT_INBOX_; }
// GmailApp can only read the mailbox of the account the script runs as. If that account is
// known and is not the report inbox, ingestion stops and says which connection is missing.
function v6AuraReportInboxConnection_() {
  var me = '', inbox = v6AuraReportInbox_();
  try { me = v6AuraGmailText_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (e) {}
  if (me && me !== inbox) return { connected: false, status: 'INBOX_NOT_CONNECTED', inbox: inbox, detail: 'AURA must run as ' + inbox + ' (the authorized Gmail integration) to read the Marketing report inbox.' };
  return { connected: true, inbox: inbox, accountVerified: !!me };
}
function v6AuraGmailDomain_(email) {
  var e = String(email || ''), at = e.lastIndexOf('@');
  return at < 0 ? '' : e.slice(at + 1).toLowerCase();
}
function v6AuraGmailTrustedDomains_() {
  var raw = v6AuraGmailText_(PropertiesService.getScriptProperties().getProperty('AURA_GMAIL_TRUSTED_DOMAINS'));
  if (raw.toUpperCase() === 'NONE') return []; // explicit opt-out: allowlisted senders only
  var list = raw ? raw.split(',') : [v6AuraGmailDomain_(v6AuraReportInbox_())];
  return list.map(function (d) { return v6AuraGmailText_(d).replace(/^@/, '').toLowerCase(); }).filter(Boolean);
}
// Gmail's own Authentication-Results header (added by mx.google.com on delivery) must show a
// DMARC, DKIM or SPF pass aligned with the sender's domain. No header or no pass = not verified.
function v6AuraGmailAuthVerified_(msg, domain) {
  var h = '';
  try { h = String((msg.getHeader && msg.getHeader('Authentication-Results')) || ''); } catch (e) {}
  if (!h || !domain || !/mx\.google\.com/i.test(h)) return false;
  var d = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), end = '(?![\\w.-])';
  return new RegExp('dmarc=pass[^;]*header\\.from=' + d + end, 'i').test(h) ||
    new RegExp('dkim=pass[^;]*header\\.[id]=@?' + d + end, 'i').test(h) ||
    new RegExp('spf=pass[^;]*smtp\\.mailfrom=[^;\\s]*@' + d + end, 'i').test(h);
}
// ALLOWLISTED_SENDER: explicit AURA_GMAIL_ALLOWED_SENDERS entry (unchanged behavior).
// VERIFIED_INTERNAL_SENDER: a trusted-domain sender whose message Gmail authenticated.
function v6AuraGmailTrust_(msg, allowed, domains) {
  var email = v6AuraGmailExtractEmail_(msg.getFrom());
  if (email && allowed.indexOf(email) >= 0) return 'ALLOWLISTED_SENDER';
  var domain = v6AuraGmailDomain_(email);
  if (domain && domains.indexOf(domain) >= 0 && v6AuraGmailAuthVerified_(msg, domain)) return 'VERIFIED_INTERNAL_SENDER';
  return '';
}
// Report detection in the inbox: messages from allowlisted senders (any format, including a
// Google Sheet link), plus XLSX/CSV attachments from trusted internal domains. Untrusted
// messages are counted, never opened.
function v6AuraGmailCandidates_(days, allowed, domains) {
  var inbox = v6AuraReportInbox_(), to = '(to:' + inbox + ' OR cc:' + inbox + ' OR deliveredto:' + inbox + ')';
  var when = ' newer_than:' + Math.max(1, Number(days) || 45) + 'd -in:sent', queries = [];
  if (allowed.length) queries.push(to + ' (' + allowed.map(function (a) { return 'from:' + a; }).join(' OR ') + ')' + when);
  if (domains.length) queries.push(to + ' (' + domains.map(function (d) { return 'from:' + d; }).join(' OR ') + ') has:attachment (filename:xlsx OR filename:csv)' + when);
  var seen = {}, candidates = [], untrusted = 0;
  queries.forEach(function (q) {
    GmailApp.search(q, 0, 50).forEach(function (t) {
      t.getMessages().forEach(function (m) {
        var id = m.getId(); if (seen[id]) return; seen[id] = true;
        var trust = v6AuraGmailTrust_(m, allowed, domains);
        if (trust) candidates.push({ msg: m, thread: t, trust: trust });
        else untrusted++;
      });
    });
  });
  return { candidates: candidates, untrusted: untrusted };
}
function v6AuraGmailBlobHash_(att) {
  try {
    var blob = att.copyBlob ? att.copyBlob() : att;
    if (!blob || typeof blob.getBytes !== 'function') return '';
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, blob.getBytes()).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
  } catch (e) { return ''; }
}

// --- Gmail labels ------------------------------------------------------------
function v6AuraGmailLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
function v6AuraGmailApplyLabel_(thread, name) {
  try { thread.addLabel(v6AuraGmailLabel_(name)); } catch (err) { /* labeling must never block ingestion */ }
}

// --- Workbook / sheet parsing -------------------------------------------------
// Luis's real report layout (confirmed live, 2026-09-10): row 1 is a title,
// row 2 a summary line, row 3 blank, row 4 the real headers. Scanning for the
// row whose first non-empty cell is "Cuenta" makes this robust to minor
// layout drift instead of hard-coding a row number.
function v6AuraGmailFindHeaderRow_(values) {
  for (var i = 0; i < Math.min(values.length, 8); i++) {
    var first = v6AuraGmailText_(values[i][0]).toLowerCase();
    if (first === 'cuenta') return i;
  }
  return -1;
}
function v6AuraGmailRowObject_(headers, row) {
  var out = {};
  headers.forEach(function (h, i) { out[v6AuraGmailText_(h)] = row[i]; });
  return out;
}
// Parses ONE 2-D array (a workbook sheet's values, or a parsed CSV) that is
// expected to follow Luis's real column layout. Returns governed opportunity
// candidates for recognized campaign-family tabs, or {dataQuality:true,
// rowCount} for the data-quality worklist, or null for an unrecognized tab
// (logged, never guessed into a family).
function v6AuraGmailParseTable_(sheetName, values, ctx) {
  var isDataQuality = MKT_V6_AURA_GMAIL_DATA_QUALITY_SHEETS.indexOf(sheetName) >= 0;
  var family = MKT_V6_AURA_GMAIL_SHEET_FAMILY[sheetName];
  if (!isDataQuality && !family) return null;
  var headerRowIdx = v6AuraGmailFindHeaderRow_(values);
  if (headerRowIdx < 0) return { unrecognizedLayout: true };
  var headers = values[headerRowIdx].map(v6AuraGmailText_);
  var dataRows = values.slice(headerRowIdx + 1).filter(function (r) { return r.some(function (v) { return v6AuraGmailText_(v) !== ''; }); });
  if (isDataQuality) return { dataQuality: true, rowCount: dataRows.length };
  var accepted = [], rejected = [];
  dataRows.forEach(function (row, i) {
    var r = v6AuraGmailRowObject_(headers, row);
    var accountName = v6AuraGmailText_(r['Cuenta']);
    if (!accountName) { rejected.push({ row: headerRowIdx + 2 + i, reason: 'MISSING ACCOUNT (Cuenta)' }); return; }
    var owner = v6AuraGmailText_(r['Account Owner']) || v6AuraGmailText_(r['Agente responsable (Sales Rep Actual)']);
    if (!owner) { rejected.push({ row: headerRowIdx + 2 + i, reason: 'MISSING AM OWNER' }); return; }
    accepted.push({
      accountName: accountName, amOwner: owner, family: family, sheetName: sheetName,
      reasonCategory: v6AuraGmailText_(r['Motivo campana']), priority: v6AuraGmailText_(r['Prioridad']),
      sourceRow: headerRowIdx + 2 + i
    });
  });
  return { family: family, accepted: accepted, rejected: rejected, rowCount: dataRows.length };
}

// --- Opportunity staging upsert ----------------------------------------------
// Deterministic, idempotent opportunityId (same pattern as v6OppId_ in
// MarketingV6ReportIngestion.gs) so a newer copy of the same report UPDATES
// the existing row instead of duplicating it.
function v6AuraGmailOpportunityId_(family, accountName) {
  return 'OPP-GMAIL-' + String(family || 'GEN').replace(/[^A-Z0-9]/gi, '').toUpperCase() + '-' + v6HashKey_(v6NormAccount_(accountName));
}
// Pure row-shape builder, no I/O -- extracted so a caller processing many candidates at once
// (e.g. MarketingV6AuraCampanaA.gs's direct-spreadsheet ingest) can compute every row in memory
// and write them all in ONE batch call (v6BatchUpsertByKey_) instead of one upsert per candidate.
// v6AuraGmailUpsertOpportunity_ itself is unchanged behavior -- it just calls this now.
function v6AuraGmailBuildOpportunityRow_(candidate, ctx) {
  var nowIso = v6AuraGmailNow_();
  return {
    opportunityId: v6AuraGmailOpportunityId_(candidate.family, candidate.accountName),
    accountId: 'ACC-' + v6HashKey_(v6NormAccount_(candidate.accountName)),
    accountName: candidate.accountName, amOwner: candidate.amOwner, opportunityType: candidate.family,
    service: 'Multiservicio', signalDate: v6AuraGmailText_(ctx.receivedAt).slice(0, 10), qnbWindow: '', lane: '',
    sourceReport: 'GMAIL_AM_REPORT', sourceRecordId: candidate.reasonCategory || candidate.priority || '',
    priorityRank: candidate.family === 'Retention' ? 2 : candidate.family === 'Reactivation' ? 3 : 4,
    eligibilityStatus: 'DETECTED', suppressionReason: '', campaignId: '', detectedAt: nowIso, updatedAt: nowIso,
    sourceType: 'GMAIL_AM_REPORT', sourceMessageId: ctx.messageId, sourceFile: ctx.sourceFile,
    sourceRow: candidate.sourceRow, sourceReceivedAt: ctx.receivedAt, sourceSheet: candidate.sheetName || ''
  };
}
function v6AuraGmailUpsertOpportunity_(candidate, ctx) {
  var row = v6AuraGmailBuildOpportunityRow_(candidate, ctx);
  var existing = v6AuraGmailRows_('MKT_AURA_GMAIL_OPPORTUNITIES').filter(function (r) { return v6AuraGmailText_(r.opportunityId) === row.opportunityId; })[0];
  v6UpsertByKey_('MKT_AURA_GMAIL_OPPORTUNITIES', ['opportunityId'], row);
  return existing ? 'updated' : 'created';
}

// --- Attachment / source handling --------------------------------------------
// XLSX: convert to a throwaway Google Sheet via the Drive Advanced Service
// (server-side, no manual conversion by Cristian), read every tab, then
// delete the temp file. CSV: parsed directly. A Google Sheet link in the body
// is read in place (never copied) since the sender is already allowlisted.
function v6AuraGmailXlsxTables_(blob) {
  var file = Drive.Files.create({ name: 'AURA_GMAIL_INGEST_' + Date.now(), mimeType: 'application/vnd.google-apps.spreadsheet' }, blob);
  try {
    var ss = SpreadsheetApp.openById(file.id);
    return ss.getSheets().map(function (s) { return { name: s.getName(), values: s.getDataRange().getValues() }; });
  } finally {
    try { Drive.Files.remove(file.id); } catch (err) { /* best effort cleanup */ }
  }
}
function v6AuraGmailCsvTables_(blob) {
  var rows = Utilities.parseCsv(blob.getDataAsString());
  return [{ name: 'CSV', values: rows }];
}
function v6AuraGmailSheetLinkTables_(body) {
  var m = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(body || '');
  if (!m) return null;
  var ss = SpreadsheetApp.openById(m[1]);
  return ss.getSheets().map(function (s) { return { name: s.getName(), values: s.getDataRange().getValues() }; });
}

// --- Per-message processing ----------------------------------------------------
function v6AuraGmailProcessMessage_(msg, thread, opts) {
  opts = opts || {};
  var messageId = msg.getId(), receivedAt = msg.getDate().toISOString(), subject = msg.getSubject();
  var ctx = { messageId: messageId, receivedAt: receivedAt };
  var logRow = {
    ingestId: 'ING-' + v6HashKey_(messageId), gmailMessageId: messageId, gmailThreadId: thread.getId(),
    senderHash: v6HashKey_(v6AuraGmailExtractEmail_(msg.getFrom())), subject: subject, receivedAt: receivedAt,
    attachmentCount: 0, sourceFiles: '', rowsParsed: 0, rowsAccepted: 0, rowsRejected: 0,
    opportunitiesCreated: 0, opportunitiesUpdated: 0, status: 'PROCESSING', errorCode: '', processedAt: v6AuraGmailNow_(),
    trustRule: opts.trustRule || 'ALLOWLISTED_SENDER', sourceHash: ''
  };
  var recognized = false;
  try {
    var atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
    logRow.attachmentCount = atts.length;
    logRow.sourceFiles = atts.map(function (a) { return a.getName(); }).join('; ');
    var xlsx = atts.filter(function (a) { return /\.xlsx$/i.test(a.getName()); })[0];
    var csv = atts.filter(function (a) { return /\.csv$/i.test(a.getName()); })[0];
    var tables = null, sourceFile = '';
    // The same report file re-sent in another email is not ingested again.
    if (xlsx || csv) logRow.sourceHash = v6AuraGmailBlobHash_(xlsx || csv);
    var dupOf = logRow.sourceHash && opts.knownHashes && opts.knownHashes[logRow.sourceHash];
    if (dupOf) { logRow.status = 'DUPLICATE_REPORT'; logRow.errorCode = 'SAME_FILE_AS ' + dupOf; }
    else if (xlsx) { tables = v6AuraGmailXlsxTables_(xlsx.copyBlob()); sourceFile = xlsx.getName(); }
    else if (csv) { tables = v6AuraGmailCsvTables_(csv.copyBlob()); sourceFile = csv.getName(); }
    else if (!dupOf) {
      tables = v6AuraGmailSheetLinkTables_(msg.getPlainBody());
      sourceFile = 'GOOGLE_SHEET_LINK';
      if (!tables && atts.length && !dupOf) { logRow.status = 'UNSUPPORTED_SOURCE_FORMAT'; logRow.errorCode = 'UNSUPPORTED SOURCE FORMAT'; }
    }
    ctx.sourceFile = sourceFile;
    if (tables) {
      // Performance fix (2026-09-16 production incident, MarketingV6AuraCampanaA.gs): every
      // accepted row across every table in this message was previously upserted individually
      // (v6AuraGmailUpsertOpportunity_ -- two full-table reads + one write PER ROW, against
      // MKT_AURA_GMAIL_OPPORTUNITIES, a table shared and grown by every ingest source). A single
      // report email can carry hundreds of rows across the whole account base (not just one
      // dedicated campaign's tab), so this loop is now: compute every accepted row's shape in
      // memory (v6AuraGmailBuildOpportunityRow_, pure, no I/O) across ALL tables in the message,
      // then write them ALL in one v6BatchUpsertByKey_ call -- same "last row wins" semantic,
      // same created/updated counting, but O(1) Sheets round trips per message instead of O(n).
      // MKT_AURA_INGEST_REJECTIONS is batched the same way.
      var rowsParsed = 0, rowsAccepted = 0, rowsRejected = 0;
      var existingOppIds = {};
      v6AuraGmailRows_('MKT_AURA_GMAIL_OPPORTUNITIES').forEach(function (r) { existingOppIds[v6AuraGmailText_(r.opportunityId)] = true; });
      var opportunityRows = [], rejectionRows = [];
      tables.forEach(function (table) {
        var parsed = v6AuraGmailParseTable_(table.name, table.values, ctx);
        if (parsed) recognized = true;
        if (!parsed || parsed.dataQuality || parsed.unrecognizedLayout) return;
        rowsParsed += parsed.rowCount;
        rowsAccepted += parsed.accepted.length;
        rowsRejected += parsed.rejected.length;
        parsed.accepted.forEach(function (candidate) { opportunityRows.push(v6AuraGmailBuildOpportunityRow_(candidate, ctx)); });
        parsed.rejected.forEach(function (rej) {
          rejectionRows.push({
            rejectionId: 'REJ-' + v6HashKey_(messageId + '|' + table.name + '|' + rej.row),
            gmailMessageId: messageId, sourceFile: sourceFile, sheetName: table.name, row: rej.row,
            reason: rej.reason, processedAt: v6AuraGmailNow_()
          });
        });
      });
      var created = 0, updated = 0, uniqueOppIdsInBatch = {};
      opportunityRows.forEach(function (row) {
        var isNewOverall = !existingOppIds[row.opportunityId] && !uniqueOppIdsInBatch[row.opportunityId];
        uniqueOppIdsInBatch[row.opportunityId] = true;
        if (isNewOverall) created++; else updated++;
      });
      if (opportunityRows.length) v6BatchUpsertByKey_('MKT_AURA_GMAIL_OPPORTUNITIES', ['opportunityId'], opportunityRows);
      if (rejectionRows.length) v6BatchUpsertByKey_('MKT_AURA_INGEST_REJECTIONS', ['rejectionId'], rejectionRows);
      logRow.rowsParsed = rowsParsed; logRow.rowsAccepted = rowsAccepted; logRow.rowsRejected = rowsRejected;
      logRow.opportunitiesCreated = created; logRow.opportunitiesUpdated = updated;
      // A trusted internal sender's spreadsheet without any governed report tab is not a Marketing report.
      if (logRow.status === 'PROCESSING' && !recognized && logRow.trustRule === 'VERIFIED_INTERNAL_SENDER') { logRow.status = 'NOT_A_MARKETING_REPORT'; logRow.errorCode = 'NO_RECOGNIZED_TABS'; }
      if (logRow.status === 'PROCESSING') logRow.status = rowsAccepted > 0 ? 'OK' : 'PARTIAL';
    } else if (logRow.status === 'PROCESSING') {
      logRow.status = 'PARTIAL'; logRow.errorCode = 'NO_RECOGNIZED_SOURCE';
    }
  } catch (err) {
    // A bad attachment must never wipe previously ingested data: this
    // function only ever upserts, it never clears MKT_AURA_GMAIL_OPPORTUNITIES.
    logRow.status = 'FAILED'; logRow.errorCode = String(err && err.message || err);
  }
  logRow.processedAt = v6AuraGmailNow_();
  v6UpsertByKey_('MKT_AURA_INGEST_LOG', ['gmailMessageId'], logRow);
  if (logRow.status !== 'NOT_A_MARKETING_REPORT') {
    v6AuraGmailApplyLabel_(thread, 'AURA/AM-REPORTS');
    v6AuraGmailApplyLabel_(thread, logRow.status === 'FAILED' || logRow.status === 'UNSUPPORTED_SOURCE_FORMAT' ? 'AURA/ERROR' : 'AURA/PROCESSED');
  }
  return logRow;
}

// --- Main tick -----------------------------------------------------------------
// Runs hourly from auraReportIntakeTick (below) and from the acquisition heartbeat
// (MarketingV6AcquisitionEngine.gs); a script lock serializes them. Idempotent per Gmail
// messageId (a message already in MKT_AURA_INGEST_LOG is never reprocessed) and per file
// (SHA-256). The search is always bounded to the last 45 days so it never walks the whole
// mailbox. Message ids already logged are cached in AURA_REPORT_SEEN_IDS, so an hour without a
// new report only queries Gmail and never opens the Data Hub.
var AURA_REPORT_SEEN_PROP_ = 'AURA_REPORT_SEEN_IDS';
function v6AuraGmailSummary_(base, processed) {
  var count = function (re) { return processed.filter(function (r) { return re.test(r.status); }).length; };
  return Object.assign(base, {
    messagesProcessed: processed.length, ok: count(/^OK$/), partial: count(/^PARTIAL$/),
    failed: count(/^(FAILED|UNSUPPORTED_SOURCE_FORMAT)$/), duplicates: count(/^DUPLICATE_REPORT$/), notReports: count(/^NOT_A_MARKETING_REPORT$/)
  });
}
function v6AuraGmailWithLock_(fn) {
  var lock = null;
  try { lock = LockService.getScriptLock(); } catch (e) { lock = null; }
  if (lock && !lock.tryLock(30000)) return { status: 'SKIPPED_ALREADY_RUNNING', messagesFound: 0, messagesProcessed: 0 };
  try { return fn(); } finally { if (lock) { try { lock.releaseLock(); } catch (e) {} } }
}
function v6AuraGmailIngestTick_() {
  var conn = v6AuraReportInboxConnection_();
  if (!conn.connected) return { status: conn.status, inbox: conn.inbox, detail: conn.detail, messagesFound: 0, messagesProcessed: 0 };
  var allowed = v6AuraGmailAllowedSenders_(), domains = v6AuraGmailTrustedDomains_();
  if (!allowed.length && !domains.length) return { status: 'NO_TRUSTED_SOURCES', inbox: conn.inbox, messagesFound: 0, messagesProcessed: 0 };
  return v6AuraGmailWithLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var found = v6AuraGmailCandidates_(45, allowed, domains), cache = {};
    try { (JSON.parse(props.getProperty(AURA_REPORT_SEEN_PROP_) || '[]') || []).forEach(function (id) { cache[id] = true; }); } catch (e) { cache = {}; }
    var fresh = found.candidates.filter(function (c) { return !cache[c.msg.getId()]; }), processed = [];
    if (fresh.length) {
      var alreadySeen = {}, knownHashes = {};
      v6AuraGmailRows_('MKT_AURA_INGEST_LOG').forEach(function (r) {
        alreadySeen[v6AuraGmailText_(r.gmailMessageId)] = true;
        if (r.sourceHash && /^(OK|PARTIAL)$/.test(v6AuraGmailText_(r.status))) knownHashes[r.sourceHash] = v6AuraGmailText_(r.gmailMessageId);
      });
      fresh.forEach(function (c) {
        if (alreadySeen[c.msg.getId()]) return;
        var row = v6AuraGmailProcessMessage_(c.msg, c.thread, { trustRule: c.trust, knownHashes: knownHashes });
        if (row.sourceHash && /^(OK|PARTIAL)$/.test(row.status)) knownHashes[row.sourceHash] = row.gmailMessageId;
        processed.push(row);
      });
      var ids = Object.keys(cache).concat(fresh.map(function (c) { return c.msg.getId(); }));
      try { props.setProperty(AURA_REPORT_SEEN_PROP_, JSON.stringify(ids.slice(-300))); } catch (e) {}
    }
    if (!props.getProperty('AURA_GMAIL_INITIALIZED_AT')) props.setProperty('AURA_GMAIL_INITIALIZED_AT', v6AuraGmailNow_());
    return v6AuraGmailSummary_({ status: 'OK', mailbox: conn.inbox, inbox: conn.inbox, messagesFound: found.candidates.length, untrustedSkipped: found.untrusted }, processed);
  });
}

// Manual reprocessing, ignoring the "already seen by messageId" skip and the file-hash skip that
// v6AuraGmailIngestTick_ applies. Needed the one time a tab-name family mapping is added
// (like 'Campana A - HA prioritaria' above) AFTER a matching report already arrived and was
// ingested under the OLD mapping. Safe to call any number of times: v6AuraGmailProcessMessage_
// only ever upserts by messageId/opportunityId, it never clears or duplicates prior data.
function v6AuraGmailReprocessRecent_(days) {
  var conn = v6AuraReportInboxConnection_();
  if (!conn.connected) return { status: conn.status, inbox: conn.inbox, detail: conn.detail, messagesFound: 0, messagesProcessed: 0 };
  var allowed = v6AuraGmailAllowedSenders_(), domains = v6AuraGmailTrustedDomains_();
  if (!allowed.length && !domains.length) return { status: 'NO_TRUSTED_SOURCES', inbox: conn.inbox, messagesFound: 0, messagesProcessed: 0 };
  return v6AuraGmailWithLock_(function () {
    var found = v6AuraGmailCandidates_(days, allowed, domains);
    var processed = found.candidates.map(function (c) { return v6AuraGmailProcessMessage_(c.msg, c.thread, { trustRule: c.trust }); });
    return v6AuraGmailSummary_({ status: 'REPROCESS_COMPLETE', mailbox: conn.inbox, inbox: conn.inbox, messagesFound: found.candidates.length, untrustedSkipped: found.untrusted }, processed);
  });
}

// --- Hourly report intake (own trigger) -----------------------------------------------
// info@dglus.com -> report detection -> XLSX -> governed opportunities. Only when a report
// added rows does it refresh MKT_OPPORTUNITIES, so the next AURA agent cycle analyzes the report
// and prepares (never sends) campaign plans that wait for one human approval. Never sends email.
function auraReportIntakeTick() {
  var out = { at: v6AuraGmailNow_() };
  try { out.ingest = v6AuraGmailIngestTick_(); } catch (err) { out.ingest = { status: 'ERROR', error: String(err && err.message || err) }; }
  if (out.ingest && out.ingest.ok > 0 && typeof v6RefreshOpportunitiesFromReports_ === 'function') {
    try { var r = v6RefreshOpportunitiesFromReports_(); out.refresh = { status: r && r.status, syncedAt: r && r.syncedAt }; }
    catch (err) { out.refresh = { status: 'ERROR', error: String(err && err.message || err) }; }
  }
  try { PropertiesService.getScriptProperties().setProperty('AURA_REPORT_INTAKE_LAST', JSON.stringify(out).slice(0, 8000)); } catch (e) {}
  return out;
}
// Operator step (run once from the Apps Script editor after deploying): keeps exactly ONE hourly
// auraReportIntakeTick trigger and runs one intake. Refuses when AURA is not running as the inbox.
function AURA_REPORT_INTAKE_ACTIVATE() {
  var conn = v6AuraReportInboxConnection_();
  if (!conn.connected) return conn;
  var ticks = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'auraReportIntakeTick'; });
  for (var i = 1; i < ticks.length; i++) ScriptApp.deleteTrigger(ticks[i]);
  if (!ticks.length) ScriptApp.newTrigger('auraReportIntakeTick').timeBased().everyHours(1).create();
  return { status: 'ACTIVE', inbox: conn.inbox, schedule: 'HOURLY', firstRun: auraReportIntakeTick() };
}

// --- Merge into the governed opportunity pipeline -----------------------------
// Called from v6RefreshOpportunitiesFromReports_ (MarketingV6ReportIngestion.gs)
// exactly like the existing v6BuildRetentionOpportunities_ / v6BuildReactivationOpportunities_
// / v6BuildCrossSellOpportunities_ builders -- same MKT_OPPORTUNITIES row shape,
// same v6ApplyPrioritySuppression_ pass, so a Gmail-sourced and a NOVA-sourced
// signal for the same account are reconciled by the SAME existing priority rule.
function v6BuildGmailOpportunities_(nowIso) {
  return v6AuraGmailRows_('MKT_AURA_GMAIL_OPPORTUNITIES').map(function (r) {
    return {
      opportunityId: r.opportunityId, accountId: r.accountId, accountName: r.accountName, amOwner: r.amOwner,
      opportunityType: r.opportunityType, service: r.service, signalDate: r.signalDate, qnbWindow: r.qnbWindow, lane: r.lane,
      sourceReport: r.sourceReport, sourceRecordId: r.sourceRecordId, priorityRank: Number(r.priorityRank) || 9,
      eligibilityStatus: r.eligibilityStatus || 'DETECTED', suppressionReason: r.suppressionReason || '',
      campaignId: '', detectedAt: r.detectedAt, updatedAt: nowIso
    };
  });
}

// --- Freshness status for Marketing OS ----------------------------------------
function v6AuraGmailFreshnessStatus_() {
  var log = v6AuraGmailRows_('MKT_AURA_INGEST_LOG').filter(function (r) { return v6AuraGmailText_(r.status) !== 'NOT_A_MARKETING_REPORT'; });
  if (!log.length) return { status: 'NO_REPORT_RECEIVED', source: 'GMAIL · ' + v6AuraReportInbox_() };
  var latest = log.reduce(function (a, b) { return v6AuraGmailText_(b.receivedAt) > v6AuraGmailText_(a.receivedAt) ? b : a; });
  var ageMs = Date.now() - new Date(latest.processedAt || latest.receivedAt).getTime();
  var ageDays = ageMs / 86400000;
  var freshness = ageDays <= 8 ? 'CURRENT' : ageDays <= 21 ? 'AGING' : 'STALE';
  var opportunities = v6AuraGmailRows_('MKT_AURA_GMAIL_OPPORTUNITIES');
  return {
    status: 'OK', source: 'GMAIL · ' + v6AuraReportInbox_(), lastStatus: latest.status || '', lastTrustRule: latest.trustRule || '',
    lastReportReceivedAt: latest.receivedAt, lastReportProcessedAt: latest.processedAt,
    filesProcessed: latest.sourceFiles, rowsAccepted: Number(latest.rowsAccepted) || 0, rowsRejected: Number(latest.rowsRejected) || 0,
    opportunitiesUpdated: Number(latest.opportunitiesCreated || 0) + Number(latest.opportunitiesUpdated || 0),
    freshness: freshness, ageDays: Math.floor(ageDays), totalGovernedOpportunities: opportunities.length
  };
}
