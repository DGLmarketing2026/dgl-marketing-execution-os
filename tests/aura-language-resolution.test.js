// Governed ES/EN/PT resolution: priority, confidence, fail-closed UNRESOLVED (never default EN),
// HIGH-only backfill, stale-plan refresh while waiting for approval, guarded hub backfill writer.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const SRC=f=>fs.readFileSync('backend/apps-script-v6/'+f,'utf8');
function makeCtx(T){
  T=Object.assign({MKT_OPPORTUNITIES:[],MKT_EMAIL_QUEUE:[],MKT_CONTACTS_SECURE:[],MKT_ACCOUNTS:[]},T||{});const store={};
  const c={console,Date,Math,Number,String,Object,Array,JSON,Error,T,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>store[k]||null,setProperty:(k,v)=>{store[k]=v;},deleteProperty:k=>{delete store[k];}})},
    ScriptApp:{getProjectTriggers:()=>[]},Session:{getActiveUser:()=>({getEmail:()=>''})},
    v6Rows_:n=>(T[n]||[]).map(r=>Object.assign({},r)),v6AcqEnsureSheet_:n=>{T[n]=T[n]||[];},
    v6BatchUpsertByKey_:(n,k,recs)=>{const l=T[n]||(T[n]=[]);recs.forEach(r=>{const i=l.findIndex(x=>k.every(q=>x[q]===r[q]));if(i<0)l.push(Object.assign({},r));else l[i]=Object.assign({},r);});},
    v6AuraEmailPerformance_:()=>({scopes:{}})};
  vm.createContext(c);for(const f of ['MarketingV6AuraAgentRuntime.gs','MarketingV6AuraAgentIntelligence.gs','MarketingV6AuraDataHubReader.gs'])vm.runInContext(SRC(f),c);return c;
}
const NOW='2026-10-08T12:00:00.000Z';
let n=0;const ok=m=>{n++;console.log('PASS '+m);};
{
  const c=makeCtx({MKT_ACCOUNTS:[{accountId:'ACC-MX',country:'Mexico'},{accountId:'ACC-US',billingCountry:'United States'},{accountId:'ACC-X',country:'Atlantis'}],
    MKT_EMAIL_QUEUE:[{contactId:'K3',email:'k3@x.com',preferredLanguage:'PT',languageSource:'CONTACT_EXPLICIT_SIGNAL'},{contactId:'K4',email:'k4@x.com',preferredLanguage:'EN',languageSource:'EN_FALLBACK_NO_SIGNAL'},
      {contactId:'K5',email:'k5@x.com',preferredLanguage:'ES',languageSource:'CAMPANA_A_TAB_COUNTRY'},{contactId:'K6',email:'k6@x.com',preferredLanguage:'ES',languageSource:'CONTACT_EXPLICIT_SIGNAL'},{contactId:'K6',email:'k6@x.com',preferredLanguage:'EN',languageSource:'CONTACT_EXPLICIT_SIGNAL'}]});
  const R=k=>c.v6AuraAgentResolveLanguage_(k,c.v6AuraAgentLanguageContext_());
  assert.deepEqual([R({preferredLanguage:'Spanish'}).language,R({preferredLanguage:'Spanish'}).confidence],['ES','HIGH']);
  assert.deepEqual([R({language:'pt-BR'}).language,R({language:'pt-BR'}).source],['PT','CONTACT_EXPLICIT']);
  assert.deepEqual([R({LanguageLocaleKey:'en_US'}).language,R({LanguageLocaleKey:'en_US'}).source],['EN','SOURCE_SYSTEM_LANGUAGE']);
  assert.deepEqual([R({contactId:'K3',email:'k3@x.com'}).language,R({contactId:'K3'}).source,R({contactId:'K3'}).confidence],['PT','PRIOR_SEND_EXPLICIT','HIGH']);
  assert.equal(R({contactId:'K4',email:'k4@x.com'}).language,'UNRESOLVED','prior EN fallback is not evidence');
  assert.deepEqual([R({contactId:'K5'}).language,R({contactId:'K5'}).confidence],['ES','MEDIUM']);
  assert.equal(R({contactId:'K6',email:'k6@x.com'}).language,'UNRESOLVED','conflicting prior languages are ignored');
  assert.deepEqual([R({accountId:'ACC-MX'}).language,R({accountId:'ACC-MX'}).source],['ES','ACCOUNT_COUNTRY']);
  assert.deepEqual([R({accountId:'ACC-US'}).language,R({accountId:'ACC-US'}).confidence],['EN','MEDIUM']);
  assert.deepEqual([R({country:'Brasil'}).language,R({country:'Brasil'}).source],['PT','CONTACT_COUNTRY']);
  assert.deepEqual([R({email:'ops@empresa.com.br'}).language,R({email:'ops@empresa.com.br'}).source],['PT','EMAIL_CCTLD']);
  assert.equal(R({accountId:'ACC-X',email:'ops@acme.com'}).language,'UNRESOLVED','unmapped country + .com -> UNRESOLVED, never EN');
  ok('priority: explicit > source system > prior governed send > country > ccTLD; EN fallbacks and conflicts ignored; no EN default');
}
{
  const c=makeCtx({MKT_OPPORTUNITIES:['A1','A2','A3','A4'].map(a=>({accountId:a,opportunityType:'QNB'})),
    MKT_CONTACTS_SECURE:[{contactId:'C1',accountId:'A1',email:'c1@acme.com',preferredLanguage:'EN'},{contactId:'C2',accountId:'A2',email:'c2@acme.com.mx'},{contactId:'C3',accountId:'A3',email:'c3@acme.com'},{contactId:'C4',accountId:'A4',email:'c4@acme.com'}],
    MKT_EMAIL_QUEUE:[{contactId:'C4',email:'c4@acme.com',status:'SKIPPED',preferredLanguage:'ES',languageSource:'CONTACT_EXPLICIT_SIGNAL'}]});
  c.AURA_AGENT_CYCLE_CACHE_={};
  const p=c.v6AuraAgentPlanCampaign_('QNB',NOW).plan;
  assert.deepEqual(JSON.parse(JSON.stringify(p.languages)),{ES:2,EN:1,PT:0,UNRESOLVED:1});assert.equal(p.contacts.recipients,3);assert.equal(p.contacts.languageUnresolved,1);
  assert.deepEqual(JSON.parse(JSON.stringify(p.languageConfidence)),{HIGH:2,MEDIUM:1,NONE:1});assert.equal(p.languageSources.EMAIL_CCTLD,1);assert.equal(p.planVersion,c.AURA_AGENT_PLAN_VERSION_);
  assert.deepEqual(Object.keys(c.AURA_AGENT_CYCLE_CACHE_.languageBackfill),['C4'],'only HIGH, non-explicit evidence is backfilled');
  assert.equal(c.AURA_AGENT_CYCLE_CACHE_.languageBackfill.C4.languageSource,'PRIOR_SEND_EXPLICIT');
  assert(!/@/.test(JSON.stringify(p)));ok('UNRESOLVED contacts are held back (not send-ready); plan reports languages, sources, confidence; HIGH-only backfill');
}
{
  const c=makeCtx({MKT_OPPORTUNITIES:[{accountId:'A1',opportunityType:'Retention'}],MKT_CONTACTS_SECURE:[{contactId:'C1',accountId:'A1',email:'c1@acme.com',preferredLanguage:'ES'}]});
  c.v6AuraAgentRunCycle_({now:'2026-10-08T10:00:00.000Z'});
  const t=()=>c.T.AURA_AGENT_TASKS.find(x=>x.kind==='OPPORTUNITY'),a=()=>c.T.AURA_AGENT_ACTIONS.find(x=>x.actionType==='PREPARE_CAMPAIGN_PLAN');
  assert.equal(t().state,'APPROVAL');
  const old=JSON.parse(a().result);old.plan.planVersion=1;old.plan.languages={ES:0,EN:0,PT:0,UNRESOLVED:1};c.T.AURA_AGENT_ACTIONS.find(x=>x.actionType==='PREPARE_CAMPAIGN_PLAN').result=JSON.stringify(old);
  c.v6AuraAgentRunCycle_({now:'2026-10-08T11:00:00.000Z'});
  const fresh=JSON.parse(a().result).plan;assert.equal(fresh.planVersion,c.AURA_AGENT_PLAN_VERSION_);assert.equal(fresh.languages.ES,1);assert.equal(t().state,'APPROVAL');assert.equal(c.T.AURA_AGENT_APPROVALS.length,1);
  assert(/REPLANNED/.test(c.T.AURA_AGENT_DECISIONS.find(d=>d.taskId===t().taskId).executionResult));
  c.T.MKT_CONTACTS_SECURE[0].preferredLanguage='';c.T.MKT_CONTACTS_SECURE[0].email='c1@acme.com';
  const old2=JSON.parse(a().result);old2.plan.planVersion=1;c.T.AURA_AGENT_ACTIONS.find(x=>x.actionType==='PREPARE_CAMPAIGN_PLAN').result=JSON.stringify(old2);
  c.v6AuraAgentRunCycle_({now:'2026-10-08T12:00:00.000Z'});
  assert.equal(t().state,'BLOCKED');assert.equal(t().blockReason,'NO_ELIGIBLE_RECIPIENTS');assert.equal(c.T.AURA_AGENT_APPROVALS[0].status,'WITHDRAWN','approval withdrawn when the refreshed plan has no send-ready recipients');
  ok('stale plans waiting for approval are refreshed; no send-ready recipients -> task BLOCKED, approval WITHDRAWN');
}
{
  const c=makeCtx(),calls=[];
  c.Sheets={Spreadsheets:{batchUpdate:r=>{calls.push(['structure',r]);},Values:{batchUpdate:r=>{calls.push(['values',r]);}}}};
  const hub={spreadsheetId:'HUB',stats:{calls:[]},sheets:{MKT_CONTACTS_SECURE:{sheetId:7,rowCount:500,columnCount:13}},headers:{MKT_CONTACTS_SECURE:['contactId','accountId','email','preferredLanguage']},
    tables:{MKT_CONTACTS_SECURE:[{contactId:'C1',email:'a@x.com',preferredLanguage:''},{contactId:'C2',email:'b@x.com',preferredLanguage:'EN'}]},rowNumbers:{MKT_CONTACTS_SECURE:[2,5]}};
  const u=k=>({contactId:k,preferredLanguage:'PT',languageSource:'PRIOR_SEND_EXPLICIT',languageConfidence:'HIGH',languageResolvedAt:'2026-10-08T12:00:00Z'});
  const r=c.v6AuraHubBackfillContactLanguage_(hub,[u('C1'),u('C2'),u('C9')]);
  assert.equal(r.written,1,'only the row with empty preferredLanguage');
  const ranges=calls.find(x=>x[0]==='values')[1].data.map(d=>d.range);
  assert(ranges.includes("'MKT_CONTACTS_SECURE'!A1:G1"),'missing language columns appended to the header');
  assert.deepEqual(ranges.slice(1).sort(),["'MKT_CONTACTS_SECURE'!D2","'MKT_CONTACTS_SECURE'!E2","'MKT_CONTACTS_SECURE'!F2","'MKT_CONTACTS_SECURE'!G2"].sort(),'only the four language cells of that row');
  assert.equal(calls.find(x=>x[0]==='values')[1].valueInputOption,'RAW');
  ok('hub backfill writes only the 4 language cells of rows without a language');
}
console.log(n+'/'+n+' language resolution checks passed');
