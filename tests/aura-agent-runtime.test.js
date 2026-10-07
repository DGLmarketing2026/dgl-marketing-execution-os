const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
function makeCtx(o){
  o=o||{};const tables=Object.assign({MKT_OPPORTUNITIES:[],MKT_EMAIL_QUEUE:[{jobId:'J1',status:'SENT'}],MKT_CONTACTS_SECURE:['A1','A2','A3'].map((a,i)=>({contactId:'C'+i,accountId:a,email:'c'+i+'@example.com',preferredLanguage:i?'EN':'ES'}))},o.tables||{}),store={},triggers=[],calls={ingest:0,gmailSend:0};
  const ctx={console,Date,Math,Number,String,Object,Array,JSON,Error,tables,store,triggers,calls,
    CAMPANA_A_CAMPAIGN_ID_:'CMP-CAMPANA-A-HA-PRIORITARIA',
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in store?store[k]:null,setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},
    ScriptApp:{getProjectTriggers:()=>triggers.slice(),newTrigger:h=>({timeBased:()=>({everyHours:n=>({create:()=>{const t={getHandlerFunction:()=>h,n};triggers.push(t);return t;}})})})},
    Session:{getActiveUser:()=>({getEmail:()=>'ops@dglus.com'})},
    GmailApp:{sendEmail:()=>{calls.gmailSend++;},createDraft:()=>{calls.gmailSend++;}},
    v6Rows_:n=>(tables[n]||[]).map(r=>Object.assign({},r)),
    v6AcqEnsureSheet_:n=>{tables[n]=tables[n]||[];},
    v6BatchUpsertByKey_:(n,keys,recs)=>{const l=tables[n]||(tables[n]=[]);recs.forEach(r=>{const i=l.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i<0)l.push(Object.assign({},r));else l[i]=Object.assign({},r);});},
    v6AuraIngestGmailDsn_:()=>{calls.ingest++;if(o.ingestFails&&calls.ingest<=o.ingestFails)throw new Error('GMAIL_TIMEOUT');return {status:'OK'};},
    v6AuraReconcileEmailEvents_:()=>({written:0}),
    v6AuraEmailPerformance_:()=>({scopes:o.scopes||{}})};
  vm.createContext(ctx);vm.runInContext(SRC('MarketingV6AuraAgentRuntime.gs'),ctx);vm.runInContext(SRC('MarketingV6AuraAgentIntelligence.gs'),ctx);return ctx;
}
let checks=0;function test(n,fn){fn();checks++;console.log('PASS '+n);}
const T0='2026-10-06T10:05:00.000Z',T1='2026-10-06T11:05:00.000Z',T2='2026-10-06T12:05:00.000Z',T3='2026-10-07T10:05:00.000Z';
const task=(c,k)=>c.tables.AURA_AGENT_TASKS.find(t=>t.taskId.includes(k));

test('lifecycle transitions are validated',()=>{
  const c=makeCtx();
  assert(c.v6AuraAgentCanTransition_('OBSERVE','ANALYZE'));assert(c.v6AuraAgentCanTransition_('PREPARE','EXECUTE'));
  assert(!c.v6AuraAgentCanTransition_('OBSERVE','EXECUTE'));assert(!c.v6AuraAgentCanTransition_('APPROVAL','VERIFY'));
  assert(c.v6AuraAgentCanTransition_('EXECUTE','FAILED'));assert(c.v6AuraAgentCanTransition_('FAILED','EXECUTE'));
  assert(!c.v6AuraAgentCanTransition_('COMPLETED','OBSERVE'));assert(!c.v6AuraAgentCanTransition_('BLOCKED','EXECUTE'));assert(!c.v6AuraAgentCanTransition_('CANCELLED','BLOCKED'));
  assert.deepEqual(Array.from(c.AURA_AGENT_LIFECYCLE_),['OBSERVE','ANALYZE','DECIDE','PLAN','PREPARE','APPROVAL','EXECUTE','VERIFY','MEASURE','NEXT_ACTION']);
  assert.equal(c.AURA_AGENT_SCOPES_.length,15);assert.equal(Object.keys(c.AURA_AGENT_SCHEMAS_).length,8);
});
test('approval policy: unknown BLOCKED, external never AUTO, Campaign A outbound BLOCKED',()=>{
  const c=makeCtx();
  assert.equal(c.v6AuraAgentPolicy_('INGEST_BOUNCES_REPLIES'),'AUTO');assert.equal(c.v6AuraAgentPolicy_('PREPARE_CAMPAIGN_PLAN'),'AUTO','preparing a campaign is AUTO');
  for(const t of ['SEND_CUSTOMER_EMAIL','PUBLISH_SOCIAL_POST','PUBLISH_WORDPRESS','UPDATE_SALESFORCE','CHANGE_PAID_BUDGET','SHARE_DRIVE_FILE'])assert.equal(c.v6AuraAgentPolicy_(t),'APPROVAL_REQUIRED',t);
  for(const t of ['DELETE_DATA','MODIFY_SENT_HISTORY','RESEND_CAMPAIGN_A','CHANGE_SEND_MODE','SOMETHING_NEW',''])assert.equal(c.v6AuraAgentPolicy_(t),'BLOCKED',t);
  assert.equal(c.v6AuraAgentPolicy_('SEND_CUSTOMER_EMAIL',{campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA'}),'BLOCKED');
  c.AURA_AGENT_ACTION_TYPES_.SEND_CUSTOMER_EMAIL.policy='AUTO';assert.equal(c.v6AuraAgentPolicy_('SEND_CUSTOMER_EMAIL'),'APPROVAL_REQUIRED','misconfig cannot downgrade external');
  assert.equal(c.v6AuraAgentTaskPolicy_(['PREPARE_CAMPAIGN_PLAN','SEND_CUSTOMER_EMAIL']),'APPROVAL_REQUIRED');
});
test('channel adapters expose PREPARE/PREVIEW/EXECUTE/VERIFY/MEASURE and never execute external actions',()=>{
  const c=makeCtx();
  for(const ch of ['GMAIL','SHEETS','DRIVE','SALESFORCE','METRICOOL','WORDPRESS','ANALYTICS']){const a=c.v6AuraAgentAdapter_(ch);for(const m of ['prepare','preview','execute','verify','measure'])assert.equal(typeof a[m],'function');}
  assert.throws(()=>c.v6AuraAgentAdapter_('TWITTER'));
  const send={actionType:'SEND_CUSTOMER_EMAIL',channel:'GMAIL'};
  assert.equal(c.v6AuraAgentAdapter_('GMAIL').execute(send,null).error,'APPROVAL_MISSING');
  assert.equal(c.v6AuraAgentAdapter_('GMAIL').execute(send,{status:'APPROVED'}).error,'EXTERNAL_EXECUTION_DISABLED_PHASE_V1');
  assert.equal(c.v6AuraAgentAdapter_('WORDPRESS').execute({actionType:'PUBLISH_WORDPRESS'},{status:'APPROVED'}).error,'EXTERNAL_EXECUTION_DISABLED_PHASE_V1');
  assert.equal(c.v6AuraAgentAdapter_('SHEETS').execute({actionType:'DELETE_DATA'},{status:'APPROVED'}).error,'ACTION_BLOCKED_BY_POLICY');
  assert.equal(c.calls.gmailSend,0);
});
test('AUTO task runs the full lifecycle unattended and logs every transition',()=>{
  const c=makeCtx();const r=c.v6AuraAgentRunCycle_({now:T0,trigger:'TIME_TRIGGER'});
  assert.equal(r.status,'COMPLETED');const t=task(c,':INGEST');
  assert.equal(t.state,'COMPLETED');assert.equal(c.calls.ingest,1);
  const path=c.tables.AURA_AGENT_EVENTS.filter(e=>e.taskId===t.taskId).map(e=>e.toState);
  assert.deepEqual(path,['ANALYZE','DECIDE','PLAN','PREPARE','EXECUTE','VERIFY','MEASURE','NEXT_ACTION','COMPLETED']);
  assert.equal(c.tables.AURA_AGENT_RUNS[0].trigger,'TIME_TRIGGER');assert(c.tables.AURA_AGENT_MEMORY.some(m=>m.memoryKey==='runtime.lastTick'));
  assert(!('AURA_AGENT_LEASE' in c.store),'lease released');
});
test('cycle is idempotent: a repeated tick creates no duplicate tasks or approvals',()=>{
  const c=makeCtx({tables:{MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'QNB'},{accountId:'A2',opportunityType:'QNB'},{accountId:'A3',opportunityType:'Retention',eligibilityStatus:'SUPPRESSED'}]}});
  c.v6AuraAgentRunCycle_({now:T0});c.v6AuraAgentRunCycle_({now:T0});
  assert.equal(c.tables.AURA_AGENT_TASKS.filter(t=>t.kind==='OPPORTUNITY').length,1,'suppressed excluded, no dup');
  assert.equal(c.tables.AURA_AGENT_TASKS.filter(t=>t.taskId.includes(':INGEST')).length,1);
  c.v6AuraAgentRunCycle_({now:T3});
  assert.equal(c.tables.AURA_AGENT_TASKS.filter(t=>t.kind==='OPPORTUNITY').length,1,'open subject not re-proposed next day');
  assert.equal(c.tables.AURA_AGENT_APPROVALS.length,1,'one approval per campaign');
  const q=task(c,':OPP:QNB');assert.equal(q.state,'APPROVAL');assert.equal(q.policy,'APPROVAL_REQUIRED');assert.equal(q.title,'QNB: 2 eligible accounts');
});
test('approval gate: approved campaign runs internal steps, external send stays blocked (no email)',()=>{
  const c=makeCtx({tables:{MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'Cross-sell'}]}});
  c.v6AuraAgentRunCycle_({now:T0});const t=task(c,':OPP:CROSS_SELL');
  assert.equal(c.v6AuraAgentDecide_({approvalId:'nope',decision:'APPROVED'}).status,'NOT_FOUND');
  assert.equal(c.v6AuraAgentDecide_({approvalId:t.approvalId,decision:'MAYBE'}).status,'INVALID_REQUEST');
  const d=c.v6AuraAgentDecide_({approvalId:t.approvalId,decision:'APPROVED'});assert.equal(d.status,'RECORDED');assert.equal(d.approval.decidedBy,'ops@dglus.com');
  assert.equal(task(c,':OPP:CROSS_SELL').state,'APPROVAL','decision records only; nothing executes inline');
  assert.equal(c.v6AuraAgentDecide_({approvalId:t.approvalId,decision:'REJECTED'}).status,'ALREADY_DECIDED');
  c.v6AuraAgentRunCycle_({now:T1});
  const after=task(c,':OPP:CROSS_SELL'),acts=c.tables.AURA_AGENT_ACTIONS.filter(a=>a.taskId===t.taskId);
  assert.equal(after.state,'BLOCKED');assert.equal(after.blockReason,'EXTERNAL_EXECUTION_DISABLED_PHASE_V1');assert(/Campaign Studio/.test(after.nextAction));
  assert.equal(acts.find(a=>a.actionType==='PREPARE_CAMPAIGN_PLAN').status,'DONE');assert.equal(acts.find(a=>a.actionType==='SEND_CUSTOMER_EMAIL').status,'BLOCKED');
  assert.equal(c.calls.gmailSend,0);assert.deepEqual(c.tables.MKT_EMAIL_QUEUE,[{jobId:'J1',status:'SENT'}]);
});
test('rejected approval cancels the task',()=>{
  const c=makeCtx({tables:{MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'Nurture'}]}});
  c.v6AuraAgentRunCycle_({now:T0});const t=task(c,':OPP:NURTURE');
  c.v6AuraAgentDecide_({approvalId:t.approvalId,decision:'REJECTED',note:'not now'});c.v6AuraAgentRunCycle_({now:T1});
  assert.equal(task(c,':OPP:NURTURE').state,'CANCELLED');
});
test('failure recovery: transient error retries on the next tick, persistent error blocks after max attempts',()=>{
  const c=makeCtx({ingestFails:1});c.v6AuraAgentRunCycle_({now:T0});
  let t=task(c,':INGEST');assert.equal(t.state,'FAILED');assert.equal(t.lastError,'GMAIL_TIMEOUT');assert.equal(Number(t.attempts),1);
  c.v6AuraAgentRunCycle_({now:'2026-10-06T10:35:00.000Z'});assert.equal(task(c,':INGEST').state,'COMPLETED');
  const b=makeCtx({ingestFails:99});b.v6AuraAgentRunCycle_({now:T0});b.v6AuraAgentRunCycle_({now:'2026-10-06T10:20:00.000Z'});b.v6AuraAgentRunCycle_({now:'2026-10-06T10:40:00.000Z'});
  t=b.tables.AURA_AGENT_TASKS.find(x=>x.taskId==='AT:2026-10-06T10:INGEST');assert.equal(t.state,'BLOCKED');assert.equal(t.blockReason,'MAX_ATTEMPTS');
});
test('concurrent tick is skipped while a lease is held',()=>{
  const c=makeCtx();c.store.AURA_AGENT_LEASE=String(new Date(T0).getTime());
  assert.equal(c.v6AuraAgentRunCycle_({now:T0}).status,'SKIPPED_ALREADY_RUNNING');assert.equal(c.calls.ingest,0);
});
test('measurement writes scoped campaign metrics; Campaign A gets no outbound task',()=>{
  const sc={'CMP-CAMPANA-A-HA-PRIORITARIA':{currentFamily:'Reactivation',lastSentAt:'2026-10-01T10:00:00Z',allTime:{sent:323,replied:2},currentRun:{sent:214,delivered:210,bounced:4,replied:2,opened:null,clicked:null,openRate:null,ctr:null,ctor:null},historical:{sent:109,delivered:109,bounced:0,replied:0,opened:null,clicked:null,openRate:null,ctr:null,ctor:null}}};
  sc['CMP-CAMPANA-A-HA-PRIORITARIA'].allTime=Object.assign({},sc['CMP-CAMPANA-A-HA-PRIORITARIA'].currentRun,{sent:323,delivered:319});
  const c=makeCtx({scopes:sc});c.v6AuraAgentRunCycle_({now:T0});
  const m=c.tables.AURA_AGENT_METRICS;
  assert.equal(m.find(x=>x.scope==='currentRun'&&x.metric==='sent').value,214);assert.equal(m.find(x=>x.scope==='historical'&&x.metric==='sent').value,109);assert.equal(m.find(x=>x.scope==='allTime'&&x.metric==='sent').value,323);
  assert.equal(m.find(x=>x.scope==='currentRun'&&x.metric==='openRate').value,'NOT_TRACKED');
  assert.equal(task(c,':MEASURE:').scope,'REACTIVATION');assert.equal(task(c,':REPLIES:').state,'COMPLETED','internal AM hand-off is AUTO');
  assert(!c.tables.AURA_AGENT_ACTIONS.some(a=>a.external&&a.policy!=='BLOCKED'&&String(a.taskId).includes('CAMPANA-A')),'no outbound action on Campaign A');
  const stale=makeCtx({scopes:{X:Object.assign({},sc['CMP-CAMPANA-A-HA-PRIORITARIA'],{lastSentAt:'2026-01-01T00:00:00Z'})}});stale.v6AuraAgentRunCycle_({now:T0});
  assert(!stale.tables.AURA_AGENT_TASKS.some(t=>t.kind==='MEASUREMENT'),'old campaigns not re-measured daily');
});
test('trigger activation is explicit and idempotent; command center groups tasks',()=>{
  const c=makeCtx({tables:{MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'QNB'}]}});
  assert.equal(c.triggers.length,0,'never auto-installed');
  assert.equal(c.v6AuraAgentActivate_().status,'ACTIVATED');assert.equal(c.v6AuraAgentActivate_().status,'ALREADY_ACTIVE');assert.equal(c.triggers.length,1);
  c.auraAgentTick();
  const cc=c.v6AuraAgentCommandCenter_();
  assert.equal(cc.status.runtime,'ACTIVE');assert.equal(cc.status.externalExecution,'EXTERNAL_EXECUTION_DISABLED_PHASE_V1');
  assert.equal(cc.waitingApproval.length,1);assert.equal(cc.opportunities.length,1);assert.equal(cc.completed.length,1);
  for(const k of ['priorities','actionQueue','running','blocked','nextBestActions','recentResults'])assert(Array.isArray(cc[k]),k);
});
test('runtime source never sends, publishes or touches send mode / SENT history',()=>{
  const s=SRC('MarketingV6AuraAgentRuntime.gs');
  assert(!/GmailApp\.|UrlFetchApp|AURA_SEND_MODE|v6AuraCampanaAGoLive_|auraProcessEmailQueue|MKT_EMAIL_QUEUE'\s*,/.test(s));
  assert(!/NOVA/.test(s.replace(/NOVA is a separate system[^\n]*/,'')));
});
test('transient Sheets timeouts are retried with backoff; the cycle completes without duplicates',()=>{
  const c=makeCtx({tables:{MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'QNB'}]}});let fails=2,sleeps=0;
  c.Utilities={sleep:()=>{sleeps++;}};
  const upsert=c.v6BatchUpsertByKey_;c.v6BatchUpsertByKey_=(n,k,r)=>{if(n==='AURA_AGENT_TASKS'&&fails-->0)throw new Error('Service Spreadsheets timed out while accessing document with id X.');return upsert(n,k,r);};
  const r=c.v6AuraAgentRunCycle_({now:T0});
  assert.equal(r.status,'COMPLETED');assert.equal(sleeps,2);
  assert.equal(c.tables.AURA_AGENT_TASKS.filter(t=>t.kind==='OPPORTUNITY').length,1);assert.equal(c.tables.AURA_AGENT_RUNS.length,1);assert.equal(c.tables.AURA_AGENT_APPROVALS.length,1);
  const d=makeCtx();d.Utilities={sleep:()=>{}};d.v6AuraAgentLoad_=()=>{throw new Error('PERMISSION_DENIED');};
  let calls=0;assert.throws(()=>d.v6AuraAgentRetry_(()=>{calls++;throw new Error('PERMISSION_DENIED');}));assert.equal(calls,1,'non-transient errors are not retried');
});
test('Gmail DSN ingestion is not duplicated when its dedicated trigger exists',()=>{
  const c=makeCtx();c.triggers.push({getHandlerFunction:()=>'auraIngestGmailDsn'});
  c.v6AuraAgentRunCycle_({now:T0});assert.equal(c.calls.ingest,0);assert(!c.tables.AURA_AGENT_TASKS.some(t=>t.taskId.includes(':INGEST')));
});
console.log(checks+'/'+checks+' agent runtime checks passed');
