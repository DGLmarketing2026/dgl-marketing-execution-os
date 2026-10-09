// AURA report intake from the Marketing inbox (2026-10-09).
// info@dglus.com -> report detection (not tied to one sender) -> XLSX -> governed opportunities
// -> AURA agent analysis task -> campaign plans that wait for one human approval.
// Synthetic data only (example.test / dglus.com addresses of fictitious senders, no real customers).
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const read = n => fs.readFileSync(path.join(root, 'backend/apps-script-v6', n), 'utf8');
const ingestSource = read('MarketingV6AuraGmailIngest.gs');

const HEADERS = ['Cuenta', 'Account Owner', 'Agente responsable (Sales Rep Actual)', 'Pais Billing', 'Pais Shipping', 'Contacto', 'Email', 'Posicion (Company position)', 'Titulo', 'Key Contact', 'Prioridad', 'Motivo campana'];
const sheet = (name, rows) => ({ name, values: [['DGL Freight Broker'], ['resumen'], [], HEADERS].concat(rows) });
const ROW_A = ['Acme Freight QA', 'AM Uno', 'AM Uno', 'USA', 'USA', 'Contacto QA', 'qa1@example.test', 'Ops', 'Manager', 'Si', 'Alta', 'Cuenta en riesgo'];
const ROW_B = ['Beta Cargo QA', 'AM Dos', 'AM Dos', 'Peru', 'Peru', 'Contacto QA', 'qa2@example.test', 'Ops', 'Manager', 'Si', 'Media', 'Area FTL en baja'];
const AUTH_OK = 'mx.google.com; dkim=pass header.i=@dglus.com header.s=google; spf=pass smtp.mailfrom=marketing@dglus.com; dmarc=pass (p=NONE) header.from=dglus.com';

function attachment(name, sheets, bytes) {
  const data = Buffer.from(bytes || JSON.stringify(sheets));
  return { getName: () => name, copyBlob() { return this; }, getBytes: () => Array.from(data), getDataAsString: () => '', __sheets: sheets };
}
function message(id, from, opts) {
  opts = opts || {};
  return { getId: () => id, getFrom: () => from, getSubject: () => opts.subject || 'Sugerencias de Marketing', getDate: () => new Date(opts.date || '2026-10-08T13:00:00.000Z'), getPlainBody: () => '', getAttachments: () => opts.atts || [], getHeader: h => h === 'Authentication-Results' ? (opts.auth || '') : '' };
}
function thread(id, msgs) { const labels = []; return { getId: () => id, getMessages: () => msgs, addLabel: l => labels.push(l.getName()), __labels: labels }; }

function context(props, tables, threads, opts) {
  opts = opts || {};
  const calls = { search: [], rowsRead: {}, driveCreate: 0, refresh: 0 };
  const labelStore = {};
  const ctx = {
    Date, String, Array, Object, Number, Math, JSON, RegExp, Error, console: { log() {} },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null, setProperty: (k, v) => { props[k] = String(v); } }) },
    Utilities: { DigestAlgorithm: { SHA_256: 'SHA_256' }, computeDigest: (algo, bytes) => Array.from(crypto.createHash('sha256').update(Buffer.from(bytes)).digest()).map(b => b > 127 ? b - 256 : b), parseCsv: t => t.split('\n').map(l => l.split(',')) },
    GmailApp: { search: q => { calls.search.push(q); return threads; }, getUserLabelByName: n => labelStore[n] || null, createLabel: n => (labelStore[n] = { getName: () => n }) },
    Drive: { Files: { create: (res, blob) => { calls.driveCreate++; ctx.__files['F' + calls.driveCreate] = blob; return { id: 'F' + calls.driveCreate }; }, remove() {} } },
    SpreadsheetApp: { openById: id => ({ getSheets: () => ctx.__files[id].__sheets.map(s => ({ getName: () => s.name, getDataRange: () => ({ getValues: () => s.values }) })) }) },
    __files: {}
  };
  if (opts.effectiveUser !== undefined) ctx.Session = { getEffectiveUser: () => ({ getEmail: () => opts.effectiveUser }) };
  vm.createContext(ctx);
  vm.runInContext(ingestSource, ctx, { filename: 'MarketingV6AuraGmailIngest.gs' });
  ctx.v6HashKey_ = t => { let h = 0; const s = String(t || ''); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'H' + Math.abs(h).toString(16).toUpperCase(); };
  ctx.v6NormAccount_ = v => String(v || '').trim().toLowerCase();
  ctx.v6AcqEnsureSheet_ = () => true;
  ctx.v6Rows_ = name => { calls.rowsRead[name] = (calls.rowsRead[name] || 0) + 1; return (tables[name] || []).map(r => Object.assign({}, r)); };
  const upsert = (name, keys, recs) => { const rows = tables[name] || (tables[name] = []); recs.forEach(rec => { const at = rows.findIndex(r => keys.every(k => String(r[k]) === String(rec[k]))); if (at < 0) rows.push(Object.assign({}, rec)); else rows[at] = Object.assign({}, rec); }); };
  ctx.v6UpsertByKey_ = (n, k, r) => upsert(n, k, [r]);
  ctx.v6BatchUpsertByKey_ = (n, k, r) => upsert(n, k, r);
  ctx.v6RefreshOpportunitiesFromReports_ = () => { calls.refresh++; return { status: 'REPORT_SOURCE_SYNCED', syncedAt: 'now' }; };
  ctx.__calls = calls;
  return ctx;
}
let passed = 0; const ok = m => { passed++; console.log('PASS ' + m); };

// 1. The inbox is always info@dglus.com, never a sender's own mailbox.
(function () {
  const props = { AURA_GMAIL_ALLOWED_SENDERS: 'am-lead@dglus.com', AURA_GMAIL_SOURCE_MAILBOX: 'am-lead@dglus.com' };
  const ctx = context(props, {}, []);
  const r = ctx.v6AuraGmailIngestTick_();
  assert.equal(r.inbox, 'info@dglus.com');
  assert(ctx.__calls.search.length === 2 && ctx.__calls.search.every(q => q.includes('to:info@dglus.com') && q.includes('deliveredto:info@dglus.com') && !q.includes('to:am-lead')), 'queries target info@dglus.com');
  assert(ctx.__calls.search.some(q => /from:dglus\.com\) has:attachment \(filename:xlsx OR filename:csv\)/.test(q)), 'content-based detection does not depend on one sender');
  ok('inbox is info@dglus.com (a sender mailbox in AURA_GMAIL_SOURCE_MAILBOX is not used as the inbox)');
})();

// 2. Wrong Google account -> explicit missing connection, Gmail never searched.
(function () {
  const ctx = context({}, {}, [], { effectiveUser: 'someone@dglus.com' });
  const r = ctx.v6AuraGmailIngestTick_();
  assert.equal(r.status, 'INBOX_NOT_CONNECTED'); assert.equal(ctx.__calls.search.length, 0);
  assert.equal(context({}, {}, [], { effectiveUser: 'info@dglus.com' }).v6AuraGmailIngestTick_().status, 'OK');
  ok('AURA must run as info@dglus.com; otherwise it reports INBOX_NOT_CONNECTED and reads nothing');
})();

// 3. Any Gmail-authenticated internal sender is accepted (no dependency on one sender).
(function () {
  const tables = {}, t = thread('T1', [message('M1', 'Marketing <marketing@dglus.com>', { auth: AUTH_OK, atts: [attachment('Marketing_DGL_08-10-2026.xlsx', [sheet('Retencion prioritaria', [ROW_A]), sheet('Expansion de servicio', [ROW_B])])] })]);
  const ctx = context({}, tables, [t]);
  const r = ctx.v6AuraGmailIngestTick_();
  assert.equal(r.ok, 1); assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length, 2);
  assert.equal(tables.MKT_AURA_INGEST_LOG[0].trustRule, 'VERIFIED_INTERNAL_SENDER');
  assert(/^[0-9a-f]{64}$/.test(tables.MKT_AURA_INGEST_LOG[0].sourceHash));
  assert.deepEqual(t.__labels, ['AURA/AM-REPORTS', 'AURA/PROCESSED']);
  ok('a report from any authenticated @dglus.com sender is detected, read and normalized');
})();

// 4. Spoofed, unauthenticated or look-alike senders are never opened.
(function () {
  const att = () => [attachment('Marketing.xlsx', [sheet('Retencion prioritaria', [ROW_A])])];
  const msgs = [
    message('S1', 'x@dglus.com', { atts: att() }),
    message('S2', 'x@dglus.com', { atts: att(), auth: 'mx.google.com; dkim=fail header.i=@dglus.com; spf=softfail smtp.mailfrom=x@dglus.com; dmarc=fail header.from=dglus.com' }),
    message('S3', 'x@dglus.com.evil.test', { atts: att(), auth: 'mx.google.com; dkim=pass header.i=@dglus.com.evil.test; dmarc=pass header.from=dglus.com.evil.test' }),
    message('S4', 'outsider@example.test', { atts: att(), auth: 'mx.google.com; dmarc=pass header.from=example.test' })
  ];
  const tables = {}, ctx = context({}, tables, [thread('T2', msgs)]);
  const r = ctx.v6AuraGmailIngestTick_();
  assert.equal(r.messagesProcessed, 0); assert.equal(r.untrustedSkipped, 4); assert.equal(ctx.__calls.driveCreate, 0, 'no attachment opened');
  assert.equal((tables.MKT_AURA_INGEST_LOG || []).length, 0);
  ok('unauthenticated, failed-DMARC, look-alike and external senders are never opened');
})();

// 5. Duplicates: the same file in another email, and the same email on the next tick.
(function () {
  const props = {}, tables = {}, bytes = 'same-report-bytes';
  const mk = id => message(id, 'marketing@dglus.com', { auth: AUTH_OK, atts: [attachment('Marketing.xlsx', [sheet('Retencion prioritaria', [ROW_A])], bytes)] });
  context(props, tables, [thread('T3', [mk('D1')])]).v6AuraGmailIngestTick_();
  const ctx2 = context(props, tables, [thread('T3', [mk('D1')]), thread('T4', [mk('D2')])]);
  const r = ctx2.v6AuraGmailIngestTick_();
  assert.equal(r.duplicates, 1); assert.equal(ctx2.__calls.driveCreate, 0, 'duplicate file not converted again');
  assert.equal(tables.MKT_AURA_INGEST_LOG.find(x => x.gmailMessageId === 'D2').status, 'DUPLICATE_REPORT');
  assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length, 1);
  const ctx3 = context(props, tables, [thread('T3', [mk('D1')]), thread('T4', [mk('D2')])]);
  assert.equal(ctx3.v6AuraGmailIngestTick_().messagesProcessed, 0);
  assert.equal(ctx3.__calls.rowsRead.MKT_AURA_INGEST_LOG || 0, 0, 'an hour without new mail never opens the Data Hub');
  ok('same file re-sent is DUPLICATE_REPORT; seen messages are skipped without reading the Data Hub');
})();

// 6. An internal spreadsheet that is not a Marketing report is logged once, not labeled, not "last report".
(function () {
  const tables = {}, t = thread('T5', [message('N1', 'finance@dglus.com', { auth: AUTH_OK, atts: [attachment('Budget.xlsx', [sheet('Q4 budget', [ROW_A])])] })]);
  const ctx = context({}, tables, [t]);
  const r = ctx.v6AuraGmailIngestTick_();
  assert.equal(r.notReports, 1); assert.equal(tables.MKT_AURA_INGEST_LOG[0].status, 'NOT_A_MARKETING_REPORT'); assert.deepEqual(t.__labels, []);
  assert.equal(ctx.v6AuraGmailFreshnessStatus_().status, 'NO_REPORT_RECEIVED');
  ok('non-report spreadsheets from colleagues are ignored (logged once, no label, not counted as a report)');
})();

// 7. Intake trigger: refreshes opportunities only when a report added rows; never sends.
(function () {
  const props = {}, tables = {};
  const t = thread('T6', [message('I1', 'marketing@dglus.com', { auth: AUTH_OK, atts: [attachment('Marketing.xlsx', [sheet('Recuperacion FTL', [ROW_B])])] })]);
  let ctx = context(props, tables, [t]);
  const out = ctx.auraReportIntakeTick();
  assert.equal(out.ingest.ok, 1); assert.equal(ctx.__calls.refresh, 1); assert.equal(out.refresh.status, 'REPORT_SOURCE_SYNCED');
  ctx = context(props, tables, [t]); ctx.auraReportIntakeTick();
  assert.equal(ctx.__calls.refresh, 0, 'no new report: no refresh');
  assert(JSON.parse(props.AURA_REPORT_INTAKE_LAST).ingest.status === 'OK');
  assert(!/sendEmail|MailApp|createDraft|AURA_SEND_MODE/.test(ingestSource), 'the intake never sends or changes the send mode');
  assert(/function AURA_REPORT_INTAKE_ACTIVATE\(\)[\s\S]{0,400}getHandlerFunction\(\) === 'auraReportIntakeTick'/.test(ingestSource), 'activation keeps exactly one hourly trigger');
  ok('auraReportIntakeTick: report -> opportunities refresh, idempotent, never sends');
})();

// 8. AURA agent: report analysis task (AUTO, counts only) and replanning on a newer report.
(function () {
  const tables = {
    MKT_AURA_INGEST_LOG: [{ ingestId: 'ING-1', gmailMessageId: 'R1', status: 'OK', rowsAccepted: 2, rowsRejected: 1, receivedAt: '2026-10-08T13:00:00.000Z', processedAt: '2026-10-08T13:05:00.000Z' }, { ingestId: 'ING-0', gmailMessageId: 'NR', status: 'NOT_A_MARKETING_REPORT', receivedAt: '2026-10-08T14:00:00.000Z', processedAt: '2026-10-08T14:00:00.000Z' }],
    MKT_AURA_GMAIL_OPPORTUNITIES: [{ accountId: 'A1', accountName: 'Acme Freight QA', amOwner: 'AM Uno', opportunityType: 'Retention', sourceMessageId: 'R1', sourceSheet: 'Retencion prioritaria' }, { accountId: 'A2', accountName: 'Beta Cargo QA', amOwner: 'AM Dos', opportunityType: 'Cross-Sell', sourceMessageId: 'R1', sourceSheet: 'Expansion de servicio' }, { accountId: 'A3', accountName: 'Gamma QA', amOwner: 'AM Uno', opportunityType: 'Activation', sourceMessageId: 'R1', sourceSheet: 'Campana A - HA prioritaria' }],
    MKT_AURA_INGEST_REJECTIONS: [{ gmailMessageId: 'R1' }]
  };
  const ctx = { Date, String, Array, Object, Number, Math, JSON, RegExp, Error, console: { log() {} } };
  vm.createContext(ctx);
  ['MarketingV6AuraGmailIngest.gs', 'MarketingV6AuraAgentRuntime.gs', 'MarketingV6AuraAgentIntelligence.gs'].forEach(n => vm.runInContext(read(n), ctx, { filename: n }));
  ctx.v6Rows_ = name => (tables[name] || []).map(r => Object.assign({}, r));
  const now = '2026-10-09T10:00:00.000Z';
  const det = ctx.v6AuraAgentReportDetections_(now);
  assert.equal(det.length, 1); assert.equal(det[0].taskId, 'AT:REPORT:ING-1'); assert.equal(det[0].kind, 'REPORT');
  assert.equal(ctx.v6AuraAgentTaskPolicy_(det[0].actions.map(a => a.actionType), {}), 'AUTO', 'analysis needs no approval (internal only)');
  const r = ctx.AURA_AGENT_HANDLERS_.ANALYZE_MARKETING_REPORT({ preview: 'R1' });
  const a = JSON.parse(r.detail).analysis;
  assert.equal(r.status, 'DONE'); assert.equal(a.accounts, 3); assert.equal(a.rejectedRows, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(a.campaignScopes)), { RETENTION: 1, CROSS_SELL: 1 }, 'Activation/Campaign A is not planned by the agent');
  assert(!/Acme|Beta|Gamma|example\.test/.test(r.detail), 'counts only, no account names');
  assert.equal(ctx.v6AuraAgentLatestReportId_(now), 'ING-1');
  const runtime = read('MarketingV6AuraAgentRuntime.gs');
  assert(/p\.sourceReportId\) !== v6AuraAgentLatestReportId_\(st\.nowIso\)/.test(runtime), 'a pending plan built from an older report is replanned before approval');
  assert(/sourceReportId: typeof v6AuraAgentLatestReportId_ === 'function'/.test(read('MarketingV6AuraAgentIntelligence.gs')));
  assert(/APPROVAL_REQUIRED/.test(ctx.AURA_AGENT_ACTION_TYPES_.SEND_CUSTOMER_EMAIL.policy) && ctx.AURA_AGENT_INGEST_IN_TICK_ === false, 'sending still needs approval; heavy Gmail work stays out of the agent tick');
  ok('agent: one AUTO analysis task per report (counts only), plans refreshed on a newer report, sends still gated');
})();

console.log(passed + '/' + passed + ' AURA report intake (info@dglus.com) checks passed');
