// AURA Autonomous Agent V1: decision engine, command model, decision ledger, approval gates.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
const NOW='2026-10-07T15:00:00.000Z';
function makeCtx(tables){
  const T=Object.assign({MKT_OPPORTUNITIES:[],MKT_EMAIL_QUEUE:[],MKT_CONTACTS_SECURE:[],MKT_EMAIL_EVENTS:[]},tables||{}),store={},calls={gmail:0,ingest:0};
  const ctx={console,Date,Math,Number,String,Object,Array,JSON,Error,T,store,calls,CAMPANA_A_CAMPAIGN_ID_:'CMP-CAMPANA-A-HA-PRIORITARIA',
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k in store?store[k]:null,setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},
    ScriptApp:{getProjectTriggers:()=>[]},Session:{getActiveUser:()=>({getEmail:()=>'ops@dglus.com'})},GmailApp:{sendEmail:()=>{calls.gmail++;}},
    v6Rows_:n=>(T[n]||[]).map(r=>Object.assign({},r)),v6AcqEnsureSheet_:n=>{T[n]=T[n]||[];},
    v6BatchUpsertByKey_:(n,keys,recs)=>{const l=T[n]||(T[n]=[]);recs.forEach(r=>{const i=l.findIndex(x=>keys.every(k=>x[k]===r[k]));if(i<0)l.push(Object.assign({},r));else l[i]=Object.assign({},r);});},
    v6AuraIngestGmailDsn_:()=>{calls.ingest++;return {status:'OK'};},v6AuraReconcileEmailEvents_:()=>({written:0}),
    v6AuraEmailPerformance_:()=>({tracking:{opened:'TRACKED'},scopes:{'CMP-CAMPANA-A-HA-PRIORITARIA':{currentFamily:'Reactivation',lastSentAt:'2026-10-01T10:00:00Z',currentRun:{sent:214},allTime:{sent:323,delivered:323,bounced:0,replied:2,openRate:null},pipeline:{rfq:0,quote:0,load:0}}}})};
  vm.createContext(ctx);vm.runInContext(SRC('MarketingV6AuraAgentRuntime.gs'),ctx);vm.runInContext(SRC('MarketingV6AuraAgentIntelligence.gs'),ctx);return ctx;
}
const opp=(a,type,extra)=>Object.assign({accountId:a,opportunityType:type,amOwner:'Ana',service:'FTL'},extra||{});
const contact=(i,a,extra)=>Object.assign({contactId:'K'+i,accountId:a,email:'p'+i+'@acme-'+a.toLowerCase()+'.com',preferredLanguage:i%2?'English':'Spanish'},extra||{});
let checks=0;const all=[];function test(n,fn){all.push(()=>Promise.resolve(fn()).then(()=>{checks++;console.log('PASS '+n);}));}

test('command model understands the target instructions (EN + ES)',()=>{
  const c=makeCtx(),P=t=>c.v6AuraAgentParseCommand_(t);
  assert.equal(P('Run the next reactivation campaign').intent,'RUN_CAMPAIGN');assert.equal(P('Run the next reactivation campaign').scope,'REACTIVATION');
  assert.equal(P('Find accounts with cross-sell opportunities').intent,'FIND_OPPORTUNITIES');assert.equal(P('Find accounts with cross-sell opportunities').scope,'CROSS_SELL');
  assert.equal(P("Prepare next week's social content").intent,'PREPARE_SOCIAL');
  assert.equal(P('Review QNB opportunities').intent,'FIND_OPPORTUNITIES');assert.equal(P('Review QNB opportunities').scope,'QNB');
  assert.equal(P('Find SEO opportunities').intent,'FIND_SEO');
  assert.equal(P('Prepare the monthly marketing report').intent,'MONTHLY_REPORT');
  assert.equal(P('Show me what Marketing should prioritize today').intent,'PRIORITIZE_TODAY');
  assert.equal(P('Lanza la próxima campaña de retención').intent,'RUN_CAMPAIGN');assert.equal(P('Lanza la próxima campaña de retención').scope,'RETENTION');
  assert.equal(P('Busca oportunidades de venta cruzada').scope,'CROSS_SELL');
  assert.equal(P('make me a sandwich').intent,'UNKNOWN');assert.equal(c.v6AuraAgentCommand_({text:'make me a sandwich'}).status,'UNRECOGNIZED');
});
test('campaign preparation is AUTO and governed: audience, language, creative, exclusions — counts only',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','Reactivation'),opp('A2','Reactivation'),opp('A3','Reactivation',{eligibilityStatus:'SUPPRESSED'}),opp('A4','QNB')],
    MKT_CONTACTS_SECURE:[contact(1,'A1'),contact(2,'A1'),contact(3,'A2',{doNotContact:'TRUE'}),contact(4,'A2',{email:'not-an-email'}),contact(5,'A2',{email:'p1@acme-a1.com'}),contact(6,'A2',{email:'recent@x.com'}),contact(7,'A3'),contact(8,'A4')],
    MKT_EMAIL_QUEUE:[{jobId:'J',status:'SENT',email:'recent@x.com',processedAt:'2026-10-01T10:00:00Z'}]});
  const r=c.v6AuraAgentPlanCampaign_('REACTIVATION',NOW),p=r.plan;
  assert.equal(r.status,'DONE');assert.equal(p.eligibleAccounts,2,'suppressed + other scopes excluded');
  assert.deepEqual(JSON.parse(JSON.stringify(p.contacts)),{eligible:6,invalid:1,doNotContact:1,recentlySent:1,duplicate:1,recipients:2});
  assert.equal(p.languages.ES+p.languages.EN,2);assert.equal(p.creativeSystem,'editorial-white');assert.equal(p.angle,'Previous Relationship');
  assert(!/@/.test(JSON.stringify(r)),'no email addresses in the plan');
  assert.equal(c.v6AuraAgentPlanCampaign_('QNB',NOW).plan.creativeSystem,'executive-minimal');
  assert.equal(c.v6AuraAgentPlanCampaign_('SOCIAL',NOW).status,'BLOCKED');
});
test('a DNC or invalid flag on any row blocks that exact email everywhere (duplicate rows cannot bypass)',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','Retention'),opp('A2','Retention')],
    MKT_CONTACTS_SECURE:[contact(1,'A1',{email:'same@x.com',doNotContact:'TRUE'}),contact(2,'A2',{email:'Same@X.com'}),contact(3,'A9',{email:'bad@x.com',emailStatus:'INVALID'}),contact(4,'A1',{email:'bad@x.com'}),contact(5,'A2')]});
  const p=c.v6AuraAgentPlanCampaign_('RETENTION',NOW).plan;
  assert.equal(p.contacts.doNotContact,2);assert.equal(p.contacts.invalid,1);assert.equal(p.contacts.recipients,1);
});
test('server playbook mirrors the frontend creative library selection',()=>{
  const c=makeCtx(),w={};vm.createContext(w);w.window=w;vm.runInContext(fs.readFileSync('assets/js/creative-library-v5.js','utf8'),w);const L=w.DGL_CREATIVE_LIBRARY_V5;
  for(const [scope,p] of Object.entries(c.AURA_AGENT_PLAYBOOK_)){
    assert.equal(L.selectSystem({objective:p.objective}).systemId,p.creativeSystem,scope);
    assert.equal(L.OBJECTIVES[p.objective].defaultAngle,p.angle,scope);assert.equal(L.OBJECTIVES[p.objective].defaultCta,p.cta,scope);
  }
});
test('"Run the next reactivation campaign": prepared before approval, ONE approval, no send in V1',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','Reactivation'),opp('A2','Reactivation')],MKT_CONTACTS_SECURE:[contact(1,'A1'),contact(2,'A2')]});
  const r=c.v6AuraAgentCommand_({text:'Run the next reactivation campaign',now:NOW});
  assert.equal(r.intent,'RUN_CAMPAIGN');assert.equal(r.task.state,'APPROVAL');assert.equal(r.task.policy,'APPROVAL_REQUIRED');
  assert.equal(r.result.plan.contacts.recipients,2);assert(/Prepared Reactivation: 2 recipients in 2 accounts/.test(r.response));assert(/Waiting for your approval/.test(r.response));
  assert.equal(c.T.AURA_AGENT_APPROVALS.length,1,'exactly one approval for the campaign');assert.equal(c.calls.ingest,0,'a command never runs unrelated work');
  const again=c.v6AuraAgentCommand_({text:'run the next reactivation campaign',now:NOW});
  assert.equal(c.T.AURA_AGENT_TASKS.filter(t=>t.kind==='COMMAND').length,1,'idempotent');assert.equal(again.task.taskId,r.task.taskId);
  c.v6AuraAgentDecide_({approvalId:r.task.approvalId,decision:'APPROVED'});c.v6AuraAgentRunCycle_({now:'2026-10-07T16:00:00.000Z'});
  const t=c.T.AURA_AGENT_TASKS.find(x=>x.taskId===r.task.taskId);
  assert.equal(t.state,'BLOCKED');assert.equal(t.blockReason,'EXTERNAL_EXECUTION_DISABLED_PHASE_V1');assert.equal(c.calls.gmail,0);
  assert.deepEqual(c.T.MKT_EMAIL_QUEUE,[],'no queue rows written');
});
test('decision ledger records observed, source, decision, why, priority, plan, approval, execution, metric, next action',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','Cross-sell')]});
  c.v6AuraAgentCommand_({text:'Find accounts with cross-sell opportunities',now:NOW});
  const d=c.T.AURA_AGENT_DECISIONS.find(x=>x.taskId.includes('FIND_OPPORTUNITIES'));
  for(const k of ['observed','dataSource','decision','rationale','priority','plannedAction','approvalRequirement','executionResult','metricResult','nextAction'])assert(d[k]!==undefined&&d[k]!=='',k);
  assert.equal(d.decision,'PROCEED');assert.equal(d.approvalRequirement,'AUTO');assert(/^DONE/.test(d.executionResult));assert(/Run the next cross-sell campaign/.test(d.nextAction));
});
test('not-connected channels are reported honestly; external publishing stays gated',()=>{
  const c=makeCtx();
  const s=c.v6AuraAgentCommand_({text:"Prepare next week's social content",now:NOW});
  assert.equal(s.task.state,'BLOCKED');assert.equal(s.task.blockReason,'SOURCE_NOT_CONNECTED:METRICOOL');assert(/METRICOOL is not connected/.test(s.response));
  const seo=c.v6AuraAgentCommand_({text:'Find SEO opportunities',now:NOW});assert.equal(seo.task.blockReason,'SOURCE_NOT_CONNECTED:SEARCH_CONSOLE');
  assert.equal(c.T.AURA_AGENT_APPROVALS.length,0,'nothing is put up for approval when preparation cannot run');
});
test('monthly report and today priorities are AUTO and persisted',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','QNB'),opp('A2','Retention')]});
  const r=c.v6AuraAgentCommand_({text:'Prepare the monthly marketing report',now:NOW});
  assert.equal(r.task.state,'COMPLETED');assert.equal(r.result.report.campaigns[0].campaignId,'CMP-CAMPANA-A-HA-PRIORITARIA');assert.equal(r.result.report.campaigns[0].currentRunSent,214);
  assert(c.T.AURA_AGENT_MEMORY.some(m=>m.memoryKey==='report.monthly.2026-10'));
  const p=c.v6AuraAgentCommand_({text:'Show me what Marketing should prioritize today',now:NOW});
  assert.equal(p.task.state,'COMPLETED');assert.equal(p.result.priorities.eligibleAccountsByScope.QNB,1);
});
test('Campaign A stays closed: recent-send protection and outbound policy',()=>{
  const c=makeCtx({MKT_OPPORTUNITIES:[opp('A1','Reactivation')],MKT_CONTACTS_SECURE:[contact(1,'A1')],MKT_EMAIL_QUEUE:[{jobId:'JA',campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',status:'SENT',email:'p1@acme-a1.com',processedAt:'2026-10-01T10:00:00Z'}]});
  const r=c.v6AuraAgentCommand_({text:'Run the next reactivation campaign',now:NOW});
  assert.equal(r.task.state,'BLOCKED');assert.equal(r.task.blockReason,'NO_ELIGIBLE_RECIPIENTS','the only contact was just sent by Campaign A');
  assert.equal(c.v6AuraAgentPolicy_('SEND_CUSTOMER_EMAIL',{campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA'}),'BLOCKED');
});
test('command endpoint is allow-listed, audited and routed; UI exposes the command bar',()=>{
  const v55=fs.readFileSync('backend/apps-script-legacy-v55/MarketingV55Backend.gs','utf8'),router=SRC('MarketingV6RouterExtension.gs'),ui=fs.readFileSync('assets/js/aura-dashboard-v1.js','utf8');
  assert(v55.includes("'v6AuraAgentCommand'"));assert(/AURA_AGENT_COMMAND/.test(v55));assert(router.includes("case 'v6AuraAgentCommand':"));
  assert(/data-agent-command-form/.test(ui)&&/data-agent-example/.test(ui)&&/planSummary/.test(ui));
  assert(!/GmailApp\.|UrlFetchApp|AURA_SEND_MODE/.test(SRC('MarketingV6AuraAgentIntelligence.gs')));
});
(async()=>{for(const t of all)await t();console.log(checks+'/'+checks+' agent intelligence checks passed');})().catch(e=>{console.error(e);process.exit(1);});
