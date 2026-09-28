// Live-core configuration lookups (reconciled from the live Apps Script project).
// This repository is PUBLIC: every value that used to be hardcoded in the live-only files
// (the V2 core spreadsheet id, AM report sender mailbox, customer-specific diagnostic
// identifiers) now lives in Script Properties and is read here. Every lookup fails closed:
// a missing property yields '' / [] / false, never a match-everything default.
//
// Script Properties that must be set in the live project before a clasp push of this code:
//   DGL_SPREADSHEET_ID                  V2 core spreadsheet (DGL_CONFIG.SPREADSHEET_ID)
//   AURA_AM_REPORT_SENDER               AM report sender mailbox for the manual Gmail recon runners
//                                       (falls back to the first AURA_GMAIL_ALLOWED_SENDERS entry)
// Optional, only needed to re-run the one-off Campana A go-live diagnostics in DGL_Core:
//   AURA_DIAG_SUSPECT_EMAIL_FRAGMENT    email fragment of the recipient held for manual verification
//   AURA_DIAG_SUSPECT_JOB_ID            that recipient's MKT_EMAIL_QUEUE jobId
//   AURA_DIAG_STRAY_JOB_IDS             JSON array of stray off-campaign jobIds to inspect

function v6LiveCoreScriptProperty_(key) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value == null ? '' : String(value).trim();
}

function v6LiveCoreJsonListProperty_(key) {
  var raw = v6LiveCoreScriptProperty_(key);
  if (!raw) return [];
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(function (v) { return String(v); }) : [];
  } catch (e) {
    return [];
  }
}

function v6LiveCoreDiagSuspectEmailMatch_(email) {
  var fragment = v6LiveCoreScriptProperty_('AURA_DIAG_SUSPECT_EMAIL_FRAGMENT').toLowerCase();
  if (!fragment) return false;
  return String(email == null ? '' : email).trim().toLowerCase().indexOf(fragment) >= 0;
}

function v6LiveCoreAmReportSender_() {
  var configured = v6LiveCoreScriptProperty_('AURA_AM_REPORT_SENDER');
  if (configured) return configured;
  var allowed = typeof v6AuraGmailAllowedSenders_ === 'function' ? v6AuraGmailAllowedSenders_() : [];
  return allowed.length ? allowed[0] : '';
}
