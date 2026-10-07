// Shadow-mode activation: single trigger, LIVE abort, no queue/SENT change, report, tick log.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
function ctx(props,triggers){
  const T={MKT_EMAIL_QUEUE:[{jobId:'A1',campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',status:'SENT'}],MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'QNB'}],MKT_CONTACTS_SECURE:[{contactId:'K1',accountId:'A1',email:'k1@acme.com',preferredLanguage:'EN'}]},store=Object.assign({},props),trig=(triggers||[]).map(h=>({getHandlerFunction:()=>h})),rows=[];
  const c={console:{log(){}},Date,Math,Number,String,Object,Array,JSON,Error,T,store,trig,rows,CAMPANA_A_CAMPAIGN_ID_:'CMP-CAMPANA-A-HA-PRIORITARIA',
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in store?store[k]:null,setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},
    ScriptApp:{getProjectTriggers:()=>trig.slice(),deleteTrigger:t=>{trig.splice(trig.indexOf(t),1);},newTrigger:h=>({timeBased:()=>({everyHours:()=>({create:()=>{const t={getHandlerFunction:()=>h};trig.push(t);return t;}})})})},
    SpreadsheetApp:{create:()=>({getId:()=>'R1',getSheets:()=>[{getRange:()=>({setValues(){}}),appendRow:r=>rows.push(r)}]}),openById:()=>({getSheets:()=>[{appendRow:r=>rows.push(r)}]})},
    Session:{getActiveUser:()=>({getEmail:()=>''})},
    v6Rows_:n=>(T[n]||[]).map(r=>Object.assign({},r)),v6AcqEnsureSheet_:n=>{T[n]=T[n]||[];},
    v6BatchUpsertByKey_:(n,k,recs)=>{const l=T[n]||(T[n]=[]);recs.forEach(r=>{const i=l.findIndex(x=>k.every(q=>x[q]===r[q]));if(i<0)l.push(Object.assign({},r));else l[i]=Object.assign({},r);});},
    v6AuraIngestGmailDsn_:()=>({status:'OK'}),v6AuraReconcileEmailEvents_:()=>({written:0}),v6AuraEmailPerformance_:()=>({scopes:{}})};
  vm.createContext(c);for(const f of ['MarketingV6AuraAgentRuntime.gs','MarketingV6AuraAgentIntelligence.gs','MarketingV6AuraAgentShadow.gs'])vm.runInContext(SRC(f),c);return c;
}
let n=0;const ok=m=>{n++;console.log('PASS '+m);};
{const c=ctx({AURA_SEND_MODE:'DRY_RUN'},['auraAgentTick','auraAgentTick','auraProcessEmailQueue']);const r=c.AURA_AGENT_SHADOW_ACTIVATE();
 assert.equal(r.status,'SHADOW_ACTIVE');assert.equal(r.hourlyTriggers,1);assert.equal(c.trig.filter(t=>t.getHandlerFunction()==='auraAgentTick').length,1);assert.equal(c.trig.length,2,'other triggers untouched');
 assert.equal(r.initialRun.status,'COMPLETED');assert(r.tables.AURA_AGENT_RUNS>=1&&r.tables.AURA_AGENT_TASKS>=1&&r.tables.AURA_AGENT_EVENTS>=1);
 assert.equal(r.queue.unchanged,true);assert.equal(r.queue.after.campaignASent,1);assert.equal(r.externalActionsExecuted,0);assert.equal(c.store.AURA_SEND_MODE,'DRY_RUN');assert.equal(c.store.AURA_AGENT_MODE,'SHADOW');
 assert.equal(c.rows.length,1);ok('activation keeps ONE trigger, runs one tick, proves no queue/SENT change');
 const again=c.AURA_AGENT_SHADOW_ACTIVATE();assert.equal(again.hourlyTriggers,1);ok('re-activation is idempotent (no duplicate trigger)');
 c.auraAgentTick();assert.equal(c.rows.length,3);assert(/"section":"TICK"/.test(c.rows[2][2]));ok('hourly ticks append a compact audit line');}
{const c=ctx({AURA_SEND_MODE:'LIVE'},[]);const r=c.AURA_AGENT_SHADOW_ACTIVATE();assert.equal(r.status,'FAILED');assert.equal(r.error,'ABORTED_SEND_MODE_IS_LIVE');assert.equal(c.trig.length,0);ok('aborts without changes when AURA_SEND_MODE is LIVE');}
{const c=ctx({AURA_SEND_MODE:'DRY_RUN'},['auraAgentTick']);c.v6AuraAgentLoad_=()=>{throw new Error('Service Spreadsheets timed out while accessing document');};c.Utilities={sleep(){}};const r=c.AURA_AGENT_SHADOW_ACTIVATE();
 assert.equal(r.initialRun.status,'FAILED');assert.equal(r.hourlyTriggers,0);assert.equal(c.trig.length,0,'runtime paused until a cycle completes');ok('a failed controlled cycle leaves NO hourly trigger');
 c.trig.push({getHandlerFunction:()=>'auraAgentTick'});const t=c.auraAgentTick();assert.equal(t.paused,true);assert.equal(c.trig.length,0);ok('a failed hourly tick pauses the runtime');}
{const s=SRC('MarketingV6AuraAgentShadow.gs');assert(!/GmailApp\.|UrlFetchApp|setProperty\('AURA_SEND_MODE'|UpsertByKey_\('MKT_EMAIL_QUEUE/.test(s));ok('shadow tooling never sends, publishes, writes the queue or changes send mode');}
console.log(n+'/'+n+' shadow checks passed');
