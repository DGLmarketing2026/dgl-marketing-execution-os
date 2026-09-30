// Regression (real Campaign A DRY_RUN, after PR #15): 139 WOULD_SEND jobs were all BLOCKED with
// GOVERNED_RENDER_CONTRACT_MISSING because the production MKT_EMAIL_QUEUE sheet had no
// renderContract (or templateId) column: v6BatchUpsertByKey_ writes only existing headers, so the
// field was silently dropped and dispatch correctly failed closed. Both canonical schemas now
// declare the governed job columns, appended after every existing column.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
class Sheet {
  constructor(rows) { this.rows = (rows || []).map(r => r.slice()); }
  getLastColumn() { return this.rows.reduce((n, r) => Math.max(n, r.length), 0); }
  getLastRow() { return this.rows.length; }
  setFrozenRows() {}
  getRange(row, col, numRows, numCols) {
    const self = this;
    return {
      getValues() { const out = []; for (let r = 0; r < numRows; r++) { const line = []; for (let c = 0; c < numCols; c++) line.push((self.rows[row - 1 + r] || [])[col - 1 + c] ?? ''); out.push(line); } return out; },
      setValues(values) { for (let r = 0; r < numRows; r++) { while (self.rows.length < row + r) self.rows.push([]); for (let c = 0; c < numCols; c++) self.rows[row - 1 + r][col - 1 + c] = values[r][c]; } },
      setFontWeight() { return this; }
    };
  }
}
const GOVERNED = ['templateId', 'renderContract'];
// The production MKT_EMAIL_QUEUE header before this fix, with real-shaped historical rows.
const LIVE_QUEUE_HEADERS = ['jobId', 'campaignId', 'audienceId', 'accountId', 'contactId', 'email', 'firstName', 'company', 'service', 'subject', 'htmlBody', 'replyTo', 'status', 'gmailDraftId', 'createdAt', 'processedAt', 'error', 'requestId', 'amOwner', 'playbookId', 'sequenceStep', 'scheduledAt', 'approvalId', 'approvedAt', 'approvedBy', 'stopOnResponse', 'country', 'preferredLanguage', 'languageSource', 'languageReason', 'stopReasonStage', 'stopReasonAt', 'stopReasonCampaignId', 'stopOverrideApplied', 'stopOverrideReason', 'recipientSource', 'creativeId', 'creativeVersion', 'creativeApprovalId', 'htmlChecksum', 'recipientRenderedChecksum', 'recipientContentChecksum'];
function historicalRows() {
  const rows = [];
  for (let i = 0; i < 109; i++) rows.push(LIVE_QUEUE_HEADERS.map(h => h === 'jobId' ? 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:HS' + i + ':1' : h === 'status' ? 'SENT' : h === 'playbookId' ? 'Retention' : h === 'htmlBody' ? '<p>Immutable ' + i + '</p>' : h === 'sequenceStep' ? 1 : h + '-' + i));
  for (let i = 0; i < 20; i++) rows.push(LIVE_QUEUE_HEADERS.map(h => h === 'jobId' ? 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:ACTIVATION:C' + i + ':1' : h === 'status' ? 'BLOCKED' : h === 'playbookId' ? 'Activation' : h + '-A' + i));
  return rows;
}

// 1. v6 additive migration (MarketingV6SchemaMigration.gs).
(function v6MigrationTest() {
  const ctx = { String, Number, Object, Array, Error, JSON };
  vm.createContext(ctx);
  vm.runInContext(read('backend/apps-script-v6/MarketingV6SchemaMigration.gs'), ctx);
  const schema = ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA.MKT_EMAIL_QUEUE;
  assert.deepEqual(schema.slice(0, LIVE_QUEUE_HEADERS.length), LIVE_QUEUE_HEADERS, 'existing columns keep their order');
  GOVERNED.forEach(h => assert(schema.includes(h), h + ' declared'));
  assert.equal(new Set(schema).size, schema.length);
  const sheets = {};
  Object.keys(ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA).forEach(name => { sheets[name] = new Sheet([ctx.MKT_V6_CONTACT_RECIPIENT_SCHEMA[name]]); });
  sheets.MKT_EMAIL_EVENTS = new Sheet([]);
  sheets.MKT_EMAIL_QUEUE = new Sheet([LIVE_QUEUE_HEADERS].concat(historicalRows()));
  ctx.v6Sheet_ = name => sheets[name] || null;
  const dataBefore = JSON.stringify(sheets.MKT_EMAIL_QUEUE.rows.slice(1));
  const first = ctx.v6EnsureContactRecipientSchema_();
  assert.equal(first.status, 'SCHEMA READY');
  const headers = sheets.MKT_EMAIL_QUEUE.rows[0];
  assert.deepEqual(headers.slice(0, LIVE_QUEUE_HEADERS.length), LIVE_QUEUE_HEADERS, 'no existing column moved');
  GOVERNED.forEach(h => assert(headers.indexOf(h) >= LIVE_QUEUE_HEADERS.length, h + ' appended after existing columns'));
  assert.equal(JSON.stringify(sheets.MKT_EMAIL_QUEUE.rows.slice(1).map(r => r.slice(0, LIVE_QUEUE_HEADERS.length))), dataBefore, 'historical rows byte-for-byte unchanged');
  const second = ctx.v6EnsureContactRecipientSchema_();
  assert.deepEqual([second.columnsAdded, second.tablesUpdated], [0, 0], 'repeated migration is idempotent');
  assert.deepEqual(sheets.MKT_EMAIL_QUEUE.rows[0], headers);

  // Root cause closed: the real batch writer now persists renderContract/templateId, and the
  // governed dispatch check can read them back.
  const freq = { String, Number, Object, Array, Error, Math, Date, v6Sheet_: ctx.v6Sheet_ };
  vm.createContext(freq);
  vm.runInContext(read('backend/apps-script-v6/MarketingV6FrequencyControl.gs'), freq);
  const record = {}; headers.forEach(h => { record[h] = ''; });
  Object.assign(record, { jobId: 'JOB:CMP-CAMPANA-A-HA-PRIORITARIA:ACTIVATION:C0:1', status: 'PENDING', playbookId: 'Activation', templateId: 'editorial-white', renderContract: 'GOVERNED_TOKEN_MERGE_V1' });
  freq.v6BatchUpsertByKey_('MKT_EMAIL_QUEUE', ['jobId'], [record]);
  const row = sheets.MKT_EMAIL_QUEUE.rows.find(r => r[0] === record.jobId);
  assert.equal(row[headers.indexOf('renderContract')], 'GOVERNED_TOKEN_MERGE_V1');
  assert.equal(row[headers.indexOf('templateId')], 'editorial-white');
  assert.equal(JSON.stringify(sheets.MKT_EMAIL_QUEUE.rows.slice(1, 110).map(r => r.slice(0, LIVE_QUEUE_HEADERS.length))), JSON.stringify(JSON.parse(dataBefore).slice(0, 109)), '109 Retention SENT rows unchanged');
  console.log('email-queue render-contract schema test 1 (v6 migration appends governed columns, preserves history, idempotent): PASS');
})();

// 2. Live-core Data Hub schema (MarketingDataHub.gs) declares the same columns, append-only.
(function dataHubSetupTest() {
  const legacy = LIVE_QUEUE_HEADERS.slice(0, 17);
  const queue = new Sheet([legacy, legacy.map(h => 'old-' + h)]);
  const sheets = { MKT_EMAIL_QUEUE: queue };
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = new Sheet([])), getId: () => 'HUB', getUrl: () => 'url' };
  const ctx = {
    String, Number, Object, Array, Error, Math, JSON,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'HUB', setProperty() {} }) },
    SpreadsheetApp: { openById: () => ss, create: () => ss }
  };
  vm.createContext(ctx);
  vm.runInContext(read('backend/apps-script-live-core/MarketingDataHub.gs'), ctx);
  const declared = vm.runInContext('MKT_HUB_SCHEMAS.MKT_EMAIL_QUEUE', ctx);
  assert.deepEqual(Array.from(declared).slice(0, 17), legacy, 'existing Data Hub columns keep their order');
  GOVERNED.forEach(h => assert(declared.includes(h), h + ' declared in Data Hub schema'));
  const dataBefore = JSON.stringify(queue.rows.slice(1));
  ctx.setupMarketingDataHub();
  const headers = queue.rows[0].slice();
  GOVERNED.forEach(h => assert(headers.indexOf(h) >= 17, h + ' appended'));
  assert.deepEqual(headers.slice(0, 17), legacy);
  assert.equal(JSON.stringify(queue.rows.slice(1).map(r => r.slice(0, 17))), dataBefore);
  ctx.setupMarketingDataHub();
  assert.deepEqual(queue.rows[0], headers, 'repeated setup is idempotent');
  console.log('email-queue render-contract schema test 2 (Data Hub schema appends governed columns, idempotent): PASS');
})();
