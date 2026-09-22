var MKT_V6_CONTACT_RECIPIENT_SCHEMA={
  MKT_ACCOUNTS:['accountId','externalSystem','externalAccountId','salesforceAccountId','canonicalSalesforceIdStatus','accountName','amOwner','status','sourceUpdatedAt','createdAt','updatedAt'],
  MKT_CONTACTS_SECURE:['contactId','accountId','externalSystem','externalContactId','salesforceContactId','canonicalSalesforceIdStatus','email','emailStatus','doNotContact','status','sourceUpdatedAt','createdAt','updatedAt'],
  MKT_CAMPAIGN_SCOPES:['scopeId','audienceId','campaignId','campaignType','opportunityType','updatedAt'],
  MKT_SCOPE_ACCOUNTS:['scopeId','audienceId','campaignId','accountId','eligibilityStatus','updatedAt'],
  MKT_EXCLUSIONS:['exclusionId','accountId','contactId','status','active','reasonCode','expiresAt','updatedAt'],
  // recipientSource added (MarketingV6AuraCampanaA.gs, Pass 18): CAMPANA_A_SOURCE |
  // CONTACTS_SECURE | MERGED -- which real table(s) actually produced this recipient. Additive,
  // every existing reader/writer of MKT_AUDIENCES (v6ResolveRecipients_ and its own dedicated
  // tests) is unaffected; only Campana A's own dedicated resolver populates it.
  MKT_AUDIENCES:['audienceRecipientId','recordType','campaignId','scopeId','accountId','contactId','email','eligibilityStatus','exclusionReason','frequencyStatus','audienceResolved','audienceStatus','eligibleContactCount','excludedContactCount','reasonCode','exclusionStatus','exclusionsCleared','resolvedAt','updatedAt','recipientSource'],
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
  MKT_AURA_RUN_LOG:['runId','timestamp','stage','status','sourceType','sourceTimestamp','accountsEvaluated','detected','eligible','suppressed','reviewRequired','campaignReady','csvCreated','handoffsCsvCreated','errorCode','errorMessage','nextAction'],
  // Real Gmail-send execution queue (MarketingV6AuraEmailDispatcher.gs). The first 17 columns
  // already exist in production (created long ago by the legacy MarketingDataHub.gs draft
  // engine, which still owns and reads them under its own manual/Draft-only flow -- untouched
  // here); the rest are additive-only, appended by v6EnsureContactRecipientSchema_ same as
  // every other table in this map, never reordering or clearing the existing 17. country/
  // preferredLanguage added for the per-contact ES/EN/PT language pipeline
  // (MarketingV6AuraCampanaA.gs). languageSource/languageReason and
  // stopReasonStage/stopReasonAt/stopReasonCampaignId added so a language decision or a STOPPED
  // status is traceable to exactly why, per job, instead of an opaque final value.
  // stopOverrideApplied/stopOverrideReason added for the governed stale-cross-family-response
  // override (MarketingV6AuraCampanaA.gs, v6AuraCampanaAStopOverrideCheck_) -- records, per job,
  // whether an otherwise-stopping stage was overridden and exactly why/why not.
  // recipientSource added (Pass 18): CAMPANA_A_SOURCE | CONTACTS_SECURE | MERGED, per job --
  // records whether this recipient came from the Campana A tab directly (and was never
  // gated on already existing in MKT_CONTACTS_SECURE), from MKT_CONTACTS_SECURE alone, or both
  // (deterministic merge by exact account+email match). See MarketingV6AuraCampanaA.gs.
  // creativeId/creativeVersion/creativeApprovalId/htmlChecksum/recipientRenderedChecksum added
  // for Iniciativa 2 (Campaign Studio como unica fuente canonica del email --
  // MarketingV6AuraCreativeApproval.gs). Additive only, every existing reader of this table is
  // unaffected. creativeApprovalId is intentionally a DIFFERENT field from the existing
  // approvalId column above -- approvalId already has an established, different meaning (a
  // POLICY-level family-approval gate consumed by v6AuraEmailQueueAudit_'s
  // APPROVAL_RECORDED_BUT_NOT_ENFORCED/APPROVAL_BYPASSED checks); creativeApprovalId is the
  // reference to the specific approved MKT_CAMPAIGN_CREATIVES row this job's content came from.
  // htmlChecksum mirrors that creative's own htmlChecksum (the pre-personalization "approved
  // template" checksum); recipientRenderedChecksum is the checksum of the actual, personalized
  // job.htmlBody -- the two checksum levels Iniciativa 2 punto 4 requires.
  MKT_EMAIL_QUEUE:['jobId','campaignId','audienceId','accountId','contactId','email','firstName','company','service','subject','htmlBody','replyTo','status','gmailDraftId','createdAt','processedAt','error','requestId','amOwner','playbookId','sequenceStep','scheduledAt','approvalId','approvedAt','approvedBy','stopOnResponse','country','preferredLanguage','languageSource','languageReason','stopReasonStage','stopReasonAt','stopReasonCampaignId','stopOverrideApplied','stopOverrideReason','recipientSource','creativeId','creativeVersion','creativeApprovalId','htmlChecksum','recipientRenderedChecksum'],
  // Pre-existing legacy table (MarketingDataHub.gs); listed here only so
  // v6RequireContactRecipientHeaders_/v6EnsureContactRecipientSchema_ can validate it before
  // the dispatcher logs a real send touch into it -- no column added or changed.
  MKT_TOUCHES:['touchId','campaignId','audienceId','accountId','contactId','channel','eventType','eventAt','externalId','metadata'],
  // Brand-new, AURA-owned table (Iniciativa 2 -- MarketingV6AuraCreativeApproval.gs). No
  // historical data at risk (see v6AuraEnsureCampaignCreativesSheet_ there), same auto-create
  // justification as MKT_RETENTION_RUN_SUMMARY/MKT_AURA_RUN_LOG below. Every row here is
  // immutable once written -- an approval never overwrites a prior creativeId, it only adds a
  // new row with the next creativeVersion for that campaignId.
  // status/contentChecksum/revokedAt/revokedBy added for the PR #3 audit remediation
  // (MarketingV6AuraCreativeApproval.gs): status is APPROVED until an edit in Campaign Studio
  // revokes this exact row server-side (never only a local UI flag); contentChecksum is the
  // canonical checksum over subject+htmlBody+textBody+templateId+creativeVersion (catches
  // subject-only drift, which htmlChecksum alone -- htmlBody only -- cannot). Additive only,
  // every existing reader of this table is unaffected.
  MKT_CAMPAIGN_CREATIVES:['creativeId','campaignId','templateId','creativeVersion','subject','preheader','htmlBody','textBody','heroUrl','logoUrl','language','approvedAt','approvedBy','approvalId','htmlChecksum','createdAt','status','contentChecksum','revokedAt','revokedBy']
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
