function runV6RefreshOpportunities() {
  return v6RefreshOpportunitiesFromReports_();
}

function installV6OpportunityRefreshTrigger() {
  return v6InstallOpportunityRefreshTrigger_();
}
function runV6FullOpportunityEngine() {
  return v6RunOpportunityEngine_();
}
function runV6AuditContactRecipientSchema() {
  var result = v6AuditContactRecipientSchema_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
function runV6EnsureContactRecipientSchema() {
  var result = v6EnsureContactRecipientSchema_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function runV6AcqInstallAutomationTrigger() {
  return v6AcqInstallAutomationTrigger_();
}
function runV6AcqAutomationTick() {
  var result = v6AcqAutomationTick_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
function runV6AuraExecutionReport() {
  var result = v6AuraExecutionReport_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
function runV6AuraGmailRecon() {
  var out = {};
  try { out.activeUser = Session.getActiveUser().getEmail(); } catch (e) { out.activeUserErr = String(e); }
  try { out.effectiveUser = Session.getEffectiveUser().getEmail(); } catch (e) { out.effectiveUserErr = String(e); }

  try {
    var threads = GmailApp.search('to:' + v6AuraGmailSourceMailbox_(), 0, 30);
    out.threadCount = threads.length;
    var senders = {};
    threads.forEach(function (t) {
      var msgs = t.getMessages();
      msgs.forEach(function (m) {
        var from = m.getFrom();
        senders[from] = (senders[from] || 0) + 1;
      });
    });
    out.senders = senders;
  } catch (e) {
    out.searchErr = String(e && e.message || e);
  }
  console.log(JSON.stringify(out, null, 2));
  return out;
}
function runV6AuraLuisRecon() {
  var out = { messages: [] };
  var amSender = v6LiveCoreAmReportSender_();
  if (!amSender) return { status: 'MISSING_CONFIG', property: 'AURA_AM_REPORT_SENDER' };
  var threads = GmailApp.search('from:' + amSender + ' to:' + v6AuraGmailSourceMailbox_(), 0, 10);
  threads.forEach(function (t) {
    t.getMessages().forEach(function (m) {
      var atts = m.getAttachments().map(function (a) { return { name: a.getName(), type: a.getContentType(), size: a.getSize() }; });
      out.messages.push({
        subject: m.getSubject(),
        date: m.getDate().toISOString(),
        to: m.getTo(),
        attachments: atts,
        bodySnippet: (m.getPlainBody() || '').slice(0, 6000)
      });
    });
  });
  out.count = out.messages.length;
  console.log(JSON.stringify(out, null, 2));
  return out;
}
function runV6AuraXlsxRecon() {
  var out = {};
  var amSender = v6LiveCoreAmReportSender_();
  if (!amSender) return { status: 'MISSING_CONFIG', property: 'AURA_AM_REPORT_SENDER' };
  var threads = GmailApp.search('from:' + amSender + ' to:' + v6AuraGmailSourceMailbox_() + ' has:attachment', 0, 5);
  var msg = threads.length ? threads[0].getMessages().slice(-1)[0] : null;
  if (!msg) { return { status: 'NO_MESSAGE' }; }
  var atts = msg.getAttachments();
  var xlsx = atts.filter(function (a) { return a.getName().toLowerCase().indexOf('.xlsx') >= 0; })[0];
  if (!xlsx) { return { status: 'NO_XLSX', names: atts.map(function (a) { return a.getName(); }) }; }
  var file = Drive.Files.create({ name: 'AURA_TEMP_' + Date.now(), mimeType: 'application/vnd.google-apps.spreadsheet' }, xlsx.copyBlob());
  var ss = SpreadsheetApp.openById(file.id);
  var sheets = ss.getSheets();
  out.sheetNames = sheets.map(function (s) { return s.getName(); });
  out.sheets = sheets.map(function (s) {
    var rows = s.getDataRange().getValues().slice(0, 5);
    var trimmed = rows.map(function (r) {
      var out2 = [];
      for (var i = 0; i < r.length; i++) { if (String(r[i] || '').trim() !== '') out2.push(String(r[i]).slice(0, 60)); }
      return out2;
    });
    return { name: s.getName(), rowCount: s.getLastRow(), colCount: s.getLastColumn(), firstRows: trimmed };
  });
  Drive.Files.remove(file.id);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

// --- TEMPORARY: AURA Gmail ingestion commissioning wrapper ---------------
// Read-only with respect to Luis's original email (only Gmail LABELS are
// applied, per spec; the message body/attachment is never modified and no
// customer-facing email is ever sent). Runs the real v6AuraGmailIngestTick_
// once against real historical mail so results can be verified before
// relying on the hourly heartbeat. Safe to delete after commissioning.
function runV6AuraGmailCommissioning() {
  var result = v6AuraGmailIngestTick_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
function runV6AuraGmailFreshnessCheck() {
  var result = v6AuraGmailFreshnessStatus_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}


function v6AuthSelfTest_() {
  var props = PropertiesService.getScriptProperties();
  var stored = props.getProperty('DGL_MKT_V55_TOKEN');
  var trimmed = stored ? stored.trim() : stored;
  var acceptsRaw = false, acceptsTrimmed = false, rawError = '', trimmedError = '';
  if (stored) {
    try { mktV55AssertToken_(stored); acceptsRaw = true; } catch (e) { rawError = String((e && e.message) || e); }
    try { mktV55AssertToken_(trimmed); acceptsTrimmed = true; } catch (e) { trimmedError = String((e && e.message) || e); }
  }
  return {
    propertyExists: !!stored,
    propertyName: 'DGL_MKT_V55_TOKEN',
    tokenLength: stored ? stored.length : 0,
    hasLeadingOrTrailingWhitespace: stored ? (stored !== trimmed) : false,
    validatorAcceptsStoredToken: acceptsRaw,
    validatorAcceptsTrimmedToken: acceptsTrimmed,
    rawErrorMessage: rawError,
    trimmedErrorMessage: trimmedError
  };
}

function runV6AuthSelfTest() {
  var result = v6AuthSelfTest_();
  console.log(JSON.stringify(result, null, 2));
  return result;
}
