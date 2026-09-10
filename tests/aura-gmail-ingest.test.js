const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestSource=src('MarketingV6AuraGmailIngest.gs');
const acqSource=src('MarketingV6AcquisitionEngine.gs');
const routerSource=src('MarketingV6RouterExtension.gs');
const reportIngestSource=src('MarketingV6ReportIngestion.gs');
const adapterSource=fs.readFileSync(path.join(root,'assets/js/marketing-backend-adapter-v55.js'),'utf8');
const lifecycleSource=fs.readFileSync(path.join(root,'assets/js/lifecycle-modules-v6.js'),'utf8');

// --- Minimal fake Gmail primitives -------------------------------------------
function fakeAttachment(name,opts){
  opts=opts||{};
  return {
    getName:()=>name,
    copyBlob(){return this;},
    getDataAsString:()=>opts.csvText||'',
    __sheets:opts.sheets||null
  };
}
function fakeMessage(id,from,subject,dateIso,body,attachments){
  return {
    getId:()=>id, getFrom:()=>from, getSubject:()=>subject,
    getDate:()=>new Date(dateIso), getPlainBody:()=>body||'',
    getAttachments:()=>attachments||[]
  };
}
function fakeThread(id,messages){
  const labels=[];
  return {getId:()=>id, getMessages:()=>messages, addLabel:l=>labels.push(l.getName()), __labels:labels};
}
function makeGmailApp(threads){
  const labelStore={};
  return {
    search:(q,start,max)=>threads,
    getUserLabelByName:name=>labelStore[name]||null,
    createLabel:name=>{labelStore[name]={getName:()=>name};return labelStore[name];}
  };
}
function fakeDrive(){
  const files={};
  let n=0;
  return {
    Files:{
      create:(resource,blob)=>{n++;var id='FILE-'+n;files[id]=blob;return {id};},
      remove:id=>{delete files[id];}
    },
    __files:files
  };
}
function workbookFromSheets(sheetDefs){
  // sheetDefs: [{name, values}]
  return {getSheets:()=>sheetDefs.map(d=>({getName:()=>d.name, getDataRange:()=>({getValues:()=>d.values})}))};
}

// --- In-memory table + Apps Script context (same pattern as other AURA tests) ---
function makeContext(props,tables){
  tables=tables||{};
  var ctx={
    Date:Date,String:String,Array:Array,Object:Object,Number:Number,Math:Math,console:console,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>Object.prototype.hasOwnProperty.call(props,k)?props[k]:null,setProperty:(k,v)=>{props[k]=v;}})},
    Utilities:{
      computeDigest:(algo,text)=>{var h=0;for(var i=0;i<text.length;i++){h=(h*31+text.charCodeAt(i))|0;}var bytes=[];for(var b=0;b<8;b++){bytes.push((h>>(b*4))&0xff);}return bytes;},
      DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF_8'},
      parseCsv:text=>text.split('\n').filter(l=>l.length).map(l=>l.split(','))
    }
  };
  vm.createContext(ctx);
  vm.runInContext(ingestSource,ctx,{filename:'MarketingV6AuraGmailIngest.gs'});
  // Stand-ins for the shared helpers this file depends on from other real
  // (already-tested elsewhere) files, isolated here so this suite focuses on
  // the ingestion logic itself.
  ctx.v6HashKey_=function(text){var h=0,s=String(text||'');for(var i=0;i<s.length;i++){h=(h*31+s.charCodeAt(i))|0;}return 'H'+Math.abs(h).toString(16).toUpperCase();};
  ctx.v6NormAccount_=function(v){return String(v||'').trim().toLowerCase().replace(/\s+/g,' ');};
  ctx.v6AcqEnsureSheet_=function(){return true;};
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
  ctx.__tables=tables;
  return ctx;
}

var LUIS='Luis Simoes <lsimoes@example-dgl.test>';
var OUTSIDER='Someone Else <outsider@example.test>';

function retentionSheet(rows){
  var values=[
    ['DGL Freight Broker – Contacto de retencion prioritario (2)'],
    ['08/09/2026 | 2 contactos en 2 cuentas | Prioridad: A1'],
    [],
    ['Cuenta','Account Owner','Agente responsable (Sales Rep Actual)','Pais Billing','Pais Shipping','Contacto','Email','Posicion (Company position)','Titulo','Key Contact','Prioridad','Motivo campana']
  ];
  rows.forEach(function(r){values.push(r);});
  return {name:'Retencion prioritaria',values:values};
}
function crossSellSheet(rows){
  var values=[
    ['DGL Freight Broker – Expansion de servicio'],
    ['08/09/2026 | 1 contactos en 1 cuentas | Prioridad: B'],
    [],
    ['Cuenta','Account Owner','Agente responsable (Sales Rep Actual)','Pais Billing','Pais Shipping','Contacto','Email','Posicion (Company position)','Titulo','Key Contact','Prioridad','Motivo campana']
  ];
  rows.forEach(function(r){values.push(r);});
  return {name:'Expansion de servicio',values:values};
}
function reactivationSheet(rows){
  var values=[
    ['DGL Freight Broker – Recuperacion FTL'],
    ['08/09/2026 | 1 contactos en 1 cuentas | Prioridad: B'],
    [],
    ['Cuenta','Account Owner','Agente responsable (Sales Rep Actual)','Pais Billing','Pais Shipping','Contacto','Email','Posicion (Company position)','Titulo','Key Contact','Prioridad','Motivo campana']
  ];
  rows.forEach(function(r){values.push(r);});
  return {name:'Recuperacion FTL',values:values};
}
function dataQualitySheet(rows){
  var values=[
    ['DGL Freight Broker – Confirmar datos de contacto antes de ca'],
    ['08/09/2026 | 2 contactos en 1 cuentas | Prioridad: A'],
    [],
    ['Cuenta','Account Owner','Agente responsable (Sales Rep Actual)','Pais Billing','Pais Shipping','Contacto','Email','Posicion (Company position)','Titulo','Key Contact','Prioridad','Motivo campana']
  ];
  rows.forEach(function(r){values.push(r);});
  return {name:'Confirmar datos contacto',values:values};
}
var GOOD_ROW=['Acme Freight LLC','Alex Cifuentes','Alex Cifuentes','USA','USA','Jane Doe','jane@acme.test','Operations','Manager','Si','Alta','Cuenta en riesgo (bajo de tier)'];
var GOOD_ROW_2=['Beta Logistics','Ali Pirela','Ali Pirela','Peru','Peru','John Roe','john@beta.test','Ops','Manager','Si','Media','Area FTL en baja este mes'];
var GOOD_ROW_3=['Gamma Cargo','Alex Cifuentes','Alex Cifuentes','USA','USA','Sam Poe','sam@gamma.test','Ops','Manager','Si','Media','Usa un solo servicio'];
var MISSING_ACCOUNT_ROW=['','Alex Cifuentes','Alex Cifuentes','USA','USA','Jane Doe','jane@acme.test','Operations','Manager','Si','Alta','Cuenta en riesgo'];

function xlsxAttachment(sheets){return fakeAttachment('Marketing_Cuentas_Contactos_v4.xlsx',{sheets:sheets});}

function runTick(props,tables,threads){
  var ctx=makeContext(props,tables);
  ctx.GmailApp=makeGmailApp(threads);
  var drive=fakeDrive();
  ctx.Drive=drive;
  ctx.SpreadsheetApp={openById:id=>workbookFromSheets(drive.__files[id].__sheets)};
  return {ctx:ctx,result:ctx.v6AuraGmailIngestTick_()};
}

// 1. Allowed sender only — a message from an unapproved sender is ignored entirely
(function testAllowedSenderOnly(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var msg=fakeMessage('MSG-1',OUTSIDER,'Marketing suggestions','2026-09-10T13:00:00.000Z','',atts);
  var thread=fakeThread('T-1',[msg]);
  var {result,ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  assert.equal(result.messagesProcessed,0,'a message from a non-allowlisted sender must never be processed');
  assert.equal((ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES||[]).length,0,'no opportunity may be created from an unapproved sender');
  assert.equal((ctx.__tables.MKT_AURA_INGEST_LOG||[]).length,0,'no ingest log row for an ignored sender');
  console.log('PASS: only messages from an allowlisted sender are ever processed');
})();

// 2. No allowlist configured -> safe no-op (fail closed)
(function testNoAllowlistFailsClosed(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var thread=fakeThread('T-2',[fakeMessage('MSG-2',LUIS,'x','2026-09-10T13:00:00.000Z','',atts)]);
  var {result}=runTick({},{},[thread]);
  assert.equal(result.status,'NO_ALLOWED_SENDERS');
  assert.equal(result.messagesProcessed,0);
  console.log('PASS: with no AURA_GMAIL_ALLOWED_SENDERS configured, ingestion is a safe no-op');
})();

// 3. Retention mapping: "Retencion prioritaria" rows become Retention opportunities
(function testRetentionMapping(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var thread=fakeThread('T-3',[fakeMessage('MSG-3',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {result,ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  assert.equal(result.messagesProcessed,1);
  var opps=ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES;
  assert.equal(opps.length,1);
  assert.equal(opps[0].opportunityType,'Retention');
  assert.equal(opps[0].accountName,'Acme Freight LLC');
  assert.equal(opps[0].amOwner,'Alex Cifuentes');
  assert.equal(opps[0].sourceRecordId,'Cuenta en riesgo (bajo de tier)');
  assert.equal(opps[0].sourceType,'GMAIL_AM_REPORT');
  console.log('PASS: "Retencion prioritaria" rows map to real Retention opportunities with real account/owner/reason');
})();

// 4. Reactivation mapping: "Recuperacion FTL"
(function testReactivationMapping(){
  var atts=[xlsxAttachment([reactivationSheet([GOOD_ROW_2])])];
  var thread=fakeThread('T-4',[fakeMessage('MSG-4',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  var opps=ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES;
  assert.equal(opps.length,1);
  assert.equal(opps[0].opportunityType,'Reactivation');
  assert.equal(opps[0].accountName,'Beta Logistics');
  console.log('PASS: "Recuperacion FTL" rows map to real Reactivation opportunities');
})();

// 5. Cross-Sell mapping: "Expansion de servicio"
(function testCrossSellMapping(){
  var atts=[xlsxAttachment([crossSellSheet([GOOD_ROW_3])])];
  var thread=fakeThread('T-5',[fakeMessage('MSG-5',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  var opps=ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES;
  assert.equal(opps.length,1);
  assert.equal(opps[0].opportunityType,'Cross-Sell');
  console.log('PASS: "Expansion de servicio" rows map to real Cross-Sell opportunities');
})();

// 6. QNB is never fabricated from the Gmail source — Luis's real report has no QNB tab
(function testNoInventedQnb(){
  assert(!/'QNB'/.test(ingestSource) && !/Quoted Not Booked/.test(ingestSource),'the Gmail ingestion module must never invent a QNB mapping that does not exist in the real report');
  console.log('PASS: Gmail ingestion never fabricates a QNB family (QNB continues to come from its existing, unrelated source)');
})();

// 7. Data-quality sheet ("Confirmar datos contacto") is counted but never turned into an opportunity
(function testDataQualitySheetExcluded(){
  var atts=[xlsxAttachment([dataQualitySheet([GOOD_ROW,GOOD_ROW_2]),retentionSheet([GOOD_ROW_3])])];
  var thread=fakeThread('T-6',[fakeMessage('MSG-6',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  var opps=ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES;
  assert.equal(opps.length,1,'only the real campaign-family sheet produces an opportunity; the data-quality worklist must not');
  assert.equal(opps[0].accountName,'Gamma Cargo');
  console.log('PASS: the "Confirmar datos contacto" data-quality worklist never becomes a fabricated campaign opportunity');
})();

// 8. Rejection logging: a row missing the account name is rejected, not silently dropped or invented
(function testRejectionLogging(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW,MISSING_ACCOUNT_ROW])])];
  var thread=fakeThread('T-7',[fakeMessage('MSG-7',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {ctx,result}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  var rejections=ctx.__tables.MKT_AURA_INGEST_REJECTIONS;
  assert.equal(rejections.length,1);
  assert.equal(rejections[0].reason,'MISSING ACCOUNT (Cuenta)');
  var log=ctx.__tables.MKT_AURA_INGEST_LOG[0];
  assert.equal(log.rowsAccepted,1);
  assert.equal(log.rowsRejected,1);
  console.log('PASS: a row missing its account is rejected and logged, never silently dropped or invented');
})();

// 9. messageId idempotency: re-running the tick never reprocesses the same message
(function testMessageIdIdempotency(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var thread=fakeThread('T-8',[fakeMessage('MSG-8',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var props={AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},tables={};
  var first=runTick(props,tables,[thread]);
  assert.equal(first.result.messagesProcessed,1);
  var second=runTick(props,tables,[thread]);
  assert.equal(second.result.messagesProcessed,0,'a message already present in MKT_AURA_INGEST_LOG must never be reprocessed');
  assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length,1,'idempotent re-run must not duplicate the opportunity');
  console.log('PASS: messageId-based idempotency — a message is never processed twice');
})();

// 10. No duplicate opportunities when Luis re-sends an updated report for the same account
(function testNoDuplicateOpportunitiesOnUpdate(){
  var props={AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},tables={};
  var atts1=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var thread1=fakeThread('T-9a',[fakeMessage('MSG-9A',LUIS,'AM report v1','2026-09-03T13:00:00.000Z','',atts1)]);
  runTick(props,tables,[thread1]);
  var updatedRow=GOOD_ROW.slice(); updatedRow[10]='Baja'; updatedRow[11]='Cuenta a punto de bajar de tier';
  var atts2=[xlsxAttachment([retentionSheet([updatedRow])])];
  var thread2=fakeThread('T-9b',[fakeMessage('MSG-9B',LUIS,'AM report v2','2026-09-10T13:00:00.000Z','',atts2)]);
  runTick(props,tables,[thread2]);
  var opps=tables.MKT_AURA_GMAIL_OPPORTUNITIES.filter(function(o){return o.accountName==='Acme Freight LLC';});
  assert.equal(opps.length,1,'a newer report for the same account must UPDATE the existing opportunity row, never duplicate it');
  assert.equal(opps[0].sourceRecordId,'Cuenta a punto de bajar de tier','the updated reason must overwrite the stale one');
  console.log('PASS: a re-sent, updated report for the same account updates the existing opportunity instead of duplicating it');
})();

// 11. Failed-report last-known-good protection: a bad second message never erases the first message's good data
(function testLastKnownGoodProtection(){
  var props={AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},tables={};
  var goodAtts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var goodThread=fakeThread('T-10a',[fakeMessage('MSG-10A',LUIS,'Good report','2026-09-03T13:00:00.000Z','',goodAtts)]);
  runTick(props,tables,[goodThread]);
  assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length,1);
  var badAttachment=fakeAttachment('Marketing_Cuentas_Contactos_v5.xlsx',{sheets:null});
  badAttachment.copyBlob=function(){throw new Error('corrupt attachment');};
  var badThread=fakeThread('T-10b',[fakeMessage('MSG-10B',LUIS,'Bad report','2026-09-10T13:00:00.000Z','',[badAttachment])]);
  var {result,ctx}=runTick(props,tables,[badThread]);
  assert.equal(result.failed,1);
  assert.equal(tables.MKT_AURA_GMAIL_OPPORTUNITIES.length,1,'a failed later ingest must never erase the previously ingested good opportunity');
  var log=tables.MKT_AURA_INGEST_LOG.filter(function(r){return r.gmailMessageId==='MSG-10B';})[0];
  assert.equal(log.status,'FAILED');
  console.log('PASS: a malformed report is logged as FAILED without corrupting or erasing previously ingested good data');
})();

// 12. CSV parsing contract
(function testCsvParsing(){
  var csvText='Cuenta,Account Owner,Agente responsable (Sales Rep Actual),Pais Billing,Pais Shipping,Contacto,Email,Posicion (Company position),Titulo,Key Contact,Prioridad,Motivo campana\n'+
    'Delta Freight,Alex Cifuentes,Alex Cifuentes,USA,USA,Pat Doe,pat@delta.test,Ops,Manager,Si,Alta,Cuenta en riesgo';
  // The CSV parser feeds one flat table; name it after a recognized family tab so it routes correctly.
  var csvAtt=fakeAttachment('Retencion_prioritaria.csv',{csvText:csvText});
  var thread=fakeThread('T-11',[fakeMessage('MSG-11',LUIS,'AM report (csv)','2026-09-10T13:00:00.000Z','',[csvAtt])]);
  var ctx=makeContext({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{});
  ctx.GmailApp=makeGmailApp([thread]);
  ctx.Drive=fakeDrive();
  ctx.SpreadsheetApp={openById:()=>{throw new Error('CSV path must not touch Drive/Sheets conversion');}};
  var result=ctx.v6AuraGmailIngestTick_();
  assert.equal(result.messagesProcessed,1);
  console.log('PASS: a CSV attachment is parsed directly, without any Drive/XLSX conversion');
})();

// 13. Google Sheet link contract: a link in the body is read only for an allowlisted sender
(function testGoogleSheetLinkContract(){
  var body='Please see the suggestions here: https://docs.google.com/spreadsheets/d/SHEET123/edit';
  var thread=fakeThread('T-12',[fakeMessage('MSG-12',LUIS,'AM report (link)','2026-09-10T13:00:00.000Z',body,[])]);
  var ctx=makeContext({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{});
  ctx.GmailApp=makeGmailApp([thread]);
  ctx.Drive=fakeDrive();
  var opened=null;
  ctx.SpreadsheetApp={openById:id=>{opened=id;return workbookFromSheets([retentionSheet([GOOD_ROW])]);}};
  var result=ctx.v6AuraGmailIngestTick_();
  assert.equal(opened,'SHEET123','the referenced Google Sheet id must be extracted from the email body and opened directly');
  assert.equal(result.messagesProcessed,1);
  console.log('PASS: an inline Google Sheet link from an allowlisted sender is read directly, no attachment required');
})();

// 14. Header/dataset identification is robust to the real title+summary rows before the header row
(function testHeaderRowIdentification(){
  var atts=[xlsxAttachment([retentionSheet([GOOD_ROW])])];
  var thread=fakeThread('T-13',[fakeMessage('MSG-13',LUIS,'AM report','2026-09-10T13:00:00.000Z','',atts)]);
  var {ctx}=runTick({AURA_GMAIL_ALLOWED_SENDERS:'lsimoes@example-dgl.test'},{},[thread]);
  assert.equal(ctx.__tables.MKT_AURA_GMAIL_OPPORTUNITIES.length,1,'the parser must find the real header row past the title and summary rows, not assume row 1');
  console.log('PASS: dataset/header identification scans past title and summary rows to the real header row');
})();

// 15. Router exposes the new endpoints
(function testRouterExposesEndpoints(){
  assert(/case 'v6AuraGmailFreshness'\s*:[\s\S]{0,200}v6AuraGmailFreshnessStatus_/.test(routerSource),'router must expose v6AuraGmailFreshness');
  console.log('PASS: router exposes v6AuraGmailFreshness');
})();

// 16. Frontend adapter exposes the freshness method
(function testAdapterExposesFreshness(){
  assert(/v6AuraGmailFreshness\s*:\s*\(\)\s*=>\s*mutate\(\s*["']v6AuraGmailFreshness["']/.test(adapterSource));
  console.log('PASS: frontend adapter exposes v6AuraGmailFreshness');
})();

// 17. Heartbeat order: Gmail ingest runs before v6AuraAutomationTick_ inside the SAME hourly tick
(function testHeartbeatOrder(){
  var ingestIdx=acqSource.indexOf('v6AuraGmailIngestTick_()');
  var auraIdx=acqSource.indexOf('v6AuraAutomationTick_()');
  assert(ingestIdx>=0 && auraIdx>=0 && ingestIdx<auraIdx,'v6AuraGmailIngestTick_ must run before v6AuraAutomationTick_ inside v6AcqAutomationTick_');
  assert((acqSource.match(/function v6AcqAutomationTick_/g)||[]).length===1,'must still be exactly one hourly heartbeat function, no second trigger');
  console.log('PASS: Gmail ingest runs before AURA automation, inside the same single hourly heartbeat');
})();

// 18. v6RefreshOpportunitiesFromReports_ folds Gmail-sourced rows into the same governed pipeline
(function testMergedIntoOpportunityPipeline(){
  assert(/v6BuildGmailOpportunities_/.test(reportIngestSource),'v6RefreshOpportunitiesFromReports_ must fold Gmail-sourced opportunities into the same MKT_OPPORTUNITIES pipeline');
  console.log('PASS: Gmail-sourced opportunities are merged into the existing governed opportunity refresh, not a parallel table nobody reads');
})();

// 19. No PII (account/contact identity) ever leaves the backend into frontend source
(function testNoPiiInFrontendSource(){
  var gmailBlock=lifecycleSource.slice(lifecycleSource.indexOf('auraGmailSourceHtml'),lifecycleSource.indexOf('auraGmailSourceHtml')+2000);
  ['accountName','contactName','email','phone'].forEach(function(f){
    assert(!gmailBlock.includes(f),'AURA Gmail freshness UI must never reference '+f);
  });
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(lifecycleSource),'lifecycle module source must not contain email addresses');
  console.log('PASS: no account/contact PII or email addresses in the Gmail freshness frontend code');
})();

// 20. No PII in the backend ingestion source (no hardcoded contact fixtures)
(function testNoPiiInIngestSource(){
  assert(!/jane@|john@|sam@/i.test(ingestSource),'ingestion module source must not contain hardcoded contact emails');
  console.log('PASS: no hardcoded contact PII in the Gmail ingestion module source');
})();

console.log('AURA Gmail ingestion: ALL PASS');
