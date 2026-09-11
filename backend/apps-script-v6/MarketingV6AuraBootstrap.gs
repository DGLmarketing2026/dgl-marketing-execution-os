// AURA single-shot bootstrap.
//
// This is the ONE function a human needs to run, exactly once, after copying the pack's
// files into the real private Apps Script project (see docs/AURA_DEPLOYMENT.md). It performs
// every remaining one-time setup step that used to require manual tab/folder creation, then
// runs the first real Retention cycle if -- and only if -- the report source is FRESH.
//
// Every step below delegates to an already-existing engine; this file introduces no new
// suppression rule, no new gate, and does not touch MKT_V6_PROVIDER_READY. It is safe to run
// more than once: every step it performs is itself idempotent (documented inline), so a
// second run reuses the same Drive folder/sheet/trigger instead of duplicating them.
function v6AuraBootstrapAndRun_(){
  // Step 1 -- fail fast if the two spreadsheets this entire pipeline depends on are not
  // reachable at all (wrong ID, no access, deleted). Nothing else in this function is safe to
  // attempt if this fails, so this is the only step that returns immediately with a minimal
  // shape instead of the full consolidated result.
  try{
    SpreadsheetApp.openById(MKT_V6_DATA_HUB_ID);
    SpreadsheetApp.openById(MKT_V6_REPORT_SOURCE_ID);
  }catch(e){
    return {status:'BLOCKED_DATA_HUB_ACCESS',error:String((e&&e.message)||e)};
  }

  var result={
    status:'',
    dataHub:{dataHubReadable:true,reportSourceReadable:true},
    schema:{runSummarySheet:null,auditBefore:null,ensureResult:null},
    canonicalIds:null,
    freshness:null,
    amContextGatePresent:false,
    contactIngestion:'SOURCE_NOT_CONFIGURED',
    driveFolderId:'',
    triggerInstalled:null,
    retentionCycle:null
  };

  // Step 2 -- create MKT_RETENTION_RUN_SUMMARY if it does not exist yet (the one table this
  // pack auto-creates end to end; see MarketingV6SchemaMigration.gs for why it is the only
  // one). Idempotent by construction: a second run finds the tab already there and does
  // nothing (ALREADY_EXISTS), never re-creating or clearing it.
  result.schema.runSummarySheet=v6AuraEnsureRunSummarySheet_();

  // Steps 3-4 -- additive column audit/ensure across every table in
  // MKT_V6_CONTACT_RECIPIENT_SCHEMA (unchanged engine, not reimplemented here). Appends
  // missing headers only; never removes/reorders/clears existing columns or data.
  result.schema.auditBefore=v6AuditContactRecipientSchema_();
  result.schema.ensureResult=v6EnsureContactRecipientSchema_();

  // Step 5 -- MKT_ACCOUNTS/MKT_CONTACTS_SECURE are real, pre-populated commercial tables in
  // this deployment; this only records their current row counts for observability. An empty
  // table here is informational (surfaced in the result), never a fatal bootstrap error --
  // v6IngestCommercialOutcomes_/v6IngestAuthoritativeContacts_ already fail closed on their
  // own downstream if these are genuinely empty.
  var accountsRows=v6Rows_('MKT_ACCOUNTS'),contactsRows=v6Rows_('MKT_CONTACTS_SECURE');
  result.dataHub.accountsRowCount=accountsRows.length;
  result.dataHub.contactsRowCount=contactsRows.length;
  if(!accountsRows.length)result.dataHub.accountsInfo='MKT_ACCOUNTS EMPTY (informational, not fatal)';
  if(!contactsRows.length)result.dataHub.contactsInfo='MKT_CONTACTS_SECURE EMPTY (informational, not fatal)';

  // Step 6 -- safe, read-only Canonical ID Bridge audit (RESOLVED/UNRESOLVED/MISSING
  // aggregates only, no PII; MarketingV6CanonicalIdentity.gs, unchanged).
  result.canonicalIds=v6AuraAuditCanonicalIds_();

  // Step 7 -- fail-closed data-freshness check via source arbitration
  // (v6AuraResolveFreshnessSource_, MarketingV6DataFreshness.gs): NOVA canonical first, the
  // AM Intelligence Gmail source as a validated fallback, STALE_SOURCE only if neither
  // qualifies. Used again at step 12 below to decide whether to run the Retention cycle.
  result.freshness=v6AuraResolveFreshnessSource_();

  // Step 8 -- trivial confirmation that the AM CONTEXT REQUIRED gate is present in the
  // deployed code (v6RetentionAmActivityReason_ is the actual gate, inside
  // v6BuildRetentionOpportunities_; this only confirms the entry point exists, it does not
  // reimplement or re-verify the gate's internal logic).
  result.amContextGatePresent=(typeof v6BuildRetentionOpportunities_==='function');

  // Step 9 -- resolve (or create, once) the private Drive folder for AM-facing Retention
  // reports and remember its ID in PropertiesService (MarketingV6RetentionReport.gs,
  // v6AuraResolveReportsFolder_ -- Task 2). Never hardcodes a real folder ID; never persists
  // the ID anywhere except PropertiesService (private per project, never reaches GitHub).
  result.driveFolderId=v6AuraResolveReportsFolder_();

  // Step 10 -- verify/install the single canonical opportunity-refresh trigger. Already
  // dedupes by handler name (v6ScheduledOpportunityRefresh_) before creating a new one, so
  // running this on every bootstrap call never creates a second, competing schedule.
  result.triggerInstalled=v6InstallOpportunityRefreshTrigger_();

  // Step 11 -- conditional, optional contact ingestion. v6FetchAuthoritativeContactsFromSource_
  // is NOT defined anywhere in this pack today (confirmed by direct grep before writing this
  // branch) and this bootstrap does not invent one -- inventing a Salesforce/NOVA contact-pull
  // integration here would fabricate an external dependency this codebase cannot verify. If a
  // real hook is ever added elsewhere in the deployed project under this exact name, this
  // conditional path calls it and feeds its result straight into the existing, unchanged
  // v6IngestAuthoritativeContacts_ -- no new ingestion mechanism is introduced by this branch.
  if(typeof v6FetchAuthoritativeContactsFromSource_==='function'){
    var fetched=v6FetchAuthoritativeContactsFromSource_();
    result.contactIngestion=v6IngestAuthoritativeContacts_(fetched);
  }else{
    result.contactIngestion='SOURCE_NOT_CONFIGURED';
  }

  // Step 12 -- never run a Retention cycle against data the freshness gate already knows is
  // stale. Everything accumulated so far is still returned for visibility (folder/sheet/
  // trigger/schema/canonical-id state), but retentionCycle stays null.
  if(result.freshness.status==='STALE_SOURCE'){
    result.status='BOOTSTRAP_BLOCKED_STALE_DATA';
    return result;
  }

  // Step 13 -- FRESH: run the real cycle (detect -> suppress -> build scope -> AM CSV ->
  // Handoffs CSV -> run summary; MarketingV6RetentionReport.gs, unchanged by this file).
  result.retentionCycle=v6AuraRunRetentionCycle_();
  result.status='BOOTSTRAP_COMPLETE';
  return result;
}
