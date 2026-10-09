// AURA environment separation (synthetic data only): PRODUCTION keeps its resources; STAGING runs
// only with a complete, isolated configuration, never touches production resources, never sends,
// publishes or changes commercial systems, and installs only allowlisted triggers; QA has no Google.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const V6 = n => fs.readFileSync(path.join(root, 'backend/apps-script-v6', n), 'utf8');
const PROD_HUB = '1FXpoBO658ldbr4V8wCKo0luHU3_kqHwYzAnWijA6lBM', PROD_NOVA = '1XPZC_VUPLsmta--MPXi4MHswz9oiYxKbiq58a_khPp4', PROD_INBOX = 'info@' + 'dglus.com';
const STAGING_INBOX = 'aura-staging@staging.example.test';
const STAGING = { AURA_ENVIRONMENT: 'STAGING', AURA_STAGING_INBOX: STAGING_INBOX, AURA_STAGING_DATA_HUB_ID: 'STAGING_SYNTHETIC_DATA_HUB_0001', AURA_STAGING_REPORT_SOURCE_ID: 'STAGING_SYNTHETIC_NOVA_SOURCE_01', AURA_STAGING_DRIVE_FOLDER_ID: 'STAGING_SYNTHETIC_DRIVE_FOLDER_1', AURA_STAGING_TRIGGERS: 'auraReportIntakeTick,auraAgentTick', AURA_GMAIL_ALLOWED_SENDERS: 'am-lead@staging.example.test', AURA_SEND_MODE: 'DRY_RUN' };

function load(props, user) {
  const opened = [], created = [], sent = [];
  const ctx = {
    console: { log() {} }, Date, Math, Number, String, Object, Array, JSON, Error, RegExp,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), getProperties: () => Object.assign({}, props), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; } }) },
    Session: { getEffectiveUser: () => ({ getEmail: () => user }), getActiveUser: () => ({ getEmail: () => user }) },
    SpreadsheetApp: { openById: id => { opened.push(id); return { getSheetByName: () => ({ getDataRange: () => ({ getValues: () => [['h']] }) }), getSheets: () => [] }; } },
    DriveApp: { getFileById: id => { opened.push(id); return { getLastUpdated: () => new Date() }; } },
    ScriptApp: { getProjectTriggers: () => [], deleteTrigger() {}, newTrigger: h => { created.push(h); return { timeBased: () => ({ everyHours: () => ({ create: () => ({}) }) }) }; } },
    GmailApp: { sendEmail: () => sent.push('gmail'), search: () => [] }, LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) }
  };
  vm.createContext(ctx);
  ['MarketingV6AuraEnvironment.gs', 'MarketingV6OpportunityEngine.gs', 'MarketingV6ReportIngestion.gs', 'MarketingV6AuraGmailIngest.gs', 'MarketingV6AuraEmailDispatcher.gs', 'MarketingV6DriveArchive.gs', 'MarketingV6AcquisitionWordPress.gs', 'MarketingV6AuraCampanaA.gs']
    .forEach(n => vm.runInContext(V6(n), ctx, { filename: n }));
  return { ctx, opened, created, sent };
}
let n = 0; const ok = m => { n++; console.log('PASS ' + m); };

// 1. PRODUCTION (unset marker, production account): existing resources unchanged.
(function () {
  const { ctx, opened } = load({}, PROD_INBOX);
  ctx.v6Sheet_('MKT_OPPORTUNITIES'); ctx.v6ReportRows_('Retention');
  assert.deepEqual(opened, [PROD_HUB, PROD_NOVA]);
  assert.equal(ctx.v6AuraReportInbox_(), PROD_INBOX); assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN');
  assert.equal(ctx.v6ArchiveFolderId_('csv'), ctx.MKT_V6_ARCHIVE.csv);
  ok('PRODUCTION keeps the existing Data Hub, NOVA source, inbox, archive folders and send mode');
})();

// 2. A project without the marker running as another account is refused (forgotten staging marker).
(function () {
  const { ctx, opened } = load({}, STAGING_INBOX);
  assert.throws(() => ctx.v6Sheet_('MKT_OPPORTUNITIES'), /AURA_ENVIRONMENT_REQUIRED/); assert.equal(opened.length, 0);
  assert.throws(() => load({ AURA_ENVIRONMENT: 'STAGNG' }, STAGING_INBOX).ctx.v6Sheet_('X'), /AURA_ENVIRONMENT_INVALID/);
  ok('unmarked or misspelled environment never falls back to production resources');
})();

// 3. Incomplete or unsafe STAGING configuration stops everything before any access.
(function () {
  const cases = [
    [{ AURA_STAGING_DATA_HUB_ID: '' }, /STAGING_CONFIG_INCOMPLETE: AURA_STAGING_DATA_HUB_ID/],
    [{ AURA_STAGING_TRIGGERS: '' }, /STAGING_CONFIG_INCOMPLETE: AURA_STAGING_TRIGGERS/],
    [{ AURA_STAGING_DATA_HUB_ID: PROD_HUB }, /STAGING_USES_PRODUCTION_RESOURCE: AURA_STAGING_DATA_HUB_ID/],
    [{ AURA_STAGING_REPORT_SOURCE_ID: PROD_NOVA }, /STAGING_USES_PRODUCTION_RESOURCE: AURA_STAGING_REPORT_SOURCE_ID/],
    [{ AURA_STAGING_DRIVE_FOLDER_ID: '1Har0llISmGa4oUDqqcathCXzMZVyyg13' }, /STAGING_USES_PRODUCTION_RESOURCE: AURA_STAGING_DRIVE_FOLDER_ID/],
    [{ AURA_STAGING_INBOX: PROD_INBOX }, /STAGING_USES_PRODUCTION_RESOURCE: production inbox/],
    [{ AURA_GMAIL_ALLOWED_SENDERS: 'a@staging.example.test,' + PROD_INBOX }, /STAGING_USES_PRODUCTION_RESOURCE: production inbox/],
    [{ MKT_DATA_HUB_ID: PROD_HUB }, /STAGING_USES_PRODUCTION_RESOURCE: MKT_DATA_HUB_ID/],
    [{ AURA_GMAIL_SOURCE_MAILBOX: PROD_INBOX }, /STAGING_USES_PRODUCTION_RESOURCE: AURA_GMAIL_SOURCE_MAILBOX/],
    [{ AURA_STAGING_REPORT_SOURCE_ID: 'STAGING_SYNTHETIC_DATA_HUB_0001' }, /resources must be distinct/],
    [{ AURA_STAGING_DATA_HUB_ID: 'short' }, /STAGING_CONFIG_INVALID: AURA_STAGING_DATA_HUB_ID/],
    [{ AURA_STAGING_TRIGGERS: 'auraReportIntakeTick,processEmailQueue' }, /STAGING_CONFIG_INVALID: AURA_STAGING_TRIGGERS/],
    [{ AURA_SEND_MODE: 'LIVE' }, /STAGING_LIVE_BLOCKED/]
  ];
  cases.forEach(([patch, re]) => {
    const { ctx, opened } = load(Object.assign({}, STAGING, patch), STAGING_INBOX);
    assert.throws(() => ctx.v6Sheet_('MKT_OPPORTUNITIES'), re, JSON.stringify(patch));
    assert.throws(() => ctx.v6AuraGmailIngestTick_(), re);
    assert.equal(opened.length, 0, 'nothing opened: ' + JSON.stringify(patch));
    assert.equal(ctx.AURA_STAGING_CHECK().status, 'STAGING_BLOCKED');
  });
  assert.throws(() => load(STAGING, PROD_INBOX).ctx.v6Sheet_('X'), /STAGING_RUNS_AS_PRODUCTION_ACCOUNT/);
  assert.throws(() => load(STAGING, 'other@staging.example.test').ctx.v6Sheet_('X'), /STAGING_ACCOUNT_MISMATCH/);
  assert.throws(() => load(STAGING, '').ctx.v6Sheet_('X'), /EXECUTION_IDENTITY_REQUIRED/);
  ok('incomplete, invalid or production-pointing STAGING configuration blocks every access (' + (cases.length + 3) + ' cases)');
})();

// 4. Valid STAGING: only staging resources; no sends, publishing, CRM, Campaign A or unlisted triggers.
(function () {
  const { ctx, opened, created, sent } = load(Object.assign({}, STAGING), STAGING_INBOX);
  assert.equal(ctx.AURA_STAGING_CHECK().status, 'STAGING_READY');
  ctx.v6Sheet_('MKT_OPPORTUNITIES'); ctx.v6ReportRows_('Retention');
  assert.deepEqual(opened, [STAGING.AURA_STAGING_DATA_HUB_ID, STAGING.AURA_STAGING_REPORT_SOURCE_ID]);
  assert.equal(ctx.v6AuraReportInbox_(), STAGING_INBOX);
  assert.deepEqual(Array.from(ctx.v6AuraGmailTrustedDomains_()), [], 'no implicit domain trust in STAGING');
  assert.equal(ctx.v6ArchiveFolderId_('csv'), STAGING.AURA_STAGING_DRIVE_FOLDER_ID);
  assert.equal(ctx.v6AuraSendMode_(), 'DRY_RUN');
  assert.throws(() => ctx.auraEnableLiveSending(), /STAGING_LIVE_BLOCKED/);
  assert.throws(() => ctx.v6AuraAssertExternalAllowed_('GMAIL_SEND'), /STAGING_EXTERNAL_BLOCKED: GMAIL_SEND/);
  assert.throws(() => ctx.v6AcqWpConfig_(), /STAGING_EXTERNAL_BLOCKED: WORDPRESS/);
  assert.throws(() => ctx.v6AuraCampanaAResolveSourceSpreadsheetId_(), /STAGING_EXTERNAL_BLOCKED: CAMPANA_A_SOURCE/);
  assert.throws(() => ctx.v6AuraGmailSheetLinkTables_('https://docs.google.com/spreadsheets/d/' + PROD_HUB + '/edit'), /STAGING_USES_PRODUCTION_RESOURCE: sheet link/);
  ctx.v6AuraNewTrigger_('auraReportIntakeTick');
  ['processEmailQueue', 'runDailyAutomation', 'importMarketingFromNovaExport', 'v6AcqAutomationTick_', 'auraProcessEmailQueue'].forEach(h => assert.throws(() => ctx.v6AuraNewTrigger_(h), /STAGING_TRIGGER_BLOCKED/));
  assert.deepEqual(created, ['auraReportIntakeTick']); assert.equal(sent.length, 0);
  assert(!opened.some(id => [PROD_HUB, PROD_NOVA].includes(id)), 'no production id opened');
  ok('valid STAGING uses only staging resources and blocks sends, LIVE, WordPress, Campaign A, production links and unlisted triggers');
})();

// 5. QA: no Google access at all.
(function () {
  const { ctx, opened } = load({ AURA_ENVIRONMENT: 'QA' }, PROD_INBOX);
  assert.throws(() => ctx.v6Sheet_('X'), /QA_GOOGLE_ACCESS_BLOCKED/); assert.throws(() => ctx.v6AuraNewTrigger_('auraAgentTick'), /QA_GOOGLE_ACCESS_BLOCKED/);
  assert.throws(() => ctx.v6AuraSendMode_(), /QA_DISPATCH_BLOCKED/); assert.equal(opened.length, 0);
  ok('QA cannot reach Google, triggers or dispatch');
})();

// 6. Static coverage of every deployed file: guarded sends, guarded triggers, no direct production ids.
(function () {
  const dirs = ['backend/apps-script-v6', 'backend/apps-script-live-core', 'backend/apps-script-legacy-v55'];
  const files = dirs.flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith('.gs')).map(f => path.join(d, f)));
  files.forEach(f => {
    const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/^\s*\/\//.test(l)) return;
      if (/GmailApp\.sendEmail\(|MailApp\.sendEmail\(/.test(l)) assert(/v6AuraAssertExternalAllowed_\('GMAIL_SEND'\)|v6AuraAssertExternalAllowed_\("GMAIL_SEND"\)/.test(lines[i - 1] + lines[i - 2]), f + ':' + (i + 1) + ' send without environment guard');
      if (/ScriptApp\.newTrigger\(/.test(l)) assert(/MarketingV6AuraEnvironment\.gs$/.test(f), f + ':' + (i + 1) + ' trigger outside v6AuraNewTrigger_');
      if (/openById\((MKT_V6_DATA_HUB_ID|MKT_V6_REPORT_SOURCE_ID|MKT_V55\.HUB_ID)\)|getFileById\(MKT_V6_REPORT_SOURCE_ID\)|MKT_V6_ARCHIVE\.(csv|html|copy|results)/.test(l)) assert.fail(f + ':' + (i + 1) + ' direct production resource');
    });
  });
  ok('every send and trigger in ' + files.length + ' deployed files goes through the environment guard; no direct production ids');
})();

// 7. OAuth: the staging manifest asks for the minimum; production manifest untouched.
(function () {
  const staging = JSON.parse(fs.readFileSync(path.join(root, 'backend/apps-script-manifest/appsscript.staging.json'), 'utf8'));
  assert.deepEqual(staging.oauthScopes, ['https://mail.google.com/', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/script.scriptapp', 'https://www.googleapis.com/auth/userinfo.email']);
  ['script.send_mail', 'script.external_request', 'auth/drive"'].forEach(s => assert(!JSON.stringify(staging.oauthScopes).includes(s), s));
  assert(!staging.webapp, 'staging exposes no web app');
  const prod = JSON.parse(fs.readFileSync(path.join(root, 'backend/apps-script-manifest/appsscript.json'), 'utf8'));
  assert(!prod.oauthScopes && prod.webapp, 'production manifest unchanged');
  ok('staging manifest: 5 explicit scopes (no send_mail, no external_request, drive.file only, no web app); production manifest untouched');
})();

console.log(n + '/' + n + ' AURA staging isolation checks passed');
