const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestionSource=src('MarketingV6ReportIngestion.gs');
const pipelineSource=src('MarketingV6Pipeline.gs');
const recipientSource=src('MarketingV6RecipientResolution.gs');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const responseEventsSource=src('MarketingV6ResponseEvents.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

function fakeUtilities(){
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate(d){return d.toISOString().slice(0,10);}
  };
}

// MKT_OPPORTUNITIES fake sheet headers -- deliberately excludes the 4 amActivity*
// evidence fields, mirroring the real sheet not having those columns yet
// (see progress.md); v6WriteOpportunities_ must silently drop unknown fields.
var OPP_HEADERS=['opportunityId','accountId','accountName','amOwner','opportunityType','service','signalDate','qnbWindow','lane','sourceReport','sourceRecordId','priorityRank','eligibilityStatus','suppressionReason','campaignId','detectedAt','updatedAt'];

function makeContext(tables){
  tables=tables||{};
  var ctx={Utilities:fakeUtilities(),Session:{getScriptTimeZone:function(){return 'UTC';}},SpreadsheetApp:{},ScriptApp:{},Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,console:console};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(pipelineSource,ctx,{filename:'MarketingV6Pipeline.gs'});
  vm.runInContext(recipientSource,ctx,{filename:'MarketingV6RecipientResolution.gs'});
  vm.runInContext(bridgeSource,ctx,{filename:'MarketingV6AuraBridge.gs'});
  vm.runInContext(responseEventsSource,ctx,{filename:'MarketingV6ResponseEvents.gs'});

  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6RecipientRows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.v6RequireContactRecipientHeaders_=function(){return true;};
  // v6WriteOpportunities_ (unmodified, real implementation) writes through v6Sheet_;
  // this fake persists into tables.MKT_OPPORTUNITIES using the header contract above.
  ctx.v6Sheet_=function(name){
    if(name!=='MKT_OPPORTUNITIES')throw new Error('unexpected v6Sheet_ call: '+name);
    return {
      getLastColumn:function(){return OPP_HEADERS.length;},
      getLastRow:function(){return (tables.MKT_OPPORTUNITIES||[]).length+1;},
      getRange:function(row,col,numRows,numCols){
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
  ctx.__tables=tables;
  return ctx;
}

function emptyReportTables(overrides){
  var base={MIGRACION_CAIDAS:[],CUENTAS:[],FICHA_CLIENTES:[],LQS_SIN_RESPUESTA:[],MIGRACION_RECUPERADAS:[]};
  return Object.assign(base,overrides||{});
}

// 1. v6AuraEvaluateRetention_ aggregates DETECTED / SUPPRESSED / reviewRequired correctly
(function evaluateRetentionTest(){
  var tables={};
  var ctx=makeContext(tables);
  var reportTables=emptyReportTables({
    MIGRACION_CAIDAS:[
      {Cuenta:'Clear Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'No Context Co','Sales Rep':'Jane','Sin dueno':'NO'},
      {Cuenta:'Review Co','Sales Rep':'Jane','Sin dueno':'NO'}
    ],
    CUENTAS:[
      {Cuenta:'Clear Co',Bucket:'2. OPERA SIN GESTION','Tipo gestion':''},
      {Cuenta:'Review Co',Bucket:'8. GESTIONADAS SIN OPERAR','Tipo gestion':'COMERCIAL'}
    ]
  });
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  var result=ctx.v6AuraEvaluateRetention_();
  assert.equal(result.status,'RETENTION_EVALUATED');
  assert.equal(result.detected,1,'only Clear Co should be DETECTED');
  assert.equal(result.suppressed,2,'No Context Co (AM CONTEXT REQUIRED) + Review Co (AM ACTIVITY REVIEW REQUIRED)');
  assert.equal(result.reviewRequired,2,'both AM CONTEXT REQUIRED and AM ACTIVITY REVIEW REQUIRED count as review-required');
  assert.equal(result.byReason['AM CONTEXT REQUIRED'],1);
  assert.equal(result.byReason['AM ACTIVITY REVIEW REQUIRED'],1);
  assert.equal(typeof result.retentionCuentasJoinCoverage,'number');
  // automatic scope build: only the single DETECTED account (Clear Co) is scoped
  assert.equal(result.scopesBuilt,1);
  assert.equal(result.accountsScoped,1,'suppressed/review-required accounts must never be scoped automatically');
  assert.equal(tables.MKT_SCOPE_ACCOUNTS.length,1);
  assert.equal(tables.MKT_CAMPAIGN_SCOPES[0].opportunityType,'Retention');
  assert(tables.MKT_CAMPAIGN_SCOPES[0].scopeId.indexOf('-RETENTION-')>=0,'scopeId must carry the RETENTION family segment');
  console.log('aura bridge test 1 (evaluate retention aggregates + automatic scope build): PASS');
})();

// 1b. v6AuraAutoBuildRetentionScopes_ groups by (amOwner, service), never touches other families
(function autoBuildScopesTest(){
  var tables={
    MKT_OPPORTUNITIES:[
      {accountId:'ACC-1',accountName:'A',amOwner:'Jane',opportunityType:'Retention',service:'FTL',eligibilityStatus:'DETECTED',suppressionReason:''},
      {accountId:'ACC-2',accountName:'B',amOwner:'Jane',opportunityType:'Retention',service:'FTL',eligibilityStatus:'DETECTED',suppressionReason:''},
      {accountId:'ACC-3',accountName:'C',amOwner:'Jane',opportunityType:'Retention',service:'LTL',eligibilityStatus:'DETECTED',suppressionReason:''},
      {accountId:'ACC-4',accountName:'D',amOwner:'Jane',opportunityType:'Retention',service:'FTL',eligibilityStatus:'SUPPRESSED',suppressionReason:'OWNER REQUIRED'},
      {accountId:'ACC-5',accountName:'E',amOwner:'Bob',opportunityType:'QNB',service:'FTL',eligibilityStatus:'DETECTED',suppressionReason:''}
    ]
  };
  var ctx=makeContext(tables);
  var result=ctx.v6AuraAutoBuildRetentionScopes_();
  assert.equal(result.scopesBuilt,2,'Jane/FTL and Jane/LTL are two distinct groups');
  assert.equal(result.accountsScoped,3,'ACC-1, ACC-2 (Jane/FTL) + ACC-3 (Jane/LTL); ACC-4 suppressed and ACC-5 (QNB) excluded');
  var scopedAccountIds=tables.MKT_SCOPE_ACCOUNTS.map(function(r){return r.accountId;}).sort();
  assert.deepEqual(scopedAccountIds,['ACC-1','ACC-2','ACC-3']);
  console.log('aura bridge test 1b (auto build scopes groups correctly, excludes suppressed/other families): PASS');
})();

// 2. v6AuraStatus_ consolidated read-only status (no campaign yet, then with campaign+audience)
(function statusTest(){
  var tables={
    MKT_ACCOUNT_PIPELINE:[{accountId:'ACC-1',currentStage:'OPPORTUNITY DETECTED',nextAction:'EVALUATE CAMPAIGN ELIGIBILITY',handoffStatus:'',campaignId:''}],
    MKT_OPPORTUNITIES:[{accountId:'ACC-1',opportunityType:'Retention',eligibilityStatus:'DETECTED',suppressionReason:''}]
  };
  var ctx=makeContext(tables);
  var noCampaign=ctx.v6AuraStatus_({accountId:'ACC-1'});
  assert.equal(noCampaign.currentStage,'OPPORTUNITY DETECTED');
  assert.equal(noCampaign.retentionEligibilityStatus,'DETECTED');
  assert.strictEqual(noCampaign.audienceStatus,null,'no campaignId yet -> no audience lookup');

  tables.MKT_ACCOUNT_PIPELINE[0].campaignId='CAM-1';
  tables.MKT_AUDIENCES=[{audienceRecipientId:'STATUS:CAM-1',audienceStatus:'RECIPIENTS RESOLVED',eligibleContactCount:3,excludedContactCount:1,reasonCode:'ELIGIBLE_CONTACTS_FOUND',frequencyStatus:'CLEAR',exclusionStatus:'CLEAR',exclusionsCleared:true}];
  var withCampaign=ctx.v6AuraStatus_({accountId:'ACC-1'});
  assert.equal(withCampaign.audienceStatus,'RECIPIENTS RESOLVED');
  assert.equal(withCampaign.eligibleContactCount,3);

  var unknown=ctx.v6AuraStatus_({accountId:'ACC-UNKNOWN'});
  assert.equal(unknown.currentStage,'NO PIPELINE RECORD');
  assert.equal(unknown.retentionEligibilityStatus,'NO RETENTION SIGNAL');
  console.log('aura bridge test 2 (consolidated status, safe aggregates only): PASS');
})();

// 3. v6AuraEnsureCampaignScope_ is idempotent and only writes explicitly-passed accountIds
(function ensureScopeTest(){
  var tables={};
  var ctx=makeContext(tables);
  var first=ctx.v6AuraEnsureCampaignScope_({scopeId:'SCOPE-JANE-RETENTION-MULTISERVICIO',opportunityType:'Retention',accountIds:['ACC-1','ACC-2']});
  assert.equal(first.status,'SCOPE_READY');
  assert.equal(first.accountsWritten,2);
  assert.equal(tables.MKT_CAMPAIGN_SCOPES.length,1);
  assert.equal(tables.MKT_SCOPE_ACCOUNTS.length,2);

  // re-run with an extra account -> merges, does not duplicate existing rows
  ctx.v6AuraEnsureCampaignScope_({scopeId:'SCOPE-JANE-RETENTION-MULTISERVICIO',opportunityType:'Retention',accountIds:['ACC-1','ACC-2','ACC-3']});
  assert.equal(tables.MKT_CAMPAIGN_SCOPES.length,1,'same scopeId must upsert, not duplicate');
  assert.equal(tables.MKT_SCOPE_ACCOUNTS.length,3,'new account added, existing two untouched (not duplicated)');
  assert(tables.MKT_SCOPE_ACCOUNTS.every(function(r){return r.eligibilityStatus==='ELIGIBLE';}));
  console.log('aura bridge test 3 (ensure campaign scope is idempotent): PASS');
})();

// 4. v6AuraCreateAccountStop_: fresh account closes; already-advanced account keeps its
// rank (preventDowngrade) but still gets nextAction/handoffStatus updated
(function accountStopTest(){
  var tables={MKT_ACCOUNT_PIPELINE:[]};
  var ctx=makeContext(tables);
  ctx.v6AuraCreateAccountStop_({accountId:'ACC-FRESH',reason:'DNC REQUEST'});
  var fresh=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-FRESH';})[0];
  assert.equal(fresh.currentStage,'CLOSED / SUPPRESSED');
  assert.equal(fresh.nextAction,'ACCOUNT STOP: DNC REQUEST');
  assert.equal(fresh.handoffStatus,'PENDING');

  tables.MKT_ACCOUNT_PIPELINE.push({accountId:'ACC-QUOTED',currentStage:'QUOTED',campaignId:'CAM-1',opportunityType:'Retention'});
  ctx.v6AuraCreateAccountStop_({accountId:'ACC-QUOTED',reason:'CUSTOMER REQUEST'});
  var advanced=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-QUOTED';})[0];
  assert.equal(advanced.currentStage,'QUOTED','a stop must not erase an already-reached commercial stage');
  assert.equal(advanced.nextAction,'ACCOUNT STOP: CUSTOMER REQUEST');
  assert.equal(advanced.handoffStatus,'PENDING');
  console.log('aura bridge test 4 (account stop: closes fresh, preserves advanced stage): PASS');
})();

// 5. v6AuraCreateAmHandoff_: preserves current stage, requires an existing pipeline record
(function amHandoffTest(){
  var tables={MKT_ACCOUNT_PIPELINE:[{accountId:'ACC-RFQ',currentStage:'RFQ RECEIVED',campaignId:'CAM-1',opportunityType:'Retention',amOwner:'Jane'}]};
  var ctx=makeContext(tables);
  ctx.v6AuraCreateAmHandoff_({accountId:'ACC-RFQ',reason:'AM ACTIVITY REVIEW REQUIRED'});
  var row=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-RFQ';})[0];
  assert.equal(row.currentStage,'RFQ RECEIVED','handoff must not reset stage back to OPPORTUNITY DETECTED');
  assert.equal(row.nextAction,'AM HANDOFF: AM ACTIVITY REVIEW REQUIRED');
  assert.equal(row.handoffStatus,'PENDING');

  assert.throws(function(){ctx.v6AuraCreateAmHandoff_({accountId:'ACC-NONE',reason:'x'});},/NO PIPELINE RECORD/);
  console.log('aura bridge test 5 (AM handoff preserves stage, refuses without pipeline record): PASS');
})();

// 6. Response event vocabulary aliases (QUOTE -> QUOTE_SIGNAL, LOAD -> LOAD_SIGNAL) and
// optional real-time attributedRevenue passthrough on LOAD
(function eventAliasTest(){
  var tables={MKT_ACCOUNT_PIPELINE:[]};
  var ctx=makeContext(tables);
  ctx.v6ClassifyResponseEvent_({eventId:'E1',eventType:'QUOTE',accountId:'ACC-1',occurredAt:'2026-09-01'});
  var quoted=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-1';})[0];
  assert.equal(quoted.currentStage,'QUOTED');

  ctx.v6ClassifyResponseEvent_({eventId:'E2',eventType:'load',accountId:'ACC-2',occurredAt:'2026-09-02',amount:777.5});
  var loaded=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-2';})[0];
  assert.equal(loaded.currentStage,'LOAD / REACTIVATED');
  assert.strictEqual(loaded.attributedRevenue,777.5,'explicit amount on a real-time LOAD event is passed through untransformed');

  ctx.v6ClassifyResponseEvent_({eventId:'E3',eventType:'LOAD',accountId:'ACC-3',occurredAt:'2026-09-03'});
  var loadedNoAmount=tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-3';})[0];
  assert.equal(loadedNoAmount.attributedRevenue,'','no amount supplied -> attributedRevenue is never fabricated');
  console.log('aura bridge test 6 (QUOTE/LOAD event aliases, no fabricated revenue): PASS');
})();

['v6AuraEvaluateRetention:v6AuraEvaluateRetention_','v6AuraStatus:v6AuraStatus_','v6AuraEnsureCampaignScope:v6AuraEnsureCampaignScope_','v6AuraCreateAccountStop:v6AuraCreateAccountStop_','v6AuraCreateAmHandoff:v6AuraCreateAmHandoff_'].forEach(function(entry){
  assert(routerSource.includes(entry),'router must expose '+entry);
});
console.log('V6 AURA Retention Bridge: ALL PASS');
