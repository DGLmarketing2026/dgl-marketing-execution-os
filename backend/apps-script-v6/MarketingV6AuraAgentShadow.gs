/**
 * AURA Agent SHADOW MODE activation (operator tooling, run once from the Apps Script editor).
 *
 * Shadow mode = the hourly agent observes, analyzes, decides, plans, prepares, creates tasks,
 * decisions and approval requests, and updates the Command Center. It never sends, publishes
 * or writes customer-facing data: external execution is disabled in Agent Runtime V1 and this
 * function aborts if AURA_SEND_MODE is LIVE.
 *
 * AURA_AGENT_SHADOW_ACTIVATE():
 *   1. refuses to run unless AURA_SEND_MODE is DRY_RUN (or unset);
 *   2. keeps exactly ONE hourly auraAgentTick trigger (removes duplicates, installs if missing);
 *   3. runs ONE controlled initial tick;
 *   4. proves no queue/SENT change and no external action, and writes a compact report (no PII)
 *      to the standalone AURA_AGENT_SHADOW_REPORT spreadsheet.
 */
var AURA_AGENT_MODE_PROP_ = 'AURA_AGENT_MODE';
var AURA_AGENT_SHADOW_REPORT_PROP_ = 'AURA_AGENT_SHADOW_REPORT_ID';

function v6AuraAgentShadowQueueSnapshot_() {
  // Projected read (no htmlBody): the safety snapshot must not itself hit the Data Hub timeout.
  var q = typeof v6WithRowsMemo_ === 'function' ? v6WithRowsMemo_(function () { return v6Rows_('MKT_EMAIL_QUEUE'); }, AURA_AGENT_MEMO_OPTIONS_) : v6Rows_('MKT_EMAIL_QUEUE'), sent = 0, campaignA = 0, statuses = {};
  q.forEach(function (r) {
    var s = String(r.status || '').toUpperCase(); statuses[s] = (statuses[s] || 0) + 1;
    if (s === 'SENT') { sent++; if (typeof CAMPANA_A_CAMPAIGN_ID_ !== 'undefined' && r.campaignId === CAMPANA_A_CAMPAIGN_ID_) campaignA++; }
  });
  return { rows: q.length, sent: sent, campaignASent: campaignA, statuses: statuses };
}
function v6AuraAgentShadowEnsureSingleTrigger_() {
  var ticks = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'auraAgentTick'; });
  for (var i = 1; i < ticks.length; i++) ScriptApp.deleteTrigger(ticks[i]);
  if (!ticks.length) ScriptApp.newTrigger('auraAgentTick').timeBased().everyHours(1).create();
  return ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'auraAgentTick'; }).length;
}
function v6AuraAgentShadowReport_(data) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(AURA_AGENT_SHADOW_REPORT_PROP_), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create('AURA_AGENT_SHADOW_REPORT'); ss.getSheets()[0].getRange(1, 1, 1, 3).setValues([['at', 'section', 'json']]); props.setProperty(AURA_AGENT_SHADOW_REPORT_PROP_, ss.getId()); }
  ss.getSheets()[0].appendRow([new Date().toISOString(), data.section || 'SHADOW', JSON.stringify(data)]);
}

function AURA_AGENT_SHADOW_ACTIVATE() {
  var props = PropertiesService.getScriptProperties(), out = { section: 'SHADOW_ACTIVATION' };
  try {
    var sendMode = String(props.getProperty('AURA_SEND_MODE') || 'DRY_RUN').toUpperCase();
    out.sendModeBefore = sendMode;
    if (sendMode === 'LIVE') throw new Error('ABORTED_SEND_MODE_IS_LIVE');
    var before = v6AuraAgentRetry_(v6AuraAgentShadowQueueSnapshot_);
    props.setProperty(AURA_AGENT_MODE_PROP_, 'SHADOW');
    out.initialRun = v6AuraAgentRunCycle_({ trigger: 'SHADOW_INITIAL' });
    if (out.initialRun.status === 'COMPLETED') out.hourlyTriggers = v6AuraAgentShadowEnsureSingleTrigger_();
    else { ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'auraAgentTick') ScriptApp.deleteTrigger(t); }); out.hourlyTriggers = 0; out.recovery = 'RUNTIME_PAUSED_UNTIL_A_CYCLE_COMPLETES'; }
    var after = v6AuraAgentRetry_(v6AuraAgentShadowQueueSnapshot_);
    var tasks = v6Rows_('AURA_AGENT_TASKS'), actions = v6Rows_('AURA_AGENT_ACTIONS');
    var byState = {}, byKind = {}; tasks.forEach(function (t) { byState[t.state] = (byState[t.state] || 0) + 1; byKind[t.kind] = (byKind[t.kind] || 0) + 1; });
    var cc = v6AuraAgentCommandCenter_();
    out.tables = {};
    ['AURA_AGENT_RUNS', 'AURA_AGENT_TASKS', 'AURA_AGENT_DECISIONS', 'AURA_AGENT_ACTIONS', 'AURA_AGENT_APPROVALS', 'AURA_AGENT_EVENTS', 'AURA_AGENT_MEMORY', 'AURA_AGENT_METRICS'].forEach(function (n) { out.tables[n] = v6Rows_(n).length; });
    out.tasksByState = byState; out.tasksByKind = byKind;
    out.opportunities = cc.opportunities.map(function (t) { return { title: t.title, scope: t.scope, state: t.state, plan: t.result && t.result.plan ? { recipients: t.result.plan.contacts.recipients, accounts: t.result.plan.eligibleAccounts, languages: t.result.plan.languages, creativeSystem: t.result.plan.creativeSystem } : null, blockReason: t.blockReason }; });
    out.waitingApproval = cc.waitingApproval.map(function (t) { return { title: t.title, policy: t.policy, approvalId: t.approvalId }; });
    out.blocked = cc.blocked.map(function (t) { return { title: t.title, reason: t.blockReason }; });
    out.nextBestActions = cc.nextBestActions;
    out.externalActionsExecuted = actions.filter(function (a) { return String(a.external) === 'true' && a.status === 'DONE'; }).length;
    out.queue = { before: before, after: after, unchanged: JSON.stringify(before) === JSON.stringify(after) };
    out.sendModeAfter = String(props.getProperty('AURA_SEND_MODE') || 'DRY_RUN').toUpperCase();
    out.status = out.queue.unchanged && out.externalActionsExecuted === 0 && out.sendModeAfter !== 'LIVE' ? 'SHADOW_ACTIVE' : 'SHADOW_CHECK_FAILED';
  } catch (err) {
    out.status = 'FAILED'; out.error = String(err && err.message || err);
  }
  console.log('AURA_AGENT_SHADOW ' + JSON.stringify(out));
  try { v6AuraAgentShadowReport_(out); } catch (e) { console.log('REPORT_WRITE_FAILED ' + e); }
  return out;
}

// Compact per-tick audit line in the shadow report (only once shadow mode was activated).
function v6AuraAgentShadowTickLog_(r) {
  if (!PropertiesService.getScriptProperties().getProperty(AURA_AGENT_SHADOW_REPORT_PROP_)) return;
  var run = (r && r.run) || {};
  v6AuraAgentShadowReport_({ section: 'TICK', status: r && r.status, runId: run.runId, tasksCreated: run.tasksCreated, tasksAdvanced: run.tasksAdvanced, tasksCompleted: run.tasksCompleted, tasksBlocked: run.tasksBlocked, tasksFailed: run.tasksFailed, error: (r && r.error) || run.error || '' });
}
