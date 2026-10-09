/**
 * AURA Agent DataHub Reader: batched Google Sheets API (Values) access for the agent cycle, so the
 * agent no longer depends on SpreadsheetApp opening the (large) Data Hub document.
 *
 * - Reads: 1 metadata call + 1 header batchGet + 1 data batchGet for every agent-required table,
 *   explicit ranges only, heavy columns (MKT_EMAIL_QUEUE.htmlBody) excluded.
 * - Writes (agent tables only): 1 structural batchUpdate when a sheet must be added/grown, then
 *   1 values batchUpdate with valueInputOption RAW. Same upsert-by-key semantics as
 *   v6BatchUpsertByKey_ (update in place or append; never removes or reorders rows).
 * - Retries transient 429/5xx/timeouts with exponential backoff; fails closed (the cycle aborts
 *   before any write when a read is incomplete).
 * - Falls back to the SpreadsheetApp path when the Sheets advanced service is not enabled.
 */
var AURA_HUB_AGENT_TABLES_ = ['AURA_AGENT_RUNS', 'AURA_AGENT_TASKS', 'AURA_AGENT_DECISIONS', 'AURA_AGENT_ACTIONS', 'AURA_AGENT_APPROVALS', 'AURA_AGENT_EVENTS', 'AURA_AGENT_MEMORY', 'AURA_AGENT_METRICS'];
var AURA_HUB_DATA_TABLES_ = ['MKT_EMAIL_QUEUE', 'MKT_EMAIL_EVENTS', 'MKT_RESPONSES', 'MKT_CAMPAIGNS', 'MKT_CONTACTS_SECURE', 'MKT_ACCOUNTS', 'MKT_OPPORTUNITIES'];
var AURA_HUB_EXCLUDE_ = { MKT_EMAIL_QUEUE: ['htmlBody'] };
var AURA_HUB_TRANSIENT_RE_ = /429|500|502|503|504|rate limit|quota|timed out|backend error|internal error|try again|unavailable/i;

function v6AuraHubApiAvailable_() { return typeof Sheets !== 'undefined' && Sheets && Sheets.Spreadsheets && Sheets.Spreadsheets.Values; }
function v6AuraHubCall_(label, fn, stats) {
  var delays = [1000, 2000, 4000], last;
  for (var i = 0; i <= delays.length; i++) {
    var t0 = Date.now();
    try { var r = fn(); if (stats) stats.calls.push({ call: label, ms: Date.now() - t0, ok: true }); return r; }
    catch (err) {
      last = err; if (stats) stats.calls.push({ call: label, ms: Date.now() - t0, ok: false, error: String(err && err.message || err).slice(0, 200) });
      if (i === delays.length || !AURA_HUB_TRANSIENT_RE_.test(String(err && err.message || err))) throw err;
      if (typeof Utilities !== 'undefined' && Utilities.sleep) Utilities.sleep(delays[i]);
    }
  }
  throw last;
}
function v6AuraHubQuote_(name) { return "'" + String(name).replace(/'/g, "''") + "'"; }
function v6AuraHubCol_(n) { var s = ''; n = Number(n); while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
var AURA_HUB_DATE_COL_RE_ = /(At|Date|_at)$|^date$/;
function v6AuraHubCell_(header, v) {
  if (v === undefined || v === null) return '';
  // Date cells arrive as serial numbers (SERIAL_NUMBER); convert only date-named columns.
  if (typeof v === 'number' && AURA_HUB_DATE_COL_RE_.test(String(header)) && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400000));
  return v;
}

// Prefetch: {tables:{NAME:[rowObjects]}, headers:{NAME:[...]}, sheets:{NAME:{sheetId,rowCount,columnCount}}, stats}
function v6AuraHubPrefetch_(tables, options) {
  var opts = options || {}, id = opts.spreadsheetId ? v6AuraAssertNotProductionResource_(opts.spreadsheetId, 'spreadsheetId') : v6AuraResourceId_('DATA_HUB'), stats = opts.stats || { calls: [] }, exclude = opts.exclude || AURA_HUB_EXCLUDE_;
  var meta = v6AuraHubCall_('metadata', function () { return Sheets.Spreadsheets.get(id, { fields: 'sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))' }); }, stats);
  var sheets = {};
  ((meta && meta.sheets) || []).forEach(function (s) { var p = s.properties || {}, g = p.gridProperties || {}; sheets[p.title] = { sheetId: p.sheetId, rowCount: g.rowCount || 0, columnCount: g.columnCount || 0 }; });
  var present = tables.filter(function (t) { return sheets[t]; });
  var out = { tables: {}, headers: {}, sheets: sheets, stats: stats, spreadsheetId: id };
  tables.forEach(function (t) { if (!sheets[t]) { out.tables[t] = []; out.headers[t] = []; } });
  if (!present.length) return out;
  var hdr = v6AuraHubCall_('headers.batchGet', function () { return Sheets.Spreadsheets.Values.batchGet(id, { ranges: present.map(function (t) { return v6AuraHubQuote_(t) + '!1:1'; }), valueRenderOption: 'UNFORMATTED_VALUE' }); }, stats);
  var ranges = [], plan = [];
  present.forEach(function (t, i) {
    var h = ((((hdr.valueRanges || [])[i] || {}).values || [])[0] || []).map(function (x) { return String(x); });
    out.headers[t] = h;
    if (!h.length) { out.tables[t] = []; return; }
    var ex = exclude[t] || [], groups = [], cur = null;
    h.forEach(function (k, c) { if (ex.indexOf(k) >= 0) { cur = null; return; } if (cur && cur.end === c - 1) cur.end = c; else { cur = { start: c, end: c }; groups.push(cur); } });
    groups.forEach(function (g) { plan.push({ table: t, start: g.start, end: g.end }); ranges.push(v6AuraHubQuote_(t) + '!' + v6AuraHubCol_(g.start + 1) + '2:' + v6AuraHubCol_(g.end + 1)); });
  });
  var data = ranges.length ? v6AuraHubCall_('data.batchGet', function () { return Sheets.Spreadsheets.Values.batchGet(id, { ranges: ranges, valueRenderOption: 'UNFORMATTED_VALUE', dateTimeRenderOption: 'SERIAL_NUMBER' }); }, stats) : { valueRanges: [] };
  var rowsByTable = {};
  plan.forEach(function (p, i) {
    var vals = (((data.valueRanges || [])[i]) || {}).values || [], h = out.headers[p.table], rows = rowsByTable[p.table] || (rowsByTable[p.table] = []);
    vals.forEach(function (v, r) { var o = rows[r] || (rows[r] = {}); for (var c = p.start; c <= p.end; c++) o[h[c]] = v6AuraHubCell_(h[c], v[c - p.start]); });
  });
  out.rowNumbers = {};
  present.forEach(function (t) {
    var h = out.headers[t], rows = [], nums = [];
    (rowsByTable[t] || []).forEach(function (o, i) { o = o || {}; h.forEach(function (k) { if (!(k in o) && (AURA_HUB_EXCLUDE_[t] || []).indexOf(k) < 0) o[k] = ''; }); if (h.some(function (k) { return o[k] !== '' && o[k] != null; })) { rows.push(o); nums.push(i + 2); } });
    out.tables[t] = rows; out.rowNumbers[t] = nums;
  });
  return out;
}

// Upsert agent records with one structural call (if needed) + one values call. Agent tables only.
function v6AuraHubWriteAgentTables_(hub, changed, keys, schemas) {
  var id = hub.spreadsheetId, stats = hub.stats, structural = [], data = [];
  Object.keys(changed).forEach(function (t) {
    if (AURA_HUB_AGENT_TABLES_.indexOf(t) < 0) throw new Error('HUB_WRITE_NOT_ALLOWED ' + t); // never customer tables
    var recs = changed[t]; if (!recs || !recs.length) return;
    var headers = (hub.headers[t] || []).slice();
    (schemas[t] || []).forEach(function (h) { if (headers.indexOf(h) < 0) headers.push(h); });
    var key = keys[t], rows = (hub.tables[t] || []).map(function (o) { return o; }), index = {};
    rows.forEach(function (o, i) { index[String(o[key])] = i; });
    recs.forEach(function (r) { var k = String(r[key]); if (Object.prototype.hasOwnProperty.call(index, k)) rows[index[k]] = Object.assign({}, rows[index[k]], r); else { index[k] = rows.length; rows.push(r); } });
    var values = [headers].concat(rows.map(function (o) { return headers.map(function (h) { var v = o[h]; if (v instanceof Date) return v.toISOString(); return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : v); }); }));
    var sh = hub.sheets[t], needRows = values.length + 1, needCols = headers.length;
    if (!sh) structural.push({ addSheet: { properties: { title: t, gridProperties: { rowCount: Math.max(1000, needRows), columnCount: Math.max(26, needCols) } } } });
    else if (sh.rowCount < needRows || sh.columnCount < needCols) structural.push({ updateSheetProperties: { properties: { sheetId: sh.sheetId, gridProperties: { rowCount: Math.max(sh.rowCount, needRows + 200), columnCount: Math.max(sh.columnCount, needCols) } }, fields: 'gridProperties(rowCount,columnCount)' } });
    data.push({ range: v6AuraHubQuote_(t) + '!A1:' + v6AuraHubCol_(needCols) + values.length, values: values });
    hub.tables[t] = rows; hub.headers[t] = headers;
  });
  if (structural.length) v6AuraHubCall_('structure.batchUpdate', function () { return Sheets.Spreadsheets.batchUpdate({ requests: structural }, id); }, stats);
  if (data.length) v6AuraHubCall_('values.batchUpdate', function () { return Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, id); }, stats);
  return { tables: data.length, structural: structural.length };
}

// Contact-language backfill: ONLY the four language columns of MKT_CONTACTS_SECURE, ONLY rows
// whose preferredLanguage is empty, ONLY HIGH-confidence auditable evidence (caller-filtered).
var AURA_HUB_LANG_COLUMNS_ = ['preferredLanguage', 'languageSource', 'languageConfidence', 'languageResolvedAt'];
function v6AuraHubBackfillContactLanguage_(hub, updates) {
  var t = 'MKT_CONTACTS_SECURE', rows = hub.tables[t] || [], nums = (hub.rowNumbers || {})[t] || [], headers = (hub.headers[t] || []).slice(), sh = hub.sheets[t];
  if (!updates.length || !sh || !headers.length) return { written: 0 };
  var structural = [], data = [];
  AURA_HUB_LANG_COLUMNS_.forEach(function (c) { if (headers.indexOf(c) < 0) headers.push(c); });
  if (headers.length > (hub.headers[t] || []).length) {
    if (sh.columnCount < headers.length) structural.push({ updateSheetProperties: { properties: { sheetId: sh.sheetId, gridProperties: { columnCount: headers.length } }, fields: 'gridProperties.columnCount' } });
    data.push({ range: v6AuraHubQuote_(t) + '!A1:' + v6AuraHubCol_(headers.length) + '1', values: [headers] });
  }
  var byId = {}; rows.forEach(function (r, i) { if (r.contactId) byId[String(r.contactId)] = i; });
  var written = 0;
  updates.slice(0, 500).forEach(function (u) {
    var i = byId[String(u.contactId)]; if (i == null || String(rows[i].preferredLanguage || '').trim()) return;
    AURA_HUB_LANG_COLUMNS_.forEach(function (c) { data.push({ range: v6AuraHubQuote_(t) + '!' + v6AuraHubCol_(headers.indexOf(c) + 1) + nums[i], values: [[u[c]]] }); });
    written++;
  });
  if (!written) return { written: 0 };
  if (structural.length) v6AuraHubCall_('contacts.structure', function () { return Sheets.Spreadsheets.batchUpdate({ requests: structural }, hub.spreadsheetId); }, hub.stats);
  v6AuraHubCall_('contacts.languageBackfill', function () { return Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: data }, hub.spreadsheetId); }, hub.stats);
  return { written: written };
}
// Production-safe diagnostic: timings per stage, no customer values logged (names/counts only).
function v6AuraHubDiagnose_() {
  var out = { spreadsheetId: v6AuraResourceId_('DATA_HUB'), stages: [] }, ss = null;
  function stage(name, sheet, fn) {
    // After the first SpreadsheetApp failure the remaining SpreadsheetApp stages are skipped so the
    // diagnostic stays bounded (each failure can take tens of seconds).
    if (out.spreadsheetAppFailed && /^[B-G]./.test(name)) { out.stages.push({ stage: name, sheet: sheet || '', skipped: true }); return null; }
    var t0 = Date.now();
    try { var r = fn(); out.stages.push({ stage: name, sheet: sheet || '', ms: Date.now() - t0, ok: true, info: r === undefined ? '' : r }); return r; }
    catch (err) { if (/^[B-G]./.test(name)) out.spreadsheetAppFailed = name + (sheet ? ' ' + sheet : ''); out.stages.push({ stage: name, sheet: sheet || '', ms: Date.now() - t0, ok: false, error: String(err && err.message || err).slice(0, 300) }); return null; }
  }
  var need = AURA_HUB_AGENT_TABLES_.concat(AURA_HUB_DATA_TABLES_);
  stage('A.resolveId', '', function () { return out.spreadsheetId; });
  ss = stage('B.openById', '', function () { return SpreadsheetApp.openById(out.spreadsheetId); });
  if (ss) {
    var all = stage('C.getSheets', '', function () { return ss.getSheets().map(function (s) { return s.getName(); }); });
    if (all) out.sheetCount = all.length;
    need.forEach(function (n) {
      var sh = stage('D.getSheetByName', n, function () { return ss.getSheetByName(n); });
      if (!sh) return;
      var dims = stage('E.lastRowCol', n, function () { return { rows: sh.getLastRow(), cols: sh.getLastColumn(), maxRows: sh.getMaxRows(), maxCols: sh.getMaxColumns() }; });
      stage('F.oneCell', n, function () { sh.getRange(1, 1).getValue(); return 'ok'; });
      if (dims && dims.rows > 1 && n !== 'MKT_EMAIL_QUEUE') stage('G.rangeRead', n, function () { return sh.getRange(1, 1, Math.min(dims.rows, 200), dims.cols).getValues().length + ' rows'; });
    });
  }
  if (v6AuraHubApiAvailable_()) {
    var stats = { calls: [] }, t0 = Date.now();
    stage('H.sheetsApiBatchRead', 'ALL_AGENT_TABLES', function () { var hub = v6AuraHubPrefetch_(need, { stats: stats }); var c = {}; need.forEach(function (n) { c[n] = (hub.tables[n] || []).length; }); return c; });
    out.apiCalls = stats.calls; out.apiMs = Date.now() - t0;
  } else out.stages.push({ stage: 'H.sheetsApiBatchRead', ok: false, error: 'SHEETS_ADVANCED_SERVICE_NOT_ENABLED' });
  return out;
}
