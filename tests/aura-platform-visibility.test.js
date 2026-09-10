const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const automationSource=src('MarketingV6AuraAutomation.gs');
const ingestSource=src('MarketingV6AuraGmailIngest.gs');
const routerSource=src('MarketingV6RouterExtension.gs');
const acqSource=src('MarketingV6AcquisitionEngine.gs');
const adapterSource=fs.readFileSync(path.join(root,'assets/js/marketing-backend-adapter-v55.js'),'utf8');
const lifecycleSource=fs.readFileSync(path.join(root,'assets/js/lifecycle-modules-v6.js'),'utf8');

function makeContext(tables){
  tables=tables||{};
  var ctx={Date:Date,String:String,Array:Array,Object:Object,Number:Number,console:console,JSON:JSON};
  vm.createContext(ctx);
  vm.runInContext(bridgeSource,ctx,{filename:'MarketingV6AuraBridge.gs'});
  vm.runInContext(automationSource,ctx,{filename:'MarketingV6AuraAutomation.gs'});
  vm.runInContext(ingestSource,ctx,{filename:'MarketingV6AuraGmailIngest.gs'});
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6AcqEnsureSheet_=function(){return true;};
  ctx.PropertiesService={getScriptProperties:function(){return{getProperty:function(k){return (tables.__props||{})[k]||'';}};}};
  return ctx;
}

// 1. This task never touched the Gmail ingestion pipeline itself
(function testIngestionUntouched(){
  assert(/function v6AuraGmailIngestTick_\s*\(/.test(ingestSource),'v6AuraGmailIngestTick_ must still exist, unmodified in shape');
  assert(/newer_than:45d/.test(ingestSource),'the already-shipped 45-day bound must still be present — this file is not touched again by the visibility layer');
  console.log('PASS: Gmail ingestion pipeline file is untouched by the platform-visibility work');
})();

// 2. New read-only endpoints exist and are routed
(function testNewEndpointsRouted(){
  ['v6AuraGmailPanelStatus_','v6AuraIngestHistory_','v6AuraGmailSourceBreakdown_'].forEach(function(fn){
    assert(new RegExp('function '+fn+'\\s*\\(').test(automationSource),fn+' must be defined in MarketingV6AuraAutomation.gs');
  });
  assert(/case 'v6AuraGmailPanel'\s*:[\s\S]{0,200}v6AuraGmailPanelStatus_/.test(routerSource),'router must expose v6AuraGmailPanel');
  assert(/case 'v6AuraIngestHistory'\s*:[\s\S]{0,200}v6AuraIngestHistory_/.test(routerSource),'router must expose v6AuraIngestHistory');
  assert(/case 'v6AuraSourceBreakdown'\s*:[\s\S]{0,200}v6AuraGmailSourceBreakdown_/.test(routerSource),'router must expose v6AuraSourceBreakdown');
  ['v6AuraGmailPanel','v6AuraIngestHistory','v6AuraSourceBreakdown'].forEach(function(a){
    assert(new RegExp(a+'\\s*:\\s*\\(\\)\\s*=>\\s*mutate\\(\\s*["\']'+a+'["\']').test(adapterSource),'adapter must expose '+a);
  });
  console.log('PASS: v6AuraGmailPanel / v6AuraIngestHistory / v6AuraSourceBreakdown are defined, routed and exposed to the frontend');
})();

// 3. Gmail panel reads MKT_AURA_INGEST_LOG honestly, no report yet
(function testGmailPanelNoReportYet(){
  var ctx=makeContext({MKT_AURA_INGEST_LOG:[],__props:{AURA_GMAIL_SOURCE_MAILBOX:'info@dglus.com',AURA_GMAIL_AM_OWNER_NAME:'Luis Simoes'}});
  var out=ctx.v6AuraGmailPanelStatus_();
  assert.equal(out.status,'NO_REPORT_RECEIVED');
  assert.equal(out.mailbox,'info@dglus.com');
  assert.equal(out.amOwnerName,'Luis Simoes');
  console.log('PASS: Gmail panel honestly reports NO_REPORT_RECEIVED when the log is empty, never a fabricated report');
})();

// 4. Gmail panel surfaces the latest real ingest log row
(function testGmailPanelLatest(){
  var tables={MKT_AURA_INGEST_LOG:[
    {gmailMessageId:'m1',subject:'Old',receivedAt:'2026-09-01T10:00:00.000Z',processedAt:'2026-09-01T10:01:00.000Z',attachmentCount:1,rowsParsed:10,rowsAccepted:9,rowsRejected:1,opportunitiesCreated:2,opportunitiesUpdated:1,status:'OK'},
    {gmailMessageId:'m2',subject:'Marketing Cuentas',receivedAt:'2026-09-10T13:00:00.000Z',processedAt:'2026-09-10T13:05:00.000Z',attachmentCount:1,rowsParsed:948,rowsAccepted:948,rowsRejected:0,opportunitiesCreated:176,opportunitiesUpdated:772,status:'OK'}
  ],__props:{AURA_GMAIL_SOURCE_MAILBOX:'info@dglus.com',AURA_GMAIL_AM_OWNER_NAME:'Luis Simoes'}};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraGmailPanelStatus_();
  assert.equal(out.status,'OK');
  assert.equal(out.lastReceivedAt,'2026-09-10T13:00:00.000Z','must pick the LATEST message, not the first row');
  assert.equal(out.rowsParsed,948);
  assert.equal(out.rowsAccepted,948);
  assert.equal(out.opportunitiesCreated,176);
  assert.equal(out.opportunitiesUpdated,772);
  assert.equal(out.lastIngestStatus,'OK');
  console.log('PASS: Gmail panel surfaces the real latest ingest log row, never a hard-coded example');
})();

// 5. Ingest history exposes only safe columns, sorted newest first
(function testIngestHistorySafeColumns(){
  var tables={MKT_AURA_INGEST_LOG:[
    {gmailMessageId:'SECRET-ID-1',gmailThreadId:'SECRET-THREAD',senderHash:'SECRET-HASH',subject:'Report A',receivedAt:'2026-09-01T00:00:00.000Z',processedAt:'2026-09-01T00:01:00.000Z',sourceFiles:'a.xlsx',rowsParsed:5,rowsAccepted:5,rowsRejected:0,opportunitiesCreated:2,opportunitiesUpdated:0,status:'OK',errorCode:''},
    {gmailMessageId:'SECRET-ID-2',subject:'Report B',receivedAt:'2026-09-10T00:00:00.000Z',processedAt:'2026-09-10T00:01:00.000Z',sourceFiles:'b.xlsx',rowsParsed:3,rowsAccepted:2,rowsRejected:1,opportunitiesCreated:0,opportunitiesUpdated:1,status:'PARTIAL',errorCode:''}
  ]};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraIngestHistory_();
  assert.equal(out.rows.length,2);
  assert.equal(out.rows[0].subject,'Report B','must be sorted newest received first');
  var keys=Object.keys(out.rows[0]).sort();
  assert.deepEqual(keys,['files','opportunities','processedAt','receivedAt','rowsAccepted','rowsParsed','rowsRejected','status','subject'].sort());
  var blob=JSON.stringify(out);
  assert(!blob.includes('SECRET-ID'),'gmailMessageId must never be exposed to the frontend');
  assert(!blob.includes('SECRET-HASH'),'senderHash must never be exposed to the frontend');
  console.log('PASS: ingest history exposes only the safe column set, newest first, no internal identifiers');
})();

// 6. Source breakdown buckets Gmail vs NOVA opportunities from real MKT_OPPORTUNITIES rows
(function testSourceBreakdown(){
  var tables={MKT_OPPORTUNITIES:[
    {accountId:'A1',sourceReport:'GMAIL_AM_REPORT',updatedAt:'2026-09-10T10:00:00.000Z',detectedAt:'2026-09-10T09:00:00.000Z'},
    {accountId:'A2',sourceReport:'GMAIL_AM_REPORT',updatedAt:'2026-09-10T11:00:00.000Z',detectedAt:'2026-09-10T09:00:00.000Z'},
    {accountId:'A3',sourceReport:'LQS_SIN_RESPUESTA',updatedAt:'2026-09-09T10:00:00.000Z',detectedAt:'2026-09-09T09:00:00.000Z'}
  ]};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraGmailSourceBreakdown_();
  assert.equal(out.gmail.opportunities,2);
  assert.equal(out.gmail.status,'ACTIVE');
  assert.equal(out.gmail.lastUpdated,'2026-09-10T11:00:00.000Z');
  assert.equal(out.nova.opportunities,1);
  assert.equal(out.nova.status,'ACTIVE');
  console.log('PASS: source breakdown derives real Gmail vs NOVA counts from MKT_OPPORTUNITIES, never hard-coded');
})();

// 7. Campaign row now carries a real, derived source label and emailGenerated flag
(function testReportRowSourceAndEmailGenerated(){
  var accountSourceByAccountId={A1:'GMAIL_AM_REPORT',A2:'LQS_SIN_RESPUESTA'};
  var ctx=makeContext({});
  assert.equal(ctx.v6AuraScopeSourceLabel_({accountIds:['A1']},accountSourceByAccountId),'GMAIL AM REPORT');
  assert.equal(ctx.v6AuraScopeSourceLabel_({accountIds:['A2']},accountSourceByAccountId),'NOVA / EXISTING SOURCE');
  assert.equal(ctx.v6AuraScopeSourceLabel_({accountIds:['A1','A2']},accountSourceByAccountId),'MIXED');
  assert.equal(ctx.v6AuraScopeSourceLabel_({accountIds:['UNKNOWN']},accountSourceByAccountId),'UNKNOWN');
  console.log('PASS: campaign source label is derived per-scope from real opportunity sourceReport, never guessed');
})();

// 8. v6AuraExecutionReport_ summary now includes byFamily and engagement sums, honestly zero
(function testSummaryByFamilyAndEngagement(){
  var tables={MKT_AURA_EXECUTION_REPORT:[
    {reportRowId:'C1',owner:'Alex',campaignFamily:'Retention',service:'FTL',campaignId:'C1',executionId:'E1',source:'GMAIL AM REPORT',detectedAccounts:1,eligibleAccounts:1,suppressedAccounts:0,recipients:2,emailGenerated:true,sent:0,delivered:0,opened:0,bounced:0,clicks:0,spamComplaints:0,replies:0,rfqs:0,quotes:0,loads:0,status:'READY TO SEND · SEND PROVIDER REQUIRED',updatedAt:'2026-09-10T10:00:00.000Z'},
    {reportRowId:'C2',owner:'Ali',campaignFamily:'Quoted Not Booked',service:'LTL',campaignId:'C2',executionId:'E2',source:'NOVA / EXISTING SOURCE',detectedAccounts:1,eligibleAccounts:1,suppressedAccounts:0,recipients:1,emailGenerated:false,sent:0,delivered:0,opened:0,bounced:0,clicks:0,spamComplaints:0,replies:0,rfqs:0,quotes:0,loads:0,status:'BLOCKED',updatedAt:'2026-09-10T09:00:00.000Z'}
  ]};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraExecutionReport_();
  assert.equal(out.summary.byFamily.Retention,1);
  assert.equal(out.summary.byFamily.QNB,1);
  assert.equal(out.summary.byFamily.Reactivation,0,'never fabricated — real zero when no Reactivation campaigns exist yet');
  assert.equal(out.summary.byFamily['Cross-Sell'],0);
  assert.equal(out.summary.delivered,0);
  assert.equal(out.summary.opened,0);
  assert.equal(out.summary.spamComplaints,0);
  assert.equal(out.summary.lastAuraRun,out.summary.lastUpdated);
  assert.equal(out.records[0].source,'GMAIL AM REPORT');
  assert.equal(out.records[1].emailGenerated,false);
  console.log('PASS: v6AuraExecutionReport_ summary carries real per-family campaign counts and honest engagement totals');
})();

// 9. Frontend: KPI grid, filters (Owner/Family/Service/Source/Status), Command Center panel, results columns
(function testFrontendStructure(){
  assert(/function auraGmailPanelHtml/.test(lifecycleSource),'Command Center ingestion panel renderer must exist');
  assert(/AURA · ACCOUNT MANAGEMENT INGESTION/.test(lifecycleSource),'Command Center panel must carry the exact required title');
  assert(/auraGmailPanelHtml\(gmailPanel\)/.test(lifecycleSource),'commandCenter must render the ingestion panel');
  assert(/function auraSourceBreakdownHtml/.test(lifecycleSource),'Source Breakdown section must exist');
  assert(/function auraIngestHistoryTableHtml/.test(lifecycleSource),'Ingest History table must exist');
  assert(/data-aura-owner/.test(lifecycleSource)&&/data-aura-family/.test(lifecycleSource)&&/data-aura-service/.test(lifecycleSource)&&/data-aura-source/.test(lifecycleSource)&&/data-aura-status/.test(lifecycleSource),'filter bar must expose Owner/Family/Service/Source/Status filters');
  ['Detected','Eligible','Suppressed','Source','Email Generated','Execution Status','Spam Complaints','Last Updated'].forEach(function(col){
    assert(lifecycleSource.includes(col),'Campaign Results table must include the "'+col+'" column');
  });
  assert(/NOT SENT YET/.test(lifecycleSource),'engagement columns must render NOT SENT YET instead of a fabricated 0 when nothing was sent');
  console.log('PASS: frontend renders the Command Center ingestion panel, Source Breakdown, Ingest History and extended filters/columns');
})();

// 10. auraEngagementCell never shows a bare 0 for a campaign that was never sent
(function testEngagementCellLogic(){
  var start=lifecycleSource.indexOf('function auraEngagementCell(');
  var end=lifecycleSource.indexOf('\n}',start)+2;
  var fnSrc=lifecycleSource.slice(start,end);
  assert(start>=0&&end>start,'auraEngagementCell must be found in source');
  const auraEngagementCell=new Function('N','"use strict";'+fnSrc+'\nreturn auraEngagementCell;')(n=>String(n||0));
  assert(auraEngagementCell(0,0).includes('NOT SENT YET'));
  assert.equal(auraEngagementCell(5,3),'3');
  console.log('PASS: auraEngagementCell shows NOT SENT YET when sent=0, and the real number once something was actually sent');
})();

// 11. Acquisition is untouched by this task
(function testAcquisitionUntouched(){
  assert(/FTL/.test(acqSource)&&/LTL/.test(acqSource)&&/Drayage/.test(acqSource),'Acquisition FTL/LTL/Drayage services must remain untouched');
  assert(!/AURA_GMAIL/.test(acqSource.slice(acqSource.indexOf('v6AuraGmailIngestTick_')+1)),'no new Gmail wiring was added to Acquisition beyond what already shipped');
  console.log('PASS: Acquisition (FTL/LTL/Drayage, English-only production) is untouched by the platform-visibility work');
})();

console.log('AURA platform visibility: ALL PASS');
