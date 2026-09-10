const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const bridgeSource=src('MarketingV6AuraBridge.gs');
const automationSource=src('MarketingV6AuraAutomation.gs');
const routerSource=src('MarketingV6RouterExtension.gs');
const adapterSource=fs.readFileSync(path.join(root,'assets/js/marketing-backend-adapter-v55.js'),'utf8');

function makeContext(tables){
  tables=tables||{};
  var ctx={Date:Date,String:String,Array:Array,Object:Object,Number:Number,console:console};
  vm.createContext(ctx);
  vm.runInContext(bridgeSource,ctx,{filename:'MarketingV6AuraBridge.gs'});
  vm.runInContext(automationSource,ctx,{filename:'MarketingV6AuraAutomation.gs'});
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6AcqEnsureSheet_=function(){return true;};
  return ctx;
}

var SAFE_FIELDS=['owner','campaignFamily','service','campaignId','executionId','source','detectedAccounts','eligibleAccounts','suppressedAccounts','recipients','emailGenerated','sent','delivered','opened','bounced','clicks','spamComplaints','replies','rfqs','quotes','loads','campaignStart','campaignEnd','status','updatedAt'];

function row(overrides){
  return Object.assign({
    reportRowId:'CMP-1',owner:'Alex Cifuentes',campaignFamily:'Retention',service:'FTL',campaignId:'CMP-1',executionId:'EXEC-1',
    detectedAccounts:5,eligibleAccounts:3,suppressedAccounts:2,recipients:6,sent:0,delivered:0,bounced:0,clicks:0,
    replies:0,rfqs:0,quotes:0,loads:0,campaignStart:'2026-09-01T00:00:00.000Z',campaignEnd:'',
    status:'READY TO SEND · SEND PROVIDER REQUIRED',updatedAt:'2026-09-09T21:57:25.889Z',
    // fields that must NEVER leak through the endpoint, even if a row somehow carries them
    accountName:'SECRET ACCOUNT INC',accountId:'ACC-SECRET-001',contactName:'Jane Secret',email:'jane@secret.example.com',phone:'+1-555-0100',price:12345,creditLimit:99999
  },overrides||{});
}

// 1. Endpoint exists and router exposes it
(function testEndpointAndRouterExist(){
  assert(/function v6AuraExecutionReport_\s*\(/.test(automationSource),'v6AuraExecutionReport_ must be defined in MarketingV6AuraAutomation.gs');
  assert(/case 'v6AuraExecutionReport'\s*:[\s\S]{0,200}v6AuraExecutionReport_/.test(routerSource),'router must expose v6AuraExecutionReport and delegate to v6AuraExecutionReport_');
  console.log('PASS: v6AuraExecutionReport_ endpoint and router case exist');
})();

// 2. Frontend adapter exposes v6AuraExecutionReport
(function testAdapterMethodExists(){
  assert(/v6AuraExecutionReport\s*:\s*\(\)\s*=>\s*mutate\(\s*["']v6AuraExecutionReport["']/.test(adapterSource),'adapter must expose v6AuraExecutionReport backed by mutate("v6AuraExecutionReport",...)');
  console.log('PASS: frontend adapter exposes v6AuraExecutionReport');
})();

// 3. Response shape, real aggregates, no hard-coded totals
(function testShapeAndAggregates(){
  var tables={MKT_AURA_EXECUTION_REPORT:[
    row({owner:'Alex Cifuentes',campaignFamily:'Retention',recipients:6,eligibleAccounts:3,status:'READY TO SEND · SEND PROVIDER REQUIRED',sent:0,replies:1,rfqs:0,quotes:0,loads:0,updatedAt:'2026-09-09T21:00:00.000Z'}),
    row({reportRowId:'CMP-2',campaignId:'CMP-2',executionId:'EXEC-2',owner:'Ali Pirela',campaignFamily:'Quoted Not Booked',recipients:4,eligibleAccounts:2,status:'BLOCKED',sent:0,replies:0,rfqs:2,quotes:1,loads:0,updatedAt:'2026-09-09T22:00:00.000Z'}),
    row({reportRowId:'CMP-3',campaignId:'CMP-3',executionId:'EXEC-3',owner:'Alex Cifuentes',campaignFamily:'Cross-Sell',recipients:2,eligibleAccounts:2,status:'PREPARING',sent:3,replies:2,rfqs:0,quotes:0,loads:1,updatedAt:'2026-09-09T20:00:00.000Z'})
  ]};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraExecutionReport_();
  assert(out&&out.summary&&Array.isArray(out.records),'response must have {summary, records}');
  assert.equal(out.records.length,3,'must return every stored report row');
  assert.equal(out.summary.campaigns,3);
  assert.equal(out.summary.readyToSend,1,'only rows whose status starts with READY TO SEND count as readyToSend');
  assert.equal(out.summary.blocked,1,'only rows whose status is exactly BLOCKED count as blocked');
  assert.equal(out.summary.recipients,12,'recipients must be summed from real rows (6+4+2), never hard-coded');
  assert.equal(out.summary.eligibleAccounts,7);
  assert.equal(out.summary.owners,2,'owners must be a distinct count');
  assert.equal(out.summary.sent,3);
  assert.equal(out.summary.replies,3);
  assert.equal(out.summary.rfqs,2);
  assert.equal(out.summary.loads,1);
  assert.equal(out.summary.lastUpdated,'2026-09-09T22:00:00.000Z','lastUpdated must be the max updatedAt across real rows');
  console.log('PASS: v6AuraExecutionReport_ returns real, computed aggregates — never hard-coded totals');
})();

// 4. No PII / account identity in the response, and only the allowed field set
(function testNoPii(){
  var tables={MKT_AURA_EXECUTION_REPORT:[row()]};
  var ctx=makeContext(tables);
  var out=ctx.v6AuraExecutionReport_();
  var record=out.records[0];
  var keys=Object.keys(record).sort();
  assert.deepEqual(keys,SAFE_FIELDS.slice().sort(),'record must contain exactly the safe operational field allowlist, nothing more');
  ['accountName','accountId','contactName','email','phone','price','creditLimit'].forEach(function(f){
    assert(!Object.prototype.hasOwnProperty.call(record,f),'record must never carry '+f);
  });
  var blob=JSON.stringify(out);
  assert(!blob.includes('SECRET ACCOUNT INC'));
  assert(!blob.includes('jane@secret.example.com'));
  assert(!blob.includes('555-0100'));
  assert(!/\b12345\b/.test(blob.replace(/"eligibleAccounts":\d+/g,'')) || !blob.includes('"price"'),'price must never appear');
  console.log('PASS: v6AuraExecutionReport_ never leaks PII/account identity, only safe operational fields');
})();

// 5. Empty sheet never fabricates data — real zeros, not fake demo numbers
(function testEmptyIsRealZero(){
  var ctx=makeContext({MKT_AURA_EXECUTION_REPORT:[]});
  var out=ctx.v6AuraExecutionReport_();
  assert.equal(out.records.length,0);
  assert.equal(out.summary.campaigns,0);
  assert.equal(out.summary.recipients,0);
  assert.equal(out.summary.lastUpdated,'');
  console.log('PASS: an empty report sheet yields real zeros, not fabricated demo data');
})();

console.log('AURA live execution report endpoint: ALL PASS');
