// AURA single-shot bootstrap.
//
// This is the ONE function a human needs to run, exactly once, after copying the pack's
// files into the real private Apps Script project (see docs/AURA_DEPLOYMENT.md). It performs
// every remaining one-time setup step that used to require manual tab/folder creation, then
// runs the first real Retention cycle if -- and only if -- an approved source (NOVA canonical
// or, as a validated fallback, the AM Intelligence Gmail source) is fresh.
//
// Every step below delegates to an already-existing engine; this file introduces no new
// suppression rule, no new gate, and does not touch MKT_V6_PROVIDER_READY. It is safe to run
// more than once: every step it performs is itself idempotent (documented inline), so a
// second run reuses the same Drive folder/sheet/trigger instead of duplicating them.
//
// Runtime dependency discipline: everything in this function and everything it calls uses
// only native Apps Script services (SpreadsheetApp, DriveApp, PropertiesService, ScriptApp,
// GmailApp where the Gmail ingestion file is present). None of it depends on any external
// REST API being reachable to observe or verify what happened -- MKT_AURA_RUN_LOG
// (MarketingV6AuraRunLog.gs) is the durable, native record of exactly what this run did, so
// production correctness never depends on an external caller being able to read Sheets.
function v6AuraBootstrapAndRun_(){
  // Step 1 -- fail fast if the two spreadsheets this entire pipeline depends on are not
  // reachable at all (wrong ID, no access, deleted). Nothing else in this function is safe to
  // attempt if this fails, including logging (MKT_AURA_RUN_LOG itself lives in the same Data
  // Hub), so this is the only step that returns immediately with a minimal shape instead of
  // the full consolidated result.
  try{
    SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID);
    SpreadsheetApp.openById(MKT_V6_REPORT_SOURCE_ID);
  }catch(e){
    return {status:'BLOCKED_DATA_HUB_ACCESS',error:String((e&&e.message)||e)};
  }

  var runId='RUN-'+Utilities.getUuid().slice(0,8).toUpperCase();

  try{
    // Step 1b -- ensure the log table itself exists before the very first log write (it is the
    // second AURA-owned auto-creatable table, same justification as the run-summary sheet).
    v6AuraEnsureRunLogSheet_();
    v6AuraLogStage_(runId,'BOOTSTRAP_STARTED','OK',{});

    var result={
      status:'',runId:runId,
      dataHub:{dataHubReadable:true,reportSourceReadable:true},
      schema:{runSummarySheet:null,runLogSheet:null,auditBefore:null,ensureResult:null},
      canonicalIds:null,
      freshness:null,
      amContextGatePresent:false,
      contactIngestion:'SOURCE_NOT_CONFIGURED',
      driveFolderId:'',
      triggerInstalled:null,
      retentionCycle:null
    };

    // Step 2 -- create MKT_RETENTION_RUN_SUMMARY if it does not exist yet. Idempotent by
    // construction: a second run finds the tab already there and does nothing (ALREADY_EXISTS),
    // never re-creating or clearing it.
    result.schema.runSummarySheet=v6AuraEnsureRunSummarySheet_();
    result.schema.runLogSheet={status:'ALREADY_EXISTS_OR_CREATED',sheetName:'MKT_AURA_RUN_LOG'};

    // Steps 3-4 -- additive column audit/ensure across every table in
    // MKT_V6_CONTACT_RECIPIENT_SCHEMA (unchanged engine, not reimplemented here). Appends
    // missing headers only; never removes/reorders/clears existing columns or data.
    result.schema.auditBefore=v6AuditContactRecipientSchema_();
    result.schema.ensureResult=v6EnsureContactRecipientSchema_();

    // Step 5 -- MKT_ACCOUNTS/MKT_CONTACTS_SECURE are real, pre-populated commercial tables in
    // this deployment; this only records their current row counts for observability. An empty
    // table here is informational (surfaced in the result), never a fatal bootstrap error.
    var accountsRows=v6Rows_('MKT_ACCOUNTS'),contactsRows=v6Rows_('MKT_CONTACTS_SECURE');
    result.dataHub.accountsRowCount=accountsRows.length;
    result.dataHub.contactsRowCount=contactsRows.length;
    if(!accountsRows.length)result.dataHub.accountsInfo='MKT_ACCOUNTS EMPTY (informational, not fatal)';
    if(!contactsRows.length)result.dataHub.contactsInfo='MKT_CONTACTS_SECURE EMPTY (informational, not fatal)';

    // Step 6 -- safe, read-only Canonical ID Bridge audit (RESOLVED/UNRESOLVED/MISSING
    // aggregates only, no PII; MarketingV6CanonicalIdentity.gs, unchanged).
    result.canonicalIds=v6AuraAuditCanonicalIds_();

    // Step 7 -- fail-closed source arbitration (v6AuraResolveFreshnessSource_,
    // MarketingV6DataFreshness.gs): NOVA canonical first, the AM Intelligence Gmail source as
    // a validated fallback, STALE_SOURCE only if neither qualifies. Used again at step 12.
    result.freshness=v6AuraResolveFreshnessSource_();
    v6AuraLogStage_(runId,'SOURCE_SELECTED','OK',{sourceType:result.freshness.selectedSource,sourceTimestamp:(result.freshness.amIntelligence&&result.freshness.amIntelligence.lastReportReceivedAt)||(result.freshness.nova&&result.freshness.nova.lastUpdatedIso)});

    // Step 8 -- trivial confirmation that the AM CONTEXT REQUIRED gate is present in the
    // deployed code, without reimplementing or re-verifying its internal logic.
    result.amContextGatePresent=(typeof v6BuildRetentionOpportunities_==='function');

    // Step 9 -- resolve (or create, once) the private Drive folder for AM-facing Retention
    // reports and remember its ID in PropertiesService. Never hardcodes a real folder ID;
    // never persists the ID anywhere except PropertiesService (private per project).
    result.driveFolderId=v6AuraResolveReportsFolder_();

    // Step 10 -- verify/install the single canonical opportunity-refresh trigger. Already
    // dedupes by handler name before creating a new one, so running this on every bootstrap
    // call never creates a second, competing schedule.
    result.triggerInstalled=v6InstallOpportunityRefreshTrigger_();
    v6AuraLogStage_(runId,'SCHEDULER_CONFIRMED','OK',{});

    // Step 11 -- conditional, optional contact ingestion. v6FetchAuthoritativeContactsFromSource_
    // is NOT defined anywhere in this pack today and this bootstrap does not invent one.
    if(typeof v6FetchAuthoritativeContactsFromSource_==='function'){
      var fetched=v6FetchAuthoritativeContactsFromSource_();
      result.contactIngestion=v6IngestAuthoritativeContacts_(fetched);
    }else{
      result.contactIngestion='SOURCE_NOT_CONFIGURED';
    }

    // Step 12 -- never run a Retention cycle against data the freshness gate already knows is
    // stale. Everything accumulated so far is still returned for visibility, but
    // retentionCycle stays null. A short one-shot recovery trigger is scheduled so the system
    // retries soon instead of waiting for the next canonical six-hour firing.
    if(result.freshness.status==='STALE_SOURCE'){
      result.status='BOOTSTRAP_BLOCKED_STALE_DATA';
      var recovery1=v6AuraScheduleOneShotBootstrapRecovery_(300);
      v6AuraLogStage_(runId,'RUN_FAILED','STALE_SOURCE',{errorCode:'STALE_SOURCE',errorMessage:'Neither NOVA canonical nor an approved AM Intelligence source is fresh enough to run.',nextAction:'oneshot recovery: '+recovery1.status});
      v6AuraWriteLastRunStatusFile_({runId:runId,status:result.status,freshness:result.freshness,recovery:recovery1,generatedAt:new Date().toISOString()});
      return result;
    }

    // Step 13 -- FRESH: run the real cycle (detect -> suppress -> build scope -> AM CSV ->
    // Handoffs CSV -> run summary), reusing the SAME runId generated at the top of this
    // function so the entire run's log trail (BOOTSTRAP_STARTED through RUN_COMPLETED) shares
    // one id end to end.
    result.retentionCycle=v6AuraRunRetentionCycle_(runId);
    result.status='BOOTSTRAP_COMPLETE';

    // A successful run means any pending short-delay recovery trigger from a prior blocked/
    // failed attempt is no longer needed.
    v6AuraCleanupOneShotBootstrapRecovery_();
    v6AuraWriteLastRunStatusFile_({runId:runId,status:result.status,freshness:{status:result.freshness.status,selectedSource:result.freshness.selectedSource},retentionCycle:result.retentionCycle,generatedAt:new Date().toISOString()});
    return result;
  }catch(err){
    var errorMessage=String(err&&err.message||err);
    v6AuraLogStage_(runId,'RUN_FAILED','ERROR',{errorCode:'RUNTIME_EXCEPTION',errorMessage:errorMessage});
    v6AuraScheduleOneShotBootstrapRecovery_(300);
    v6AuraWriteLastRunStatusFile_({runId:runId,status:'RUN_FAILED',errorCode:'RUNTIME_EXCEPTION',errorMessage:errorMessage,generatedAt:new Date().toISOString()});
    return {status:'RUN_FAILED',runId:runId,errorCode:'RUNTIME_EXCEPTION',errorMessage:errorMessage};
  }
}

// Public, no-underscore entry point purely so this can be invoked directly via
// `clasp run v6AuraBootstrapAndRun` / the Apps Script Execution API without relying on the
// "_"-suffix convention. No internal logic lives here -- it only forwards to the real
// function above, unchanged.
function v6AuraBootstrapAndRun(){
  return v6AuraBootstrapAndRun_();
}
