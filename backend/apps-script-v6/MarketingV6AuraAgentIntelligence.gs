/**
 * AURA Agent Intelligence V1: the decision engine behind the Agent Runtime.
 *
 * - Campaign planner (AUTO): resolves audience, language, family, angle and creative system
 *   from governed data and returns COUNTS ONLY (no customer PII leaves this file).
 * - Opportunity analysis, monthly report and daily prioritization (AUTO, internal).
 * - Command model: a human sentence ("Run the next reactivation campaign") becomes an Agent
 *   Run with tasks; external effects stay behind ONE approval and the governed send flow.
 * - Channels without a connected source (Metricool, Search Console) are reported as
 *   SOURCE_NOT_CONNECTED; nothing is simulated.
 */

// Mirror of assets/js/creative-library-v5.js OBJECTIVES / selectSystem (asserted equal in tests).
var AURA_AGENT_PLAYBOOK_ = {
  REACTIVATION: { objective: 'Reactivation', creativeSystem: 'editorial-white', angle: 'Previous Relationship', cta: 'Generate Quote' },
  RETENTION: { objective: 'Retention', creativeSystem: 'editorial-white', angle: 'Stay Close', cta: 'Reply' },
  QNB: { objective: 'Quoted Not Booked', creativeSystem: 'executive-minimal', angle: 'Still Active', cta: 'Recover Quote' },
  CROSS_SELL: { objective: 'Cross-Sell', creativeSystem: 'service-architecture', angle: 'Additional Capability', cta: 'Generate Quote' },
  NURTURE: { objective: 'Nurture', creativeSystem: 'editorial-white', angle: 'Stay Close', cta: 'Reply' },
  ACCOUNT_GROWTH: { objective: 'Relationship Renewal', creativeSystem: 'case-proof', angle: 'Planning Ahead', cta: 'Reply' }
};
var AURA_AGENT_RECENT_SEND_DAYS_ = 30;

function v6AuraAgentIsTrue_(v) { return /^(true|yes|y|1|x)$/i.test(String(v == null ? '' : v).trim()); }
function v6AuraAgentLang_(v) {
  if (typeof v6StudioLanguage_ === 'function') { var l = v6StudioLanguage_(v); if (/^(ES|EN|PT)$/.test(l)) return l; }
  var s = String(v || '').trim().toLowerCase();
  if (/^(es|spa|spanish|español|espanol)/.test(s)) return 'ES';
  if (/^(en|eng|english|inglés|ingles)/.test(s)) return 'EN';
  if (/^(pt|por|portugu)/.test(s)) return 'PT';
  return 'UNRESOLVED';
}
function v6AuraAgentEligible_(scope) {
  var accounts = {}, owners = {}, services = {}, windows = {};
  v6Rows_('MKT_OPPORTUNITIES').forEach(function (o) {
    if (v6AuraAgentText_(o.eligibilityStatus).toUpperCase() === 'SUPPRESSED') return;
    if (v6AuraAgentScopeForType_(o.opportunityType) !== scope || !o.accountId) return;
    if (accounts[o.accountId]) return;
    accounts[o.accountId] = true;
    var owner = v6AuraAgentText_(o.amOwner) || 'Unassigned', service = v6AuraAgentText_(o.service) || 'Multiservicio', win = v6AuraAgentText_(o.qnbWindow || o.window);
    owners[owner] = (owners[owner] || 0) + 1; services[service] = (services[service] || 0) + 1; if (win) windows[win] = (windows[win] || 0) + 1;
  });
  return { accounts: accounts, count: Object.keys(accounts).length, owners: owners, services: services, windows: windows };
}
function v6AuraAgentTop_(map, n) { return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; }).slice(0, n || 5).map(function (k) { return { key: k, count: map[k] }; }); }

// AUTO campaign preparation: audience, language, family, angle, creative system. Counts only.
function v6AuraAgentPlanCampaign_(scope, nowIso) {
  var play = AURA_AGENT_PLAYBOOK_[scope];
  if (!play) return { status: 'BLOCKED', error: 'SCOPE_HAS_NO_CAMPAIGN_PLAYBOOK' };
  var elig = v6AuraAgentEligible_(scope), now = new Date(nowIso || new Date().toISOString()).getTime();
  var recent = {};
  v6Rows_('MKT_EMAIL_QUEUE').forEach(function (q) {
    if (String(q.status).toUpperCase() !== 'SENT') return;
    var at = new Date(q.processedAt || q.sentAt || 0).getTime();
    if (at && now - at <= AURA_AGENT_RECENT_SEND_DAYS_ * 86400000) recent[String(q.email || '').trim().toLowerCase()] = true;
  });
  var seen = {}, out = { eligible: 0, invalid: 0, doNotContact: 0, recentlySent: 0, duplicate: 0, recipients: 0 }, langs = { ES: 0, EN: 0, PT: 0, UNRESOLVED: 0 };
  var contacts = v6Rows_('MKT_CONTACTS_SECURE'), blockedEmail = {};
  function isInvalid(c, email) { return !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || /INVALID|BOUNCE/i.test(String(c.emailStatus || '')); }
  function isDnc(c) { return v6AuraAgentIsTrue_(c.doNotContact) || /DNC|DO_NOT_CONTACT|UNSUBSCRIBED/i.test(String(c.status || '')); }
  // Exact-email governance across ALL contact rows (any account): a DNC or invalid flag on one
  // row blocks that email everywhere, so a duplicate row can never bypass it.
  contacts.forEach(function (c) { var e = String(c.email || '').trim().toLowerCase(); if (e && (isDnc(c) || isInvalid(c, e))) blockedEmail[e] = isDnc(c) ? 'DNC' : (blockedEmail[e] || 'INVALID'); });
  contacts.forEach(function (c) {
    if (!elig.accounts[c.accountId]) return;
    out.eligible++;
    var email = String(c.email || '').trim().toLowerCase();
    if (isInvalid(c, email) || blockedEmail[email] === 'INVALID') { out.invalid++; return; }
    if (isDnc(c) || blockedEmail[email] === 'DNC') { out.doNotContact++; return; }
    if (seen[email]) { out.duplicate++; return; }
    seen[email] = true;
    if (recent[email]) { out.recentlySent++; return; }
    out.recipients++; langs[v6AuraAgentLang_(c.preferredLanguage || c.language)]++;
  });
  var service = (v6AuraAgentTop_(elig.services, 1)[0] || {}).key || 'Multiservicio';
  return {
    status: out.recipients ? 'DONE' : 'BLOCKED', error: out.recipients ? '' : 'NO_ELIGIBLE_RECIPIENTS',
    plan: {
      scope: scope, objective: play.objective, eligibleAccounts: elig.count, contacts: out, languages: langs,
      service: service, creativeSystem: play.creativeSystem, angle: play.angle, cta: play.cta,
      topOwners: v6AuraAgentTop_(elig.owners, 5),
      governance: 'Exact-email dedupe, DNC, invalid email and ' + AURA_AGENT_RECENT_SEND_DAYS_ + '-day resend protection applied; contact frequency and exclusions are re-applied by the governed build.',
      dataSources: ['MKT_OPPORTUNITIES', 'MKT_CONTACTS_SECURE', 'MKT_EMAIL_QUEUE'],
      approvalRequired: 'SEND_CUSTOMER_EMAIL (one approval for the whole campaign)'
    }
  };
}
function v6AuraAgentAnalyzeOpportunities_(scope) {
  var elig = v6AuraAgentEligible_(scope);
  return { status: 'DONE', analysis: { scope: scope, eligibleAccounts: elig.count, topOwners: v6AuraAgentTop_(elig.owners, 5), services: v6AuraAgentTop_(elig.services, 6), windows: v6AuraAgentTop_(elig.windows, 4), dataSources: ['MKT_OPPORTUNITIES'] } };
}
function v6AuraAgentMonthlyReport_(nowIso) {
  var perf = v6AuraEmailPerformance_(), now = new Date(nowIso).getTime(), campaigns = [];
  Object.keys(perf.scopes || {}).forEach(function (id) {
    var s = perf.scopes[id];
    if (!s.lastSentAt || now - new Date(s.lastSentAt).getTime() > 31 * 86400000) return;
    var a = s.allTime || {}, r = s.currentRun || {};
    campaigns.push({ campaignId: id, family: s.currentFamily, currentRunSent: r.sent, sent: a.sent, delivered: a.delivered, bounced: a.bounced, replied: a.replied, openRate: a.openRate, ctr: a.ctr, ctor: a.ctor, pipeline: s.pipeline });
  });
  var opp = {};
  ['REACTIVATION', 'RETENTION', 'QNB', 'CROSS_SELL', 'NURTURE', 'ACCOUNT_GROWTH'].forEach(function (sc) { opp[sc] = v6AuraAgentEligible_(sc).count; });
  return { status: 'DONE', report: { month: nowIso.slice(0, 7), campaigns: campaigns, eligibleAccountsByScope: opp, tracking: perf.tracking, dataSources: ['MKT_EMAIL_QUEUE', 'MKT_EMAIL_EVENTS', 'MKT_RESPONSES', 'MKT_OPPORTUNITIES'] } };
}
function v6AuraAgentPrioritize_(st) {
  var open = (st.AURA_AGENT_TASKS || []).filter(function (t) { return !AURA_AGENT_TERMINAL_[t.state] && t.kind !== 'COMMAND'; })
    .sort(function (a, b) { return Number(a.priority || 99) - Number(b.priority || 99); }).slice(0, 5)
    .map(function (t) { return { title: t.title, state: t.state, policy: t.policy }; });
  var opp = {};
  ['QNB', 'RETENTION', 'REACTIVATION', 'CROSS_SELL', 'NURTURE'].forEach(function (sc) { opp[sc] = v6AuraAgentEligible_(sc).count; });
  return { status: 'DONE', priorities: { openTasks: open, eligibleAccountsByScope: opp, rule: 'Order: replies to follow up, approvals waiting, QNB, Retention, Reactivation, Cross-Sell, Nurture.' } };
}

// ---- Command model -----------------------------------------------------------------------------
var AURA_AGENT_COMMAND_EXAMPLES_ = ['Run the next reactivation campaign', 'Find accounts with cross-sell opportunities', 'Prepare next week\'s social content', 'Review QNB opportunities', 'Find SEO opportunities', 'Prepare the monthly marketing report', 'Show me what Marketing should prioritize today'];
function v6AuraAgentCommandScope_(t) {
  if (/reactiv/.test(t)) return 'REACTIVATION';
  if (/retenc|retention/.test(t)) return 'RETENTION';
  if (/\bqnb\b|quoted|cotizad|not booked/.test(t)) return 'QNB';
  if (/cross[\s-]?sell|venta cruzada/.test(t)) return 'CROSS_SELL';
  if (/nurture|nutric/.test(t)) return 'NURTURE';
  if (/growth|abm|crecimiento|expansion/.test(t)) return 'ACCOUNT_GROWTH';
  return '';
}
function v6AuraAgentParseCommand_(text) {
  var t = String(text || '').toLowerCase().trim(), scope = v6AuraAgentCommandScope_(t);
  if (!t) return { intent: 'UNKNOWN' };
  if (/social|linkedin|instagram|facebook|metricool|redes/.test(t)) return { intent: 'PREPARE_SOCIAL', scope: 'SOCIAL', actions: ['PREPARE_SOCIAL_PLAN', 'PUBLISH_SOCIAL_POST'], title: 'Prepare social content' };
  if (/\bseo\b|\bgeo\b|search console|posicionamiento/.test(t)) return { intent: 'FIND_SEO', scope: 'SEO', actions: ['FIND_SEO_OPPORTUNITIES'], title: 'Find SEO / GEO opportunities' };
  if (/report|reporte|informe/.test(t)) return { intent: 'MONTHLY_REPORT', scope: 'ANALYTICS', actions: ['PREPARE_REPORT'], title: 'Prepare the monthly marketing report' };
  if (/priorit|priorid|today|hoy|focus|enfoc/.test(t)) return { intent: 'PRIORITIZE_TODAY', scope: 'INTERNAL_MARKETING', actions: ['PRIORITIZE_TODAY'], title: 'What Marketing should prioritize today' };
  if (scope && /campaign|campaña|campana|run|launch|lanza|ejecuta|send|envia|envía/.test(t) && !/find|busca|encuentra|review|revisa|show|muestra|list/.test(t))
    return { intent: 'RUN_CAMPAIGN', scope: scope, actions: ['PREPARE_CAMPAIGN_PLAN', 'SEND_CUSTOMER_EMAIL'], title: 'Run the next ' + AURA_AGENT_PLAYBOOK_[scope].objective + ' campaign' };
  if (scope && /find|busca|encuentra|review|revisa|show|muestra|list|identif|which|cuales|cuáles|opportunit|oportunidad/.test(t))
    return { intent: 'FIND_OPPORTUNITIES', scope: scope, actions: ['ANALYZE_OPPORTUNITIES'], title: 'Review ' + AURA_AGENT_PLAYBOOK_[scope].objective + ' opportunities' };
  return { intent: 'UNKNOWN' };
}
// Turns a human instruction into an Agent Run. Internal steps run now; anything external waits
// for one approval. Returns a plain-language answer plus the task, never customer PII.
function v6AuraAgentCommand_(payload) {
  var text = String((payload || {}).text || '').slice(0, 300), parsed = v6AuraAgentParseCommand_(text);
  if (parsed.intent === 'UNKNOWN') return { status: 'UNRECOGNIZED', response: 'AURA did not recognize that instruction yet.', examples: AURA_AGENT_COMMAND_EXAMPLES_ };
  var nowIso = (payload && payload.now) || new Date().toISOString(), day = nowIso.slice(0, 10);
  var taskId = 'CMD:' + day + ':' + parsed.intent + ':' + parsed.scope;
  var detection = {
    taskId: taskId, kind: 'COMMAND', scope: parsed.scope, subjectKey: parsed.intent + ':' + parsed.scope, title: parsed.title, intent: parsed.intent, source: 'USER_COMMAND',
    summary: 'Requested: "' + text + '"', observed: 'User instruction: "' + text + '"', dataSource: 'AURA command',
    rationale: 'Instruction mapped to ' + parsed.intent + (parsed.scope ? ' / ' + parsed.scope : ''), priority: 5,
    actions: parsed.actions.map(function (a) { return { actionType: a, preview: parsed.scope }; })
  };
  var run = v6AuraAgentRunCycle_({ trigger: 'COMMAND', now: nowIso, extra: [detection], onlyExtra: true });
  if (run.status === 'SKIPPED_ALREADY_RUNNING') return { status: 'BUSY', response: 'AURA is finishing another cycle. Try again in a moment.' };
  var task = v6Rows_('AURA_AGENT_TASKS').filter(function (t) { return t.taskId === taskId || (t.kind === 'COMMAND' && t.subjectKey === detection.subjectKey && !AURA_AGENT_TERMINAL_[t.state]); })[0] || null;
  var actions = task ? v6Rows_('AURA_AGENT_ACTIONS').filter(function (a) { return a.taskId === task.taskId; }) : [];
  var result = null; actions.forEach(function (a) { if (a.status === 'DONE' && a.result && !result) { try { result = JSON.parse(a.result); } catch (e) { result = a.result; } } });
  return { status: run.status, intent: parsed.intent, scope: parsed.scope, task: task, result: result, response: v6AuraAgentCommandResponse_(parsed, task, result, actions) };
}
function v6AuraAgentCommandResponse_(parsed, task, result, actions) {
  if (!task) return 'AURA recorded the request.';
  var blocked = (actions || []).filter(function (a) { return a.status === 'BLOCKED' && a.error; })[0];
  if (task.state === 'BLOCKED' && blocked && /^SOURCE_NOT_CONNECTED/.test(blocked.error)) return 'AURA cannot do this yet: ' + blocked.error.replace('SOURCE_NOT_CONNECTED:', '') + ' is not connected. ' + (task.nextAction || '');
  if (parsed.intent === 'RUN_CAMPAIGN' && result && result.plan) {
    var p = result.plan, c = p.contacts || {}, l = p.languages || {};
    return 'Prepared ' + p.objective + ': ' + c.recipients + ' recipients in ' + p.eligibleAccounts + ' accounts (ES ' + l.ES + ' · EN ' + l.EN + ' · PT ' + l.PT + (l.UNRESOLVED ? ' · unresolved ' + l.UNRESOLVED : '') + '). Creative: ' + p.creativeSystem + ' · angle "' + p.angle + '". Excluded: ' + (c.recentlySent + c.doNotContact + c.invalid + c.duplicate) + '. ' + (task.state === 'APPROVAL' ? 'Waiting for your approval.' : task.nextAction || '');
  }
  if (task.state === 'BLOCKED') return 'Blocked: ' + String(task.blockReason || '').replace(/_/g, ' ').toLowerCase() + '. ' + (task.nextAction || '');
  if (result && result.analysis) return result.analysis.eligibleAccounts + ' eligible accounts for ' + parsed.scope.replace('_', '-').toLowerCase() + '. Top owner: ' + ((result.analysis.topOwners[0] || {}).key || 'n/a') + '.';
  if (result && result.report) return 'Monthly report ready: ' + result.report.campaigns.length + ' campaigns with sends in the last 31 days.';
  if (result && result.priorities) return result.priorities.openTasks.length + ' open priorities. ' + (result.priorities.openTasks[0] ? 'First: ' + result.priorities.openTasks[0].title + '.' : '');
  return 'Done.';
}
