const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const ingestionSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6ReportIngestion.gs'),'utf8');
const pipelineSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6Pipeline.gs'),'utf8');
const outcomesSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6CommercialOutcomes.gs'),'utf8');
const routerSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6RouterExtension.gs'),'utf8');

function fakeUtilities(){
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate(d){return d.toISOString().slice(0,10);}
  };
}

function makeContext(tables){
  tables=tables||{MKT_ACCOUNTS:[],MKT_ACCOUNT_PIPELINE:[]};
  var ctx={Utilities:fakeUtilities(),Session:{getScriptTimeZone:function(){return 'UTC';}},SpreadsheetApp:{},ScriptApp:{},Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(pipelineSource,ctx,{filename:'MarketingV6Pipeline.gs'});
  vm.runInContext(outcomesSource,ctx,{filename:'MarketingV6CommercialOutcomes.gs'});
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

// 1. Resolve accountId via MKT_ACCOUNTS and write attributedRevenue == Monto (untransformed)
(function resolveTest(){
  var tables={
    MKT_ACCOUNTS:[{accountId:'ACC-1',accountName:'Acme Freight',salesforceAccountId:'SF-1'}],
    MKT_ACCOUNT_PIPELINE:[]
  };
  var ctx=makeContext(tables);
  ctx.v6ReportRows_=function(name){
    assert.equal(name,'LOADS_ORIGEN_LQ');
    return [{Load:'L-100',Cliente:'Acme Freight',Area:'FTL',Dispatcher:'D1',Monto:12345.67,'Fecha load':'2026-08-01','LQ de origen':'LQ-1','Fecha LQ':'2026-07-01',Origen:'Marketing'}];
  };
  var result=ctx.v6IngestCommercialOutcomes_();
  assert.equal(result.rowsProcessed,1);
  assert.equal(result.resolved,1);
  assert.equal(result.unresolvedCount,0);
  assert.equal(result.ambiguousCount,0);
  var record=ctx.__tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-1';})[0];
  assert(record,'pipeline record must be written for resolved account');
  assert.strictEqual(record.attributedRevenue,12345.67,'attributedRevenue must equal Monto untransformed');
  assert.equal(record.loadAt,'2026-08-01');
  assert.equal(record.nextAction,'','non-ambiguous ingestion must not set the concurrency nextAction');
  console.log('commercial outcomes test (resolves accountId, copies Monto untransformed): PASS');
})();

// 2. Row without a match in MKT_ACCOUNTS writes nothing; unresolvedCount increments
(function unresolvedTest(){
  var tables={
    MKT_ACCOUNTS:[{accountId:'ACC-1',accountName:'Acme Freight',salesforceAccountId:'SF-1'}],
    MKT_ACCOUNT_PIPELINE:[]
  };
  var ctx=makeContext(tables);
  ctx.v6ReportRows_=function(){
    return [{Load:'L-200',Cliente:'Unknown Shipper',Area:'LTL',Dispatcher:'D2',Monto:500,'Fecha load':'2026-08-02'}];
  };
  var result=ctx.v6IngestCommercialOutcomes_();
  assert.equal(result.rowsProcessed,1);
  assert.equal(result.resolved,0);
  assert.equal(result.unresolvedCount,1);
  assert.equal(ctx.__tables.MKT_ACCOUNT_PIPELINE.length,0,'no pipeline write for unresolved row');
  console.log('commercial outcomes test (unmatched account writes nothing): PASS');
})();

// 2b. Account present by name but without salesforceAccountId/externalAccountId also counts unresolved
(function unresolvedNoCrosswalkTest(){
  var tables={
    MKT_ACCOUNTS:[{accountId:'ACC-2',accountName:'No Crosswalk Co'}],
    MKT_ACCOUNT_PIPELINE:[]
  };
  var ctx=makeContext(tables);
  ctx.v6ReportRows_=function(){
    return [{Load:'L-300',Cliente:'No Crosswalk Co',Monto:100,'Fecha load':'2026-08-03'}];
  };
  var result=ctx.v6IngestCommercialOutcomes_();
  assert.equal(result.unresolvedCount,1);
  assert.equal(result.resolved,0);
  console.log('commercial outcomes test (account without crosswalk id is unresolved): PASS');
})();

// 3. Multi-campaign concurrency marks nextAction without overwriting campaignId
(function ambiguousTest(){
  var tables={
    MKT_ACCOUNTS:[{accountId:'ACC-3',accountName:'Concurrent Co',externalAccountId:'EXT-3'}],
    MKT_ACCOUNT_PIPELINE:[{accountId:'ACC-3',currentStage:'RESPONDED',campaignId:'CAM-OLD',opportunityType:'Retention'}]
  };
  var ctx=makeContext(tables);
  ctx.v6ReportRows_=function(){
    return [{Load:'L-400',Cliente:'Concurrent Co',Monto:999.5,'Fecha load':'2026-08-04'}];
  };
  var result=ctx.v6IngestCommercialOutcomes_();
  assert.equal(result.resolved,1);
  assert.equal(result.ambiguousCount,1);
  var record=ctx.__tables.MKT_ACCOUNT_PIPELINE.filter(function(r){return r.accountId==='ACC-3';})[0];
  assert.equal(record.campaignId,'CAM-OLD','campaignId must not be overwritten');
  assert.equal(record.nextAction,'MULTI-CAMPAIGN CONCURRENCY — ATTRIBUTION AMBIGUOUS');
  assert.strictEqual(record.attributedRevenue,999.5);
  console.log('commercial outcomes test (multi-campaign concurrency preserves campaignId): PASS');
})();

assert(routerSource.includes('v6IngestCommercialOutcomes:v6IngestCommercialOutcomes_'),'router must expose v6IngestCommercialOutcomes');
console.log('V6 commercial outcomes ingestion: ALL PASS');
