// AURA Retention pilot dry-run + AM CSV report + persisted run summary.
//
// Every function here reuses an already-existing engine (v6AuraEvaluateRetention_,
// v6AuraCheckReportFreshness_, v6FrequencyStatus_, v6Csv_/v6CsvEscape_, v6UpsertByKey_) --
// no suppression rule, no frequency rule, no new opportunity/pipeline mechanism is
// introduced here. This file only aggregates what those engines already decided and
// produces a private, non-PII CSV for AM plus a persisted run summary row.

// One-time, DGL-owned Drive folder for AM-facing Retention reports. Deliberately separate
// from MKT_V6_ARCHIVE (MarketingV6DriveArchive.gs), which is for campaign-execution
// artifacts (audience CSV/HTML/copy/results), not AM reporting. Replace this placeholder
// with the real private folder ID before deploying -- see docs/AURA_DEPLOYMENT.md.
var MKT_V6_AM_REPORTS_FOLDER_ID='REPLACE_WITH_REAL_AM_REPORTS_DRIVE_FOLDER_ID';

var MKT_V6_AM_CSV_HEADERS=['runId','asOfDate','accountId','accountName','amOwner','currentTier','bucket','retentionSignal','signalReason','sourceReport','sourceRecordId','lastCommercialActivity','lastLoadDate','daysSinceLastLoad','service','priority','auraDecision','suppressionReason','dataQualityStatus','campaignEligible','campaignId','scopeId','campaignStatus','responseStatus','handoffStatus','rfqStatus','quoteStatus','loadStatus','attributedRevenue','nextAction'];

// --- Pilot dry run -----------------------------------------------------------
function v6AuraRetentionDryRun_(){
  var freshness=v6AuraCheckReportFreshness_();
  if(freshness.status==='STALE')return {status:'BLOCKED_STALE_DATA',freshness:freshness,label:'AURA RETENTION PILOT — DRY RUN'};
  var evaluate=v6AuraEvaluateRetention_();
  // evaluate itself re-checks freshness (defense in depth, cheap read-only DriveApp call);
  // if it somehow reports STALE here (source went stale between the two checks), honor it
  // rather than proceeding on data evaluate itself refused to use.
  if(evaluate.status==='BLOCKED_STALE_DATA')return Object.assign({label:'AURA RETENTION PILOT — DRY RUN'},evaluate);

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

  return {
    status:'DRY_RUN_COMPLETE',label:'AURA RETENTION PILOT — DRY RUN',
    runId:'RUN-'+Utilities.getUuid().slice(0,8).toUpperCase(),
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
function v6AuraGenerateAmCsvReport_(runId,asOfDate){
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
      attributedRevenue:hasRevenue?revenueRaw:'',nextAction:pipelineRow?v6AuraText_(pipelineRow.nextAction):''
    };
  });

  var csvText=v6Csv_(MKT_V6_AM_CSV_HEADERS,csvRows);
  // Drive does not collide on duplicate file names (unlike a keyed table row) -- every
  // runId is unique by construction (Utilities.getUuid()), so this always creates a new
  // file and never overwrites a prior run's historical CSV.
  var fileName='AURA_RETENTION_AM_'+asOfDate+'_'+runId+'.csv';
  var file=DriveApp.getFolderById(MKT_V6_AM_REPORTS_FOLDER_ID).createFile(fileName,csvText,MimeType.CSV);
  return {
    status:'CSV_GENERATED',csvDriveFileId:file.getId(),fileName:fileName,rowCount:csvRows.length,
    decisionCounts:counts,attributedRevenueTotal:attributedRevenueTotal
  };
}

// --- Persisted run summary (Task 8C) -----------------------------------------
function v6AuraWriteRunSummary_(runId,asOfDate,metrics){
  var m=metrics||{},now=new Date().toISOString();
  return v6UpsertByKey_('MKT_RETENTION_RUN_SUMMARY',['runId'],{
    runId:runId,asOfDate:asOfDate,
    accountsEvaluated:m.accountsEvaluated||0,detected:m.detected||0,eligible:m.eligible||0,suppressed:m.suppressed||0,
    reviewRequired:m.reviewRequired||0,campaignReady:m.campaignReady||0,responded:m.responded||0,handedToAM:m.handedToAM||0,
    rfqs:m.rfqs||0,quotes:m.quotes||0,loads:m.loads||0,attributedRevenue:m.attributedRevenue||0,
    csvDriveFileId:m.csvDriveFileId||'',createdAt:now
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
function v6AuraRunRetentionCycle_(){
  var dryRun=v6AuraRetentionDryRun_();
  if(dryRun.status==='BLOCKED_STALE_DATA')return dryRun;
  var asOfDate=Utilities.formatDate(new Date(),(typeof Session!=='undefined'&&Session.getScriptTimeZone&&Session.getScriptTimeZone())||'America/Bogota','yyyy-MM-dd');
  var runId=dryRun.runId;
  var csv=v6AuraGenerateAmCsvReport_(runId,asOfDate);
  var suppressed=dryRun.suppressedTotal||0;
  var summaryMetrics={
    accountsEvaluated:dryRun.accountsEvaluated,detected:dryRun.detected,eligible:dryRun.eligible,suppressed:suppressed,
    reviewRequired:dryRun.reviewRequired,campaignReady:csv.decisionCounts.campaignReady,responded:csv.decisionCounts.responded,
    handedToAM:csv.decisionCounts.handedToAM,rfqs:csv.decisionCounts.rfqs,quotes:csv.decisionCounts.quotes,loads:csv.decisionCounts.loads,
    attributedRevenue:csv.attributedRevenueTotal,csvDriveFileId:csv.csvDriveFileId
  };
  v6AuraWriteRunSummary_(runId,asOfDate,summaryMetrics);
  return {runId:runId,asOfDate:asOfDate,csvDriveFileId:csv.csvDriveFileId,metrics:summaryMetrics,status:'CYCLE_COMPLETE'};
}
