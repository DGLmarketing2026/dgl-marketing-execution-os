require('./helpers/aura-environment'); // Apps Script global scope: environment module always loaded
// AURA agent cycle against a counting fake of the Data Hub: one spreadsheet open, each table read at
// most once, MKT_EMAIL_QUEUE read WITHOUT the heavy htmlBody column, no queue writes, no external
// actions, Campaign A SENT rows untouched. (Root cause of the 3 shadow-mode timeouts.)
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
function profileCycle(files,withApi,apiFail){
  const stats={opens:0,fullReads:{},rangeReads:{},htmlBodyReads:0,writes:{}};
  const data={
    MKT_EMAIL_QUEUE:[['jobId','campaignId','accountId','contactId','email','status','playbookId','htmlBody','processedAt','goLiveRunId','trackingBaseUrl']],
    MKT_EMAIL_EVENTS:[['eventId','jobId','eventType','occurredAt','source']],MKT_RESPONSES:[['responseId','campaignId','eventType']],
    MKT_CAMPAIGNS:[['campaignId','campaignType']],MKT_CONTACTS_SECURE:[['contactId','accountId','email','doNotContact','emailStatus','status','preferredLanguage']],
    MKT_ACCOUNTS:[['accountId','accountName']],MKT_OPPORTUNITIES:[['accountId','opportunityType','eligibilityStatus','amOwner','service']]};
  for(let i=0;i<214;i++)data.MKT_EMAIL_QUEUE.push(['A'+i,'CMP-CAMPANA-A-HA-PRIORITARIA','AC'+i,'K'+i,'a'+i+'@x.com','SENT','Reactivation','<html>'+'x'.repeat(50)+'</html>','2026-10-01T10:00:00Z','GL-1','']);
  for(let i=0;i<109;i++)data.MKT_EMAIL_QUEUE.push(['H'+i,'CMP-CAMPANA-A-HA-PRIORITARIA','AH'+i,'KH'+i,'h'+i+'@x.com','SENT','Retention','<html></html>','2026-07-01T10:00:00Z','','']);
  data.MKT_CAMPAIGNS.push(['CMP-CAMPANA-A-HA-PRIORITARIA','Reactivation']);
  ['QNB','Retention','Cross-sell','Reactivation'].forEach((t,j)=>{for(let i=0;i<5;i++){data.MKT_OPPORTUNITIES.push(['O'+j+i,t,'','Ana','FTL']);data.MKT_CONTACTS_SECURE.push(['C'+j+i,'O'+j+i,'c'+j+i+'@acme.com','','','','English']);}});
  const queueBefore=JSON.stringify(data.MKT_EMAIL_QUEUE);
  function sheet(name){
    const v=()=>data[name]||(data[name]=[]);
    return {getName:()=>name,getParent:()=>book,getLastRow:()=>v().length,getLastColumn:()=>(v()[0]||[]).length,
      getDataRange:()=>({getValues:()=>{stats.fullReads[name]=(stats.fullReads[name]||0)+1;if(name==='MKT_EMAIL_QUEUE')stats.htmlBodyReads++;return v().map(r=>r.slice());}}),
      getRange:(r,c,nr,nc)=>({getValues:()=>{if(r>1){stats.rangeReads[name]=(stats.rangeReads[name]||0)+1;const hi=(v()[0]||[]).indexOf('htmlBody');if(name==='MKT_EMAIL_QUEUE'&&hi>=c-1&&hi<=c-2+(nc||1))stats.htmlBodyReads++;}return v().slice(r-1,r-1+(nr||1)).map(row=>{const out=row.slice(c-1,c-1+(nc||1));while(out.length<(nc||1))out.push('');return out;});},
        setValues:vals=>{stats.writes[name]=(stats.writes[name]||0)+1;const a=v();vals.forEach((row,i)=>{a[r-1+i]=a[r-1+i]||[];row.forEach((x,j)=>{a[r-1+i][c-1+j]=x;});});}}),
      insertSheet:()=>null};
  }
  const book={getSheetByName:n=>data[n]?sheet(n):null,insertSheet:n=>{data[n]=[];return sheet(n);},getId:()=>'HUB'};
  const store={AURA_SEND_MODE:'DRY_RUN'};
  stats.api=[];
  const colIdx=l=>l.split('').reduce((a,ch)=>a*26+ch.charCodeAt(0)-64,0);
  const parse=r=>{const m=r.match(/^'(.+)'!(?:([A-Z]+)(\d+):([A-Z]+)(\d*)|(\d+):(\d+))$/);const t=m[1].replace(/''/g,"'");if(m[6])return {t,r1:+m[6],r2:+m[7],c1:1,c2:9999};return {t,c1:colIdx(m[2]),r1:+m[3],c2:colIdx(m[4]),r2:m[5]?+m[5]:999999};};
  const Sheets={Spreadsheets:{
    get:()=>{stats.api.push('get');if(apiFail)throw new Error('PERMISSION_DENIED');return {sheets:Object.keys(data).map((t,i)=>({properties:{sheetId:i,title:t,gridProperties:{rowCount:1000,columnCount:26}}}))};},
    batchUpdate:(req)=>{stats.api.push('batchUpdate');req.requests.forEach(q=>{if(q.addSheet)data[q.addSheet.properties.title]=[];});return {};},
    Values:{
      batchGet:(id,o)=>{stats.api.push('batchGet');return {valueRanges:o.ranges.map(r=>{const p=parse(r);if(p.t==='MKT_EMAIL_QUEUE'){const hi=data.MKT_EMAIL_QUEUE[0].indexOf('htmlBody')+1;if(p.r1>1&&hi>=p.c1&&hi<=p.c2)stats.htmlBodyReads++;}const rows=(data[p.t]||[]).slice(p.r1-1,p.r2).map(row=>row.slice(p.c1-1,Math.min(p.c2,row.length)));return {values:rows};})};},
      batchUpdate:(req)=>{stats.api.push('values.batchUpdate');req.data.forEach(d=>{const p=parse(d.range);stats.writes[p.t]=(stats.writes[p.t]||0)+1;data[p.t]=d.values.map(r=>r.slice());});return {};}}}};
  const ctx={console:{log(){}},Date,Math,Number,String,Object,Array,JSON,Error,Set,stats,data,
    SpreadsheetApp:{openById:()=>{stats.opens++;return book;}},
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in store?store[k]:null,setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},
    ScriptApp:{getProjectTriggers:()=>[]},Session:{getActiveUser:()=>({getEmail:()=>''})},Utilities:{sleep(){}},
    GmailApp:{sendEmail:()=>{throw new Error('NO_SEND_ALLOWED');}},Sheets:withApi?Sheets:undefined,LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){},tryLock:()=>true})}};
  vm.createContext(ctx);
  for(const f of files)vm.runInContext(f.src,ctx,{filename:f.name});
  const r=ctx.v6AuraAgentRunCycle_({now:'2026-10-07T22:00:00.000Z',trigger:'TEST'});
  return {r,stats,data,queueUnchanged:JSON.stringify(data.MKT_EMAIL_QUEUE)===queueBefore,store};
}
const FILES=['MarketingV6AuraDataHubReader.gs','MarketingV6OpportunityEngine.gs','MarketingV6FrequencyControl.gs','MarketingV6AcquisitionEngine.gs','MarketingV6SchemaMigration.gs','MarketingV6ResponseEvents.gs','MarketingV6AuraTracking.gs','MarketingV6AuraEmailPerformance.gs','MarketingV6AuraAgentRuntime.gs','MarketingV6AuraAgentIntelligence.gs'].map(n=>({name:n,src:SRC(n)}));
const p=profileCycle(FILES),reads=Object.assign({},p.stats.fullReads);Object.keys(p.stats.rangeReads).forEach(k=>{reads[k]=(reads[k]||0)+0;});
console.log('  opens='+p.stats.opens+' fullReads='+JSON.stringify(p.stats.fullReads)+' rangeReads='+JSON.stringify(p.stats.rangeReads)+' htmlBodyReads='+p.stats.htmlBodyReads+' writes='+JSON.stringify(p.stats.writes));
let n=0;const ok=m=>{n++;console.log('PASS '+m);};
assert.equal(p.r.status,'COMPLETED',JSON.stringify(p.r));ok('agent cycle completes against the Data Hub fake');
assert.equal(p.stats.opens,1);ok('Data Hub opened exactly once per cycle');
Object.entries(p.stats.fullReads).forEach(([t,c])=>assert(c<=1,t+' full-read '+c+'x'));ok('each table fully read at most once (no reads inside loops)');
assert.equal(p.stats.htmlBodyReads,0);assert(!p.stats.fullReads.MKT_EMAIL_QUEUE);ok('MKT_EMAIL_QUEUE read without the heavy htmlBody column');
assert(!p.stats.writes.MKT_EMAIL_QUEUE&&p.queueUnchanged);ok('no queue writes; Campaign A 214 + Retention 109 SENT rows unchanged');
assert.equal(p.data.AURA_AGENT_ACTIONS.slice(1).filter(row=>String(row[4])==='true'&&row[6]==='DONE').length,0);assert.equal(p.store.AURA_SEND_MODE,'DRY_RUN');ok('no external actions; send mode untouched');
const tasks=p.data.AURA_AGENT_TASKS.length-1;assert(tasks>=4,'opportunity + measurement tasks created: '+tasks);assert(p.data.AURA_AGENT_DECISIONS.length-1>=4);ok('tasks and decisions persisted');
const q=profileCycle(FILES,true);
console.log('  API path: opens='+q.stats.opens+' apiCalls='+JSON.stringify(q.stats.api)+' htmlBodyReads='+q.stats.htmlBodyReads+' writes='+JSON.stringify(q.stats.writes));
assert.equal(q.r.status,'COMPLETED',JSON.stringify(q.r));assert.equal(q.stats.opens,0,'no SpreadsheetApp open of the Data Hub');ok('Sheets API path completes with ZERO SpreadsheetApp opens');
assert.deepEqual(q.stats.api,['get','batchGet','batchGet','batchUpdate','values.batchUpdate']);ok('one metadata call, one header batchGet, one data batchGet, one structure + one values write');
assert.equal(q.stats.htmlBodyReads,0);assert(!q.stats.writes.MKT_EMAIL_QUEUE&&q.queueUnchanged);ok('API path: no htmlBody, no queue writes, Campaign A unchanged');
const tasksApi=q.data.AURA_AGENT_TASKS.length-1;assert(tasksApi>=4);assert.equal(q.data.AURA_AGENT_RUNS[1][q.data.AURA_AGENT_RUNS[0].indexOf('dataPath')],'SHEETS_API');ok('agent tables written through the API; run records dataPath SHEETS_API');
const again=(()=>{const z=profileCycle(FILES,true);return z;})();assert.equal(again.data.AURA_AGENT_TASKS.length-1,tasksApi,'deterministic ids');
const x=profileCycle(FILES,true,true);assert.equal(x.r.status,'FAILED');assert(!x.data.AURA_AGENT_TASKS&&x.queueUnchanged&&!Object.keys(x.stats.writes).length,'fails closed: nothing written');ok('API failure fails closed (no partial writes)');
console.log(n+'/'+n+' agent Data Hub performance checks passed');
