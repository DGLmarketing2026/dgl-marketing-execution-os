const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),file=path.join(root,'backend/apps-script-v6/MarketingV6ReportIngestion.gs'),source=fs.readFileSync(file,'utf8'),engine=fs.readFileSync(path.join(root,'backend/apps-script-v6/MarketingV6OpportunityEngine.gs'),'utf8');
const sourceId='1XPZC_VUPLsmta--MPXi4MHswz9oiYxKbiq58a_khPp4';
assert.equal((source.match(new RegExp(sourceId.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length,1,'Source ID must exist once as configuration');
assert(source.includes("var MKT_V6_REPORT_SOURCE_ID='"+sourceId+"'"));
assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(source),'No email addresses may be stored in ingestion source');
assert(!/(CUSTOMER_NAME|CONTACT_NAME|EMAIL_ADDRESS)\s*[:=]\s*['\"][^'\"]+/i.test(source),'No customer/contact fixtures may be hardcoded');
['CUENTAS','FICHA_CLIENTES','LQS_SIN_RESPUESTA','MIGRACION_CAIDAS','MIGRACION_RECUPERADAS'].forEach(sheet=>assert(source.includes("'"+sheet+"'")));
const context={Utilities:{},SpreadsheetApp:{},ScriptApp:{}};vm.createContext(context);vm.runInContext(source,context,{filename:'MarketingV6ReportIngestion.gs'});
assert(source.includes("var rows=v6ReportRows_('LQS_SIN_RESPUESTA'),latest={}"));assert(source.includes("stamp>latest[key]._stamp"),'QNB must retain one latest signal per account');
const signals=[{accountName:'SAFE ACCOUNT KEY',opportunityType:'Nurture',priorityRank:5,eligibilityStatus:'DETECTED',suppressionReason:''},{accountName:'SAFE ACCOUNT KEY',opportunityType:'Quoted Not Booked',priorityRank:1,eligibilityStatus:'DETECTED',suppressionReason:''}];context.v6ApplyPrioritySuppression_(signals);assert.equal(signals[0].eligibilityStatus,'SUPPRESSED');assert.equal(signals[0].suppressionReason,'HIGHER PRIORITY SIGNAL');assert.equal(signals[1].eligibilityStatus,'DETECTED');
assert(engine.includes('v6RefreshOpportunitiesFromReports_()'));assert(engine.includes('v6PipelineSyncSignals_'));assert(engine.includes("status:'REPORT_SOURCE_SYNCED'"));['total','detected','suppressed','byType','lastEngineRun'].forEach(field=>assert(engine.includes(field)));
const frontend=fs.readFileSync(path.join(root,'assets/js/marketing-opportunity-engine-v6.js'),'utf8'),index=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(frontend.includes('result.opportunities||result.records||[]'));assert(index.includes('marketing-opportunity-engine-v6.js?v=20260826-2'));
for(const gs of fs.readdirSync(path.join(root,'backend/apps-script-v6')).filter(x=>x.endsWith('.gs'))){new vm.Script(fs.readFileSync(path.join(root,'backend/apps-script-v6',gs),'utf8'),{filename:gs});}
console.log('V6 private report ingestion: PASS');
