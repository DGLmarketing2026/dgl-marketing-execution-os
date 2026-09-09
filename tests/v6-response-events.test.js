const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const responseSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6ResponseEvents.gs'),'utf8');
const pipelineSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6Pipeline.gs'),'utf8');
const routerSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6RouterExtension.gs'),'utf8');

function makeContext(){
  var tables={MKT_ACCOUNT_PIPELINE:[],MKT_CONTACTS_SECURE:[],MKT_EXCLUSIONS:[]};
  var ctx={Date:Date,String:String,Array:Array,Object:Object};
  vm.createContext(ctx);
  vm.runInContext(pipelineSource,ctx,{filename:'MarketingV6Pipeline.gs'});
  vm.runInContext(responseSource,ctx,{filename:'MarketingV6ResponseEvents.gs'});
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

// REPLY -> RESPONDED + handoff pending
(function replyTest(){
  var ctx=makeContext();
  var out=ctx.v6ClassifyResponseEvent_({eventType:'REPLY',accountId:'ACC-1',eventId:'EVT-1',occurredAt:'2026-09-01T00:00:00Z',campaignId:'CAM-1',executionId:'EXEC-1',amOwner:'Owner A'});
  assert.equal(out.action,'PIPELINE_UPDATED');
  assert.equal(out.eventId,'EVT-1');
  var record=ctx.__tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-1';})[0];
  assert(record,'pipeline record must be created');
  assert.equal(record.currentStage,'RESPONDED');
  assert.equal(record.nextAction,'STOP ACCOUNT AUTOMATION / V5.5 HANDOFF');
  assert.equal(record.handoffStatus,'PENDING');
  assert.equal(record.responseAt,'2026-09-01T00:00:00Z');
  console.log('response events test (REPLY -> RESPONDED + handoff pending): PASS');
})();

// RFQ -> RFQ RECEIVED
(function rfqTest(){
  var ctx=makeContext();
  var out=ctx.v6ClassifyResponseEvent_({eventType:'RFQ',accountId:'ACC-2',eventId:'EVT-2',occurredAt:'2026-09-02T00:00:00Z'});
  assert.equal(out.action,'PIPELINE_UPDATED');
  var record=ctx.__tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-2';})[0];
  assert.equal(record.currentStage,'RFQ RECEIVED');
  assert.equal(record.rfqAt,'2026-09-02T00:00:00Z');
  console.log('response events test (RFQ -> RFQ RECEIVED): PASS');
})();

// BOUNCE -> emailStatus INVALID, sin tocar pipeline, merge preserves historical fields
(function bounceTest(){
  var ctx=makeContext();
  ctx.__tables.MKT_CONTACTS_SECURE.push({contactId:'CON-3',accountId:'ACC-3',email:'old@example.invalid',emailStatus:'VALID',firstName:'Historical',lastName:'Contact'});
  var out=ctx.v6ClassifyResponseEvent_({eventType:'BOUNCE',accountId:'ACC-3',contactId:'CON-3',email:'old@example.invalid',eventId:'EVT-3',occurredAt:'2026-09-03T00:00:00Z'});
  assert.equal(out.action,'CONTACT_MARKED_INVALID');
  var contact=ctx.__tables.MKT_CONTACTS_SECURE.filter(function(r){return r.contactId==='CON-3';})[0];
  assert.equal(contact.emailStatus,'INVALID');
  assert.equal(contact.firstName,'Historical','merge must preserve historical fields');
  assert.equal(contact.lastName,'Contact');
  assert.equal(ctx.__tables.MKT_ACCOUNT_PIPELINE.length,0,'BOUNCE must not touch pipeline');
  console.log('response events test (BOUNCE -> emailStatus INVALID, pipeline untouched): PASS');
})();

// UNSUBSCRIBE -> exclusion activa, sin tocar pipeline
(function unsubscribeTest(){
  var ctx=makeContext();
  var out=ctx.v6ClassifyResponseEvent_({eventType:'UNSUBSCRIBE',accountId:'ACC-4',contactId:'CON-4',eventId:'EVT-4',occurredAt:'2026-09-04T00:00:00Z'});
  assert.equal(out.action,'EXCLUSION_REGISTERED');
  var exclusion=ctx.__tables.MKT_EXCLUSIONS.filter(function(r){return r.exclusionId==='UNSUB:CON-4';})[0];
  assert(exclusion,'exclusion must be registered');
  assert.equal(exclusion.status,'ACTIVE');
  assert.equal(exclusion.active,true);
  assert.equal(exclusion.reasonCode,'UNSUBSCRIBE');
  assert.equal(exclusion.accountId,'ACC-4');
  assert.equal(ctx.__tables.MKT_ACCOUNT_PIPELINE.length,0,'UNSUBSCRIBE must not touch pipeline');
  console.log('response events test (UNSUBSCRIBE -> active exclusion, pipeline untouched): PASS');
})();

// CLICK / OTHER -> IGNORED, sin efectos secundarios
(function ignoredTest(){
  var ctx=makeContext();
  ['CLICK','OTHER','SOMETHING_UNKNOWN'].forEach(function(eventType){
    var out=ctx.v6ClassifyResponseEvent_({eventType:eventType,accountId:'ACC-5',eventId:'EVT-5-'+eventType});
    assert.equal(out.action,'IGNORED');
    assert.equal(out.result,null);
  });
  assert.equal(ctx.__tables.MKT_ACCOUNT_PIPELINE.length,0);
  assert.equal(ctx.__tables.MKT_CONTACTS_SECURE.length,0);
  assert.equal(ctx.__tables.MKT_EXCLUSIONS.length,0);
  console.log('response events test (CLICK/OTHER -> IGNORED, no side effects): PASS');
})();

assert(routerSource.includes('v6ClassifyResponseEvent:v6ClassifyResponseEvent_'),'router must expose v6ClassifyResponseEvent');
console.log('V6 response event classifier: ALL PASS');
