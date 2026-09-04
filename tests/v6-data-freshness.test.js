const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestionSource=src('MarketingV6ReportIngestion.gs'); // declares MKT_V6_REPORT_SOURCE_ID
const freshnessSource=src('MarketingV6DataFreshness.gs');

function fakeUtilities(){
  return {DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},computeDigest(){return [];}};
}
function makeContext(hoursAgo){
  var lastUpdated=new Date(Date.now()-hoursAgo*3600000);
  var ctx={
    Utilities:fakeUtilities(),Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,
    DriveApp:{getFileById:function(id){return {getLastUpdated:function(){return lastUpdated;},id:id};}}
  };
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(freshnessSource,ctx,{filename:'MarketingV6DataFreshness.gs'});
  return ctx;
}

// 1. FRESH: last updated 1 hour ago (< 6-hour threshold)
(function freshTest(){
  var ctx=makeContext(1);
  var result=ctx.v6AuraCheckReportFreshness_();
  assert.equal(result.status,'FRESH');
  assert.equal(result.staleThresholdHours,6);
  assert(result.hoursSinceLastUpdate>=1&&result.hoursSinceLastUpdate<1.01);
  assert(typeof result.lastUpdatedIso==='string'&&result.lastUpdatedIso.length>0);
  console.log('data freshness test 1 (1h ago -> FRESH): PASS');
})();

// 2. STALE: last updated 10 hours ago (> 6-hour threshold, reusing the existing
// six-hour opportunity-refresh trigger constant, not a new invented number)
(function staleTest(){
  var ctx=makeContext(10);
  var result=ctx.v6AuraCheckReportFreshness_();
  assert.equal(result.status,'STALE');
  assert(result.hoursSinceLastUpdate>6);
  console.log('data freshness test 2 (10h ago -> STALE): PASS');
})();

// 3. Boundary: just under 6 hours ago is still FRESH (status flips on > 6, not >=6; not
// tested at the exact instant of 6.000h since that depends on real wall-clock elapsed
// during the test itself and would be flaky)
(function boundaryTest(){
  var ctx=makeContext(5.9);
  var result=ctx.v6AuraCheckReportFreshness_();
  assert.equal(result.status,'FRESH');
  console.log('data freshness test 3 (5.9h ago -> still FRESH, just under threshold): PASS');
})();

// 4. DriveApp.getFileById is called with the real report source spreadsheet id, not a
// hardcoded/fabricated one
(function usesRealSourceIdTest(){
  var ctx=makeContext(1);
  var seenId=null;
  ctx.DriveApp={getFileById:function(id){seenId=id;return {getLastUpdated:function(){return new Date();}};}};
  ctx.v6AuraCheckReportFreshness_();
  assert.equal(seenId,ctx.MKT_V6_REPORT_SOURCE_ID);
  console.log('data freshness test 4 (checks the real MKT_V6_REPORT_SOURCE_ID spreadsheet): PASS');
})();

console.log('V6 data freshness gate: ALL PASS');
