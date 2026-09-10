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
// Security: only messages FROM an address on the AURA_GMAIL_ALLOWED_SENDERS
// script property (comma-separated) are ever opened. Everything in the email
// (subject, body, attachment contents) is treated as DATA — never as
// instructions to this script. If no allowlist is configured, ingestion is a
// safe no-op (fail closed), never "trust anyone who emails info@dglus.com."

var MKT_V6_AURA_GMAIL_SCHEMA = {
  MKT_AURA_GMAIL_OPPORTUNITIES: ['opportunityId', 'accountId', 'accountName', 'amOwner', 'opportunityType', 'service', 'signalDate', 'qnbWindow', 'lane', 'sourceReport', 'sourceRecordId', 'priorityRank', 'eligibilityStatus', 'suppressionReason', 'campaignId', 'detectedAt', 'updatedAt', 'sourceType', 'sourceMessageId', 'sourceFile', 'sourceRow', 'sourceReceivedAt'],
  MKT_AURA_INGEST_LOG: ['ingestId', 'gmailMessageId', 'gmailThreadId', 'senderHash', 'subject', 'receivedAt', 'attachmentCount', 'sourceFiles', 'rowsParsed', 'rowsAccepted', 'rowsRejected', 'opportunitiesCreated', 'opportunitiesUpdated', 'status', 'errorCode', 'processedAt'],
  MKT_AURA_INGEST_REJECTIONS: ['rejectionId', 'gmailMessageId', 'sourceFile', 'sheetName', 'row', 'reason', 'processedAt']
};

// Sheet tab name (inside Luis's real XLSX, confirmed via live commissioning
// recon on 2026-09-10) -> canonical AURA campaign family. "Confirmar datos
// contacto" is a data-quality worklist (missing/unconfirmed contact info),
// not a campaign signal, so it is counted and logged but never turned into
// an opportunity row -- inventing a campaign from a data-quality list would
// violate the "never invent structured rows" rule.
var MKT_V6_AURA_GMAIL_SHEET_FAMILY = {
  'Retencion prioritaria': 'Retention',
  'Fidelizacion general': 'Retention',
  'Nurture-Reactivacion': 'Reactivation',
  'Recuperacion FTL': 'Reactivation',
  'Promocion dirigida': 'Cross-Sell',
  'Expansion de servicio': 'Cross-Sell'
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
      accountName: accountName, amOwner: owner, family: family,
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
function v6AuraGmailUpsertOpportunity_(candidate, ctx) {
  var nowIso = v6AuraGmailNow_();
  var row = {
    opportunityId: v6AuraGmailOpportunityId_(candidate.family, candidate.accountName),
    accountId: 'ACC-' + v6HashKey_(v6NormAccount_(candidate.accountName)),
    accountName: candidate.accountName, amOwner: candidate.amOwner, opportunityType: candidate.family,
    service: 'Multiservicio', signalDate: v6AuraGmailText_(ctx.receivedAt).slice(0, 10), qnbWindow: '', lane: '',
    sourceReport: 'GMAIL_AM_REPORT', sourceRecordId: candidate.reasonCategory || candidate.priority || '',
    priorityRank: candidate.family === 'Retention' ? 2 : candidate.family === 'Reactivation' ? 3 : 4,
    eligibilityStatus: 'DETECTED', suppressionReason: '', campaignId: '', detectedAt: nowIso, updatedAt: nowIso,
    sourceType: 'GMAIL_AM_REPORT', sourceMessageId: ctx.messageId, sourceFile: ctx.sourceFile,
    sourceRow: candidate.sourceRow, sourceReceivedAt: ctx.receivedAt
  };
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
function v6AuraGmailProcessMessage_(msg, thread) {
  var messageId = msg.getId(), receivedAt = msg.getDate().toISOString(), subject = msg.getSubject();
  var ctx = { messageId: messageId, receivedAt: receivedAt };
  var logRow = {
    ingestId: 'ING-' + v6HashKey_(messageId), gmailMessageId: messageId, gmailThreadId: thread.getId(),
    senderHash: v6HashKey_(v6AuraGmailExtractEmail_(msg.getFrom())), subject: subject, receivedAt: receivedAt,
    attachmentCount: 0, sourceFiles: '', rowsParsed: 0, rowsAccepted: 0, rowsRejected: 0,
    opportunitiesCreated: 0, opportunitiesUpdated: 0, status: 'PROCESSING', errorCode: '', processedAt: v6AuraGmailNow_()
  };
  v6AuraGmailApplyLabel_(thread, 'AURA/AM-REPORTS');
  try {
    var atts = msg.getAttachments({ includeInlineImages: false, includeAttachments: true });
    logRow.attachmentCount = atts.length;
    logRow.sourceFiles = atts.map(function (a) { return a.getName(); }).join('; ');
    var xlsx = atts.filter(function (a) { return /\.xlsx$/i.test(a.getName()); })[0];
    var csv = atts.filter(function (a) { return /\.csv$/i.test(a.getName()); })[0];
    var tables = null, sourceFile = '';
    if (xlsx) { tables = v6AuraGmailXlsxTables_(xlsx.copyBlob()); sourceFile = xlsx.getName(); }
    else if (csv) { tables = v6AuraGmailCsvTables_(csv.copyBlob()); sourceFile = csv.getName(); }
    else {
      tables = v6AuraGmailSheetLinkTables_(msg.getPlainBody());
      sourceFile = 'GOOGLE_SHEET_LINK';
      if (!tables && atts.length) { logRow.status = 'UNSUPPORTED_SOURCE_FORMAT'; logRow.errorCode = 'UNSUPPORTED SOURCE FORMAT'; }
    }
    ctx.sourceFile = sourceFile;
    if (tables) {
      var created = 0, updated = 0, rowsParsed = 0, rowsAccepted = 0, rowsRejected = 0;
      tables.forEach(function (table) {
        var parsed = v6AuraGmailParseTable_(table.name, table.values, ctx);
        if (!parsed || parsed.dataQuality || parsed.unrecognizedLayout) return;
        rowsParsed += parsed.rowCount;
        rowsAccepted += parsed.accepted.length;
        rowsRejected += parsed.rejected.length;
        parsed.accepted.forEach(function (candidate) {
          var result = v6AuraGmailUpsertOpportunity_(candidate, ctx);
          if (result === 'created') created++; else updated++;
        });
        parsed.rejected.forEach(function (rej) {
          v6UpsertByKey_('MKT_AURA_INGEST_REJECTIONS', ['rejectionId'], {
            rejectionId: 'REJ-' + v6HashKey_(messageId + '|' + table.name + '|' + rej.row),
            gmailMessageId: messageId, sourceFile: sourceFile, sheetName: table.name, row: rej.row,
            reason: rej.reason, processedAt: v6AuraGmailNow_()
          });
        });
      });
      logRow.rowsParsed = rowsParsed; logRow.rowsAccepted = rowsAccepted; logRow.rowsRejected = rowsRejected;
      logRow.opportunitiesCreated = created; logRow.opportunitiesUpdated = updated;
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
  v6AuraGmailApplyLabel_(thread, logRow.status === 'FAILED' || logRow.status === 'UNSUPPORTED_SOURCE_FORMAT' ? 'AURA/ERROR' : 'AURA/PROCESSED');
  return logRow;
}

// --- Main tick -----------------------------------------------------------------
// Runs from the SAME hourly heartbeat as v6AcqAutomationTick_ / v6AuraAutomationTick_
// (see MarketingV6AcquisitionEngine.gs). Idempotent per Gmail messageId: a
// message already present in MKT_AURA_INGEST_LOG is never reprocessed. The
// search is ALWAYS bounded to the last 45 days (not just on the first run) so
// GmailApp.search never has to walk the full mailbox history on every hourly
// tick -- confirmed live: an unbounded search on ticks after the first one
// caused v6AcqAutomationTick_ to take ~30 minutes per run against a mailbox
// with years of unrelated correspondence between the AM lead and this inbox.
// 45 days safely covers Luis's periodic AM report cadence while keeping every
// tick fast; already-seen messages are still skipped by id regardless.
function v6AuraGmailIngestTick_() {
  var allowed = v6AuraGmailAllowedSenders_();
  if (!allowed.length) return { status: 'NO_ALLOWED_SENDERS', messagesFound: 0, messagesProcessed: 0 };
  var props = PropertiesService.getScriptProperties();
  var initializedAt = props.getProperty('AURA_GMAIL_INITIALIZED_AT');
  var mailbox = v6AuraGmailSourceMailbox_();
  var senderClause = '(' + allowed.map(function (a) { return 'from:' + a; }).join(' OR ') + ')';
  var query = 'to:' + mailbox + ' ' + senderClause + ' newer_than:45d';
  var threads = GmailApp.search(query, 0, 50);
  var alreadySeen = {};
  v6AuraGmailRows_('MKT_AURA_INGEST_LOG').forEach(function (r) { alreadySeen[v6AuraGmailText_(r.gmailMessageId)] = true; });
  var processed = [], messagesFound = 0;
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      if (!v6AuraGmailSenderAllowed_(m.getFrom(), allowed)) return;
      messagesFound++;
      if (alreadySeen[m.getId()]) return;
      processed.push(v6AuraGmailProcessMessage_(m, t));
    });
  });
  if (!initializedAt) props.setProperty('AURA_GMAIL_INITIALIZED_AT', v6AuraGmailNow_());
  return {
    status: 'OK', mailbox: mailbox, messagesFound: messagesFound, messagesProcessed: processed.length,
    ok: processed.filter(function (r) { return r.status === 'OK'; }).length,
    partial: processed.filter(function (r) { return r.status === 'PARTIAL'; }).length,
    failed: processed.filter(function (r) { return r.status === 'FAILED' || r.status === 'UNSUPPORTED_SOURCE_FORMAT'; }).length
  };
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
  var log = v6AuraGmailRows_('MKT_AURA_INGEST_LOG');
  if (!log.length) return { status: 'NO_REPORT_RECEIVED', source: 'GMAIL · ' + v6AuraGmailSourceMailbox_() };
  var latest = log.reduce(function (a, b) { return v6AuraGmailText_(b.receivedAt) > v6AuraGmailText_(a.receivedAt) ? b : a; });
  var ageMs = Date.now() - new Date(latest.processedAt || latest.receivedAt).getTime();
  var ageDays = ageMs / 86400000;
  var freshness = ageDays <= 8 ? 'CURRENT' : ageDays <= 21 ? 'AGING' : 'STALE';
  var opportunities = v6AuraGmailRows_('MKT_AURA_GMAIL_OPPORTUNITIES');
  return {
    status: 'OK', source: 'GMAIL · ' + v6AuraGmailSourceMailbox_(),
    lastReportReceivedAt: latest.receivedAt, lastReportProcessedAt: latest.processedAt,
    filesProcessed: latest.sourceFiles, rowsAccepted: Number(latest.rowsAccepted) || 0, rowsRejected: Number(latest.rowsRejected) || 0,
    opportunitiesUpdated: Number(latest.opportunitiesCreated || 0) + Number(latest.opportunitiesUpdated || 0),
    freshness: freshness, ageDays: Math.floor(ageDays), totalGovernedOpportunities: opportunities.length
  };
}
