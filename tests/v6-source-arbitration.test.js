const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const src=name=>fs.readFileSync(path.join(root,'backend/apps-script-v6',name),'utf8');
const ingestionSource=src('MarketingV6ReportIngestion.gs');
const freshnessSource=src('MarketingV6DataFreshness.gs');

function fakeUtilities(){
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate(d){return d.toISOString().slice(0,10);}
  };
}
function fakeDriveApp(lastUpdated){
  return {getFileById:function(){return {getLastUpdated:function(){return lastUpdated;}};}};
}
var OPP_HEADERS=['opportunityId','accountId','accountName','amOwner','opportunityType','service','signalDate','qnbWindow','lane','sourceReport','sourceRecordId','priorityRank','eligibilityStatus','suppressionReason','campaignId','detectedAt','updatedAt','amActivityBucket','amActivityTipoGestion','amActivityUltimoChatter','amActivityAutorChatter','tierDestino'];

function makeContext(tables,lastUpdated,withGmail){
  tables=tables||{};
  var ctx={Utilities:fakeUtilities(),Session:{getScriptTimeZone:function(){return 'UTC';}},SpreadsheetApp:{},ScriptApp:{},DriveApp:fakeDriveApp(lastUpdated||new Date()),Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp,console:console};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  vm.runInContext(freshnessSource,ctx,{filename:'MarketingV6DataFreshness.gs'});
  if(withGmail){
    ctx.v6AuraGmailFreshnessStatus_=withGmail.freshnessFn||function(){return withGmail.freshness;};
    ctx.v6BuildGmailOpportunities_=withGmail.buildFn||function(nowIso){return withGmail.rows||[];};
  }
  ctx.v6Rows_=function(name){return (tables[name]||[]).map(function(r){return Object.assign({},r);});};
  ctx.v6UpsertByKey_=function(name,keys,record){
    var rows=tables[name]||(tables[name]=[]);
    var at=rows.findIndex(function(row){return keys.every(function(k){return String(row[k]||'')===String(record[k]||'');});});
    if(at<0)rows.push(Object.assign({},record));else rows[at]=Object.assign({},record);
    return record;
  };
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
  ctx.__tables=tables;
  return ctx;
}
function emptyReportTables(overrides){
  var base={MIGRACION_CAIDAS:[],CUENTAS:[],FICHA_CLIENTES:[],LQS_SIN_RESPUESTA:[],MIGRACION_RECUPERADAS:[]};
  return Object.assign(base,overrides||{});
}

// 1. NOVA fresh -> selected source is NOVA, Gmail is never even consulted
(function novaFreshTest(){
  var ctx=makeContext({},new Date(Date.now()-1*3600000),{
    freshnessFn:function(){throw new Error('Gmail freshness must not be checked when NOVA is already FRESH');}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'FRESH');
  assert.equal(result.selectedSource,'NOVA_CANONICAL');
  assert.equal(result.nova.status,'FRESH');
  assert.strictEqual(result.amIntelligence,null);
  console.log('source arbitration test 1 (NOVA fresh short-circuits, Gmail never checked): PASS');
})();

// 2. NOVA stale, Gmail CURRENT/OK/rowsAccepted>0 -> AM Intelligence fallback qualifies
(function novaStaleGmailFreshTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000),{
    freshness:{status:'OK',freshness:'CURRENT',rowsAccepted:948,rowsRejected:0,ageDays:1}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'FRESH');
  assert.equal(result.selectedSource,'AM_INTELLIGENCE_GMAIL');
  assert.equal(result.nova.status,'STALE');
  assert.equal(result.amIntelligence.rowsAccepted,948);
  console.log('source arbitration test 2 (NOVA stale, valid current AM Gmail source fills in): PASS');
})();

// 2b. rowsRejected present but non-zero must NOT block arbitration (no documented reject-rate
// policy exists anywhere in this codebase; CLAUDE.md forbids inventing one) -- only
// rowsAccepted>0 gates.
(function novaStaleGmailWithRejectionsStillQualifiesTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000),{
    freshness:{status:'OK',freshness:'CURRENT',rowsAccepted:900,rowsRejected:48,ageDays:1}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'FRESH');
  assert.equal(result.selectedSource,'AM_INTELLIGENCE_GMAIL');
  console.log('source arbitration test 2b (rowsRejected>0 does not block; no invented reject-rate threshold): PASS');
})();

// 3. NOVA stale, Gmail present but AGING (not CURRENT) -> fail closed
(function novaStaleGmailAgingTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000),{
    freshness:{status:'OK',freshness:'AGING',rowsAccepted:500,rowsRejected:0,ageDays:15}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'STALE_SOURCE');
  assert.equal(result.selectedSource,'NONE');
  console.log('source arbitration test 3 (Gmail AGING, not CURRENT -> STALE_SOURCE): PASS');
})();

// 4. NOVA stale, Gmail present but rowsAccepted=0 -> fail closed
(function novaStaleGmailZeroRowsTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000),{
    freshness:{status:'OK',freshness:'CURRENT',rowsAccepted:0,rowsRejected:5,ageDays:1}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'STALE_SOURCE');
  console.log('source arbitration test 4 (Gmail CURRENT but zero accepted rows -> STALE_SOURCE): PASS');
})();

// 5. NOVA stale, no Gmail report ever received -> fail closed
(function novaStaleNoGmailReportTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000),{
    freshness:{status:'NO_REPORT_RECEIVED'}
  });
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'STALE_SOURCE');
  console.log('source arbitration test 5 (no Gmail report ever received -> STALE_SOURCE): PASS');
})();

// 6. NOVA stale, Gmail ingestion file not deployed at all (typeof guard) -> fail closed, no crash
(function novaStaleNoGmailDeployedTest(){
  var ctx=makeContext({},new Date(Date.now()-20*3600000)); // no withGmail -> v6AuraGmailFreshnessStatus_ undefined
  var result=ctx.v6AuraResolveFreshnessSource_();
  assert.equal(result.status,'STALE_SOURCE');
  assert.equal(result.amIntelligence.status,'SOURCE_NOT_DEPLOYED');
  console.log('source arbitration test 6 (Gmail ingestion not deployed -> fail closed, no crash): PASS');
})();

// 7. v6RefreshOpportunitiesFromReports_ folds in Gmail-sourced rows when the builder exists
(function refreshFoldsInGmailOpportunitiesTest(){
  var tables={};
  var gmailRows=[{
    opportunityId:'OPP-GMAIL-RETENTION-ABC123',accountId:'ACC-GMAILACCT1',accountName:'Gmail Sourced Co',
    amOwner:'Luis',opportunityType:'Retention',service:'Multiservicio',signalDate:'2026-09-10',qnbWindow:'',lane:'',
    sourceReport:'GMAIL_AM_REPORT',sourceRecordId:'',priorityRank:2,eligibilityStatus:'DETECTED',suppressionReason:'',
    campaignId:'',detectedAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-10T00:00:00.000Z'
  }];
  var ctx=makeContext(tables,new Date(),{buildFn:function(){return gmailRows;}});
  ctx.v6ReportRows_=function(name){return emptyReportTables()[name]||[];};
  var result=ctx.v6RefreshOpportunitiesFromReports_();
  assert.equal(result.status,'REPORT_SOURCE_SYNCED');
  var written=tables.MKT_OPPORTUNITIES.filter(function(r){return r.sourceReport==='GMAIL_AM_REPORT';});
  assert.equal(written.length,1,'the Gmail-sourced row must be written into MKT_OPPORTUNITIES');
  assert.equal(written[0].accountName,'Gmail Sourced Co');
  console.log('source arbitration test 7 (v6RefreshOpportunitiesFromReports_ folds in Gmail-sourced opportunities): PASS');
})();

// 8. Cross-source priority suppression: a Gmail-sourced Retention row and a NOVA-sourced QNB row
// for the SAME account (same accountId hash) are reconciled by the existing priority engine --
// QNB (priority 1) wins, Gmail Retention (priority 2) is suppressed. No new suppression mechanism.
(function crossSourcePrioritySuppressionTest(){
  var tables={};
  var accountName='Shared Account Co';
  var gmailRows=[{
    opportunityId:'OPP-GMAIL-RETENTION-XYZ',accountId:'',accountName:accountName,amOwner:'Luis',
    opportunityType:'Retention',service:'Multiservicio',signalDate:'2026-09-10',qnbWindow:'',lane:'',
    sourceReport:'GMAIL_AM_REPORT',sourceRecordId:'',priorityRank:2,eligibilityStatus:'DETECTED',suppressionReason:'',
    campaignId:'',detectedAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-10T00:00:00.000Z'
  }];
  var ctx=makeContext(tables,new Date(),{buildFn:function(){return gmailRows;}});
  // accountId must match the same hash scheme v6BuildQnbOpportunities_ uses for the same account
  // name, so compute it the same way the real Gmail builder does before running the refresh.
  gmailRows[0].accountId='ACC-'+ctx.v6HashKey_(ctx.v6NormAccount_(accountName));
  var reportTables=emptyReportTables({
    LQS_SIN_RESPUESTA:[{Cliente:accountName,Agente:'Jane',Area:'FTL',Bucket:'0-14','Fecha creacion':'2026-09-08',LQ:'LQ-1'}]
  });
  ctx.v6ReportRows_=function(name){return reportTables[name]||[];};
  ctx.v6RefreshOpportunitiesFromReports_();
  var rows=tables.MKT_OPPORTUNITIES.filter(function(r){return r.accountName===accountName;});
  assert.equal(rows.length,2,'both the QNB and the Gmail-Retention row must exist for this account');
  var qnb=rows.filter(function(r){return r.opportunityType==='Quoted Not Booked';})[0];
  var gmailRow=rows.filter(function(r){return r.sourceReport==='GMAIL_AM_REPORT';})[0];
  assert.equal(qnb.eligibilityStatus,'DETECTED');
  assert.equal(gmailRow.eligibilityStatus,'SUPPRESSED');
  assert.equal(gmailRow.suppressionReason,'HIGHER PRIORITY SIGNAL');
  console.log('source arbitration test 8 (cross-source priority suppression reconciles Gmail + NOVA signals for the same account): PASS');
})();

console.log('V6 source arbitration + Gmail fold-in: ALL PASS');
