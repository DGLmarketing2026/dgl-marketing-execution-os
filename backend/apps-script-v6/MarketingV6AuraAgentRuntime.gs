/**
 * AURA Agent Runtime V1 (NOVA is a separate system and is never called from here).
 *
 * Runs unattended from an hourly time trigger (auraAgentTick), so it keeps working when no
 * operator or Claude Code session is open. Every cycle is idempotent: task, action and
 * approval ids are deterministic, so a repeated or concurrent tick never duplicates work.
 *
 * Lifecycle per task:
 *   OBSERVE -> ANALYZE -> DECIDE -> PLAN -> PREPARE -> [APPROVAL] -> EXECUTE -> VERIFY -> MEASURE
 *   -> NEXT_ACTION -> COMPLETED            (plus BLOCKED, FAILED, CANCELLED)
 *
 * Approval model (per action type; unknown action types are BLOCKED):
 *   AUTO               internal read / internal bookkeeping only (ingest, reconcile, measure)
 *   REVIEW             internal action prepared for a human look before it runs
 *   APPROVAL_REQUIRED  any external effect: customer send, social, WordPress, Salesforce write,
 *                      paid budget, Drive sharing. One approval gates the whole task (campaign).
 *   BLOCKED            destructive or governance-breaking: never executed.
 * V1 never executes an external action, even when approved: the channel adapter returns
 * EXTERNAL_EXECUTION_DISABLED_PHASE_V1 and the task points to the governed manual flow
 * (Campaign Studio -> DRY_RUN -> governed GO LIVE). Campaign A is closed: no task may target it
 * with an outbound action.
 */
var AURA_AGENT_SCHEMAS_ = {
  AURA_AGENT_RUNS: ['runId', 'trigger', 'state', 'startedAt', 'finishedAt', 'tasksCreated', 'tasksAdvanced', 'tasksCompleted', 'tasksBlocked', 'tasksFailed', 'error'],
  AURA_AGENT_TASKS: ['taskId', 'runId', 'kind', 'scope', 'campaignId', 'subjectKey', 'title', 'summary', 'state', 'policy', 'priority', 'blockReason', 'nextAction', 'attempts', 'lastError', 'approvalId', 'createdAt', 'updatedAt', 'completedAt', 'intent', 'source', 'observed', 'dataSource', 'rationale'],
  // One decision ledger row per task: what AURA observed, from which source, what it decided and
  // why, priority, planned action, approval requirement, execution result, metric result, next action.
  AURA_AGENT_DECISIONS: ['decisionId', 'taskId', 'runId', 'decision', 'rationale', 'evidence', 'createdAt', 'observed', 'dataSource', 'priority', 'plannedAction', 'approvalRequirement', 'executionResult', 'metricResult', 'nextAction', 'updatedAt'],
  AURA_AGENT_ACTIONS: ['actionId', 'taskId', 'actionType', 'channel', 'external', 'policy', 'status', 'preview', 'result', 'error', 'createdAt', 'executedAt', 'verifiedAt'],
  AURA_AGENT_APPROVALS: ['approvalId', 'taskId', 'campaignId', 'scope', 'summary', 'status', 'requestedAt', 'decidedAt', 'decidedBy', 'note'],
  AURA_AGENT_EVENTS: ['eventId', 'runId', 'taskId', 'fromState', 'toState', 'at', 'detail'],
  AURA_AGENT_MEMORY: ['memoryKey', 'scope', 'value', 'updatedAt'],
  AURA_AGENT_METRICS: ['metricId', 'runId', 'scope', 'campaignId', 'metric', 'value', 'basis', 'at']
};
var AURA_AGENT_LIFECYCLE_ = ['OBSERVE', 'ANALYZE', 'DECIDE', 'PLAN', 'PREPARE', 'APPROVAL', 'EXECUTE', 'VERIFY', 'MEASURE', 'NEXT_ACTION'];
var AURA_AGENT_TERMINAL_ = { COMPLETED: true, BLOCKED: true, CANCELLED: true };
var AURA_AGENT_TRANSITIONS_ = {
  OBSERVE: ['ANALYZE'], ANALYZE: ['DECIDE'], DECIDE: ['PLAN', 'COMPLETED'], PLAN: ['PREPARE'],
  PREPARE: ['APPROVAL', 'EXECUTE'], APPROVAL: ['EXECUTE', 'CANCELLED'], EXECUTE: ['VERIFY'],
  VERIFY: ['MEASURE'], MEASURE: ['NEXT_ACTION'], NEXT_ACTION: ['COMPLETED'],
  FAILED: ['EXECUTE'], BLOCKED: [], COMPLETED: [], CANCELLED: []
};
var AURA_AGENT_SCOPES_ = ['REACTIVATION', 'RETENTION', 'QNB', 'CROSS_SELL', 'ACCOUNT_GROWTH', 'NURTURE', 'EMAIL', 'SOCIAL', 'EVENT', 'CONTENT', 'SEO', 'GEO', 'WEB', 'ANALYTICS', 'INTERNAL_MARKETING'];
// Scopes without a connected data source are registered but detect nothing (never simulated).
var AURA_AGENT_SCOPE_SOURCES_ = {
  REACTIVATION: 'MKT_OPPORTUNITIES', RETENTION: 'MKT_OPPORTUNITIES', QNB: 'MKT_OPPORTUNITIES', CROSS_SELL: 'MKT_OPPORTUNITIES',
  NURTURE: 'MKT_OPPORTUNITIES', ACCOUNT_GROWTH: 'MKT_OPPORTUNITIES', EMAIL: 'MKT_EMAIL_QUEUE/MKT_EMAIL_EVENTS', ANALYTICS: 'MKT_EMAIL_EVENTS',
  SOCIAL: 'NOT_CONNECTED', EVENT: 'NOT_CONNECTED', CONTENT: 'NOT_CONNECTED', SEO: 'NOT_CONNECTED', GEO: 'NOT_CONNECTED', WEB: 'NOT_CONNECTED', INTERNAL_MARKETING: 'NOT_CONNECTED'
};
var AURA_AGENT_ACTION_TYPES_ = {
  INGEST_BOUNCES_REPLIES: { channel: 'GMAIL', external: false, policy: 'AUTO' },
  RECONCILE_EVENTS: { channel: 'SHEETS', external: false, policy: 'AUTO' },
  MEASURE_CAMPAIGN: { channel: 'ANALYTICS', external: false, policy: 'AUTO' },
  PREPARE_CAMPAIGN_PLAN: { channel: 'SHEETS', external: false, policy: 'AUTO' },
  FOLLOW_UP_REPLIES: { channel: 'SHEETS', external: false, policy: 'AUTO' },
  ANALYZE_OPPORTUNITIES: { channel: 'SHEETS', external: false, policy: 'AUTO' },
  PREPARE_REPORT: { channel: 'ANALYTICS', external: false, policy: 'AUTO' },
  PRIORITIZE_TODAY: { channel: 'SHEETS', external: false, policy: 'AUTO' },
  PREPARE_SOCIAL_PLAN: { channel: 'METRICOOL', external: false, policy: 'AUTO' },
  FIND_SEO_OPPORTUNITIES: { channel: 'ANALYTICS', external: false, policy: 'AUTO' },
  SEND_CUSTOMER_EMAIL: { channel: 'GMAIL', external: true, policy: 'APPROVAL_REQUIRED' },
  PUBLISH_SOCIAL_POST: { channel: 'METRICOOL', external: true, policy: 'APPROVAL_REQUIRED' },
  PUBLISH_WORDPRESS: { channel: 'WORDPRESS', external: true, policy: 'APPROVAL_REQUIRED' },
  UPDATE_SALESFORCE: { channel: 'SALESFORCE', external: true, policy: 'APPROVAL_REQUIRED' },
  SHARE_DRIVE_FILE: { channel: 'DRIVE', external: true, policy: 'APPROVAL_REQUIRED' },
  CHANGE_PAID_BUDGET: { channel: 'METRICOOL', external: true, policy: 'APPROVAL_REQUIRED' },
  DELETE_DATA: { channel: 'SHEETS', external: false, policy: 'BLOCKED' },
  MODIFY_SENT_HISTORY: { channel: 'SHEETS', external: false, policy: 'BLOCKED' },
  RESEND_CAMPAIGN_A: { channel: 'GMAIL', external: true, policy: 'BLOCKED' },
  CHANGE_SEND_MODE: { channel: 'SHEETS', external: false, policy: 'BLOCKED' }
};
var AURA_AGENT_POLICY_RANK_ = { AUTO: 0, REVIEW: 1, APPROVAL_REQUIRED: 2, BLOCKED: 3 };
var AURA_AGENT_CHANNELS_ = ['GMAIL', 'SHEETS', 'DRIVE', 'SALESFORCE', 'METRICOOL', 'WORDPRESS', 'ANALYTICS'];
var AURA_AGENT_MAX_ATTEMPTS_ = 3;
var AURA_AGENT_LEASE_PROP_ = 'AURA_AGENT_LEASE';
var AURA_AGENT_EXTERNAL_DISABLED_ = 'EXTERNAL_EXECUTION_DISABLED_PHASE_V1';

function v6AuraAgentText_(v) { return v == null ? '' : String(v).trim(); }
function v6AuraAgentCanTransition_(from, to) { return (AURA_AGENT_TRANSITIONS_[from] || []).indexOf(to) >= 0 || (to === 'BLOCKED' || to === 'FAILED') && !AURA_AGENT_TERMINAL_[from]; }
// Policy for one action type. Unknown -> BLOCKED; an external action can never be AUTO/REVIEW.
function v6AuraAgentPolicy_(actionType, context) {
  var def = AURA_AGENT_ACTION_TYPES_[v6AuraAgentText_(actionType)];
  if (!def) return 'BLOCKED';
  var ctx = context || {};
  if (def.external && typeof CAMPANA_A_CAMPAIGN_ID_ !== 'undefined' && ctx.campaignId === CAMPANA_A_CAMPAIGN_ID_) return 'BLOCKED';
  if (def.external && AURA_AGENT_POLICY_RANK_[def.policy] < AURA_AGENT_POLICY_RANK_.APPROVAL_REQUIRED) return 'APPROVAL_REQUIRED';
  return def.policy;
}
function v6AuraAgentTaskPolicy_(actionTypes, context) {
  return (actionTypes || []).reduce(function (worst, t) { var p = v6AuraAgentPolicy_(t, context); return AURA_AGENT_POLICY_RANK_[p] > AURA_AGENT_POLICY_RANK_[worst] ? p : worst; }, 'AUTO');
}

// ---- Channel adapters: PREPARE / PREVIEW / EXECUTE / VERIFY / MEASURE ---------------------
var AURA_AGENT_HANDLERS_ = {
  INGEST_BOUNCES_REPLIES: function () { var r = v6AuraIngestGmailDsn_({}); return { status: 'DONE', detail: r && r.status ? r.status : 'OK' }; },
  RECONCILE_EVENTS: function () { var r = v6AuraReconcileEmailEvents_(); return { status: 'DONE', detail: 'written=' + ((r && r.written) || 0) }; },
  MEASURE_CAMPAIGN: function (action, state) { return v6AuraAgentMeasureCampaign_(action, state); },
  PREPARE_CAMPAIGN_PLAN: function (action, st) {
    var scope = v6AuraAgentText_(action.preview);
    if (typeof v6AuraAgentPlanCampaign_ !== 'function' || !AURA_AGENT_PLAYBOOK_[scope]) return { status: 'DONE', detail: 'PLAN_RECORDED: ' + action.preview };
    var r = v6AuraAgentPlanCampaign_(scope, st && st.nowIso);
    return { status: r.status, error: r.error, detail: JSON.stringify({ plan: r.plan }) };
  },
  FOLLOW_UP_REPLIES: function (action) { return { status: 'DONE', detail: 'AM_FOLLOW_UP_LISTED: ' + action.preview }; },
  ANALYZE_OPPORTUNITIES: function (action) { return v6AuraAgentJson_(v6AuraAgentAnalyzeOpportunities_(v6AuraAgentText_(action.preview))); },
  PREPARE_REPORT: function (action, st) { var r = v6AuraAgentMonthlyReport_(st.nowIso); v6AuraAgentPut_(st, 'AURA_AGENT_MEMORY', { memoryKey: 'report.monthly.' + st.nowIso.slice(0, 7), scope: 'ANALYTICS', value: JSON.stringify(r.report), updatedAt: st.nowIso }); return v6AuraAgentJson_(r); },
  PRIORITIZE_TODAY: function (action, st) { return v6AuraAgentJson_(v6AuraAgentPrioritize_(st)); },
  // Not connected yet: reported honestly, never simulated.
  PREPARE_SOCIAL_PLAN: function () { return { status: 'BLOCKED', error: 'SOURCE_NOT_CONNECTED:METRICOOL' }; },
  FIND_SEO_OPPORTUNITIES: function () { return { status: 'BLOCKED', error: 'SOURCE_NOT_CONNECTED:SEARCH_CONSOLE' }; }
};
function v6AuraAgentJson_(r) { var body = Object.assign({}, r); delete body.status; delete body.error; return { status: r.status, error: r.error, detail: JSON.stringify(body) }; }
function v6AuraAgentAdapter_(channel) {
  var name = v6AuraAgentText_(channel).toUpperCase();
  if (AURA_AGENT_CHANNELS_.indexOf(name) < 0) throw new Error('UNKNOWN_CHANNEL ' + name);
  return {
    channel: name,
    prepare: function (action) { return { status: 'PREPARED', preview: v6AuraAgentText_(action.preview) }; },
    preview: function (action) { return { channel: name, actionType: action.actionType, external: !!AURA_AGENT_ACTION_TYPES_[action.actionType] && AURA_AGENT_ACTION_TYPES_[action.actionType].external, preview: action.preview }; },
    execute: function (action, approval, state) {
      var def = AURA_AGENT_ACTION_TYPES_[action.actionType], policy = v6AuraAgentPolicy_(action.actionType, { campaignId: action.campaignId });
      if (!def || policy === 'BLOCKED') return { status: 'BLOCKED', error: 'ACTION_BLOCKED_BY_POLICY' };
      if (policy !== 'AUTO' && !(approval && approval.status === 'APPROVED')) return { status: 'BLOCKED', error: 'APPROVAL_MISSING' };
      if (def.external) return { status: 'BLOCKED', error: AURA_AGENT_EXTERNAL_DISABLED_ };
      var handler = AURA_AGENT_HANDLERS_[action.actionType];
      if (!handler) return { status: 'BLOCKED', error: 'NO_INTERNAL_HANDLER' };
      return handler(action, state);
    },
    verify: function (action) { return { verified: action.status === 'DONE' }; },
    measure: function (action) { return { channel: name, actionType: action.actionType, status: action.status }; }
  };
}

// ---- Storage ---------------------------------------------------------------------------------
function v6AuraAgentEnsureSheets_() { Object.keys(AURA_AGENT_SCHEMAS_).forEach(function (n) { v6AcqEnsureSheet_(n, AURA_AGENT_SCHEMAS_[n]); }); }
function v6AuraAgentLoad_() {
  var st = { changed: {} };
  Object.keys(AURA_AGENT_SCHEMAS_).forEach(function (n) { st[n] = v6Rows_(n); });
  st.taskById = {}; st.AURA_AGENT_TASKS.forEach(function (t) { st.taskById[t.taskId] = t; });
  st.approvalById = {}; st.AURA_AGENT_APPROVALS.forEach(function (a) { st.approvalById[a.approvalId] = a; });
  st.actionsByTask = {}; st.AURA_AGENT_ACTIONS.forEach(function (a) { (st.actionsByTask[a.taskId] = st.actionsByTask[a.taskId] || []).push(a); });
  st.decisionById = {}; st.AURA_AGENT_DECISIONS.forEach(function (d) { st.decisionById[d.decisionId] = d; });
  return st;
}
function v6AuraAgentPut_(st, table, record) { (st.changed[table] = st.changed[table] || []).push(record); }
function v6AuraAgentFlush_(st) {
  var keys = { AURA_AGENT_RUNS: 'runId', AURA_AGENT_TASKS: 'taskId', AURA_AGENT_DECISIONS: 'decisionId', AURA_AGENT_ACTIONS: 'actionId', AURA_AGENT_APPROVALS: 'approvalId', AURA_AGENT_EVENTS: 'eventId', AURA_AGENT_MEMORY: 'memoryKey', AURA_AGENT_METRICS: 'metricId' };
  Object.keys(st.changed).forEach(function (t) { if (st.changed[t].length) v6BatchUpsertByKey_(t, [keys[t]], st.changed[t]); });
  st.changed = {};
}
function v6AuraAgentMove_(st, task, to, detail, nowIso) {
  if (!v6AuraAgentCanTransition_(task.state, to)) throw new Error('ILLEGAL_TRANSITION ' + task.state + '->' + to);
  v6AuraAgentPut_(st, 'AURA_AGENT_EVENTS', { eventId: task.taskId + '#' + (Number(task._seq || 0) + 1) + ':' + to + '@' + st.runId, runId: st.runId, taskId: task.taskId, fromState: task.state, toState: to, at: nowIso, detail: detail || '' });
  task._seq = Number(task._seq || 0) + 1;
  task.state = to; task.updatedAt = nowIso; task.runId = st.runId;
  if (to === 'COMPLETED' || to === 'CANCELLED') task.completedAt = nowIso;
  st.advanced = (st.advanced || 0) + 1;
}

// ---- OBSERVE: deterministic detection from governed data (never fabricated) -----------------
function v6AuraAgentScopeForType_(type) {
  var t = v6AuraAgentText_(type).toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '');
  if (/QNB|QUOTED_NOT_BOOKED/.test(t)) return 'QNB';
  if (/RETENTION/.test(t)) return 'RETENTION';
  if (/REACTIVATION/.test(t)) return 'REACTIVATION';
  if (/CROSS_SELL/.test(t)) return 'CROSS_SELL';
  if (/NURTURE|RENEWAL/.test(t)) return 'NURTURE';
  if (/GROWTH|EXPANSION|ACCOUNT/.test(t)) return 'ACCOUNT_GROWTH';
  return '';
}
function v6AuraAgentDetect_(nowIso) {
  var day = nowIso.slice(0, 10), hour = nowIso.slice(0, 13), now = new Date(nowIso).getTime(), found = [];
  found.push({ taskId: 'AT:' + hour + ':INGEST', kind: 'MAINTENANCE', scope: 'EMAIL', subjectKey: 'GMAIL_DSN', title: 'Ingest bounces and replies', summary: 'Read Gmail delivery notifications and reconcile email events.', observed: 'Hourly maintenance window', dataSource: 'Gmail DSN + MKT_EMAIL_EVENTS', rationale: 'Bounces and replies must be current before any measurement or next send', priority: 20, actions: [{ actionType: 'INGEST_BOUNCES_REPLIES', preview: 'Gmail DSN scan + MKT_EMAIL_EVENTS reconcile' }] });
  var perf = typeof v6AuraEmailPerformance_ === 'function' ? v6AuraEmailPerformance_() : { scopes: {} };
  Object.keys(perf.scopes || {}).forEach(function (cid) {
    var s = perf.scopes[cid], cur = s.currentRun || {};
    // Only campaigns with SENT evidence in the last 45 days are measured daily.
    if (!(s.allTime && s.allTime.sent) || !s.lastSentAt || now - new Date(s.lastSentAt).getTime() > 45 * 86400000) return;
    var scope = v6AuraAgentScopeForType_(s.currentFamily) || 'EMAIL';
    found.push({ taskId: 'AT:' + day + ':MEASURE:' + cid, kind: 'MEASUREMENT', scope: scope, campaignId: cid, subjectKey: cid, title: 'Measure ' + cid, summary: 'Current run SENT ' + (cur.sent || 0) + ', bounced ' + (cur.bounced || 0) + ', replied ' + (cur.replied || 0) + '.', observed: 'SENT evidence in the last 45 days', dataSource: 'MKT_EMAIL_QUEUE/MKT_EMAIL_EVENTS', rationale: 'Daily measurement of active campaigns', priority: 30, actions: [{ actionType: 'MEASURE_CAMPAIGN', preview: cid, campaignId: cid }] });
    if (s.allTime.replied > 0) found.push({ taskId: 'AT:' + day + ':REPLIES:' + cid, kind: 'FOLLOW_UP', scope: scope, campaignId: cid, subjectKey: cid, title: s.allTime.replied + ' replies to follow up (' + cid + ')', summary: 'Hand replied contacts to the owning AM.', observed: s.allTime.replied + ' replies', dataSource: 'MKT_RESPONSES/MKT_EMAIL_EVENTS', rationale: 'Replies are the strongest buying signal and need an owner', priority: 10, actions: [{ actionType: 'FOLLOW_UP_REPLIES', preview: s.allTime.replied + ' replied contacts', campaignId: cid }] });
  });
  var groups = {};
  v6Rows_('MKT_OPPORTUNITIES').forEach(function (o) {
    if (v6AuraAgentText_(o.eligibilityStatus).toUpperCase() === 'SUPPRESSED') return;
    var scope = v6AuraAgentScopeForType_(o.opportunityType); if (!scope) return;
    var g = groups[scope] || (groups[scope] = { accounts: {}, type: v6AuraAgentText_(o.opportunityType) });
    if (o.accountId) g.accounts[o.accountId] = true;
  });
  Object.keys(groups).forEach(function (scope) {
    var n = Object.keys(groups[scope].accounts).length; if (!n) return;
    found.push({ taskId: 'AT:' + day + ':OPP:' + scope, kind: 'OPPORTUNITY', scope: scope, subjectKey: scope, title: groups[scope].type + ': ' + n + ' eligible accounts', summary: 'Prepare a governed ' + groups[scope].type + ' campaign plan. Sending requires one approval and then the governed send flow.', observed: n + ' eligible (non-suppressed) accounts', dataSource: 'MKT_OPPORTUNITIES', rationale: 'Eligible accounts without an open campaign task for this family', priority: AURA_AGENT_SCOPES_.indexOf(scope) + 1, actions: [{ actionType: 'PREPARE_CAMPAIGN_PLAN', preview: scope }, { actionType: 'SEND_CUSTOMER_EMAIL', preview: groups[scope].type + ' email to ' + n + ' accounts (governed flow)' }] });
  });
  return found;
}

// ---- One cycle -------------------------------------------------------------------------------
function v6AuraAgentRunCycle_(options) {
  var opts = options || {}, now = opts.now ? new Date(opts.now) : new Date(), nowIso = now.toISOString();
  var props = PropertiesService.getScriptProperties(), lease = Number(props.getProperty(AURA_AGENT_LEASE_PROP_) || 0);
  if (lease && now.getTime() - lease < 10 * 60 * 1000) return { status: 'SKIPPED_ALREADY_RUNNING' };
  props.setProperty(AURA_AGENT_LEASE_PROP_, String(now.getTime()));
  var st, run;
  try {
    v6AuraAgentEnsureSheets_();
    st = v6AuraAgentLoad_(); st.runId = 'RUN:' + nowIso; st.advanced = 0; st.nowIso = nowIso;
    run = { runId: st.runId, trigger: opts.trigger || 'MANUAL', state: 'RUNNING', startedAt: nowIso, tasksCreated: 0 };
    var created = 0, openBySubject = {};
    st.AURA_AGENT_TASKS.forEach(function (t) { if (!AURA_AGENT_TERMINAL_[t.state]) openBySubject[t.kind + ':' + t.subjectKey] = true; });
    var detections = (opts.extra || []).concat(opts.onlyExtra ? [] : v6AuraAgentDetect_(nowIso)), onlyIds = {};
    detections.forEach(function (d) {
      // Idempotent: one task per deterministic key, and never a second open task for the same subject.
      if (st.taskById[d.taskId] || openBySubject[d.kind + ':' + d.subjectKey]) return;
      openBySubject[d.kind + ':' + d.subjectKey] = true;
      if (opts.onlyExtra) onlyIds[d.taskId] = true;
      var task = { taskId: d.taskId, runId: st.runId, kind: d.kind, scope: d.scope, campaignId: d.campaignId || '', subjectKey: d.subjectKey, title: d.title, summary: d.summary, state: 'OBSERVE', intent: d.intent || '', source: d.source || 'AURA_DETECTION', observed: d.observed || d.summary, dataSource: d.dataSource || '', rationale: d.rationale || '', policy: v6AuraAgentTaskPolicy_(d.actions.map(function (a) { return a.actionType; }), { campaignId: d.campaignId }), priority: d.priority, attempts: 0, createdAt: nowIso, updatedAt: nowIso, _actions: d.actions, _new: true };
      st.taskById[task.taskId] = task; st.AURA_AGENT_TASKS.push(task); created++;
    });
    var stats = { completed: 0, blocked: 0, failed: 0 };
    st.AURA_AGENT_TASKS.forEach(function (task) {
      if (AURA_AGENT_TERMINAL_[task.state]) return;
      if (opts.onlyExtra && !onlyIds[task.taskId]) return; // a command never advances unrelated work
      try { v6AuraAgentAdvance_(st, task, nowIso); }
      catch (err) {
        task.attempts = Number(task.attempts || 0) + 1; task.lastError = String(err && err.message || err).slice(0, 300);
        if (task.state !== 'FAILED') v6AuraAgentMove_(st, task, 'FAILED', task.lastError, nowIso);
        if (task.attempts >= AURA_AGENT_MAX_ATTEMPTS_) { task.blockReason = 'MAX_ATTEMPTS'; v6AuraAgentMove_(st, task, 'BLOCKED', 'MAX_ATTEMPTS', nowIso); }
      }
      if (task.state === 'COMPLETED') stats.completed++; else if (task.state === 'BLOCKED') stats.blocked++; else if (task.state === 'FAILED') stats.failed++;
      v6AuraAgentPut_(st, 'AURA_AGENT_TASKS', v6AuraAgentStripTask_(task));
    });
    v6AuraAgentPut_(st, 'AURA_AGENT_MEMORY', { memoryKey: 'runtime.lastTick', scope: 'RUNTIME', value: JSON.stringify({ runId: st.runId, at: nowIso, trigger: run.trigger }), updatedAt: nowIso });
    Object.assign(run, { state: 'COMPLETED', finishedAt: new Date().toISOString(), tasksCreated: created, tasksAdvanced: st.advanced, tasksCompleted: stats.completed, tasksBlocked: stats.blocked, tasksFailed: stats.failed });
    v6AuraAgentPut_(st, 'AURA_AGENT_RUNS', run);
    v6AuraAgentFlush_(st);
    return { status: 'COMPLETED', run: run };
  } catch (err) {
    if (run) { try { st.changed = {}; v6BatchUpsertByKey_('AURA_AGENT_RUNS', ['runId'], [Object.assign(run, { state: 'FAILED', finishedAt: new Date().toISOString(), error: String(err && err.message || err).slice(0, 300) })]); } catch (e) {} }
    return { status: 'FAILED', error: String(err && err.message || err) };
  } finally { props.deleteProperty(AURA_AGENT_LEASE_PROP_); }
}
function v6AuraAgentStripTask_(task) { var o = {}; AURA_AGENT_SCHEMAS_.AURA_AGENT_TASKS.forEach(function (h) { o[h] = task[h] == null ? '' : task[h]; }); return o; }
function v6AuraAgentDecision_(st, task, decision, rationale, evidence, nowIso) {
  v6AuraAgentLedger_(st, task, { decision: decision, rationale: rationale, evidence: evidence || '' }, nowIso);
}
// Decision ledger: one row per task (DEC:<taskId>), completed as the task moves through the loop.
function v6AuraAgentLedger_(st, task, patch, nowIso) {
  var id = 'DEC:' + task.taskId, row = st.decisionById[id] || { decisionId: id, taskId: task.taskId, createdAt: nowIso, observed: task.observed || task.summary || '', dataSource: task.dataSource || '', priority: task.priority, approvalRequirement: task.policy };
  Object.assign(row, patch, { runId: st.runId, updatedAt: nowIso });
  st.decisionById[id] = row; v6AuraAgentPut_(st, 'AURA_AGENT_DECISIONS', row);
}
// Advance one task as far as policy allows in this tick.
function v6AuraAgentAdvance_(st, task, nowIso) {
  var guard = 0;
  while (!AURA_AGENT_TERMINAL_[task.state] && guard++ < 16) {
    var s = task.state;
    if (s === 'OBSERVE') v6AuraAgentMove_(st, task, 'ANALYZE', 'detected', nowIso);
    else if (s === 'ANALYZE') v6AuraAgentMove_(st, task, 'DECIDE', task.summary, nowIso);
    else if (s === 'DECIDE') {
      if (task.policy === 'BLOCKED') { task.blockReason = 'ACTION_BLOCKED_BY_POLICY'; v6AuraAgentDecision_(st, task, 'BLOCK', 'Policy BLOCKED', '', nowIso); v6AuraAgentMove_(st, task, 'BLOCKED', task.blockReason, nowIso); }
      else {
        v6AuraAgentLedger_(st, task, { decision: 'PROCEED', rationale: task.rationale || (task.kind + ' / policy ' + task.policy), evidence: task.summary, plannedAction: (task._actions || []).map(function (a) { return a.actionType; }).join(' -> '), approvalRequirement: task.policy }, nowIso);
        v6AuraAgentMove_(st, task, 'PLAN', '', nowIso);
      }
    } else if (s === 'PLAN') {
      (task._actions || []).forEach(function (a) {
        var def = AURA_AGENT_ACTION_TYPES_[a.actionType] || {}, id = 'AA:' + task.taskId + ':' + a.actionType;
        var action = { actionId: id, taskId: task.taskId, actionType: a.actionType, channel: def.channel || '', external: !!def.external, policy: v6AuraAgentPolicy_(a.actionType, { campaignId: a.campaignId || task.campaignId }), status: 'PLANNED', preview: a.preview || '', createdAt: nowIso };
        (st.actionsByTask[task.taskId] = st.actionsByTask[task.taskId] || []).push(action); v6AuraAgentPut_(st, 'AURA_AGENT_ACTIONS', action);
      });
      v6AuraAgentMove_(st, task, 'PREPARE', (task._actions || []).length + ' actions', nowIso);
    } else if (s === 'PREPARE') {
      (st.actionsByTask[task.taskId] || []).forEach(function (a) { Object.assign(a, v6AuraAgentAdapter_(a.channel).prepare(a)); v6AuraAgentPut_(st, 'AURA_AGENT_ACTIONS', a); });
      // AUTO internal steps (audience, language, creative system, analysis…) run now, so the human
      // approves a PREPARED campaign, not a request to start preparing one.
      var prepBlocked = '';
      (st.actionsByTask[task.taskId] || []).forEach(function (a) {
        if (prepBlocked || a.status === 'DONE' || v6AuraAgentPolicy_(a.actionType, { campaignId: task.campaignId }) !== 'AUTO') return;
        var pr = v6AuraAgentAdapter_(a.channel).execute(a, null, st);
        a.status = pr.status === 'DONE' ? 'DONE' : 'BLOCKED'; a.result = pr.detail || ''; a.error = pr.error || ''; a.executedAt = nowIso;
        v6AuraAgentPut_(st, 'AURA_AGENT_ACTIONS', a);
        if (a.status !== 'DONE') prepBlocked = pr.error || 'BLOCKED';
      });
      if (prepBlocked) {
        task.blockReason = prepBlocked;
        task.nextAction = /^SOURCE_NOT_CONNECTED:/.test(prepBlocked) ? 'Connect ' + prepBlocked.split(':')[1].replace(/_/g, ' ') + ' to enable this capability.' : prepBlocked === 'NO_ELIGIBLE_RECIPIENTS' ? 'No eligible recipients after governance; nothing to approve.' : '';
        v6AuraAgentLedger_(st, task, { executionResult: 'BLOCKED: ' + prepBlocked, nextAction: task.nextAction }, nowIso);
        v6AuraAgentMove_(st, task, 'BLOCKED', prepBlocked, nowIso);
      } else if (task.policy === 'AUTO') v6AuraAgentMove_(st, task, 'EXECUTE', 'AUTO', nowIso);
      else {
        task.approvalId = 'AP:' + task.taskId;
        if (!st.approvalById[task.approvalId]) { var ap = { approvalId: task.approvalId, taskId: task.taskId, campaignId: task.campaignId || '', scope: task.scope, summary: task.title, status: 'PENDING', requestedAt: nowIso }; st.approvalById[ap.approvalId] = ap; v6AuraAgentPut_(st, 'AURA_AGENT_APPROVALS', ap); }
        task.nextAction = task.policy === 'REVIEW' ? 'Review and approve in AURA' : 'Approve once in AURA; the send then runs through the governed flow';
        v6AuraAgentLedger_(st, task, { executionResult: 'PREPARED; waiting for approval', nextAction: task.nextAction }, nowIso);
        v6AuraAgentMove_(st, task, 'APPROVAL', task.policy, nowIso);
      }
    } else if (s === 'APPROVAL') {
      var approval = st.approvalById[task.approvalId] || {};
      if (approval.status === 'APPROVED') v6AuraAgentMove_(st, task, 'EXECUTE', 'approved by ' + (approval.decidedBy || 'user'), nowIso);
      else if (approval.status === 'REJECTED') { task.nextAction = ''; v6AuraAgentMove_(st, task, 'CANCELLED', 'rejected', nowIso); }
      else return; // waits for a human; nothing else happens for this task
    } else if (s === 'EXECUTE' || s === 'FAILED') {
      if (s === 'FAILED') v6AuraAgentMove_(st, task, 'EXECUTE', 'retry ' + task.attempts, nowIso);
      var approvalRow = st.approvalById[task.approvalId], blocked = '';
      if (!(st.actionsByTask[task.taskId] || []).length) throw new Error('NO_ACTIONS');
      (st.actionsByTask[task.taskId] || []).forEach(function (a) {
        if (a.status === 'DONE' || blocked) return;
        var r = v6AuraAgentAdapter_(a.channel).execute(a, approvalRow, st);
        a.status = r.status === 'DONE' ? 'DONE' : 'BLOCKED'; a.result = r.detail || ''; a.error = r.error || ''; a.executedAt = nowIso;
        v6AuraAgentPut_(st, 'AURA_AGENT_ACTIONS', a);
        if (a.status !== 'DONE') blocked = r.error || 'BLOCKED';
      });
      v6AuraAgentLedger_(st, task, { executionResult: blocked ? 'BLOCKED: ' + blocked : 'DONE: ' + (st.actionsByTask[task.taskId] || []).map(function (a) { return a.actionType + '=' + a.status; }).join(', ') }, nowIso);
      if (blocked) {
        task.blockReason = blocked;
        task.nextAction = blocked === AURA_AGENT_EXTERNAL_DISABLED_ ? 'Internal steps done. Run the send in Campaign Studio (DRY_RUN, then governed GO LIVE).' : '';
        v6AuraAgentMove_(st, task, 'BLOCKED', blocked, nowIso);
      } else v6AuraAgentMove_(st, task, 'VERIFY', 'executed', nowIso);
    } else if (s === 'VERIFY') {
      var ok = (st.actionsByTask[task.taskId] || []).every(function (a) { var v = v6AuraAgentAdapter_(a.channel).verify(a); if (v.verified) { a.verifiedAt = nowIso; v6AuraAgentPut_(st, 'AURA_AGENT_ACTIONS', a); } return v.verified; });
      if (!ok) throw new Error('VERIFY_FAILED');
      v6AuraAgentMove_(st, task, 'MEASURE', 'verified', nowIso);
    } else if (s === 'MEASURE') {
      v6AuraAgentPut_(st, 'AURA_AGENT_METRICS', { metricId: task.taskId + ':actions', runId: st.runId, scope: task.scope, campaignId: task.campaignId || '', metric: 'actionsDone', value: (st.actionsByTask[task.taskId] || []).length, basis: 'AURA_AGENT_ACTIONS', at: nowIso });
      v6AuraAgentLedger_(st, task, { metricResult: 'actionsDone=' + (st.actionsByTask[task.taskId] || []).length }, nowIso);
      v6AuraAgentMove_(st, task, 'NEXT_ACTION', '', nowIso);
    } else if (s === 'NEXT_ACTION') {
      task.nextAction = task.kind === 'FOLLOW_UP' ? 'AM follows up the replied contacts' : task.kind === 'OPPORTUNITY' ? 'Build the campaign in Campaign Studio' :
        task.intent === 'FIND_OPPORTUNITIES' ? 'Say "Run the next ' + String(task.scope || '').toLowerCase().replace('_', '-') + ' campaign" to prepare it' : task.intent === 'MONTHLY_REPORT' ? 'Review the report in Recent results' : '';
      v6AuraAgentLedger_(st, task, { nextAction: task.nextAction }, nowIso);
      v6AuraAgentMove_(st, task, 'COMPLETED', '', nowIso);
    } else return;
  }
}
function v6AuraAgentMeasureCampaign_(action, st) {
  st._perf = st._perf || v6AuraEmailPerformance_();
  var cid = action.preview, s = (st._perf.scopes || {})[cid];
  if (!s) return { status: 'BLOCKED', error: 'CAMPAIGN_NOT_FOUND' };
  var at = new Date().toISOString();
  ['currentRun', 'historical', 'allTime'].forEach(function (scope) {
    ['sent', 'delivered', 'bounced', 'replied', 'opened', 'clicked', 'openRate', 'ctr', 'ctor'].forEach(function (m) {
      v6AuraAgentPut_(st, 'AURA_AGENT_METRICS', { metricId: cid + ':' + at.slice(0, 10) + ':' + scope + ':' + m, runId: st.runId, scope: scope, campaignId: cid, metric: m, value: s[scope][m] == null ? 'NOT_TRACKED' : s[scope][m], basis: m === 'delivered' ? 'SENT_MINUS_BOUNCED' : 'MKT_EMAIL_QUEUE/MKT_EMAIL_EVENTS', at: at });
    });
  });
  return { status: 'DONE', detail: 'measured ' + cid };
}

// ---- Human decisions: records the approval only; execution happens on the next tick ---------
function v6AuraAgentDecide_(payload) {
  var p = payload || {}, id = v6AuraAgentText_(p.approvalId), decision = v6AuraAgentText_(p.decision).toUpperCase();
  if (!id || (decision !== 'APPROVED' && decision !== 'REJECTED')) return { status: 'INVALID_REQUEST' };
  v6AuraAgentEnsureSheets_();
  var row = v6Rows_('AURA_AGENT_APPROVALS').filter(function (a) { return a.approvalId === id; })[0];
  if (!row) return { status: 'NOT_FOUND' };
  if (row.status !== 'PENDING') return { status: 'ALREADY_DECIDED', approval: row };
  var who = ''; try { who = Session.getActiveUser().getEmail(); } catch (e) {}
  Object.assign(row, { status: decision, decidedAt: new Date().toISOString(), decidedBy: who || 'AURA_USER', note: v6AuraAgentText_(p.note).slice(0, 500) });
  v6BatchUpsertByKey_('AURA_AGENT_APPROVALS', ['approvalId'], [row]);
  return { status: 'RECORDED', approval: row };
}

// ---- Trigger --------------------------------------------------------------------------------
function auraAgentTick() {
  var r = v6AuraAgentRunCycle_({ trigger: 'TIME_TRIGGER' });
  if (typeof v6AuraAgentShadowTickLog_ === 'function') { try { v6AuraAgentShadowTickLog_(r); } catch (e) {} }
  return r;
}
function v6AuraAgentTriggerInstalled_() {
  try { return ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'auraAgentTick'; }); } catch (e) { return null; }
}
// Idempotent; called from the command center "Activate" control (never auto-installed).
function v6AuraAgentActivate_() {
  if (v6AuraAgentTriggerInstalled_()) return { status: 'ALREADY_ACTIVE' };
  ScriptApp.newTrigger('auraAgentTick').timeBased().everyHours(1).create();
  return { status: 'ACTIVATED', schedule: 'HOURLY' };
}

// ---- Command center payload ------------------------------------------------------------------
function v6AuraAgentCommandCenter_() {
  var tasks = v6Rows_('AURA_AGENT_TASKS'), approvals = v6Rows_('AURA_AGENT_APPROVALS'), runs = v6Rows_('AURA_AGENT_RUNS'), metrics = v6Rows_('AURA_AGENT_METRICS');
  var apById = {}; approvals.forEach(function (a) { apById[a.approvalId] = a; });
  var decById = {}; v6Rows_('AURA_AGENT_DECISIONS').forEach(function (d) { decById[d.taskId] = d; });
  var planByTask = {}; v6Rows_('AURA_AGENT_ACTIONS').forEach(function (a) { if (a.status === 'DONE' && /^\{/.test(String(a.result || ''))) { try { planByTask[a.taskId] = JSON.parse(a.result); } catch (e) {} } });
  function view(t) { return { taskId: t.taskId, title: t.title, summary: t.summary, scope: t.scope, kind: t.kind, campaignId: t.campaignId, state: t.state, policy: t.policy, priority: Number(t.priority || 99), blockReason: t.blockReason || '', nextAction: t.nextAction || '', approvalId: t.approvalId || '', approvalStatus: (apById[t.approvalId] || {}).status || '', updatedAt: t.updatedAt, intent: t.intent || '', source: t.source || '',
    decision: decById[t.taskId] ? { observed: decById[t.taskId].observed, dataSource: decById[t.taskId].dataSource, rationale: decById[t.taskId].rationale, plannedAction: decById[t.taskId].plannedAction, executionResult: decById[t.taskId].executionResult, metricResult: decById[t.taskId].metricResult } : null,
    result: planByTask[t.taskId] || null }; }
  var all = tasks.map(view).sort(function (a, b) { return a.priority - b.priority || String(b.updatedAt).localeCompare(String(a.updatedAt)); });
  var open = all.filter(function (t) { return !AURA_AGENT_TERMINAL_[t.state]; });
  var lastRun = runs.slice().sort(function (a, b) { return String(b.startedAt).localeCompare(String(a.startedAt)); })[0] || null;
  var latest = metrics.slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); }).slice(0, 40);
  return {
    commands: typeof AURA_AGENT_COMMAND_EXAMPLES_ !== 'undefined' ? AURA_AGENT_COMMAND_EXAMPLES_ : [],
    status: { runtime: v6AuraAgentTriggerInstalled_() ? 'ACTIVE' : 'INACTIVE', schedule: 'HOURLY', lastRun: lastRun, externalExecution: AURA_AGENT_EXTERNAL_DISABLED_, policyModel: ['AUTO', 'REVIEW', 'APPROVAL_REQUIRED', 'BLOCKED'], scopes: AURA_AGENT_SCOPES_.map(function (s) { return { scope: s, source: AURA_AGENT_SCOPE_SOURCES_[s] }; }), channels: AURA_AGENT_CHANNELS_ },
    priorities: open.slice(0, 5),
    opportunities: all.filter(function (t) { return t.kind === 'OPPORTUNITY' && !AURA_AGENT_TERMINAL_[t.state]; }),
    actionQueue: open.filter(function (t) { return ['OBSERVE', 'ANALYZE', 'DECIDE', 'PLAN', 'PREPARE'].indexOf(t.state) >= 0; }),
    waitingApproval: open.filter(function (t) { return t.state === 'APPROVAL'; }),
    running: open.filter(function (t) { return ['EXECUTE', 'VERIFY', 'MEASURE', 'NEXT_ACTION', 'FAILED'].indexOf(t.state) >= 0; }),
    blocked: all.filter(function (t) { return t.state === 'BLOCKED'; }).slice(0, 20),
    completed: all.filter(function (t) { return t.state === 'COMPLETED' || t.state === 'CANCELLED'; }).sort(function (a, b) { return String(b.updatedAt).localeCompare(String(a.updatedAt)); }).slice(0, 10),
    nextBestActions: all.filter(function (t) { return t.nextAction; }).slice(0, 6).map(function (t) { return { taskId: t.taskId, title: t.title, nextAction: t.nextAction, state: t.state }; }),
    recentResults: latest
  };
}

// ---- AURA Command Center bundle (read-only) -----------------------------------------------------
// One request replaces the Overview's 7 calls in 2 sequential waves. Every table is read once per
// execution (v6WithRowsMemo_); the Campaign A audit already embeds matchReport/stoppedBreakdown,
// so they are no longer recomputed by separate calls. A failing section degrades to {error}.
function v6AuraCommandCenterBundle_() {
  var started = Date.now(), sections = {};
  function safe(name, fn) { try { sections[name] = fn(); } catch (err) { sections[name] = { error: String(err && err.message || err) }; } }
  v6WithRowsMemo_(function () {
    safe('agent', function () { return v6AuraAgentCommandCenter_(); });
    safe('performance', function () { return v6AuraEmailPerformance_(); });
    safe('retention', function () { return typeof v6AuraRetentionDashboard_ === 'function' ? v6AuraRetentionDashboard_() : null; });
    safe('campanaA', function () { return typeof v6AuraCampanaAAudit_ === 'function' ? v6AuraCampanaAAudit_() : null; });
    safe('execution', function () { return typeof v6AuraExecutionReport_ === 'function' ? v6AuraExecutionReport_() : null; });
    safe('latestRun', function () { return typeof v6AuraCampanaALatestRunSummary_ === 'function' ? v6AuraCampanaALatestRunSummary_() : null; });
  });
  sections.meta = { generatedAt: new Date().toISOString(), backendMs: Date.now() - started, contract: 'AURA_COMMAND_CENTER_V1' };
  return sections;
}
