const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),file=path.join(root,'backend/apps-script-v6/MarketingV6ReportIngestion.gs'),source=fs.readFileSync(file,'utf8'),engine=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6OpportunityEngine.gs'),'utf8');
const sourceId='1XPZC_VUPLsmta--MPXi4MHswz9oiYxKbiq58a_khPp4';
assert.equal((source.match(new RegExp(sourceId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length,1,'Source ID must exist once as configuration');
assert(source.includes("var MKT_V6_REPORT_SOURCE_ID='"+sourceId+"'"));
assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(source),'No email addresses may be stored in ingestion source');
assert(!/(CUSTOMER_NAME|CONTACT_NAME|EMAIL_ADDRESS)\s*[:=]\s*['\"][^'\"]+/i.test(source),'No customer/contact fixtures may be hardcoded');
assert(source.includes("['CUENTAS','FICHA_CLIENTES','LANES_DETALLE','LOADS_ORIGEN_LQ','LQS_SEMANA','LQS_SIN_RESPUESTA','MIGRACION_CAIDAS','MIGRACION_RECUPERADAS']"));
const context={Utilities:{getUuid:()=> '12345678-0000'},SpreadsheetApp:{},ScriptApp:{}};vm.createContext(context);vm.runInContext(source,context,{filename:'MarketingV6ReportIngestion.gs'});
const latest=context.v6LatestQnbByAccount_([{ACCOUNT_ID:'A-1',FECHA:'2026-01-01',LQ_ID:'OLD'},{ACCOUNT_ID:'A-1',FECHA:'2026-02-01',LQ_ID:'LATEST'},{ACCOUNT_ID:'A-2',FECHA:'2026-01-15',LQ_ID:'ONLY'}]);assert.equal(Object.keys(latest).length,2);assert.equal(latest['A-1'].LQ_ID,'LATEST','QNB must retain one latest signal per account');
const signals=[{accountId:'A-1',opportunityType:'NURTURE',priority:5,eligibilityStatus:'ELIGIBLE',eligibleAccounts:1,suppressedAccounts:0},{accountId:'A-1',opportunityType:'QNB',priority:1,eligibilityStatus:'ELIGIBLE',eligibleAccounts:1,suppressedAccounts:0}];context.v6ApplyReportPriority_(signals);assert.equal(signals[0].eligibilityStatus,'SUPPRESSED');assert.equal(signals[0].suppressionReason,'HIGHER PRIORITY SIGNAL');assert.equal(signals[1].eligibilityStatus,'ELIGIBLE');
assert(engine.includes('var sync=v6RefreshOpportunitiesFromReports_();'));assert(engine.includes("status:'REPORT_SOURCE_SYNCED'"));['total','detected','suppressed','byType','lastEngineRun'].forEach(field=>assert(engine.includes(field)));
const frontend=fs.readFileSync(path.join(root,'assets/js/marketing-opportunity-engine-v6.js'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(frontend.includes('result.opportunities||result.records||[]'));assert(index.includes('marketing-opportunity-engine-v6.js?v=20260826-2'));
for(const gs of fs.readdirSync(path.join(root,'backend/apps-script-v6')).filter(x=>x.endsWith('.gs'))){new vm.Script(fs.readFileSync(path.join(root,'backend/apps-script-v6',gs),'utf8'),{filename:gs});}
console.log('V6 private report ingestion: PASS');
