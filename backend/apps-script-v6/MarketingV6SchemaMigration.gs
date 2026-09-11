var MKT_V6_CONTACT_RECIPIENT_SCHEMA={
  MKT_ACCOUNTS:['accountId','externalSystem','externalAccountId','salesforceAccountId','canonicalSalesforceIdStatus','accountName','amOwner','status','sourceUpdatedAt','createdAt','updatedAt'],
  MKT_CONTACTS_SECURE:['contactId','accountId','externalSystem','externalContactId','salesforceContactId','canonicalSalesforceIdStatus','email','emailStatus','doNotContact','status','sourceUpdatedAt','createdAt','updatedAt'],
  MKT_CAMPAIGN_SCOPES:['scopeId','audienceId','campaignId','campaignType','opportunityType','updatedAt'],
  MKT_SCOPE_ACCOUNTS:['scopeId','audienceId','campaignId','accountId','eligibilityStatus','updatedAt'],
  MKT_EXCLUSIONS:['exclusionId','accountId','contactId','status','active','reasonCode','expiresAt','updatedAt'],
  MKT_AUDIENCES:['audienceRecipientId','recordType','campaignId','scopeId','accountId','contactId','email','eligibilityStatus','exclusionReason','frequencyStatus','audienceResolved','audienceStatus','eligibleContactCount','excludedContactCount','reasonCode','exclusionStatus','exclusionsCleared','resolvedAt','updatedAt'],
  // Added for the AURA Retention pilot dry-run/AM CSV cycle (MarketingV6RetentionReport.gs).
  // Reuses this same generic additive-schema audit/ensure engine rather than duplicating it;
  // MKT_RETENTION_RUN_SUMMARY is a brand-new table, so its sheet tab must be created once,
  // manually, in the private Data Hub before v6EnsureContactRecipientSchema_() can append
  // these headers (this function only adds columns to an existing sheet, it never creates
  // a new tab) -- see docs/AURA_DEPLOYMENT.md.
  // handoffsCsvDriveFileId added alongside csvDriveFileId (Task 5, AURA bootstrap pass): the
  // Handoffs CSV (MarketingV6RetentionReport.gs, v6AuraGenerateHandoffsCsvReport_) is a
  // second, separate Drive artifact per run -- additive column, existing readers of
  // csvDriveFileId are unaffected.
  MKT_RETENTION_RUN_SUMMARY:['runId','asOfDate','accountsEvaluated','detected','eligible','suppressed','reviewRequired','campaignReady','responded','handedToAM','rfqs','quotes','loads','attributedRevenue','csvDriveFileId','handoffsCsvDriveFileId','createdAt'],
  // Self-observability log (MarketingV6AuraRunLog.gs): one row per (runId, stage) so a run's
  // full progression -- including exactly where and why it failed -- is durable and
  // inspectable natively via SpreadsheetApp/DriveApp, without depending on any external API
  // to read Sheets content. Second table this pack auto-creates end to end, same justification
  // as MKT_RETENTION_RUN_SUMMARY above (brand-new, AURA-owned, no historical data at risk).
  MKT_AURA_RUN_LOG:['runId','timestamp','stage','status','sourceType','sourceTimestamp','accountsEvaluated','detected','eligible','suppressed','reviewRequired','campaignReady','csvCreated','handoffsCsvCreated','errorCode','errorMessage','nextAction']
};
// The one table in MKT_V6_CONTACT_RECIPIENT_SCHEMA that is safe to auto-create end to end
// (tab + header row), because it is a brand-new, AURA-owned reporting table with no historical
// data that could ever be at risk -- unlike MKT_ACCOUNTS/MKT_CONTACTS_SECURE/every other table
// here, which are real commercial tables that must already exist; a missing tab there is a
// real configuration error and must keep failing loudly via v6RequireContactRecipientHeaders_/
// v6EnsureContactRecipientSchema_ ('SCHEMA MIGRATION REQUIRED: <name> NOT FOUND'), never
// silently auto-created. Do not generalize this pattern to any other table.
//
// Reuses the same MKT_V6_DATA_HUB_ID constant and SpreadsheetApp.openById(...) call already
// used by v6Sheet_ (MarketingV6OpportunityEngine.gs) -- v6Sheet_ itself only exposes
// getSheetByName (a null on a missing tab), not the parent Spreadsheet object insertSheet()
// requires, so this opens the same spreadsheet ID directly rather than duplicating a second
// lookup mechanism.
function v6AuraEnsureRunSummarySheet_(){
  var name='MKT_RETENTION_RUN_SUMMARY';
  var existing=v6Sheet_(name);
  if(existing)return {status:'ALREADY_EXISTS',sheetName:name};
  var headers=MKT_V6_CONTACT_RECIPIENT_SCHEMA[name];
  var created=SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).insertSheet(name);
  created.getRange(1,1,1,headers.length).setValues([headers]);
  return {status:'CREATED',sheetName:name,headers:headers};
}
// Same auto-create pattern as v6AuraEnsureRunSummarySheet_ above, for the same reason
// (MKT_AURA_RUN_LOG is the second AURA-owned table with no historical data at risk).
function v6AuraEnsureRunLogSheet_(){
  var name='MKT_AURA_RUN_LOG';
  var existing=v6Sheet_(name);
  if(existing)return {status:'ALREADY_EXISTS',sheetName:name};
  var headers=MKT_V6_CONTACT_RECIPIENT_SCHEMA[name];
  var created=SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID).insertSheet(name);
  created.getRange(1,1,1,headers.length).setValues([headers]);
  return {status:'CREATED',sheetName:name,headers:headers};
}
function v6SchemaHeaders_(sheet){if(!sheet)return [];var columns=Number(sheet.getLastColumn()||0);if(columns<1)return [];return sheet.getRange(1,1,1,columns).getValues()[0].map(function(value){return String(value||'').trim();}).filter(function(value){return value!=='';});}
function v6AuditContactRecipientSchema_(){
  var tables={},missingTableCount=0,missingColumnCount=0;Object.keys(MKT_V6_CONTACT_RECIPIENT_SCHEMA).forEach(function(name){var sheet=v6Sheet_(name),headers=v6SchemaHeaders_(sheet),required=MKT_V6_CONTACT_RECIPIENT_SCHEMA[name],missing=required.filter(function(header){return headers.indexOf(header)<0;}),present=required.filter(function(header){return headers.indexOf(header)>=0;});if(!sheet)missingTableCount++;missingColumnCount+=missing.length;tables[name]={sheetPresent:!!sheet,existingColumnCount:headers.length,requiredColumnCount:required.length,presentColumns:present,missingColumns:missing};});return {status:missingTableCount||missingColumnCount?'SCHEMA MIGRATION REQUIRED':'SCHEMA READY',tableCount:Object.keys(tables).length,missingTableCount:missingTableCount,missingColumnCount:missingColumnCount,tables:tables};
}
function v6EnsureContactRecipientSchema_(){
  var before=v6AuditContactRecipientSchema_(),columnsAdded=0,tablesUpdated=0;Object.keys(MKT_V6_CONTACT_RECIPIENT_SCHEMA).forEach(function(name){var state=before.tables[name],sheet=v6Sheet_(name);if(!sheet)throw new Error('SCHEMA MIGRATION REQUIRED: '+name+' NOT FOUND');if(!state.missingColumns.length)return;var start=Math.max(1,Number(sheet.getLastColumn()||0)+1);sheet.getRange(1,start,1,state.missingColumns.length).setValues([state.missingColumns]);columnsAdded+=state.missingColumns.length;tablesUpdated++;});var after=v6AuditContactRecipientSchema_();return {status:after.status,tableCount:after.tableCount,tablesUpdated:tablesUpdated,columnsAdded:columnsAdded,missingTableCount:after.missingTableCount,missingColumnCount:after.missingColumnCount,tables:after.tables};
}
function v6RequireContactRecipientHeaders_(name,required){var sheet=v6Sheet_(name);if(!sheet)throw new Error('SCHEMA MIGRATION REQUIRED: '+name+' NOT FOUND');var headers=v6SchemaHeaders_(sheet),expected=required&&required.length?required:(MKT_V6_CONTACT_RECIPIENT_SCHEMA[name]||[]),missing=expected.filter(function(header){return headers.indexOf(header)<0;});if(missing.length)throw new Error('SCHEMA MIGRATION REQUIRED: '+name+' MISSING '+missing.join(','));return true;}
