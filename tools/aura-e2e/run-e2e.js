// DEV-ONLY end-to-end proof for AURA report intake (synthetic data, isolated environment).
//
// What is REAL here: the production Apps Script source files of AURA (ingest, opportunity refresh,
// agent runtime + intelligence, language/creative helpers), and real .xlsx files.
// What is SIMULATED (no Google test project is authorized): the Gmail test mailbox, the Drive
// XLSX->Sheets conversion (openpyxl reads the same file), the Data Hub (in-memory tables) and the
// Apps Script time-trigger scheduler. The scheduler only fires the handlers that AURA itself
// installed with ScriptApp.newTrigger(...) -- nothing calls the pipeline functions directly.
//
// Usage: node tools/aura-e2e/run-e2e.js            -> runs and writes docs/aura-e2e/
//        require('./run-e2e').run()                -> returns the results (used by the test)
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto'), os = require('os');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '../..');
const GS = n => fs.readFileSync(path.join(ROOT, 'backend/apps-script-v6', n), 'utf8');
const FIX = n => path.join(__dirname, 'fixtures', n);
const INBOX = 'info@dglus.com';
const AUTH_PASS = d => 'mx.google.com; dkim=pass header.i=@' + d + '; spf=pass smtp.mailfrom=qa@' + d + '; dmarc=pass (p=NONE) header.from=' + d;

function xlsxValues(file) {
  return JSON.parse(execFileSync('python', [path.join(__dirname, 'xlsx_to_values.py'), file], { encoding: 'utf8' }));
}

function run() {
  const RealDate = Date, clock = { now: RealDate.parse('2026-10-12T08:00:00.000Z') };
  function FakeDate(...a) { return a.length ? new RealDate(...a) : new RealDate(clock.now); }
  FakeDate.prototype = RealDate.prototype; FakeDate.now = () => clock.now; FakeDate.parse = RealDate.parse; FakeDate.UTC = RealDate.UTC;

  const tables = { MKT_EMAIL_QUEUE: [], MKT_OPPORTUNITIES: [], MKT_CONTACTS_SECURE: [], MKT_ACCOUNTS: [] };
  const props = { AURA_SEND_MODE: 'DRY_RUN', AURA_GMAIL_ALLOWED_SENDERS: 'am-lead-qa@dglus.com' };
  const triggers = [], mailbox = [], files = {}, labels = {};
  const audit = { written: {}, external: { gmailSend: 0, gmailDraft: 0, mailApp: 0, urlFetch: 0 }, driveConversions: 0, ingestLogReads: 0, tickLog: [] };
  const note = n => { audit.written[n] = (audit.written[n] || 0) + 1; };
  const copy = r => Object.assign({}, r);
  const upsert = (name, keys, recs) => { note(name); const rows = tables[name] || (tables[name] = []); recs.forEach(rec => { const i = rows.findIndex(r => keys.every(k => String(r[k]) === String(rec[k]))); if (i < 0) rows.push(copy(rec)); else rows[i] = copy(rec); }); };
  const digest = (algo, data) => Array.from(crypto.createHash(algo === 'MD5' ? 'md5' : 'sha256').update(Array.isArray(data) ? Buffer.from(data.map(b => b & 0xff)) : Buffer.from(String(data), 'utf8')).digest()).map(b => b > 127 ? b - 256 : b);

  // --- Simulated Gmail test mailbox (query semantics used by AURA: inbox recipient, from:, has:attachment, filename:, newer_than:) ---
  function deliver(id, from, opts) {
    const atts = (opts.files || []).map(f => { const bytes = fs.readFileSync(f); return { getName: () => path.basename(f), copyBlob() { return this; }, getBytes: () => Array.from(bytes).map(b => b > 127 ? b - 256 : b), getDataAsString: () => '', __file: f }; });
    const date = new RealDate(clock.now), threadLabels = labels[id] = [];
    const msg = { getId: () => id, getFrom: () => from, getSubject: () => opts.subject, getDate: () => date, getPlainBody: () => '', getAttachments: () => atts, getHeader: h => h === 'Authentication-Results' ? (opts.auth || '') : '', __to: opts.to || INBOX, __at: clock.now };
    mailbox.push({ id, thread: { getId: () => 'T-' + id, getMessages: () => [msg], addLabel: l => threadLabels.push(l.getName()) }, msg, atts });
  }
  function search(q) {
    const days = Number((q.match(/newer_than:(\d+)d/) || [])[1] || 3650);
    const froms = ((q.match(/\)\s*\(([^)]*from:[^)]*)\)/) || [])[1] || '').split(' OR ').map(s => s.replace('from:', '').trim()).filter(Boolean);
    const needXlsx = /has:attachment/.test(q);
    return mailbox.filter(m => {
      const from = String(m.msg.getFrom()).toLowerCase(), email = (from.match(/<([^>]+)>/) || [, from])[1];
      if (m.msg.__to !== INBOX) return false;
      if (clock.now - m.msg.__at > days * 86400000) return false;
      if (!froms.some(f => f.includes('@') ? email === f : email.endsWith('@' + f))) return false;
      if (needXlsx && !m.atts.some(a => /\.(xlsx|csv)$/i.test(a.getName()))) return false;
      return true;
    }).map(m => m.thread);
  }

  const ctx = {
    console: { log() {} }, Date: FakeDate, Math, Number, String, Object, Array, JSON, Error, RegExp, isNaN, parseInt, parseFloat,
    Utilities: { DigestAlgorithm: { MD5: 'MD5', SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' }, computeDigest: digest, formatDate: d => new RealDate(d).toISOString().slice(0, 10), parseCsv: t => t.split('\n').map(l => l.split(',')), sleep() {} },
    Session: { getEffectiveUser: () => ({ getEmail: () => INBOX }), getActiveUser: () => ({ getEmail: () => '' }), getScriptTimeZone: () => 'America/Bogota' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      deleteTrigger: t => { const i = triggers.indexOf(t); if (i >= 0) triggers.splice(i, 1); },
      newTrigger: h => ({ timeBased: () => ({ everyHours: n => ({ create: () => { const t = { getHandlerFunction: () => h, everyHours: n, minute: h === 'auraAgentTick' ? 38 : 10 }; triggers.push(t); return t; } }) }) })
    },
    GmailApp: {
      search: q => search(q), getUserLabelByName: n => null, createLabel: n => ({ getName: () => n }),
      sendEmail: () => { audit.external.gmailSend++; }, createDraft: () => { audit.external.gmailDraft++; }
    },
    MailApp: { sendEmail: () => { audit.external.mailApp++; } },
    UrlFetchApp: { fetch: () => { audit.external.urlFetch++; throw new Error('NETWORK_DISABLED_IN_E2E'); } },
    Drive: { Files: { create: (res, blob) => { audit.driveConversions++; const id = 'CONV-' + audit.driveConversions; files[id] = blob.__file; return { id }; }, remove: id => { delete files[id]; } } },
    SpreadsheetApp: { openById: id => { if (!files[id]) throw new Error('E2E: only converted test files can be opened (' + id + ')'); const v = xlsxValues(files[id]); return { getSheets: () => v.map(s => ({ getName: () => s.name, getDataRange: () => ({ getValues: () => s.values }) })) }; } }
  };
  vm.createContext(ctx);
  ['MarketingV6ReportIngestion.gs', 'MarketingV6AuraGmailIngest.gs', 'MarketingV6AuraCampanaA.gs', 'MarketingV6AuraCreativeApproval.gs', 'MarketingV6AuraEmailDispatcher.gs', 'MarketingV6AuraAgentRuntime.gs', 'MarketingV6AuraAgentIntelligence.gs']
    .forEach(n => vm.runInContext(GS(n), ctx, { filename: n }));
  // In-memory Data Hub (same read/upsert semantics as v6Rows_/v6UpsertByKey_/v6BatchUpsertByKey_).
  ctx.v6Rows_ = n => { if (n === 'MKT_AURA_INGEST_LOG' && audit.handler === 'auraReportIntakeTick') audit.ingestLogReads++; return (tables[n] || []).map(copy); };
  ctx.v6AcqEnsureSheet_ = n => { tables[n] = tables[n] || []; return true; };
  ctx.v6UpsertByKey_ = (n, k, r) => upsert(n, k, [r]);
  ctx.v6BatchUpsertByKey_ = (n, k, r) => upsert(n, k, r);
  ctx.v6WriteOpportunities_ = rows => { note('MKT_OPPORTUNITIES'); tables.MKT_OPPORTUNITIES = rows.map(copy); };
  // The NOVA report source is not part of this test environment: only the Gmail source feeds it.
  ['v6BuildQnbOpportunities_', 'v6BuildRetentionOpportunities_', 'v6BuildReactivationOpportunities_', 'v6BuildCrossSellOpportunities_', 'v6BuildNurtureOpportunities_'].forEach(f => { ctx[f] = () => []; });
  ctx.v6FichaIndex_ = () => ({}); ctx.v6CuentasIndex_ = () => ({});
  ctx.v6AuraEmailPerformance_ = () => ({ scopes: {}, tracking: {} });

  // Synthetic CRM contacts for the synthetic accounts (as the contact sync would have stored them).
  const acc = name => 'ACC-' + ctx.v6HashKey_(ctx.v6NormAccount_(name));
  const contact = (id, account, email, extra) => Object.assign({ contactId: id, accountId: acc(account), email, status: 'ACTIVE' }, extra || {});
  tables.MKT_ACCOUNTS = [['QA Transportes Andinos', 'Colombia'], ['QA Logistica Pacifico', 'Peru'], ['QA Cargo Brasil', 'Brazil'], ['QA Freight Texas', 'United States'], ['QA Distribuidora Sur', 'Chile'], ['QA Agro Export', 'Peru']].map(([n, c]) => ({ accountId: acc(n), accountName: n, country: c }));
  tables.MKT_CONTACTS_SECURE = [
    contact('QC1', 'QA Transportes Andinos', 'ana@andinos.example.test'),
    contact('QC2', 'QA Transportes Andinos', 'compras@andinos.example.test', { doNotContact: 'TRUE' }),
    contact('QC3', 'QA Logistica Pacifico', 'luis@pacifico.example.test'),
    contact('QC4', 'QA Logistica Pacifico', 'correo-invalido'),
    contact('QC12', 'QA Logistica Pacifico', 'ana@andinos.example.test'), // same email twice in one family
    contact('QC5', 'QA Cargo Brasil', 'joao@cargobr.example.test'),
    contact('QC6', 'QA Freight Texas', 'mike@freighttx.example.test'),
    contact('QC7', 'QA Freight Texas', 'ana@andinos.example.test'),
    contact('QC8', 'QA Distribuidora Sur', 'pedro@dsur.example.test'),
    contact('QC9', 'QA Distribuidora Sur', 'ops@dsur.example.test', { preferredLanguage: 'EN' }),
    contact('QC10', 'QA Agro Export', 'carla@agro.example.test'),
    contact('QC11', 'QA Freight Texas', 'recent@freighttx.example.test')
  ];
  // One synthetic contact already received a governed email 5 days ago (30-day resend protection).
  tables.MKT_EMAIL_QUEUE = [{ jobId: 'QA-JOB-1', email: 'recent@freighttx.example.test', status: 'SENT', processedAt: new RealDate(clock.now - 5 * 86400000).toISOString(), campaignId: 'QA-OLD' }];
  const queueBefore = JSON.stringify(tables.MKT_EMAIL_QUEUE);
  delete audit.written.MKT_ACCOUNTS; delete audit.written.MKT_CONTACTS_SECURE;

  // --- Apps Script time-trigger scheduler (simulated): fires only the installed handlers. ---
  function advanceTo(iso) {
    const target = RealDate.parse(iso);
    let t = Math.floor(clock.now / 3600000) * 3600000;
    while (t <= target) {
      triggers.slice().sort((a, b) => a.minute - b.minute).forEach(tr => {
        const at = t + tr.minute * 60000;
        if (at <= clock.now || at > target) return;
        clock.now = at;
        const handler = tr.getHandlerFunction(); audit.handler = handler; const r = ctx[handler](); audit.handler = '';
        audit.tickLog.push({ at: new RealDate(at).toISOString(), handler, status: (r && (r.status || (r.ingest && r.ingest.status))) || 'OK', ingest: r && r.ingest ? { processed: r.ingest.messagesProcessed, ok: r.ingest.ok, duplicates: r.ingest.duplicates, notReports: r.ingest.notReports, untrusted: r.ingest.untrustedSkipped } : undefined, refresh: r && r.refresh ? r.refresh.status : undefined, run: r && r.run ? { created: r.run.tasksCreated, advanced: r.run.tasksAdvanced } : undefined });
      });
      t += 3600000;
    }
    clock.now = target;
  }
  const snap = label => ({ label, at: new RealDate(clock.now).toISOString(), log: (tables.MKT_AURA_INGEST_LOG || []).map(r => ({ id: r.gmailMessageId, status: r.status, trust: r.trustRule, accepted: r.rowsAccepted, rejected: r.rowsRejected })), tasks: (tables.AURA_AGENT_TASKS || []).map(t => ({ id: t.taskId, kind: t.kind, scope: t.scope, state: t.state, policy: t.policy, error: t.lastError || t.blockReason || '' })), approvals: (tables.AURA_AGENT_APPROVALS || []).map(a => ({ id: a.approvalId, scope: a.scope, status: a.status })) });

  // 08:00 operator activation (the one-time step), then everything runs from the triggers.
  const activation = ctx.AURA_REPORT_INTAKE_ACTIVATE(); ctx.v6AuraAgentActivate_();
  // 08:20 mail arrives in the test mailbox.
  clock.now = RealDate.parse('2026-10-12T08:20:00.000Z');
  deliver('QA-M1', 'Marketing QA <marketing-qa@dglus.com>', { subject: 'Sugerencias de Marketing - semana 42', auth: AUTH_PASS('dglus.com'), files: [FIX('Marketing_DGL_QA_SINTETICO_v1.xlsx')] });
  deliver('QA-SPOOF', 'Falso <marketing-qa@dglus.com>', { subject: 'Sugerencias de Marketing', auth: 'mx.google.com; dkim=fail header.i=@dglus.com; spf=fail smtp.mailfrom=x@evil.example.test; dmarc=fail header.from=dglus.com', files: [FIX('Marketing_DGL_QA_SINTETICO_v1.xlsx')] });
  deliver('QA-EXT', 'Externo <ventas@example.test>', { subject: 'Reporte', auth: AUTH_PASS('example.test'), files: [FIX('Marketing_DGL_QA_SINTETICO_v1.xlsx')] });
  deliver('QA-NOTREPORT', 'Finanzas QA <finanzas-qa@dglus.com>', { subject: 'Presupuesto Q4', auth: AUTH_PASS('dglus.com'), files: [FIX('Presupuesto_Q4_QA.xlsx')] });
  advanceTo('2026-10-12T09:59:00.000Z');
  const s1 = snap('after first report');
  const plansV1 = (tables.AURA_AGENT_ACTIONS || []).filter(a => a.actionType === 'PREPARE_CAMPAIGN_PLAN').map(a => ({ taskId: a.taskId, status: a.status, plan: JSON.parse(a.result || '{}').plan }));
  // 10:05 the same file is re-sent by the allowlisted AM lead (duplicate).
  clock.now = RealDate.parse('2026-10-12T10:05:00.000Z');
  deliver('QA-M2', 'AM Lead QA <am-lead-qa@dglus.com>', { subject: 'Reenvio: Sugerencias de Marketing', files: [FIX('Marketing_DGL_QA_SINTETICO_v1.xlsx')] });
  advanceTo('2026-10-12T10:59:00.000Z');
  const conversionsAfterDup = audit.driveConversions, s2 = snap('after duplicate');
  // 11:00-11:59 no new mail: the intake must not open the Data Hub.
  const logReadsBeforeIdle = audit.ingestLogReads;
  advanceTo('2026-10-12T11:59:00.000Z');
  const idleLogReads = audit.ingestLogReads - logReadsBeforeIdle, s3 = snap('idle hour');
  // 12:15 an updated report (one new account) arrives.
  clock.now = RealDate.parse('2026-10-12T12:15:00.000Z');
  deliver('QA-M3', 'Marketing QA <marketing-qa@dglus.com>', { subject: 'Sugerencias de Marketing - actualizado', auth: AUTH_PASS('dglus.com'), files: [FIX('Marketing_DGL_QA_SINTETICO_v2.xlsx')] });
  advanceTo('2026-10-12T13:59:00.000Z');
  const s4 = snap('after updated report');
  const plansV2 = (tables.AURA_AGENT_ACTIONS || []).filter(a => a.actionType === 'PREPARE_CAMPAIGN_PLAN').map(a => ({ taskId: a.taskId, status: a.status, plan: JSON.parse(a.result || '{}').plan }));
  const reportActions = (tables.AURA_AGENT_ACTIONS || []).filter(a => a.actionType === 'ANALYZE_MARKETING_REPORT').map(a => ({ taskId: a.taskId, status: a.status, analysis: JSON.parse(a.result || '{}').analysis }));
  const decisions = (tables.AURA_AGENT_DECISIONS || []).length;

  return {
    activation: { status: activation.status, inboxIsMarketing: activation.inbox === INBOX }, triggers: triggers.map(t => ({ handler: t.getHandlerFunction(), everyHours: t.everyHours, minute: t.minute })),
    snapshots: [s1, s2, s3, s4], plansV1, plansV2, reportActions, decisions, opportunities: tables.MKT_OPPORTUNITIES.map(o => ({ type: o.opportunityType, status: o.eligibilityStatus, reason: o.suppressionReason, source: o.sourceReport })),
    rejections: (tables.MKT_AURA_INGEST_REJECTIONS || []).map(r => ({ message: r.gmailMessageId, sheet: r.sheetName, reason: r.reason })),
    labels, conversionsAfterDup, idleLogReads, audit, queueUnchanged: JSON.stringify(tables.MKT_EMAIL_QUEUE) === queueBefore, sendMode: props.AURA_SEND_MODE,
    tablesWritten: Object.keys(audit.written).sort()
  };
}

function evaluate(r) {
  const s1 = r.snapshots[0], s2 = r.snapshots[1], s4 = r.snapshots[3];
  const log1 = id => s1.log.find(x => x.id === id) || {};
  const opps = r.opportunities, scopes = ['RETENTION', 'REACTIVATION', 'CROSS_SELL'];
  const oppTask = (s, sc) => s.tasks.find(t => t.kind === 'OPPORTUNITY' && t.scope === sc) || {};
  const ap = (s, sc) => s.approvals.filter(a => a.scope === sc);
  const planFor = (plans, sc) => (plans.find(p => p.plan && p.plan.scope === sc) || {}).plan || {};
  const ra = r.reportActions[0] || {}, a1 = ra.analysis || {};
  const ALLOWED = ['AURA_AGENT_ACTIONS', 'AURA_AGENT_APPROVALS', 'AURA_AGENT_DECISIONS', 'AURA_AGENT_EVENTS', 'AURA_AGENT_MEMORY', 'AURA_AGENT_METRICS', 'AURA_AGENT_RUNS', 'AURA_AGENT_TASKS', 'MKT_AURA_GMAIL_OPPORTUNITIES', 'MKT_AURA_INGEST_LOG', 'MKT_AURA_INGEST_REJECTIONS', 'MKT_OPPORTUNITIES'];
  const checks = [
    ['Programación', 'AURA instala sus propios triggers horarios y la prueba solo los dispara', r.activation.status === 'ACTIVE' && r.triggers.map(t => t.handler).sort().join(',') === 'auraAgentTick,auraReportIntakeTick' && r.audit.tickLog.length >= 8, r.triggers.map(t => t.handler + ' c/' + t.everyHours + 'h').join(', ') + '; ' + r.audit.tickLog.length + ' ejecuciones programadas'],
    ['Detección', 'El reporte de un remitente interno verificado (que no está en la lista) se detecta en la bandeja de Marketing', log1('QA-M1').status === 'OK' && log1('QA-M1').trust === 'VERIFIED_INTERNAL_SENDER', 'QA-M1 ' + log1('QA-M1').status + ' / ' + log1('QA-M1').trust],
    ['Detección', 'Los correos suplantados y externos nunca se abren', !s1.log.some(x => /QA-SPOOF|QA-EXT/.test(x.id)), 'No hay entradas en el registro para QA-SPOOF ni QA-EXT; ' + r.audit.tickLog.filter(t => t.ingest && t.ingest.untrusted).map(t => t.ingest.untrusted)[0] + ' no confiable omitido'],
    ['Detección', 'Un Excel interno que no es un reporte se ignora', log1('QA-NOTREPORT').status === 'NOT_A_MARKETING_REPORT' && (r.labels['QA-NOTREPORT'] || []).length === 0, 'QA-NOTREPORT ' + log1('QA-NOTREPORT').status],
    ['Lectura del Excel', 'Se lee el XLSX real (6 pestañas) mediante la conversión', log1('QA-M1').accepted === 8, log1('QA-M1').accepted + ' filas aceptadas en las pestañas reconocidas'],
    ['Validación', 'Las filas sin cuenta o sin responsable se rechazan y registran', log1('QA-M1').rejected === 2 && r.rejections.filter(x => x.message === 'QA-M1' && /MISSING/.test(x.reason)).length === 2, r.rejections.filter(x => x.message === 'QA-M1').map(x => x.reason).join(' | ')],
    ['Validación', 'No se crean oportunidades desde las pestañas de calidad de datos ni desconocidas', !opps.some(o => /Datos Pendientes|Campana B/.test(JSON.stringify(o))) && opps.length > 0, 'Se ignoran "Confirmar datos contacto" y "Campana B - nueva"'],
    ['Deduplicación', 'El mismo archivo reenviado da DUPLICATE_REPORT y no se vuelve a convertir', (s2.log.find(x => x.id === 'QA-M2') || {}).status === 'DUPLICATE_REPORT' && r.conversionsAfterDup === 2, 'Conversiones tras el duplicado: ' + r.conversionsAfterDup + ' (v1 + no-reporte)'],
    ['Deduplicación', 'Una cuenta en dos familias pasa una sola vez a la cola (las demás se suprimen por prioridad)', opps.filter(o => o.status === 'SUPPRESSED').length >= 1, opps.filter(o => o.status === 'SUPPRESSED').length + ' oportunidades suprimidas'],
    ['Deduplicación', 'En una hora sin correo nuevo la recepción no lee el Data Hub', r.idleLogReads === 0, 'Lecturas del registro de ingesta en la hora inactiva: ' + r.idleLogReads],
    ['Interpretación', 'Tarea automática de análisis por reporte, con conteos y sin nombres', ra.status === 'DONE' && a1.accounts > 0 && !/QA (Transportes|Logistica|Cargo|Freight|Distribuidora|Mudanzas|Agro)|example\.test/.test(JSON.stringify(r.reportActions)), 'Por familia: ' + JSON.stringify(a1.byFamily || {}) + ', planificables: ' + JSON.stringify(a1.campaignScopes || {})],
    ['Preparación', 'Planes de campaña Retention/Reactivation/Cross-Sell preparados automáticamente', scopes.every(sc => (r.plansV1.find(p => p.plan && p.plan.scope === sc) || {}).status === 'DONE'), scopes.map(sc => sc + ': ' + (planFor(r.plansV1, sc).contacts || {}).recipients + ' destinatarios').join('; ')],
    ['Preparación', 'Se aplican las exclusiones de gobernanza (DNC, email inválido, duplicado, envío reciente)', (() => { const c = scopes.map(sc => planFor(r.plansV1, sc).contacts || {}); return c.some(x => x.doNotContact) && c.some(x => x.invalid) && c.some(x => x.recentlySent) && c.some(x => x.duplicate); })(), scopes.map(sc => { const c = planFor(r.plansV1, sc).contacts || {}; return sc + ' dnc=' + c.doNotContact + ' inválidos=' + c.invalid + ' dup=' + c.duplicate + ' recientes=' + c.recentlySent + ' sinIdioma=' + c.languageUnresolved; }).join('; ')],
    ['Preparación', 'Idioma ES/EN/PT resuelto por contacto', (() => { const l = {}; scopes.forEach(sc => Object.entries(planFor(r.plansV1, sc).languages || {}).forEach(([k, v]) => { l[k] = (l[k] || 0) + v; })); return l.ES > 0 && l.EN > 0 && l.PT > 0; })(), scopes.map(sc => sc + ' ' + JSON.stringify(planFor(r.plansV1, sc).languages || {})).join('; ')],
    ['Aprobación pendiente', 'Una aprobación PENDING por familia y ninguna aprobada automáticamente', scopes.every(sc => ap(s1, sc).length === 1 && ap(s1, sc)[0].status === 'PENDING' && oppTask(s1, sc).state === 'APPROVAL'), scopes.map(sc => sc + ': ' + oppTask(s1, sc).state + '/' + (ap(s1, sc)[0] || {}).status).join('; ')],
    ['Reporte actualizado', 'Un reporte más nuevo genera un análisis nuevo y recalcula el plan pendiente sin duplicar aprobaciones', r.reportActions.length === 2 && planFor(r.plansV2, 'CROSS_SELL').eligibleAccounts === planFor(r.plansV1, 'CROSS_SELL').eligibleAccounts + 1 && scopes.every(sc => ap(s4, sc).length === 1 && ap(s4, sc)[0].status === 'PENDING'), 'CROSS_SELL cuentas ' + planFor(r.plansV1, 'CROSS_SELL').eligibleAccounts + ' -> ' + planFor(r.plansV2, 'CROSS_SELL').eligibleAccounts + '; aprobaciones: ' + s4.approvals.length],
    ['Seguridad', 'Ningún envío: Gmail, MailApp, borradores y llamadas HTTP en 0', Object.values(r.audit.external).every(v => v === 0), JSON.stringify(r.audit.external)],
    ['Seguridad', 'La cola de envío no cambió y AURA_SEND_MODE sigue en DRY_RUN', r.queueUnchanged && r.sendMode === 'DRY_RUN', 'cola sin cambios=' + r.queueUnchanged + ', modo=' + r.sendMode],
    ['Seguridad', 'Solo se escribió en tablas internas de AURA (nada de Salesforce, Clientify ni producción)', r.tablesWritten.every(t => ALLOWED.includes(t)), r.tablesWritten.join(', ')]
  ];
  return checks.map(([stage, name, pass, evidence]) => ({ stage, name, result: pass ? 'PASS' : 'FAIL', evidence }));
}

function markdown(results, raw) {
  const pass = results.filter(c => c.result === 'PASS').length;
  const lines = [
    '# AURA: prueba de punta a punta de recepción automática de reportes (datos sintéticos)', '',
    'Generado por `node tools/aura-e2e/run-e2e.js` (rama `feat/aura-report-intake-info`). Resultado: **' + pass + '/' + results.length + ' PASS**.', '',
    '## Qué es real y qué es simulado', '',
    '- **Real:**',
    '  - el código de AURA que se despliega en Apps Script (ingesta, refresco de oportunidades, agente y helpers de idioma);',
    '  - los archivos `.xlsx` sintéticos de `tools/aura-e2e/fixtures/`.',
    '- **Simulado** (no hay un entorno de Google de pruebas autorizado):',
    '  - el buzón de pruebas;',
    '  - la conversión XLSX→Sheets de Drive (la hace openpyxl sobre el mismo archivo);',
    '  - el Data Hub (en memoria);',
    '  - el programador de triggers de Apps Script. Este solo dispara los handlers que el propio AURA instaló con `ScriptApp.newTrigger`; ninguna función del flujo se llama directamente.',
    '- **Sin red:** `UrlFetchApp`, `MailApp` y los envíos de `GmailApp` cuentan las llamadas y fallan.', '',
    '## Resultados', '', '| Etapa | Verificación | Resultado | Evidencia |', '|---|---|---|---|'
  ].concat(results.map(c => '| ' + c.stage + ' | ' + c.name + ' | **' + c.result + '** | ' + String(c.evidence).replace(/\|/g, '/') + ' |'));
  lines.push('', '## Ejecuciones programadas', '', '| Hora (UTC) | Handler | Resultado |', '|---|---|---|');
  raw.audit.tickLog.forEach(t => lines.push('| ' + t.at.slice(11, 16) + ' | `' + t.handler + '` | ' + t.status + (t.ingest ? ' · procesados ' + t.ingest.processed + ', OK ' + t.ingest.ok + ', duplicados ' + t.ingest.duplicates + ', no-reporte ' + t.ingest.notReports + ', no confiables ' + t.ingest.untrusted : '') + (t.refresh ? ' · refresco ' + t.refresh : '') + (t.run ? ' · tareas creadas ' + t.run.created : '') + ' |'));
  const plan = sc => (raw.plansV1.find(p => p.plan && p.plan.scope === sc) || {}).plan || {};
  lines.push('', '## Observaciones de la prueba (no son fallos del flujo)', '',
    '1. **Cuentas sin contactos en el CRM no se pueden contactar.** Los destinatarios salen de `MKT_CONTACTS_SECURE` (sincronización del CRM); las columnas Contacto/Email del Excel no se importan. Ejemplo: "QA Mudanzas Norte" está en el reporte, pero no aporta destinatarios (Reactivation: ' + plan('REACTIVATION').eligibleAccounts + ' cuentas elegibles, ' + ((plan('REACTIVATION').contacts || {}).recipients) + ' destinatarios).',
    '2. **El mismo email puede aparecer en planes de dos familias.** Un contacto compartido aparece en Retention y en Reactivation. El plan deduplica solo dentro de cada familia. Según el propio plan, la frecuencia se vuelve a aplicar al construir el envío; esa parte no se ejerció en esta prueba.',
    '3. **Una pestaña nueva sin mapeo se ignora** ("Campana B - nueva"). Queda fuera hasta que una persona la agregue al mapa de familias.',
    '4. **El texto libre de "Motivo campana" no se usa** para priorizar ni para adaptar el mensaje: hoy solo se guarda como referencia.', '',
    '## Decisiones del motor actual: reglas vs. IA', '',
    '| Decisión observada en la prueba | Hoy (reglas) | ¿Mejora real con IA? |', '|---|---|---|',
    '| Confiar en el remitente, detectar el reporte, descartar duplicados y no-reportes | Correcto en todos los casos de la prueba | No. Debe seguir siendo determinista y auditable. |',
    '| Validar filas (sin cuenta / sin responsable) | Correcto (2 rechazos registrados) | No. |',
    '| Mapear pestañas a familias | Correcto para las conocidas; ignora las nuevas | **Sí, moderada:** sugerir la familia de una pestaña nueva para que una persona la confirme. |',
    '| Elegibilidad, supresión por prioridad, DNC, email inválido, duplicados, envío reciente | Correcto | No. Son reglas de gobierno y deben ser exactas. |',
    '| Idioma por contacto | Correcto con datos de país o explícitos | **Sí, acotada:** solo para contactos `UNRESOLVED` sin país, con evidencia y revisión. |',
    '| Prioridad entre cuentas y argumento del mensaje | No usa el "Motivo campana" | **Sí, la mayor mejora:** interpretar el motivo en texto libre para priorizar y proponer el ángulo del mensaje, siempre con aprobación. |',
    '| Plan de campaña (diseño, CTA, familia) | Playbooks fijos | Baja: los playbooks ya están aprobados. La IA solo propondría variantes. |',
    '| Aprobar o enviar | Siempre una persona | **Nunca** debe decidirlo la IA. |');
  return lines.join('\n') + '\n';
}

module.exports = { run, evaluate, markdown };
if (require.main === module) {
  const raw = run(), results = evaluate(raw), out = path.join(ROOT, 'docs/aura-e2e');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'E2E_RESULTS.json'), JSON.stringify({ generatedBy: 'tools/aura-e2e/run-e2e.js', results, raw }, null, 2));
  fs.writeFileSync(path.join(out, 'E2E_RESULTS.md'), markdown(results, raw));
  results.forEach(c => console.log(c.result + ' [' + c.stage + '] ' + c.name + ' -- ' + c.evidence));
  console.log(results.filter(c => c.result === 'PASS').length + '/' + results.length + ' PASS');
  if (results.some(c => c.result !== 'PASS')) process.exitCode = 1;
}
