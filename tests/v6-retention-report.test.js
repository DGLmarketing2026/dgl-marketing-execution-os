const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestionSource=src('MarketingV6ReportIngestion.gs');
const pipelineSource=src('MarketingV6Pipeline.gs');
const recipientSource=src('MarketingV6RecipientResolution.gs');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const responseEventsSource=src('MarketingV6ResponseEvents.gs');
const freshnessSource=src('MarketingV6DataFreshness.gs');
const frequencySource=src('MarketingV6FrequencyControl.gs');
const archiveSource=src('MarketingV6DriveArchive.gs');
const reportSource=src('MarketingV6RetentionReport.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

function fakeUtilities(){
  var n=0;
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate(d){return d.toISOString().slice(0,10);},
    getUuid(){n++;return 'UUID-'+('00000000'+n).slice(-8);}
  };
}
function fakeDriveApp(files,lastUpdated){
  return {
    getFolderById:function(id){return {createFile:function(name,content,mime){var f={id:'FILE-'+(Object.keys(files).length+1),name:name,content:content,mime:mime,folderId:id};f.getId=function(){return f.id;};files[name]=f;return f;}};},
    getFileById:function(){return {getLastUpdated:function(){return lastUpdated||new Date(Date.now()-3600000);}};}
  };
}

function makeContext(tables,files){
  tables=tables||{};files=files||{};
  var ctx={Utilities:fakeUtilities(),Session:{getScriptTimeZone:function(){return 'UTC';}},SpreadsheetApp:{},ScriptApp:{},MimeType:{CSV:'CSV'},DriveApp:fakeDriveApp(files),Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,isNaN:isNaN,console:console};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(pipelineSource,ctx,{filename:'MarketingV6Pipeline.gs'});
  vm.runInContext(recipientSource,ctx,{filename:'MarketingV6RecipientResolution.gs'});
  vm.runInContext(freshnessSource,ctx,{filename:'MarketingV6DataFreshness.gs'});
  vm.runInContext(frequencySource,ctx,{filename:'MarketingV6FrequencyControl.gs'});
  vm.runInContext(bridgeSource,ctx,{filename:'MarketingV6AuraBridge.gs'});
  vm.runInContext(responseEventsSource,ctx,{filename:'MarketingV6ResponseEvents.gs'});
  vm.runInContext(archiveSource,ctx,{filename:'MarketingV6DriveArchive.gs'});
  vm.runInContext(reportSource,ctx,{filename:'MarketingV6RetentionReport.gs'});

  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6RecipientRows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.v6RequireContactRecipientHeaders_=function(){return true;};
  var OPP_HEADERS=['opportunityId','accountId','accountName','amOwner','opportunityType','service','signalDate','qnbWindow','lane','sourceReport','sourceRecordId','priorityRank','eligibilityStatus','suppressionReason','campaignId','detectedAt','updatedAt','amActivityBucket','amActivityTipoGestion','amActivityUltimoChatter','amActivityAutorChatter','tierDestino'];
  ctx.v6Sheet_=function(name){
    if(name!=='MKT_OPPORTUNITIES')throw new Error('unexpected v6Sheet_ call: '+name);
    return {
      getLastColumn:function(){return OPP_HEADERS.length;},
      getLastRow:function(){return (tables.MKT_OPPORTUNITIES||[]).length+1;},
      getRange:function(row){
        if(row===1)return {getValues:function(){return [OPP_HEADERS];}};
        return {
          clearContent:function(){tables.MKT_OPPORTUNITIES=[];},
          setValues:function(values){
            tables.MKT_OPPORTUNITIES=values.map(function(rowValues){
              var o={};OPP_HEADERS.forEach(function(h,i){o[h]=rowValues[i];});return o;
            });
          }
        };
      }
    };
  };
  ctx.__tables=tables;ctx.__files=files;
  return ctx;
}

function baseReportTables(overrides){
  var base={MIGRACION_CAIDAS:[],CUENTAS:[],FICHA_CLIENTES:[],LQS_SIN_RESPUESTA:[],MIGRACION_RECUPERADAS:[]};
  return Object.assign(base,overrides||{});
}

function csvRows(csvText){
  var lines=csvText.split('\r\n');
  var headers=lines[0].split(',');
  return lines.slice(1).filter(Boolean).map(function(line){
    // simple splitter sufficient for these synthetic, comma/quote-free test values
    var cells=line.split(',');var o={};headers.forEach(function(h,i){o[h]=cells[i];});return o;
  });
}

// === Task 7: v6AuraRetentionDryRun_ =========================================

(function dryRunStaleTest(){
  var ctx=makeContext({},{});
  ctx.DriveApp={getFileById:function(){return {getLastUpdated:function(){return new Date(Date.now()-10*3600000);}};}};
  ctx.v6ReportRows_=function(){throw new Error('must not read reports when STALE');};
  var result=ctx.v6AuraRetentionDryRun_();
  assert.equal(result.status,'BLOCKED_STALE_DATA');
  assert.equal(result.label,'AURA RETENTION PILOT — DRY RUN');
  console.log('retention report test 1 (dry run STALE short-circuits, no report reads): PASS');
})();

(function dryRunCategoriesTest(){
  var ctx=makeContext({},{});
  var reportTables=baseReportTables({
    MIGRACION_CAIDAS:[
      {Cuenta:'Detected Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'Blocked Freq Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'Review Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'No Context Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'False Positive Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'Collections Co','Sales Rep':'Jane','Sin dueno':'NO'}
    ],
    CUENTAS:[
      {Cuenta:'Detected Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''},
      {Cuenta:'Blocked Freq Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''},
      {Cuenta:'Review Co',Bucket:'8. GESTIONADAS SIN OPERAR','Tipo gestion':'COMERCIAL'},
      {Cuenta:'False Positive Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':'','Falso positivo':'SI'},
      {Cuenta:'Collections Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':'','Solo cobranza':'SI'}
    ]
  });
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  var blockedAccountId='ACC-'+ctx.v6HashKey_(ctx.v6NormAccount_('Blocked Freq Co'));
  ctx.v6FrequencyStatus_=function(payload){return payload.accountId===blockedAccountId?{eligible:false}:{eligible:true};};
  var result=ctx.v6AuraRetentionDryRun_();
  assert.equal(result.status,'DRY_RUN_COMPLETE');
  assert.equal(result.accountsEvaluated,6);
  assert.equal(result.detected,2,'Detected Co + Blocked Freq Co (both DETECTED before frequency check)');
  assert.equal(result.frequencyBlocked,1,'Blocked Freq Co only');
  assert.equal(result.eligible,1,'Detected Co only (DETECTED and not frequency-blocked)');
  assert.equal(result.suppressedByAmActivity,2,'Review Co (AM ACTIVITY REVIEW REQUIRED) + Collections Co (COLLECTIONS)');
  assert.equal(result.suppressedByMissingAmContext,1,'No Context Co');
  assert.equal(result.suppressedByDataQuality,1,'False Positive Co');
  assert.equal(result.reviewRequired,2,'Review Co + No Context Co (AM ACTIVITY REVIEW REQUIRED + AM CONTEXT REQUIRED)');
  assert.equal(result.campaignScopesGenerated,1);
  assert.equal(result.recipientResolutionSuccess,0);
  assert.equal(result.recipientResolutionBlocked,2,'accountsScoped from the evaluate step (both DETECTED accounts, frequency-blocking is a report-time-only distinction)');
  assert(result.blockedReason.indexOf('NO CAMPAIGN ID ASSIGNED YET')===0);
  assert.equal(result.suppressedTotal,4,'Review Co + Collections Co + No Context Co + False Positive Co (all 4 SUPPRESSED rows)');
  console.log('retention report test 2 (dry run category classification with synthetic data): PASS');
})();

// Regression: a Retention row suppressed by cross-family priority (HIGHER PRIORITY SIGNAL,
// e.g. a QNB signal on the same account) falls outside all three named buckets
// (AM activity / missing AM context / data quality). suppressedTotal must still count it,
// so the run summary's total suppressed count is never silently under-reported.
(function dryRunHigherPrioritySuppressionTest(){
  var ctx=makeContext({},{});
  var reportTables=baseReportTables({
    MIGRACION_CAIDAS:[{Cuenta:'Contested Co','Sales Rep':'Jane','Sin dueno':'NO'}],
    CUENTAS:[{Cuenta:'Contested Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''}],
    LQS_SIN_RESPUESTA:[{Cliente:'Contested Co',Agente:'Jane',Area:'FTL',Bucket:'0-14','Fecha creacion':'2026-08-01',LQ:'LQ-1'}]
  });
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  var result=ctx.v6AuraRetentionDryRun_();
  assert.equal(result.accountsEvaluated,1);
  assert.equal(result.detected,0,'QNB (priority 1) outranks Retention (priority 2) for the same account');
  assert.equal(result.suppressedByAmActivity,0);
  assert.equal(result.suppressedByMissingAmContext,0);
  assert.equal(result.suppressedByDataQuality,0);
  assert.equal(result.reviewRequired,0);
  assert.equal(result.suppressedTotal,1,'HIGHER PRIORITY SIGNAL is not any of the three named buckets but must still count as suppressed');
  console.log('retention report test 2b (suppressedTotal counts HIGHER PRIORITY SIGNAL rows the 3 named buckets miss): PASS');
})();

// === Task 8A: v6AuraDecisionFor_ — one test per branch =======================

(function decisionBranchTests(){
  var ctx=makeContext({},{});
  var d=ctx.v6AuraDecisionFor_;

  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'RETAINED / EXPANDED'},false),'RETAINED');
  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'QUOTED'},false),'QUOTED');
  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'RFQ RECEIVED'},false),'RFQ');
  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'RESPONDED',handoffStatus:'PENDING'},false),'HANDED_TO_AM');
  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'RESPONDED',handoffStatus:''},false),'RESPONDED');
  assert.equal(d({eligibilityStatus:'DETECTED'},{currentStage:'CAMPAIGN ACTIVE'},false),'ACTIVE');
  assert.equal(d({eligibilityStatus:'SUPPRESSED',suppressionReason:'AM ACTIVITY REVIEW REQUIRED'},null,false),'REVIEW_REQUIRED');
  assert.equal(d({eligibilityStatus:'SUPPRESSED',suppressionReason:'AM CONTEXT REQUIRED'},null,false),'REVIEW_REQUIRED');
  assert.equal(d({eligibilityStatus:'SUPPRESSED',suppressionReason:'OWNER REQUIRED'},null,false),'SUPPRESSED');
  assert.equal(d({eligibilityStatus:'DETECTED'},null,true),'CAMPAIGN_READY');
  assert.equal(d({eligibilityStatus:'DETECTED'},null,false),'ELIGIBLE');
  // precedence: an existing pipeline row always wins over opportunity-level status
  assert.equal(d({eligibilityStatus:'SUPPRESSED',suppressionReason:'OWNER REQUIRED'},{currentStage:'QUOTED'},false),'QUOTED','pipeline stage must win over opportunity suppression once advanced');
  console.log('retention report test 3 (v6AuraDecisionFor_ — one assertion per branch, 10 branches + 2 precedence checks): PASS');
})();

// === Task 8B: v6AuraGenerateAmCsvReport_ ====================================

(function csvReportTest(){
  var files={};
  var ctx=makeContext({
    MKT_OPPORTUNITIES:[
      {accountId:'ACC-1',accountName:'Ready Co',amOwner:'Jane',opportunityType:'Retention',service:'FTL',signalDate:'2026-08-01',priorityRank:2,eligibilityStatus:'DETECTED',suppressionReason:'',sourceReport:'MIGRACION_CAIDAS',sourceRecordId:'T1>T2',amActivityBucket:'2. OPERA SIN GESTION',amActivityUltimoChatter:'2026-07-01',tierDestino:'Tier 2'},
      {accountId:'ACC-2',accountName:'Suppressed Co',amOwner:'Jane',opportunityType:'Retention',service:'LTL',signalDate:'',priorityRank:2,eligibilityStatus:'SUPPRESSED',suppressionReason:'AM CONTEXT REQUIRED',sourceReport:'MIGRACION_CAIDAS',sourceRecordId:'T1>T2',amActivityBucket:'',amActivityUltimoChatter:'',tierDestino:''}
    ],
    MKT_ACCOUNT_PIPELINE:[
      {accountId:'ACC-1',currentStage:'CAMPAIGN ACTIVE',campaignId:'CAM-1',handoffStatus:'',nextAction:'MONITOR',responseAt:'',rfqAt:'',quoteAt:'',loadAt:'',attributedRevenue:''}
    ],
    MKT_SCOPE_ACCOUNTS:[
      {scopeId:'SCOPE-JANE-RETENTION-FTL',accountId:'ACC-1',campaignId:''}
    ]
  },files);
  var result=ctx.v6AuraGenerateAmCsvReport_('RUN-TEST1','2026-09-04');
  assert.equal(result.status,'CSV_GENERATED');
  assert.equal(result.rowCount,2);
  assert.equal(result.fileName,'AURA_RETENTION_AM_2026-09-04_RUN-TEST1.csv');
  var file=files[result.fileName];
  assert(file,'CSV must be created in the AM reports folder');
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(file.content),'CSV must never contain an email address');
  var rows=csvRows(file.content);
  assert.equal(rows.length,2);
  var ready=rows.filter(function(r){return r.accountId==='ACC-1';})[0];
  assert.equal(ready.auraDecision,'ACTIVE');
  assert.equal(ready.campaignStatus,'CAMPAIGN ACTIVE');
  assert.equal(ready.scopeId,'SCOPE-JANE-RETENTION-FTL');
  assert.equal(ready.campaignId,'CAM-1');
  assert.equal(ready.currentTier,'Tier 2');
  assert.equal(ready.dataQualityStatus,'OK');
  assert.equal(ready.campaignEligible,'NO','ACTIVE is not ELIGIBLE/CAMPAIGN_READY');
  var suppressed=rows.filter(function(r){return r.accountId==='ACC-2';})[0];
  assert.equal(suppressed.auraDecision,'REVIEW_REQUIRED');
  assert.equal(suppressed.dataQualityStatus,'AM CONTEXT MISSING');
  assert.equal(suppressed.campaignStatus,'NOT YET SCOPED');
  assert.equal(suppressed.lastLoadDate,'');
  assert.equal(suppressed.daysSinceLastLoad,'');
  console.log('retention report test 4 (AM CSV report: columns, decision join, no PII): PASS');
})();

// === Task 8C: run summary persistence + read-back ===========================

(function runSummaryTest(){
  var ctx=makeContext({},{});
  var written=ctx.v6AuraWriteRunSummary_('RUN-SUM-1','2026-09-04',{accountsEvaluated:5,detected:2,eligible:1,suppressed:3,reviewRequired:2,campaignReady:1,responded:0,handedToAM:0,rfqs:0,quotes:0,loads:0,attributedRevenue:0,csvDriveFileId:'FILE-1'});
  assert.equal(written.runId,'RUN-SUM-1');
  var readBack=ctx.v6AuraRetentionRunSummary_({runId:'RUN-SUM-1'});
  assert.equal(readBack.accountsEvaluated,5);
  assert.equal(readBack.csvDriveFileId,'FILE-1');
  var notFound=ctx.v6AuraRetentionRunSummary_({runId:'RUN-NONE'});
  assert.equal(notFound.status,'NOT FOUND');
  console.log('retention report test 5 (run summary write + read-back, unknown runId is NOT FOUND): PASS');
})();

// === Task 8D: v6AuraRunRetentionCycle_ orchestrator =========================

(function cycleStaleTest(){
  var ctx=makeContext({},{});
  ctx.DriveApp={getFileById:function(){return {getLastUpdated:function(){return new Date(Date.now()-10*3600000);}};}};
  ctx.v6ReportRows_=function(){throw new Error('must not read reports when STALE');};
  var result=ctx.v6AuraRunRetentionCycle_();
  assert.equal(result.status,'BLOCKED_STALE_DATA');
  console.log('retention report test 6 (run cycle: STALE never generates a CSV or summary): PASS');
})();

(function cycleCompleteTest(){
  var tables={},files={};
  var ctx=makeContext(tables,files);
  var reportTables=baseReportTables({
    MIGRACION_CAIDAS:[{Cuenta:'Cycle Co','Sales Rep':'Jane','Sin dueno':'NO'}],
    CUENTAS:[{Cuenta:'Cycle Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''}]
  });
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  var result=ctx.v6AuraRunRetentionCycle_();
  assert.equal(result.status,'CYCLE_COMPLETE');
  assert(result.runId);
  assert(result.csvDriveFileId);
  assert(tables.MKT_RETENTION_RUN_SUMMARY.length===1);
  assert.equal(tables.MKT_RETENTION_RUN_SUMMARY[0].runId,result.runId);
  assert.equal(tables.MKT_RETENTION_RUN_SUMMARY[0].csvDriveFileId,result.csvDriveFileId);
  assert.equal(Object.keys(files).length,1);
  console.log('retention report test 7 (run cycle: FRESH source produces CSV + persisted summary): PASS');
})();

['v6AuraAuditCanonicalIds:v6AuraAuditCanonicalIds_','v6AuraRetentionDryRun:v6AuraRetentionDryRun_','v6AuraRunRetentionCycle:v6AuraRunRetentionCycle_','v6AuraRetentionRunSummary:v6AuraRetentionRunSummary_'].forEach(function(entry){
  assert(routerSource.includes(entry),'router must expose '+entry);
});
console.log('V6 retention report/pilot: ALL PASS');
