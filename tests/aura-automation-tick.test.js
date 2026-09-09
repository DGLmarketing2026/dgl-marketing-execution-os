const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const recipientSource=src('MarketingV6RecipientResolution.gs');
const executionSource=src('MarketingV6ExecutionEngine.gs');
const frequencySource=src('MarketingV6FrequencyControl.gs');
const driveSource=src('MarketingV6DriveArchive.gs');
const automationSource=src('MarketingV6AuraAutomation.gs');
const routerSource=src('MarketingV6RouterExtension.gs');

function fakeUtilities(){
  var seq=0;
  return {
    getUuid(){seq++;return 'uuid-'+seq+'-0000-0000-0000-000000000000';}
  };
}
function fakeDrive(){
  var files=[];
  return {
    files:files,
    getFolderById(id){
      return {createFile(name,content,mime){var f={id:'FILE-'+files.length,name:name,content:content,mime:mime,getId(){return this.id;}};files.push(f);return f;}};
    }
  };
}
function fakePropertiesService(props){
  props=props||{};
  return {getScriptProperties(){return {getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,setProperty:(k,v)=>{props[k]=v;}};}};
}

function makeContext(tables,props){
  tables=tables||{};
  var drive=fakeDrive();
  var ctx={
    Utilities:fakeUtilities(),
    DriveApp:drive,
    PropertiesService:fakePropertiesService(props),
    MimeType:{CSV:'text/csv',HTML:'text/html',PLAIN_TEXT:'text/plain'},
    Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,console:console
  };
  vm.createContext(ctx);
  vm.runInContext(bridgeSource,ctx,{filename:'MarketingV6AuraBridge.gs'});
  vm.runInContext(recipientSource,ctx,{filename:'MarketingV6RecipientResolution.gs'});
  vm.runInContext(frequencySource,ctx,{filename:'MarketingV6FrequencyControl.gs'});
  vm.runInContext(executionSource,ctx,{filename:'MarketingV6ExecutionEngine.gs'});
  vm.runInContext(driveSource,ctx,{filename:'MarketingV6DriveArchive.gs'});
  vm.runInContext(automationSource,ctx,{filename:'MarketingV6AuraAutomation.gs'});

  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6RecipientRows_=ctx.v6Rows_;
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.v6RequireContactRecipientHeaders_=function(){return true;};
  ctx.v6AcqEnsureSheet_=function(){return true;};
  // Real ingestion is exercised in tests/v6-report-ingestion.test.js; here we
  // stub it so this test focuses on the NEW orchestration (scope -> campaign
  // -> recipients -> execution -> report), seeding MKT_OPPORTUNITIES directly.
  ctx.v6RefreshOpportunitiesFromReports_=function(){return {status:'REPORT_SOURCE_SYNCED',syncedAt:new Date().toISOString(),retentionCuentasJoinCoverage:1};};
  ctx.__tables=tables;
  return ctx;
}

function opp(accountId,amOwner,opportunityType,service,extra){
  return Object.assign({accountId:accountId,accountName:accountId,amOwner:amOwner,opportunityType:opportunityType,service:service,eligibilityStatus:'DETECTED',suppressionReason:'',qnbWindow:''},extra||{});
}
function contact(accountId,contactId,email){
  return {accountId:accountId,contactId:contactId,email:email,status:'ACTIVE',emailStatus:'VALID',doNotContact:false};
}

// 1. One tick, one campaign per family, all four families processed automatically
(function oneTickAllFamiliesTest(){
  var tables={
    MKT_OPPORTUNITIES:[
      opp('ACC-1','Jane','Retention','FTL'),
      opp('ACC-2','Jane','Reactivation','FTL'),
      opp('ACC-3','Jane','Cross-Sell','FTL'),
      opp('ACC-4','Jane','QNB','FTL',{qnbWindow:'0-14'})
    ],
    MKT_CONTACTS_SECURE:[
      contact('ACC-1','CON-1','laura@abc.example'),
      contact('ACC-2','CON-2','mark@abc.example'),
      contact('ACC-3','CON-3','ana@abc.example'),
      contact('ACC-4','CON-4','luis@abc.example')
    ]
  };
  var ctx=makeContext(tables);
  var result=ctx.v6AuraAutomationTick_();
  assert.equal(result.status,'AURA_TICK_COMPLETE');
  assert.equal(result.campaignsProcessed,4,'one campaign per family for Jane/FTL');
  assert.equal(tables.MKT_CAMPAIGNS.length,4);
  assert.equal(tables.MKT_CAMPAIGN_EXECUTIONS.length,4);
  assert.equal(tables.MKT_AURA_EXECUTION_REPORT.length,4);
  console.log('aura automation test 1 (one tick builds all four families automatically): PASS');
})();

// 2. Idempotency: running the tick twice never duplicates campaigns/executions/report rows
(function idempotentTickTest(){
  var tables={
    MKT_OPPORTUNITIES:[opp('ACC-1','Jane','Retention','FTL')],
    MKT_CONTACTS_SECURE:[contact('ACC-1','CON-1','laura@abc.example')]
  };
  var ctx=makeContext(tables);
  ctx.v6AuraAutomationTick_();
  var firstCampaignCount=tables.MKT_CAMPAIGNS.length,firstExecCount=tables.MKT_CAMPAIGN_EXECUTIONS.length,firstReportCount=tables.MKT_AURA_EXECUTION_REPORT.length;
  ctx.v6AuraAutomationTick_();
  assert.equal(tables.MKT_CAMPAIGNS.length,firstCampaignCount,'re-running must never mint a second campaign for the same scope');
  assert.equal(tables.MKT_CAMPAIGN_EXECUTIONS.length,firstExecCount,'re-running must never create a second execution record');
  assert.equal(tables.MKT_AURA_EXECUTION_REPORT.length,firstReportCount,'re-running must upsert the same report row, never duplicate');
  console.log('aura automation test 2 (tick is idempotent — no duplicate campaigns/executions/report rows on re-run): PASS');
})();

// 3. Safe terminal state: real recipients resolved, everything clears except
// the bulk provider -- must reach exactly "READY TO SEND / SEND PROVIDER
// REQUIRED", never an actual send (MKT_V6_PROVIDER_READY stays hardcoded false).
(function readyToSendPendingProviderTest(){
  var tables={
    MKT_OPPORTUNITIES:[opp('ACC-1','Jane','Retention','FTL')],
    MKT_CONTACTS_SECURE:[contact('ACC-1','CON-1','laura@abc.example')]
  };
  var ctx=makeContext(tables);
  assert.equal(ctx.MKT_V6_PROVIDER_READY,false,'bulk provider must stay hardcoded off — this test would be meaningless otherwise');
  var result=ctx.v6AuraAutomationTick_();
  assert.equal(result.readyToSendPendingProvider,1);
  var execution=tables.MKT_CAMPAIGN_EXECUTIONS[0];
  assert.equal(execution.status,'CREATED','v6QueueExecution_ never mutates status when blocked');
  var reportRow=tables.MKT_AURA_EXECUTION_REPORT[0];
  assert.equal(reportRow.status,'READY TO SEND · SEND PROVIDER REQUIRED');
  assert.equal(reportRow.sent,0);assert.equal(reportRow.delivered,0);assert.equal(reportRow.clicks,0);
  assert(reportRow.recipients>=1,'real recipient resolution must have found the seeded contact');
  console.log('aura automation test 3 (safe terminal state: READY TO SEND / SEND PROVIDER REQUIRED, never an actual send): PASS');
})();

// 4. No fabricated metrics: response/pipeline-derived counts (replies/RFQs/
// quotes/loads) only ever reflect real MKT_ACCOUNT_PIPELINE rows for that
// exact campaignId -- never invented, never leaked from another campaign.
(function noFabricatedMetricsTest(){
  var scopeId='SCOPE-JANE-RETENTION-FTL--';
  var campaignId='CMP-JANE-RETENTION-FTL--';
  var tables={
    MKT_OPPORTUNITIES:[opp('ACC-1','Jane','Retention','FTL')],
    MKT_CONTACTS_SECURE:[contact('ACC-1','CON-1','laura@abc.example')],
    MKT_ACCOUNT_PIPELINE:[
      {accountId:'ACC-1',campaignId:campaignId,rfqAt:'2026-09-01T00:00:00.000Z',quoteAt:'',loadAt:'',responseAt:'2026-09-01T00:00:00.000Z'},
      {accountId:'ACC-9',campaignId:'CMP-OTHER',rfqAt:'2026-09-01T00:00:00.000Z',quoteAt:'2026-09-01T00:00:00.000Z',loadAt:'2026-09-01T00:00:00.000Z',responseAt:'2026-09-01T00:00:00.000Z'}
    ]
  };
  var ctx=makeContext(tables);
  ctx.v6AuraAutomationTick_();
  var reportRow=tables.MKT_AURA_EXECUTION_REPORT.filter(r=>r.campaignId===campaignId)[0];
  assert.ok(reportRow,'expected a report row for the deterministic campaignId '+campaignId);
  assert.equal(reportRow.replies,1);assert.equal(reportRow.rfqs,1);assert.equal(reportRow.quotes,0);assert.equal(reportRow.loads,0);
  console.log('aura automation test 4 (pipeline-derived metrics are real and campaign-scoped, never fabricated or leaked): PASS');
})();

// 5. Automatic CSV reporting: one CSV per owner plus a consolidated CSV,
// archived automatically -- no manual export required.
(function automaticCsvReportingTest(){
  var tables={
    MKT_OPPORTUNITIES:[opp('ACC-1','Jane','Retention','FTL'),opp('ACC-2','Bob','QNB','LTL',{qnbWindow:'15-30'})],
    MKT_CONTACTS_SECURE:[contact('ACC-1','CON-1','laura@abc.example'),contact('ACC-2','CON-2','bob2@abc.example')]
  };
  var props={};
  var ctx=makeContext(tables,props);
  props.AURA_EXECUTION_ARCHIVE_FOLDER_ID='FOLDER-1';
  var result=ctx.v6AuraAutomationTick_();
  assert.equal(result.report.archive.byOwner.length,2,'one CSV archived per distinct owner (Jane, Bob)');
  result.report.archive.byOwner.forEach(function(entry){assert.equal(entry.archive.status,'CSV ARCHIVED');});
  assert.equal(result.report.archive.consolidated.status,'CSV ARCHIVED','one consolidated CSV across all owners');
  var status=ctx.v6AuraAutomaticReportStatus_();
  assert.equal(status.totalCampaigns,2);assert.equal(status.owners,2);
  console.log('aura automation test 5 (automatic per-owner + consolidated CSV, archived without manual export): PASS');
})();

// 6. Router exposes the new tick and status actions.
(function routerExposesAuraAutomationTest(){
  assert(/case 'v6AuraAutomationTick'\s*:[\s\S]{0,200}v6AuraAutomationTick_/.test(routerSource),'router must expose v6AuraAutomationTick');
  console.log('aura automation test 6 (router exposes v6AuraAutomationTick): PASS');
})();

console.log('AURA automatic campaign execution tick: ALL PASS');
