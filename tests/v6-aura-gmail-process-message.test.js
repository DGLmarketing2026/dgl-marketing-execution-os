const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'backend/apps-script-v6/MarketingV6AuraGmailIngest.gs'), 'utf8');

// Regression coverage for the 2026-09-16 performance-fix pass: v6AuraGmailProcessMessage_ used to
// upsert every accepted row individually (v6AuraGmailUpsertOpportunity_ -- two full-table reads +
// one write PER ROW against the shared, multi-source MKT_AURA_GMAIL_OPPORTUNITIES table). A single
// real AM report email can carry hundreds of rows across the whole account base, so this is now
// batched (v6AuraGmailBuildOpportunityRow_ computed in memory + one v6BatchUpsertByKey_ call per
// message) -- these tests prove the batching is real (call counts) and behavior-preserving
// (created/updated counts, idempotent re-processing, rejection rows still recorded).
function makeContext(opts) {
  opts = opts || {};
  var tables = opts.tables || {};
  var props = opts.props || { AURA_GMAIL_ALLOWED_SENDERS: 'luis@dglpartner.example' };
  var labelsApplied = [];
  var callCounts = { v6Rows_: {}, v6UpsertByKey_: {}, v6BatchUpsertByKey_: {} };
  function bump(bucket, name) { bucket[name] = (bucket[name] || 0) + 1; }
  var ctx = {
    String: String, Number: Number, Object: Object, Array: Array, Error: Error, Date: Date, JSON: JSON, RegExp: RegExp,
    console: { log: function () {} },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; }, setProperty: function (k, v) { props[k] = v; return this; } }; } },
    Utilities: { parseCsv: function (text) { return text.split('\n').filter(Boolean).map(function (line) { return line.split(','); }); } },
    GmailApp: {
      getUserLabelByName: function () { return null; },
      createLabel: function (name) { return { getName: function () { return name; } }; }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'MarketingV6AuraGmailIngest.gs' });
  ctx.v6Rows_ = function (name) { bump(callCounts.v6Rows_, name); return (tables[name] || []).map(function (r) { return Object.assign({}, r); }); };
  ctx.v6UpsertByKey_ = function (name, keys, record) {
    bump(callCounts.v6UpsertByKey_, name);
    var rows = tables[name] || (tables[name] = []);
    var at = rows.findIndex(function (row) { return keys.every(function (k) { return String(row[k] || '') === String(record[k] || ''); }); });
    if (at < 0) rows.push(Object.assign({}, record)); else rows[at] = Object.assign({}, record);
    return record;
  };
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
  ctx.v6AcqEnsureSheet_ = function () { return null; };
  ctx.v6NormAccount_ = function (v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, ' '); };
  ctx.v6HashKey_ = function (text) { var s = String(text || ''), h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'H' + Math.abs(h).toString(16).toUpperCase(); };
  // v6AuraGmailXlsxTables_ normally converts a real .xlsx attachment via the Drive Advanced
  // Service (SpreadsheetApp.openById of a throwaway converted file) -- out of scope here, since
  // this file tests v6AuraGmailProcessMessage_'s batching behavior, not the XLSX conversion
  // itself. Stubbed to return each fake message's real per-tab name/values directly.
  ctx.v6AuraGmailXlsxTables_ = function (blob) { return blob.__tables; };
  ctx.__tables = tables; ctx.__callCounts = callCounts; ctx.__labelsApplied = labelsApplied;
  return ctx;
}

function xlsxBlob(tables) {
  return { __tables: tables };
}
function fakeMessage(id, tables, dateIso) {
  var date = new Date(dateIso || '2026-09-01T00:00:00Z');
  return {
    getId: function () { return id; },
    getDate: function () { return date; },
    getSubject: function () { return 'AM Report'; },
    getFrom: function () { return 'Luis <luis@dglpartner.example>'; },
    getPlainBody: function () { return ''; },
    getAttachments: function () { return [{ getName: function () { return 'report.xlsx'; }, copyBlob: function () { return xlsxBlob(tables); } }]; }
  };
}
function fakeThread(id, messages) {
  var labels = [];
  return { getId: function () { return id; }, getMessages: function () { return messages; }, addLabel: function (l) { labels.push(l); }, __labels: labels };
}

// 1. A message with many accepted rows across one recognized tab writes
// MKT_AURA_GMAIL_OPPORTUNITIES via exactly ONE batch call, never one v6UpsertByKey_ call per row.
(function batchesOpportunityWritesPerMessageTest() {
  var N = 40;
  var rows = [['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad']];
  for (var i = 0; i < N; i++) rows.push(['Account ' + i, 'Owner ' + i, 'HA priority', 'High']);
  var ctx = makeContext({});
  var msg = fakeMessage('MSG-1', [{ name: 'Retencion prioritaria', values: rows }]);
  var thread = fakeThread('THREAD-1', [msg]);
  var logRow = ctx.v6AuraGmailProcessMessage_(msg, thread);
  assert.equal(logRow.status, 'OK');
  assert.equal(logRow.rowsAccepted, N);
  assert.equal(logRow.opportunitiesCreated, N);
  assert.equal(ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES.length, N);
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_AURA_GMAIL_OPPORTUNITIES, 1, 'every accepted row in one message must be written via exactly one batch call');
  assert(!ctx.__callCounts.v6UpsertByKey_.MKT_AURA_GMAIL_OPPORTUNITIES, 'MKT_AURA_GMAIL_OPPORTUNITIES must never be written via a per-row v6UpsertByKey_ call from message processing');
  console.log('gmail-process-message test 1 (a message with many accepted rows writes MKT_AURA_GMAIL_OPPORTUNITIES via one batch call, never one per row): PASS');
})();

// 2. Reprocessing the SAME message content later (e.g. a corrected report re-sent) updates the
// existing opportunity rows in place rather than duplicating them, still via one batch call.
(function reprocessingUpdatesInPlaceTest() {
  var rows = [['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad'], ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High']];
  var tables = [{ name: 'Retencion prioritaria', values: rows }];
  var ctx = makeContext({});
  var msg1 = fakeMessage('MSG-1', tables);
  ctx.v6AuraGmailProcessMessage_(msg1, fakeThread('T1', [msg1]));
  var msg2 = fakeMessage('MSG-2', tables);
  var logRow2 = ctx.v6AuraGmailProcessMessage_(msg2, fakeThread('T2', [msg2]));
  assert.equal(logRow2.opportunitiesCreated, 0, 'the same account seen in a second message must update, not create a duplicate');
  assert.equal(logRow2.opportunitiesUpdated, 1);
  assert.equal(ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES.length, 1, 'no duplicate opportunity row must ever be created for the same account');
  console.log('gmail-process-message test 2 (reprocessing the same account updates the existing row in place, never duplicates): PASS');
})();

// 3. Rejected rows (missing a required field) are still recorded, via one batch call, without
// blocking the accepted rows in the same message.
(function rejectedRowsBatchedTest() {
  var rows = [
    ['Cuenta', 'Account Owner', 'Motivo campana', 'Prioridad'],
    ['Progeral Corp', 'Luis Simoes', 'HA priority', 'High'],
    ['', 'No Account Name', 'HA priority', 'High']
  ];
  var ctx = makeContext({});
  var msg = fakeMessage('MSG-1', [{ name: 'Retencion prioritaria', values: rows }]);
  var logRow = ctx.v6AuraGmailProcessMessage_(msg, fakeThread('T1', [msg]));
  assert.equal(logRow.rowsAccepted, 1);
  assert.equal(logRow.rowsRejected, 1);
  assert.equal(ctx.__tables.MKT_AURA_INGEST_REJECTIONS.length, 1);
  assert.equal(ctx.__callCounts.v6BatchUpsertByKey_.MKT_AURA_INGEST_REJECTIONS, 1);
  assert(!ctx.__callCounts.v6UpsertByKey_ || !ctx.__callCounts.v6UpsertByKey_.MKT_AURA_INGEST_REJECTIONS);
  console.log('gmail-process-message test 3 (rejected rows are recorded via one batch call and never block the accepted rows in the same message): PASS');
})();

console.log('V6 AURA Gmail message processing (batched opportunity/rejection writes): ALL PASS');
