// Performance regression: the AURA Overview bundle reads each table once per execution and
// replaces 7 requests (2 sequential waves) with 1. Counts real sheet reads (getDataRange).
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
const data={MKT_EMAIL_QUEUE:[['jobId','campaignId','status','playbookId','processedAt'],['J1','C1','SENT','Retention','2026-09-01T00:00:00Z']],MKT_CAMPAIGNS:[['campaignId','campaignType'],['C1','Retention']],MKT_EMAIL_EVENTS:[['eventId','jobId','eventType']],MKT_RESPONSES:[['responseId']],MKT_CONTACTS_SECURE:[['contactId']],MKT_ACCOUNTS:[['accountId']],MKT_EXCLUSIONS:[['contactId']],MKT_CAMPAIGN_CREATIVES:[['creativeId']],MKT_AURA_EXECUTIONS:[['executionId']],MKT_AURA_CAMPANA_A_RUN_SUMMARY:[['runId']]};
function makeCtx(){
  const reads={n:0,byTable:{}},opens={n:0};
  const sheet=name=>({getDataRange:()=>({getValues:()=>{reads.n++;reads.byTable[name]=(reads.byTable[name]||0)+1;return (data[name]||[]).map(r=>r.slice());}})});
  const ctx={console,Date,Math,Number,String,Object,Array,JSON,Error,Set,reads,opens,
    SpreadsheetApp:{openById:()=>{opens.n++;return {getSheetByName:n=>data[n]||/^AURA_AGENT_/.test(n)?sheet(n):null};}},
    ScriptApp:{getProjectTriggers:()=>[]},PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})}};
  vm.createContext(ctx);
  vm.runInContext(SRC('MarketingV6OpportunityEngine.gs'),ctx);
  for(const f of ['MarketingV6SchemaMigration.gs','MarketingV6ResponseEvents.gs','MarketingV6AuraEmailPerformance.gs','MarketingV6AuraAgentRuntime.gs'])vm.runInContext(SRC(f),ctx);
  // Report functions modeled on the real table reads of each Overview section.
  const R=t=>t.forEach(n=>ctx.v6Rows_(n));
  ctx.v6AuraRetentionDashboard_=()=>{R(['MKT_EMAIL_QUEUE','MKT_CAMPAIGNS']);return {};};
  ctx.v6AuraCampanaAMatchReport_=()=>{R(['MKT_EMAIL_QUEUE','MKT_CONTACTS_SECURE']);return {};};
  ctx.v6AuraCampanaAStoppedBreakdown_=()=>{R(['MKT_EMAIL_QUEUE','MKT_EXCLUSIONS']);return {};};
  ctx.v6AuraCampanaAAudit_=()=>{R(['MKT_EMAIL_QUEUE','MKT_CAMPAIGN_CREATIVES']);return {matchReport:ctx.v6AuraCampanaAMatchReport_(),stoppedBreakdown:ctx.v6AuraCampanaAStoppedBreakdown_()};};
  ctx.v6AuraExecutionReport_=()=>{R(['MKT_EMAIL_QUEUE','MKT_AURA_EXECUTIONS']);return {};};
  ctx.v6AuraCampanaALatestRunSummary_=()=>{R(['MKT_AURA_CAMPANA_A_RUN_SUMMARY']);return {};};
  return ctx;
}
let checks=0;function test(n,fn){fn();checks++;console.log('PASS '+n);}
test('memo reads each table once, returns independent row copies, invalidates on write',()=>{
  const c=makeCtx();
  c.v6WithRowsMemo_(()=>{const a=c.v6Rows_('MKT_EMAIL_QUEUE');a[0].status='MUTATED';assert.equal(c.v6Rows_('MKT_EMAIL_QUEUE')[0].status,'SENT');c.v6RowsMemoInvalidate_('MKT_EMAIL_QUEUE');c.v6Rows_('MKT_EMAIL_QUEUE');});
  assert.equal(c.reads.byTable.MKT_EMAIL_QUEUE,2);
  c.v6Rows_('MKT_EMAIL_QUEUE');c.v6Rows_('MKT_EMAIL_QUEUE');assert.equal(c.reads.byTable.MKT_EMAIL_QUEUE,4,'no memo outside a scope (writers always see fresh data)');
  const fc=fs.readFileSync('backend/apps-script-v6/MarketingV6FrequencyControl.gs','utf8');
  assert((fc.match(/v6RowsMemoInvalidate_\(name\)/g)||[]).length>=2,'both upsert paths invalidate');
});
test('bundle vs previous Overview calls: fewer sheet reads, one spreadsheet open, one request',()=>{
  const before=makeCtx();
  ['v6AuraEmailPerformance_','v6AuraRetentionDashboard_','v6AuraCampanaAAudit_','v6AuraCampanaAMatchReport_','v6AuraCampanaAStoppedBreakdown_','v6AuraExecutionReport_','v6AuraCampanaALatestRunSummary_'].forEach(f=>before[f]());
  const after=makeCtx(),b=after.v6AuraCommandCenterBundle_();
  console.log('  BEFORE reads='+before.reads.n+' opens='+before.opens.n+' requests=7 (2 waves) | AFTER reads='+after.reads.n+' opens='+after.opens.n+' requests=1');
  assert(after.reads.n<before.reads.n);assert.equal(after.opens.n,1);
  Object.keys(after.reads.byTable).forEach(t=>assert.equal(after.reads.byTable[t],1,t+' read once'));
  for(const k of ['agent','performance','retention','campanaA','execution','latestRun','meta'])assert(k in b,k);
  assert(b.campanaA.matchReport&&b.campanaA.stoppedBreakdown,'audit carries match/stopped (no duplicate calls)');
  assert.equal(b.meta.contract,'AURA_COMMAND_CENTER_V1');assert(b.performance.scopes.C1);
});
test('a failing section degrades without failing the bundle',()=>{
  const c=makeCtx();c.v6AuraExecutionReport_=()=>{throw new Error('boom');};
  const b=c.v6AuraCommandCenterBundle_();assert.equal(b.execution.error,'boom');assert(b.performance.summary);
});
test('bundle and agent endpoints are routed and allow-listed; bundle is read-only',()=>{
  const v55=fs.readFileSync('backend/apps-script-legacy-v55/MarketingV55Backend.gs','utf8'),router=SRC('MarketingV6RouterExtension.gs');
  for(const a of ['v6AuraCommandCenter','v6AuraAgentDecide','v6AuraAgentRunNow','v6AuraAgentActivate']){assert(v55.includes("'"+a+"'"),a);assert(router.includes("case '"+a+"'"),a);}
  const body=SRC('MarketingV6AuraAgentRuntime.gs').split('function v6AuraCommandCenterBundle_')[1];
  assert(!/Upsert|setValues|appendRow|EnsureSheet/.test(body));
});
console.log(checks+'/'+checks+' command center performance checks passed');
