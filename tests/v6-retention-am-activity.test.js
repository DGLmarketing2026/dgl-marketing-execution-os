const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const ingestionSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6ReportIngestion.gs'),'utf8');
const pipelineSource=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6Pipeline.gs'),'utf8');

function fakeUtilities(){
  return {
    DigestAlgorithm:{MD5:'MD5'},Charset:{UTF_8:'UTF8'},
    computeDigest(_a,text){var bytes=[];for(var i=0;i<16;i++)bytes.push((String(text).charCodeAt(i%String(text).length)||i)+i);return bytes;},
    formatDate(d){return d.toISOString().slice(0,10);}
  };
}

function makeIngestionContext(tables){
  var ctx={Utilities:fakeUtilities(),Session:{getScriptTimeZone:function(){return 'UTC';}},SpreadsheetApp:{},ScriptApp:{},Date:Date,String:String,Array:Array,Object:Object,Number:Number,RegExp:RegExp};
  vm.createContext(ctx);
  vm.runInContext(ingestionSource,ctx,{filename:'MarketingV6ReportIngestion.gs'});
  ctx.v6ReportRows_=function(name){return (tables&&tables[name])||[];};
  return ctx;
}

function buildRetentionRow(ctx,migracionRow,cuentas){
  var tables={MIGRACION_CAIDAS:[migracionRow]};
  ctx.v6ReportRows_=function(name){return tables[name]||[];};
  return ctx.v6BuildRetentionOpportunities_('2026-09-04T00:00:00.000Z',{},cuentas||{})[0];
}

// 1. Deteccion base CON contexto de AM Intelligence (CUENTAS) presente y sin contradicciones -> DETECTED
// Canonical architecture: NOVA -> AM PLATFORM / AM INTELLIGENCE -> AURA. La deteccion base
// requiere el match de AM Intelligence; sin el, ver test 7b (AM CONTEXT REQUIRED).
(function test1(){
  var ctx=makeIngestionContext();
  var cuentas={'acme freight':{Bucket:'2. OPERA SIN GESTION','Tipo gestion':''}};
  var row=buildRetentionRow(ctx,{Cuenta:'Acme Freight','Sales Rep':'Jane Doe','Sin dueno':'NO'},cuentas);
  assert.equal(row.eligibilityStatus,'DETECTED');
  assert.equal(row.suppressionReason,'');
  console.log('retention test 1 (base detection with AM Intelligence context): PASS');
})();

// 2. Suppression por Sin dueno (regression) -> SUPPRESSED/OWNER REQUIRED, sin tocar rama CUENTAS
(function test2(){
  var ctx=makeIngestionContext();
  var cuentas={'acme freight':{Bucket:'8. GESTIONADAS SIN OPERAR','Tipo gestion':'COMERCIAL'}};
  var row=buildRetentionRow(ctx,{Cuenta:'Acme Freight','Sales Rep':'Someone','Sin dueno':'SI'},cuentas);
  assert.equal(row.eligibilityStatus,'SUPPRESSED');
  assert.equal(row.suppressionReason,'OWNER REQUIRED');
  var rowHouse=buildRetentionRow(ctx,{Cuenta:'House One','Sales Rep':'House Account','Sin dueno':'NO'},{});
  assert.equal(rowHouse.suppressionReason,'OWNER REQUIRED');
  console.log('retention test 2 (sin dueno regression): PASS');
})();

// 3. Suppression cross-prioridad (regression), adaptado a opportunityType Retention
(function test3(){
  var ctx=makeIngestionContext();
  var signals=[
    {accountName:'SAFE ACCOUNT KEY',opportunityType:'Retention',priorityRank:2,eligibilityStatus:'DETECTED',suppressionReason:''},
    {accountName:'SAFE ACCOUNT KEY',opportunityType:'Quoted Not Booked',priorityRank:1,eligibilityStatus:'DETECTED',suppressionReason:''}
  ];
  ctx.v6ApplyPrioritySuppression_(signals);
  assert.equal(signals[0].eligibilityStatus,'SUPPRESSED');
  assert.equal(signals[0].suppressionReason,'HIGHER PRIORITY SIGNAL');
  assert.equal(signals[1].eligibilityStatus,'DETECTED');
  console.log('retention test 3 (cross-priority regression): PASS');
})();

// 4. Bucket claro de ausencia de gestion -> DETECTED
(function test4(){
  var ctx=makeIngestionContext();
  var cuentas={'quiet co':{Bucket:'2. OPERA SIN GESTION','Tipo gestion':'OPERATIVA'}};
  var row=buildRetentionRow(ctx,{Cuenta:'Quiet Co','Sales Rep':'Jane Doe','Sin dueno':'NO'},cuentas);
  assert.equal(row.eligibilityStatus,'DETECTED');
  assert.equal(row.suppressionReason,'');
  assert.equal(row.amActivityBucket,'2. OPERA SIN GESTION');
  assert.equal(row.amActivityTipoGestion,'OPERATIVA');
  console.log('retention test 4 (clear no-management bucket): PASS');
})();

// 5. Bucket ambiguo ('8. GESTIONADAS SIN OPERAR') -> SUPPRESSED/AM ACTIVITY REVIEW REQUIRED
// and verify pipeline sync treats it like any SUPPRESSED row (no leak into active pipeline)
(function test5(){
  var ctx=makeIngestionContext();
  vm.runInContext(pipelineSource,ctx,{filename:'MarketingV6Pipeline.gs'});
  var cuentas={'ambiguous co':{Bucket:'8. GESTIONADAS SIN OPERAR','Tipo gestion':'COMERCIAL'}};
  var row=buildRetentionRow(ctx,{Cuenta:'Ambiguous Co','Sales Rep':'Jane Doe','Sin dueno':'NO'},cuentas);
  assert.equal(row.eligibilityStatus,'SUPPRESSED');
  assert.equal(row.suppressionReason,'AM ACTIVITY REVIEW REQUIRED');
  row.accountId='ACC-AMBIGUOUS';

  var winner=ctx.v6PipelineWinner_(null,row);
  assert.strictEqual(winner,row);

  var headers=['accountId','accountName','amOwner','currentStage','opportunityType','service','campaignId','executionId','enteredStageAt','lastMarketingTouchAt','responseAt','rfqAt','quoteAt','loadAt','cooldownUntil','nextAction','handoffStatus','attributedRevenue','updatedAt'];
  var written=[];
  var sheet={getDataRange:function(){return {getValues:function(){return [headers];}};},getLastRow:function(){return 1;},getRange:function(){return {clearContent:function(){},setValues:function(rows){written=rows;}};}};
  ctx.v6Sheet_=function(name){assert.equal(name,'MKT_ACCOUNT_PIPELINE');return sheet;};
  ctx.v6Rows_=function(){throw new Error('unexpected opportunity read via v6Rows_');};
  var result=ctx.v6PipelineSyncSignals_({opportunities:[row]});
  assert.equal(result.suppressed,1);
  var record=Object.fromEntries(headers.map(function(h,i){return [h,written[0][i]];}));
  assert.equal(record.currentStage,'CLOSED / SUPPRESSED');
  assert.equal(record.nextAction,'SUPPRESSED: AM ACTIVITY REVIEW REQUIRED');
  console.log('retention test 5 (ambiguous bucket stays suppressed in pipeline): PASS');
})();

// 6. Contradiccion bucket / Tipo gestion -> SUPPRESSED/AM ACTIVITY REVIEW REQUIRED
(function test6(){
  var ctx=makeIngestionContext();
  var cuentas={'contradiction co':{Bucket:'3. SIN GESTION CRITICO','Tipo gestion':'comercial'}};
  var row=buildRetentionRow(ctx,{Cuenta:'Contradiction Co','Sales Rep':'Jane Doe','Sin dueno':'NO'},cuentas);
  assert.equal(row.eligibilityStatus,'SUPPRESSED');
  assert.equal(row.suppressionReason,'AM ACTIVITY REVIEW REQUIRED');
  console.log('retention test 6 (bucket vs gestion contradiction): PASS');
})();

// 7. Cobertura de join: fila sin match en CUENTAS -> SUPPRESSED / AM CONTEXT REQUIRED.
// Canonical architecture correction: AURA no debe avanzar un candidato de Retention a
// DETECTED usando solo campos NOVA (MIGRACION_CAIDAS) cuando no hay AM Intelligence
// (CUENTAS) correspondiente -- eso seria una ruta NOVA -> AURA que salta a AM.
(function test7(){
  var ctx=makeIngestionContext();
  var tables={MIGRACION_CAIDAS:[
    {Cuenta:'Matched Co','Sales Rep':'Jane Doe','Sin dueno':'NO'},
    {Cuenta:'Unmatched Co','Sales Rep':'Jane Doe','Sin dueno':'NO'}
  ]};
  ctx.v6ReportRows_=function(name){return tables[name]||[];};
  var cuentas={'matched co':{Bucket:'2. OPERA SIN GESTION','Tipo gestion':'OPERATIVA'}};
  var rows=ctx.v6BuildRetentionOpportunities_('2026-09-04T00:00:00.000Z',{},cuentas);
  var matched=rows.filter(function(r){return r.accountName==='Matched Co';})[0];
  assert.equal(matched.eligibilityStatus,'DETECTED');
  var unmatched=rows.filter(function(r){return r.accountName==='Unmatched Co';})[0];
  assert.equal(unmatched.eligibilityStatus,'SUPPRESSED');
  assert.equal(unmatched.suppressionReason,'AM CONTEXT REQUIRED');
  var coverage=ctx.v6RetentionCuentasJoinCoverage_(rows,cuentas);
  assert.equal(coverage,0.5);
  console.log('retention test 7 (missing AM Intelligence match is held, not auto-detected): PASS');
})();

console.log('V6 retention AM activity join: ALL PASS');
