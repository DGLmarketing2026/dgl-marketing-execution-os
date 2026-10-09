/**
 * AURA environment separation: PRODUCTION, STAGING and QA.
 *
 * PRODUCTION (default when AURA_ENVIRONMENT is unset): existing resources and behavior, unchanged.
 *   An unmarked project that runs as a different Google account than the production inbox is
 *   refused (AURA_ENVIRONMENT_REQUIRED), so a staging copy that forgot its marker cannot fall back
 *   to production resources.
 * STAGING: a separate Apps Script project running as a separate Google account. Every resource
 *   (mailbox, Data Hub, NOVA report source, Drive folder, triggers, allowed senders) comes from
 *   Script Properties; all are mandatory, validated, and may never point at a production resource.
 *   An incomplete or invalid configuration stops the process. STAGING never sends, publishes or
 *   changes commercial systems (send mode is forced to DRY_RUN; external calls throw) and installs
 *   only allowlisted triggers.
 * QA: the offline Node harness only (tools/aura-e2e). Any Google access is refused.
 */
var AURA_ENV_PROP_ = 'AURA_ENVIRONMENT';
var AURA_ENVS_ = { PRODUCTION: true, STAGING: true, QA: true };
var AURA_STAGING_KEYS_ = ['AURA_STAGING_INBOX', 'AURA_STAGING_DATA_HUB_ID', 'AURA_STAGING_REPORT_SOURCE_ID', 'AURA_STAGING_DRIVE_FOLDER_ID', 'AURA_STAGING_TRIGGERS', 'AURA_GMAIL_ALLOWED_SENDERS'];
var AURA_STAGING_TRIGGER_ALLOWLIST_ = ['auraReportIntakeTick', 'auraAgentTick'];
var AURA_ENV_IDENTITY_ = null; // effective user, resolved once per execution

function v6AuraEnvText_(v) { return String(v == null ? '' : v).trim(); }
function v6AuraEnvProps_() { return PropertiesService.getScriptProperties(); }
function v6AuraEnv_() {
  var raw = v6AuraEnvText_(v6AuraEnvProps_().getProperty(AURA_ENV_PROP_)).toUpperCase();
  if (!raw) return 'PRODUCTION';
  if (!AURA_ENVS_[raw]) throw new Error('AURA_ENVIRONMENT_INVALID');
  return raw;
}
function v6AuraIsProduction_() { return v6AuraEnv_() === 'PRODUCTION'; }
function v6AuraEffectiveUser_() {
  if (AURA_ENV_IDENTITY_ === null) { try { AURA_ENV_IDENTITY_ = v6AuraEnvText_(Session.getEffectiveUser().getEmail()).toLowerCase(); } catch (e) { AURA_ENV_IDENTITY_ = ''; } }
  return AURA_ENV_IDENTITY_;
}
// Production identity and resources (existing values; never changed here).
function v6AuraProductionInbox_() { return typeof AURA_REPORT_INBOX_ !== 'undefined' ? String(AURA_REPORT_INBOX_).toLowerCase() : ''; }
function v6AuraProductionIds_() {
  var ids = [];
  if (typeof MKT_V6_DATA_HUB_ID !== 'undefined') ids.push(MKT_V6_DATA_HUB_ID);
  if (typeof MKT_V6_REPORT_SOURCE_ID !== 'undefined') ids.push(MKT_V6_REPORT_SOURCE_ID);
  if (typeof CAMPANA_A_SOURCE_SPREADSHEET_ID_DEFAULT_ !== 'undefined') ids.push(CAMPANA_A_SOURCE_SPREADSHEET_ID_DEFAULT_);
  if (typeof MKT_V6_ARCHIVE !== 'undefined') Object.keys(MKT_V6_ARCHIVE).forEach(function (k) { ids.push(MKT_V6_ARCHIVE[k]); });
  if (typeof MKT_V55 !== 'undefined' && MKT_V55.HUB_ID) ids.push(MKT_V55.HUB_ID);
  return ids.map(v6AuraEnvText_).filter(Boolean);
}
function v6AuraEnvList_(v) { return v6AuraEnvText_(v).split(',').map(function (s) { return v6AuraEnvText_(s); }).filter(Boolean); }

// STAGING configuration: complete, well-formed, distinct, isolated from production, or nothing runs.
function v6AuraStagingConfig_() {
  var p = v6AuraEnvProps_(), get = function (k) { return v6AuraEnvText_(p.getProperty(k)); };
  var missing = AURA_STAGING_KEYS_.filter(function (k) { return !get(k); });
  if (missing.length) throw new Error('STAGING_CONFIG_INCOMPLETE: ' + missing.join(', '));
  var cfg = {
    inbox: get('AURA_STAGING_INBOX').toLowerCase(), dataHubId: get('AURA_STAGING_DATA_HUB_ID'), reportSourceId: get('AURA_STAGING_REPORT_SOURCE_ID'),
    driveFolderId: get('AURA_STAGING_DRIVE_FOLDER_ID'), triggers: v6AuraEnvList_(get('AURA_STAGING_TRIGGERS')),
    allowedSenders: v6AuraEnvList_(get('AURA_GMAIL_ALLOWED_SENDERS').toLowerCase())
  };
  var prodIds = v6AuraProductionIds_(), prodInbox = v6AuraProductionInbox_();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cfg.inbox)) throw new Error('STAGING_CONFIG_INVALID: AURA_STAGING_INBOX');
  [['AURA_STAGING_DATA_HUB_ID', cfg.dataHubId], ['AURA_STAGING_REPORT_SOURCE_ID', cfg.reportSourceId], ['AURA_STAGING_DRIVE_FOLDER_ID', cfg.driveFolderId]].forEach(function (kv) {
    if (!/^[A-Za-z0-9_-]{20,}$/.test(kv[1])) throw new Error('STAGING_CONFIG_INVALID: ' + kv[0]);
    if (prodIds.indexOf(kv[1]) >= 0) throw new Error('STAGING_USES_PRODUCTION_RESOURCE: ' + kv[0]);
  });
  if (cfg.dataHubId === cfg.reportSourceId || cfg.dataHubId === cfg.driveFolderId || cfg.reportSourceId === cfg.driveFolderId) throw new Error('STAGING_CONFIG_INVALID: resources must be distinct');
  if (!cfg.triggers.every(function (h) { return AURA_STAGING_TRIGGER_ALLOWLIST_.indexOf(h) >= 0; })) throw new Error('STAGING_CONFIG_INVALID: AURA_STAGING_TRIGGERS');
  if (prodInbox && (cfg.inbox === prodInbox || cfg.allowedSenders.indexOf(prodInbox) >= 0)) throw new Error('STAGING_USES_PRODUCTION_RESOURCE: production inbox');
  // No other Script Property may carry a production resource (e.g. properties copied from production).
  var all = p.getProperties ? p.getProperties() : {};
  Object.keys(all).forEach(function (k) {
    var v = v6AuraEnvText_(all[k]), lower = v.toLowerCase();
    if (prodIds.some(function (id) { return v.indexOf(id) >= 0; }) || (prodInbox && lower.indexOf(prodInbox) >= 0)) throw new Error('STAGING_USES_PRODUCTION_RESOURCE: ' + k);
  });
  if (String(p.getProperty('AURA_SEND_MODE') || '').toUpperCase() === 'LIVE') throw new Error('STAGING_LIVE_BLOCKED');
  var me = v6AuraEffectiveUser_();
  if (!me) throw new Error('EXECUTION_IDENTITY_REQUIRED');
  if (prodInbox && me === prodInbox) throw new Error('STAGING_RUNS_AS_PRODUCTION_ACCOUNT');
  if (me !== cfg.inbox) throw new Error('STAGING_ACCOUNT_MISMATCH');
  return cfg;
}

// Gate for every Google data access (Sheets, Drive, Gmail intake, triggers).
function v6AuraAssertGoogleAccess_() {
  var env = v6AuraEnv_();
  if (env === 'QA') throw new Error('QA_GOOGLE_ACCESS_BLOCKED');
  if (env === 'STAGING') { v6AuraStagingConfig_(); return env; }
  var marked = !!v6AuraEnvText_(v6AuraEnvProps_().getProperty(AURA_ENV_PROP_)), me = v6AuraEffectiveUser_(), prodInbox = v6AuraProductionInbox_();
  if (!marked && me && prodInbox && me !== prodInbox) throw new Error('AURA_ENVIRONMENT_REQUIRED');
  return env;
}
// Resource ids per environment. PRODUCTION returns the existing ids; DRIVE_FOLDER is '' there
// (callers keep their existing production folder logic).
function v6AuraResourceId_(kind) {
  var env = v6AuraAssertGoogleAccess_();
  if (env === 'PRODUCTION') {
    if (kind === 'DATA_HUB') return MKT_V6_DATA_HUB_ID;
    if (kind === 'REPORT_SOURCE') return MKT_V6_REPORT_SOURCE_ID;
    if (kind === 'DRIVE_FOLDER') return '';
    throw new Error('UNKNOWN_RESOURCE ' + kind);
  }
  var c = v6AuraStagingConfig_();
  var id = { DATA_HUB: c.dataHubId, REPORT_SOURCE: c.reportSourceId, DRIVE_FOLDER: c.driveFolderId }[kind];
  if (!id) throw new Error('UNKNOWN_RESOURCE ' + kind);
  return id;
}
// A resource id taken from data or a property: refused outside PRODUCTION when it is a production one.
function v6AuraAssertNotProductionResource_(id, label) {
  if (v6AuraEnv_() !== 'PRODUCTION' && v6AuraProductionIds_().indexOf(v6AuraEnvText_(id)) >= 0) throw new Error('STAGING_USES_PRODUCTION_RESOURCE: ' + (label || 'resource'));
  return id;
}
// External effects (customer email, CRM, CMS publishing, legacy NOVA import): PRODUCTION only.
function v6AuraAssertExternalAllowed_(action) {
  var env = v6AuraEnv_();
  if (env !== 'PRODUCTION') throw new Error(env + '_EXTERNAL_BLOCKED: ' + action);
}
// Every time trigger is created through here. STAGING: only allowlisted, configured handlers.
function v6AuraNewTrigger_(handler) {
  var env = v6AuraAssertGoogleAccess_();
  if (env === 'STAGING' && v6AuraStagingConfig_().triggers.indexOf(handler) < 0) throw new Error('STAGING_TRIGGER_BLOCKED: ' + handler);
  return ScriptApp.newTrigger(handler);
}
// Operator check (no side effects): run in the staging project before any activation.
function AURA_STAGING_CHECK() {
  try {
    var env = v6AuraEnv_();
    if (env !== 'STAGING') return { status: 'NOT_STAGING', environment: env };
    var c = v6AuraStagingConfig_();
    return { status: 'STAGING_READY', inbox: c.inbox, triggers: c.triggers, allowedSenders: c.allowedSenders.length, sendMode: 'DRY_RUN (forced)', external: 'BLOCKED' };
  } catch (err) { return { status: 'STAGING_BLOCKED', error: String(err && err.message || err) }; }
}
