/**
 * DGL Marketing Data Hub
 * Private Google Workspace storage for Marketing campaign data.
 * Add this file to the NOVA Apps Script project.
 *
 * IMPORTANT:
 * - No customer data is stored in GitHub.
 * - Spreadsheet ID is stored in Script Properties.
 * - This module does not change NOVA's existing 17 reports.
 */

const MKT_HUB_PROP = 'DGL_MARKETING_DATA_HUB_ID';

const MKT_HUB_SCHEMAS = {
  MKT_ACCOUNTS: [
    'accountId','accountName','status','tier','accountManager','industry','country',
    'servicesUsed','lastLoadDate','lastQuoteDate','daysSinceLastLoad',
    'quotes30d','quotes60d','quotes90d','loads30d','loads60d','loads90d',
    'revenueYTD','revenueHistoric','branch','updatedAt'
  ],
  MKT_CONTACTS_SECURE: [
    'contactId','accountId','firstName','lastName','email','title','language',
    'marketingStatus','doNotContact','updatedAt'
  ],
  MKT_QUOTES: [
    'quoteId','accountId','contactId','service','branch','quoteDate','status',
    'amount','reason','daysOpen','lane','updatedAt'
  ],
  MKT_LOADS_SUMMARY: [
    'accountId','service','lastLoadDate','loads30d','loads60d','loads90d',
    'revenue30d','revenue90d','updatedAt'
  ],
  MKT_AUDIENCES: [
    'audienceId','audienceName','accountId','contactId','campaignType','service',
    'reasonCode','sourceReport','eligible','exclusionReason','score','updatedAt'
  ],
  MKT_CAMPAIGNS: [
    'campaignId','campaignName','campaignType','audienceId','service','language',
    'templateId','subject','preheader','headline','body','body2','cta','ctaUrl',
    'heroUrl','logoUrl','senderName','replyTo','status','createdAt','updatedAt'
  ],
  MKT_TOUCHES: [
    'touchId','campaignId','audienceId','accountId','contactId','channel','eventType',
    'eventAt','externalId','metadata'
  ],
  MKT_ATTRIBUTION: [
    'attributionId','campaignId','accountId','contactId','quoteId','loadId','service',
    'attributionType','revenue','eventDate','notes'
  ],
  MKT_EXCLUSIONS: [
    'accountId','contactId','reason','source','startDate','endDate','active','updatedAt'
  ],
  MKT_SYNC_LOG: [
    'syncId','source','startedAt','finishedAt','status','accounts','contacts','quotes',
    'audienceRows','message'
  ],
  MKT_EMAIL_QUEUE: [
    'jobId','campaignId','audienceId','accountId','contactId','email','firstName',
    'company','service','subject','htmlBody','replyTo','status','gmailDraftId',
    'createdAt','processedAt','error',
    // Append-only: governed Campaign A job fields (PR #14 / #15). Existing columns never move.
    'templateId','renderContract','accountStatusOverride','sourceRow','regeneratedAt','previousStatus'
  ]
};

function setupMarketingDataHub() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty(MKT_HUB_PROP);
  let ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('DGL_MARKETING_DATA_HUB');
    props.setProperty(MKT_HUB_PROP, ss.getId());
  }

  Object.keys(MKT_HUB_SCHEMAS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = MKT_HUB_SCHEMAS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1,1,1,headers.length).setFontWeight('bold');
    } else {
      const current = sh.getRange(1,1,1,Math.max(sh.getLastColumn(), headers.length)).getValues()[0];
      const missing = headers.filter(h => current.indexOf(h) === -1);
      if (missing.length) {
        sh.getRange(1, sh.getLastColumn()+1, 1, missing.length).setValues([missing]);
      }
    }
  });

  return { ok:true, spreadsheetId:ss.getId(), url:ss.getUrl() };
}

function getMarketingDataHub_() {
  const id = PropertiesService.getScriptProperties().getProperty(MKT_HUB_PROP);
  if (!id) throw new Error('Marketing Data Hub no configurado. Ejecuta setupMarketingDataHub().');
  return SpreadsheetApp.openById(id);
}

function mktSheet_(name) {
  const ss = getMarketingDataHub_();
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error('Hoja no encontrada: ' + name);
  return sh;
}

function mktHeaders_(sheet) {
  return sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
}

function mktReadAll_(sheetName) {
  const sh = mktSheet_(sheetName);
  if (sh.getLastRow() < 2) return [];
  const headers = mktHeaders_(sh);
  return sh.getRange(2,1,sh.getLastRow()-1,headers.length).getValues().map(row => {
    const o = {};
    headers.forEach((h,i)=>o[h]=row[i]);
    return o;
  });
}

function mktUpsertRows_(sheetName, keyFields, records) {
  if (!records || !records.length) return { inserted:0, updated:0 };
  const sh = mktSheet_(sheetName);
  const headers = mktHeaders_(sh);
  const data = mktReadAll_(sheetName);
  const index = {};

  data.forEach((row, i) => {
    const key = keyFields.map(k => String(row[k] || '')).join('||');
    index[key] = i + 2;
  });

  let inserted = 0, updated = 0;
  records.forEach(rec => {
    const key = keyFields.map(k => String(rec[k] || '')).join('||');
    const row = headers.map(h => rec[h] === undefined ? '' : rec[h]);
    if (index[key]) {
      sh.getRange(index[key],1,1,headers.length).setValues([row]);
      updated++;
    } else {
      sh.appendRow(row);
      index[key] = sh.getLastRow();
      inserted++;
    }
  });
  return { inserted, updated };
}

function mktLogSync_(source, result, message) {
  const now = new Date();
  return mktUpsertRows_('MKT_SYNC_LOG', ['syncId'], [{
    syncId: Utilities.getUuid(),
    source: source || 'NOVA',
    startedAt: now,
    finishedAt: now,
    status: result && result.ok === false ? 'ERROR' : 'OK',
    accounts: Number(result && result.accounts || 0),
    contacts: Number(result && result.contacts || 0),
    quotes: Number(result && result.quotes || 0),
    audienceRows: Number(result && result.audienceRows || 0),
    message: message || ''
  }]);
}

/**
 * Generic writer used by NOVA export functions.
 * Call this after NOVA has built clean Marketing records.
 */
function pushMarketingSnapshot(snapshot) {
  snapshot = snapshot || {};
  const now = new Date();

  const accounts = (snapshot.accounts || []).map(r => Object.assign({updatedAt:now}, r));
  const contacts = (snapshot.contacts || []).map(r => Object.assign({updatedAt:now}, r));
  const quotes = (snapshot.quotes || []).map(r => Object.assign({updatedAt:now}, r));
  const loads = (snapshot.loadsSummary || []).map(r => Object.assign({updatedAt:now}, r));
  const exclusions = (snapshot.exclusions || []).map(r => Object.assign({updatedAt:now}, r));

  mktUpsertRows_('MKT_ACCOUNTS', ['accountId'], accounts);
  mktUpsertRows_('MKT_CONTACTS_SECURE', ['contactId'], contacts);
  mktUpsertRows_('MKT_QUOTES', ['quoteId'], quotes);
  mktUpsertRows_('MKT_LOADS_SUMMARY', ['accountId','service'], loads);
  mktUpsertRows_('MKT_EXCLUSIONS', ['accountId','contactId','reason'], exclusions);

  const result = {
    ok:true,
    accounts:accounts.length,
    contacts:contacts.length,
    quotes:quotes.length
  };
  mktLogSync_('NOVA_SNAPSHOT', result, 'Snapshot actualizado');
  return result;
}
