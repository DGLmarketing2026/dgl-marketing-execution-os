// AURA Retention pilot dry-run + AM CSV report + persisted run summary.
//
// Every function here reuses an already-existing engine (v6AuraEvaluateRetention_,
// v6AuraCheckReportFreshness_, v6FrequencyStatus_, v6Csv_/v6CsvEscape_, v6UpsertByKey_) --
// no suppression rule, no frequency rule, no new opportunity/pipeline mechanism is
// introduced here. This file only aggregates what those engines already decided and
// produces a private, non-PII CSV for AM plus a persisted run summary row.

// AM-facing Retention reports live in a dedicated Drive folder, deliberately separate from
// MKT_V6_ARCHIVE (MarketingV6DriveArchive.gs), which is for campaign-execution artifacts
// (audience CSV/HTML/copy/results), not AM reporting. There is no hardcoded real folder ID
// anywhere in this file or this repo -- v6AuraResolveReportsFolder_() below resolves (or
// creates, once) the real folder at runtime and remembers it in PropertiesService (private,
// per-project, never committed to GitHub). See docs/AURA_DEPLOYMENT.md.
var MKT_V6_AM_REPORTS_FOLDER_NAME='DGL_AURA_AM_REPORTS';
var MKT_V6_AM_REPORTS_FOLDER_PROPERTY_KEY='AURA_AM_REPORT_FOLDER_ID';

// Resolves the private Drive folder for AM-facing Retention reports without ever hardcoding
// a real folder ID in source. Order of resolution:
//   1. PropertiesService.getScriptProperties() already has a folder ID -> try to open it;
//      if it still exists, reuse it (this is the fast, common path on every run after the
//      first, and the only path exercised on a second bootstrap run -- idempotent).
//   2. The stored ID is missing or the folder behind it was deleted (DriveApp.getFolderById
//      throws) -> look up by the fixed folder name; if one already exists (e.g. created by
//      a prior run whose property write did not persist, or created manually), reuse it and
//      re-save its ID to the property.
//   3. No folder anywhere yet -> create it once, then save its ID to the property.
// Never stores the folder ID anywhere except PropertiesService (private per Apps Script
// project, never reaches this GitHub repo).
function v6AuraResolveReportsFolder_(){
  var props=PropertiesService.getScriptProperties();
  var storedId=props.getProperty(MKT_V6_AM_REPORTS_FOLDER_PROPERTY_KEY);
  if(storedId){
    try{
      DriveApp.getFolderById(storedId);
      return storedId;
    }catch(_){
      // Folder behind the stored ID no longer resolves (deleted/invalid) -- fall through to
      // name-based lookup/creation below instead of failing the whole Retention cycle.
    }
  }
  var existing=DriveApp.getFoldersByName(MKT_V6_AM_REPORTS_FOLDER_NAME);
  if(existing.hasNext()){
    var found=existing.next();
    var foundId=found.getId();
    props.setProperty(MKT_V6_AM_REPORTS_FOLDER_PROPERTY_KEY,foundId);
    return foundId;
  }
  var created=DriveApp.createFolder(MKT_V6_AM_REPORTS_FOLDER_NAME);
  var createdId=created.getId();
  props.setProperty(MKT_V6_AM_REPORTS_FOLDER_PROPERTY_KEY,createdId);
  return createdId;
}

var MKT_V6_AM_CSV_HEADERS=['runId','asOfDate','accountId','accountName','amOwner','currentTier','bucket','retentionSignal','signalReason','sourceReport','sourceRecordId','lastCommercialActivity','lastLoadDate','daysSinceLastLoad','service','priority','auraDecision','suppressionReason','dataQualityStatus','campaignEligible','campaignId','scopeId','campaignStatus','responseStatus','handoffStatus','rfqStatus','quoteStatus','loadStatus','attributedRevenue','nextAction'];

// Retention decisions that represent a real, qualifying commercial response already handed
// (or being handed) to AM -- the set the Handoffs CSV (Task 5) is scoped to. Kept as a named
// constant (not re-derived) so the AM CSV's full decision vocabulary and the Handoffs CSV's
// narrower subset never silently drift apart.
var MKT_V6_AM_HANDOFF_DECISIONS=['RESPONDED','HANDED_TO_AM','RFQ','QUOTED','RETAINED'];
var MKT_V6_AM_HANDOFFS_CSV_HEADERS=['runId','accountId','accountName','amOwner','campaignId','responseType','responseDate','handoffStatus','nextAction','rfqStatus','quoteStatus','loadStatus','attributedRevenue'];

// --- Pilot dry run -----------------------------------------------------------
// Accepts an optional runId so a caller (v6AuraBootstrapAndRun_) that already generated one
// at the very start of a run (to log BOOTSTRAP_STARTED before freshness is even known) can
// thread the SAME id through every stage instead of this function silently minting a second,
// disconnected one. Standalone callers (tests, a manual dry-run check) get one generated here
// exactly as before when no runId is supplied -- fully backward compatible.
function v6AuraRetentionDryRun_(runId){
  runId=runId||('RUN-'+Utilities.getUuid().slice(0,8).toUpperCase());
  var freshness=v6AuraResolveFreshnessSource_();
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'SOURCE_SELECTED','OK',{sourceType:freshness.selectedSource,sourceTimestamp:(freshness.amIntelligence&&freshness.amIntelligence.lastReportReceivedAt)||freshness.nova.lastUpdatedIso});
  if(freshness.status==='STALE_SOURCE'){
    if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RUN_FAILED','STALE_SOURCE',{errorCode:'STALE_SOURCE',errorMessage:'Neither NOVA canonical nor an approved AM Intelligence source is fresh enough to run.'});
    return {status:'BLOCKED_STALE_DATA',runId:runId,freshness:freshness,label:'AURA RETENTION PILOT — DRY RUN'};
  }
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'FRESHNESS_PASSED','OK',{sourceType:freshness.selectedSource});
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RETENTION_STARTED','OK',{});
  var evaluate=v6AuraEvaluateRetention_();
  // evaluate itself re-checks freshness (defense in depth, cheap read-only DriveApp call);
  // if it somehow reports STALE here (source went stale between the two checks), honor it
  // rather than proceeding on data evaluate itself refused to use.
  if(evaluate.status==='BLOCKED_STALE_DATA'){
    if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RUN_FAILED','STALE_SOURCE',{errorCode:'STALE_SOURCE',errorMessage:'Source went stale between the arbitration check and the detection pass.'});
    return Object.assign({label:'AURA RETENTION PILOT — DRY RUN',runId:runId},evaluate);
  }

  var rows=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){return v6AuraText_(r.opportunityType)==='Retention';});
  var AM_ACTIVITY_REASONS=['AM ACTIVITY REVIEW REQUIRED','OWNER REQUIRED','COLLECTIONS'];
  var REVIEW_REASONS=['AM ACTIVITY REVIEW REQUIRED','AM CONTEXT REQUIRED'];
  var detected=0,suppressedByAmActivity=0,suppressedByMissingAmContext=0,suppressedByDataQuality=0,reviewRequired=0,frequencyBlocked=0,eligible=0;
  rows.forEach(function(r){
    var status=v6AuraText_(r.eligibilityStatus).toUpperCase(),reason=v6AuraText_(r.suppressionReason);
    if(status==='DETECTED'){
      detected++;
      var freq=v6FrequencyStatus_({accountId:r.accountId});
      if(freq&&freq.eligible===false){frequencyBlocked++;}else{eligible++;}
      return;
    }
    if(AM_ACTIVITY_REASONS.indexOf(reason)>=0)suppressedByAmActivity++;
    if(reason==='AM CONTEXT REQUIRED')suppressedByMissingAmContext++;
    if(reason==='FALSE POSITIVE')suppressedByDataQuality++;
    if(REVIEW_REASONS.indexOf(reason)>=0)reviewRequired++;
  });

  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RETENTION_COMPLETED','OK',{accountsEvaluated:rows.length,detected:detected,eligible:eligible,suppressed:evaluate.suppressed,reviewRequired:reviewRequired,campaignReady:evaluate.scopesBuilt});
  return {
    status:'DRY_RUN_COMPLETE',label:'AURA RETENTION PILOT — DRY RUN',
    runId:runId,
    sourceTimestamp:evaluate.syncedAt,
    accountsEvaluated:rows.length,
    detected:detected,
    suppressedByAmActivity:suppressedByAmActivity,
    suppressedByMissingAmContext:suppressedByMissingAmContext,
    suppressedByDataQuality:suppressedByDataQuality,
    // evaluate.suppressed is the true total (every non-DETECTED row, from v6AuraEvaluateRetention_'s
    // own byReason pass). The three named buckets above only cover the reasons this pilot report
    // was asked to break out; they do not include e.g. 'HIGHER PRIORITY SIGNAL' (cross-family
    // suppression). Using their sum here would silently under-report total suppressed accounts
    // whenever a competing higher-priority family (e.g. QNB) already claims some of them.
    suppressedTotal:evaluate.suppressed,
    reviewRequired:reviewRequired,
    frequencyBlocked:frequencyBlocked,
    eligible:eligible,
    campaignScopesGenerated:evaluate.scopesBuilt,
    recipientResolutionSuccess:0,
    recipientResolutionBlocked:evaluate.accountsScoped,
    blockedReason:'NO CAMPAIGN ID ASSIGNED YET (private backend createCampaign not reachable from this pack)'
  };
}

// --- Pure decision mapper (Task 8A) ------------------------------------------
// Never mutates its inputs, never reads/writes a sheet. Precedence is evaluated in the
// exact order below; the first matching rule wins. Only returns one of the ten literal
// values named in RETENTION_V1 spec -- no invented status.
function v6AuraDecisionFor_(opportunityRow,pipelineRow,hasScopeRow){
  var o=opportunityRow||{},p=pipelineRow||null,stage=p?v6AuraText_(p.currentStage):'';
  if(p&&stage==='RETAINED / EXPANDED')return 'RETAINED';
  if(p&&stage==='QUOTED')return 'QUOTED';
  if(p&&stage==='RFQ RECEIVED')return 'RFQ';
  if(p&&stage==='RESPONDED'&&v6AuraText_(p.handoffStatus))return 'HANDED_TO_AM';
  if(p&&stage==='RESPONDED')return 'RESPONDED';
  if(p&&stage==='CAMPAIGN ACTIVE')return 'ACTIVE';
  var eligibilityStatus=v6AuraText_(o.eligibilityStatus).toUpperCase(),reason=v6AuraText_(o.suppressionReason);
  if(eligibilityStatus==='SUPPRESSED'&&['AM ACTIVITY REVIEW REQUIRED','AM CONTEXT REQUIRED'].indexOf(reason)>=0)return 'REVIEW_REQUIRED';
  if(eligibilityStatus==='SUPPRESSED')return 'SUPPRESSED';
  if(eligibilityStatus==='DETECTED'&&hasScopeRow)return 'CAMPAIGN_READY';
  if(eligibilityStatus==='DETECTED')return 'ELIGIBLE';
  return '';
}

function v6AuraDataQualityStatus_(suppressionReason){
  var reason=v6AuraText_(suppressionReason);
  if(reason==='FALSE POSITIVE')return 'FLAGGED FALSE POSITIVE';
  if(reason==='AM CONTEXT REQUIRED')return 'AM CONTEXT MISSING';
  return 'OK';
}

function v6AuraDaysSinceLastLoad_(lastLoadDate){
  if(!lastLoadDate)return '';
  var d=new Date(lastLoadDate);
  if(isNaN(d.getTime()))return '';
  return Math.floor((new Date().getTime()-d.getTime())/86400000);
}

// --- AM-facing CSV report (Task 8B) ------------------------------------------
// Joins Retention opportunities (MKT_OPPORTUNITIES) with MKT_ACCOUNT_PIPELINE (stage/
// campaign/response/rfq/quote/load/attribution) and MKT_SCOPE_ACCOUNTS (scope linkage) --
// strictly by accountId, never by account name. No email/phone in any column. Also
// accumulates the same-row decision/status counts used by v6AuraWriteRunSummary_, so the
// summary table reflects exactly what the CSV itself reports (single source of truth,
// computed once per row).
//
// v6AuraBuildAmCsvRows_ does the join/mapping once (pure, no Drive write) so both the full
// AM CSV (v6AuraGenerateAmCsvReport_) and the Handoffs CSV (v6AuraGenerateHandoffsCsvReport_,
// Task 5) can reuse the exact same rows without re-reading MKT_OPPORTUNITIES/
// MKT_ACCOUNT_PIPELINE/MKT_SCOPE_ACCOUNTS twice. Each row also carries the raw
// responseAt/rfqAt/quoteAt/loadAt timestamps (not part of MKT_V6_AM_CSV_HEADERS, so they are
// never written to the AM CSV itself) purely so the Handoffs CSV can compute
// responseDate without a second sheet read.
function v6AuraBuildAmCsvRows_(runId,asOfDate){
  var oppRows=v6Rows_('MKT_OPPORTUNITIES').filter(function(r){return v6AuraText_(r.opportunityType)==='Retention';});
  var pipelineByAccount={};
  v6Rows_('MKT_ACCOUNT_PIPELINE').forEach(function(r){pipelineByAccount[v6AuraText_(r.accountId)]=r;});
  var scopeByAccount={};
  v6Rows_('MKT_SCOPE_ACCOUNTS').forEach(function(r){scopeByAccount[v6AuraText_(r.accountId)]=r;});

  var counts={campaignReady:0,responded:0,handedToAM:0,rfqs:0,quotes:0,loads:0},attributedRevenueTotal=0;
  var csvRows=oppRows.map(function(o){
    var accountId=v6AuraText_(o.accountId),pipelineRow=pipelineByAccount[accountId]||null,scopeRow=scopeByAccount[accountId]||null,hasScopeRow=!!scopeRow;
    var decision=v6AuraDecisionFor_(o,pipelineRow,hasScopeRow);
    if(decision==='CAMPAIGN_READY')counts.campaignReady++;
    if(decision==='HANDED_TO_AM')counts.handedToAM++;
    var responseAt=pipelineRow?v6AuraText_(pipelineRow.responseAt):'',rfqAt=pipelineRow?v6AuraText_(pipelineRow.rfqAt):'',quoteAt=pipelineRow?v6AuraText_(pipelineRow.quoteAt):'',loadAt=pipelineRow?v6AuraText_(pipelineRow.loadAt):'';
    if(responseAt)counts.responded++;
    if(rfqAt)counts.rfqs++;
    if(quoteAt)counts.quotes++;
    if(loadAt)counts.loads++;
    var revenueRaw=pipelineRow?pipelineRow.attributedRevenue:null,hasRevenue=revenueRaw!=null&&String(revenueRaw)!==''&&!isNaN(Number(revenueRaw));
    if(hasRevenue)attributedRevenueTotal+=Number(revenueRaw);
    var campaignId=pipelineRow&&v6AuraText_(pipelineRow.campaignId)?v6AuraText_(pipelineRow.campaignId):(scopeRow&&v6AuraText_(scopeRow.campaignId)?v6AuraText_(scopeRow.campaignId):'');
    return {
      runId:runId,asOfDate:asOfDate,accountId:accountId,accountName:v6AuraText_(o.accountName),amOwner:v6AuraText_(o.amOwner),
      currentTier:v6AuraText_(o.tierDestino),bucket:v6AuraText_(o.amActivityBucket),retentionSignal:'RETENTION',
      signalReason:v6AuraText_(o.suppressionReason)||'NONE',sourceReport:v6AuraText_(o.sourceReport),sourceRecordId:v6AuraText_(o.sourceRecordId),
      lastCommercialActivity:v6AuraText_(o.amActivityUltimoChatter),lastLoadDate:v6AuraText_(o.signalDate),
      daysSinceLastLoad:v6AuraDaysSinceLastLoad_(o.signalDate),service:v6AuraText_(o.service),priority:o.priorityRank,
      auraDecision:decision,suppressionReason:v6AuraText_(o.suppressionReason),dataQualityStatus:v6AuraDataQualityStatus_(o.suppressionReason),
      campaignEligible:(decision==='ELIGIBLE'||decision==='CAMPAIGN_READY')?'YES':'NO',
      campaignId:campaignId,scopeId:scopeRow?v6AuraText_(scopeRow.scopeId):'',
      campaignStatus:pipelineRow?v6AuraText_(pipelineRow.currentStage):(hasScopeRow?'NO PIPELINE RECORD':'NOT YET SCOPED'),
      responseStatus:responseAt?'YES '+responseAt:'',handoffStatus:pipelineRow?v6AuraText_(pipelineRow.handoffStatus):'',
      rfqStatus:rfqAt?'YES '+rfqAt:'',quoteStatus:quoteAt?'YES '+quoteAt:'',loadStatus:loadAt?'YES '+loadAt:'',
      attributedRevenue:hasRevenue?revenueRaw:'',nextAction:pipelineRow?v6AuraText_(pipelineRow.nextAction):'',
      // Internal-only fields, not part of MKT_V6_AM_CSV_HEADERS -- v6Csv_ only serializes the
      // named headers it is given, so these never leak into the AM CSV. Reused as-is by
      // v6AuraGenerateHandoffsCsvReport_ so it never has to re-read MKT_ACCOUNT_PIPELINE.
      responseAtRaw:responseAt,rfqAtRaw:rfqAt,quoteAtRaw:quoteAt,loadAtRaw:loadAt
    };
  });

  return {csvRows:csvRows,counts:counts,attributedRevenueTotal:attributedRevenueTotal};
}

function v6AuraGenerateAmCsvReport_(runId,asOfDate){
  var built=v6AuraBuildAmCsvRows_(runId,asOfDate);
  var csvText=v6Csv_(MKT_V6_AM_CSV_HEADERS,built.csvRows);
  // Drive does not collide on duplicate file names (unlike a keyed table row) -- every
  // runId is unique by construction (Utilities.getUuid()), so this always creates a new
  // file and never overwrites a prior run's historical CSV.
  var fileName='AURA_RETENTION_AM_'+asOfDate+'_'+runId+'.csv';
  var file=DriveApp.getFolderById(v6AuraResolveReportsFolder_()).createFile(fileName,csvText,MimeType.CSV);
  return {
    status:'CSV_GENERATED',csvDriveFileId:file.getId(),fileName:fileName,rowCount:built.csvRows.length,
    decisionCounts:built.counts,attributedRevenueTotal:built.attributedRevenueTotal,
    // Additive: lets v6AuraRunRetentionCycle_ hand the same rows to
    // v6AuraGenerateHandoffsCsvReport_ without a second join/read. Never part of any prior
    // tested contract shape (existing callers that only read the fields above are unaffected).
    csvRows:built.csvRows
  };
}

// --- Most-recent-date helper for the Handoffs CSV (Task 5) -------------------
// Picks the latest of the given ISO-like date strings. Parses as real dates when possible
// (all of responseAt/rfqAt/quoteAt/loadAt are ISO timestamps written by
// v6UpsertPipelineStage_/MarketingV6ResponseEvents.gs); falls back to a plain string
// comparison only if parsing fails, rather than silently dropping an unparsable-but-present
// date.
function v6AuraMostRecentDate_(dates){
  var candidates=(dates||[]).map(v6AuraText_).filter(Boolean);
  if(!candidates.length)return '';
  candidates.sort(function(a,b){
    var da=new Date(a).getTime(),db=new Date(b).getTime();
    if(!isNaN(da)&&!isNaN(db))return db-da;
    return a<b?1:(a>b?-1:0);
  });
  return candidates[0];
}

// --- AM-facing Handoffs CSV (Task 5) ------------------------------------------
// A narrower, AM-actionable slice of the same rows v6AuraGenerateAmCsvReport_ already built
// (passed in explicitly as csvRows -- never re-reads MKT_OPPORTUNITIES/MKT_ACCOUNT_PIPELINE/
// MKT_SCOPE_ACCOUNTS to avoid rebuilding the join twice per cycle). Only accounts whose
// auraDecision reflects a real, already-in-motion commercial response
// (MKT_V6_AM_HANDOFF_DECISIONS) are included -- accounts still ELIGIBLE/SUPPRESSED/
// CAMPAIGN_READY/ACTIVE/REVIEW_REQUIRED never appear here. No email/phone in any column.
function v6AuraGenerateHandoffsCsvReport_(runId,asOfDate,csvRows){
  var filtered=(csvRows||[]).filter(function(r){return MKT_V6_AM_HANDOFF_DECISIONS.indexOf(r.auraDecision)>=0;});
  var rows=filtered.map(function(r){
    return {
      runId:runId,accountId:r.accountId,accountName:r.accountName,amOwner:r.amOwner,campaignId:r.campaignId,
      responseType:r.auraDecision,
      responseDate:v6AuraMostRecentDate_([r.responseAtRaw,r.rfqAtRaw,r.quoteAtRaw,r.loadAtRaw]),
      handoffStatus:r.handoffStatus,nextAction:r.nextAction,rfqStatus:r.rfqStatus,quoteStatus:r.quoteStatus,
      loadStatus:r.loadStatus,attributedRevenue:r.attributedRevenue
    };
  });
  var csvText=v6Csv_(MKT_V6_AM_HANDOFFS_CSV_HEADERS,rows);
  var fileName='AURA_RETENTION_HANDOFFS_'+asOfDate+'_'+runId+'.csv';
  var file=DriveApp.getFolderById(v6AuraResolveReportsFolder_()).createFile(fileName,csvText,MimeType.CSV);
  return {status:'CSV_GENERATED',csvDriveFileId:file.getId(),fileName:fileName,rowCount:rows.length};
}

// --- Persisted run summary (Task 8C) -----------------------------------------
function v6AuraWriteRunSummary_(runId,asOfDate,metrics){
  var m=metrics||{},now=new Date().toISOString();
  return v6UpsertByKey_('MKT_RETENTION_RUN_SUMMARY',['runId'],{
    runId:runId,asOfDate:asOfDate,
    accountsEvaluated:m.accountsEvaluated||0,detected:m.detected||0,eligible:m.eligible||0,suppressed:m.suppressed||0,
    reviewRequired:m.reviewRequired||0,campaignReady:m.campaignReady||0,responded:m.responded||0,handedToAM:m.handedToAM||0,
    rfqs:m.rfqs||0,quotes:m.quotes||0,loads:m.loads||0,attributedRevenue:m.attributedRevenue||0,
    csvDriveFileId:m.csvDriveFileId||'',
    // Additive (Task 5): the Handoffs CSV is a separate file from the full AM CSV above;
    // recorded alongside it so the run summary row always names both artifacts for a given
    // runId. Existing readers of csvDriveFileId are unaffected -- this is a new column, not a
    // replacement.
    handoffsCsvDriveFileId:m.handoffsCsvDriveFileId||'',
    createdAt:now
  });
}

function v6AuraRetentionRunSummary_(payload){
  var runId=v6AuraText_((payload||{}).runId);
  if(!runId)throw new Error('runId REQUIRED');
  return v6Rows_('MKT_RETENTION_RUN_SUMMARY').filter(function(r){return v6AuraText_(r.runId)===runId;})[0]||{runId:runId,status:'NOT FOUND'};
}

// --- Single orchestrator (Task 8D) -------------------------------------------
// If the dry run is BLOCKED_STALE_DATA, no CSV and no summary row are generated -- the
// same fail-closed contract as v6AuraEvaluateRetention_ itself; a stale-data pilot number
// must never be handed to AM as if it were current.
function v6AuraRunRetentionCycle_(runId){
  var dryRun=v6AuraRetentionDryRun_(runId);
  if(dryRun.status==='BLOCKED_STALE_DATA')return dryRun;
  var asOfDate=Utilities.formatDate(new Date(),(typeof Session!=='undefined'&&Session.getScriptTimeZone&&Session.getScriptTimeZone())||'America/Bogota','yyyy-MM-dd');
  runId=dryRun.runId;
  var csv=v6AuraGenerateAmCsvReport_(runId,asOfDate);
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'CSV_CREATED','OK',{csvCreated:true});
  // Task 5: Handoffs CSV reuses the exact rows v6AuraGenerateAmCsvReport_ already built
  // (csv.csvRows) -- no second join/read of MKT_OPPORTUNITIES/MKT_ACCOUNT_PIPELINE/
  // MKT_SCOPE_ACCOUNTS for the same cycle.
  var handoffs=v6AuraGenerateHandoffsCsvReport_(runId,asOfDate,csv.csvRows);
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'HANDOFF_CSV_CREATED','OK',{handoffsCsvCreated:true});
  var suppressed=dryRun.suppressedTotal||0;
  var summaryMetrics={
    accountsEvaluated:dryRun.accountsEvaluated,detected:dryRun.detected,eligible:dryRun.eligible,suppressed:suppressed,
    reviewRequired:dryRun.reviewRequired,campaignReady:csv.decisionCounts.campaignReady,responded:csv.decisionCounts.responded,
    handedToAM:csv.decisionCounts.handedToAM,rfqs:csv.decisionCounts.rfqs,quotes:csv.decisionCounts.quotes,loads:csv.decisionCounts.loads,
    attributedRevenue:csv.attributedRevenueTotal,csvDriveFileId:csv.csvDriveFileId,handoffsCsvDriveFileId:handoffs.csvDriveFileId
  };
  v6AuraWriteRunSummary_(runId,asOfDate,summaryMetrics);
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RUN_SUMMARY_WRITTEN','OK',{accountsEvaluated:summaryMetrics.accountsEvaluated,detected:summaryMetrics.detected,eligible:summaryMetrics.eligible,suppressed:summaryMetrics.suppressed,reviewRequired:summaryMetrics.reviewRequired,campaignReady:summaryMetrics.campaignReady,csvCreated:true,handoffsCsvCreated:true});
  if(typeof v6AuraLogStage_==='function')v6AuraLogStage_(runId,'RUN_COMPLETED','OK',{});
  return {runId:runId,asOfDate:asOfDate,csvDriveFileId:csv.csvDriveFileId,handoffsCsvDriveFileId:handoffs.csvDriveFileId,metrics:summaryMetrics,status:'CYCLE_COMPLETE'};
}
