const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/lifecycle-modules-v6.js'),'utf8');

const RECOVERY_OWNERS_EXPECTED=["Alejandro Ochoa","Alex Cifuentes","Ali Pirela","Andres Bernal","Andy J. McNelly","Caroline Salamanca","Cindy Ave","Cristian Serna","DGL Accounts","Daniel Martin","David Cuestas","Fabian Lopez","German Cano","House Account","Juan Rodriguez","Juan Ruiz","Luis Simoes","Manuel Arias","Mateo Matallana","Nicolas Monroy","Santiago Villegas","Sebastian Crespo","Tatiana Lozano","Valentina Rico"];

function record(overrides){
  return Object.assign({
    owner:'Alex Cifuentes',campaignFamily:'Retention',service:'FTL',campaignId:'CMP-1',executionId:'EXEC-1',
    detectedAccounts:5,eligibleAccounts:3,suppressedAccounts:2,recipients:6,sent:0,delivered:0,bounced:0,clicks:0,
    replies:1,rfqs:0,quotes:0,loads:0,campaignStart:'2026-09-01T00:00:00.000Z',campaignEnd:'',
    status:'READY TO SEND · SEND PROVIDER REQUIRED',updatedAt:'2026-09-09T21:00:00.000Z'
  },overrides||{});
}
const FIXTURE_RECORDS=[
  record({owner:'Alex Cifuentes',campaignFamily:'Retention',campaignId:'CMP-1',executionId:'EXEC-1',recipients:6,eligibleAccounts:3,status:'READY TO SEND · SEND PROVIDER REQUIRED',replies:1,updatedAt:'2026-09-09T21:00:00.000Z'}),
  record({owner:'Ali Pirela',campaignFamily:'Quoted Not Booked',campaignId:'CMP-2',executionId:'EXEC-2',recipients:4,eligibleAccounts:2,status:'BLOCKED',replies:0,rfqs:2,updatedAt:'2026-09-09T22:00:00.000Z'}),
  record({owner:'Alex Cifuentes',campaignFamily:'Cross-Sell',campaignId:'CMP-3',executionId:'EXEC-3',recipients:2,eligibleAccounts:2,status:'PREPARING',replies:0,updatedAt:'2026-09-09T20:00:00.000Z'})
];
const FIXTURE_SUMMARY={campaigns:3,readyToSend:1,blocked:1,recipients:12,eligibleAccounts:7,suppressedAccounts:0,owners:2,sent:0,replies:1,rfqs:2,quotes:0,loads:0,lastUpdated:'2026-09-09T22:00:00.000Z'};

function makeEnv({connected=true,auraImpl,intervalCapture}={}){
  const listeners={};
  const timers=intervalCapture||{fn:null,ms:null,cleared:false};
  const loc={hash:'#/account-campaign-reports'};
  // Elements addressed via document.getElementById in the module (auraResultsSection,
  // auraFilterBar) — real DOM nodes, kept separate from the container's own
  // innerHTML string since this harness has no HTML parser.
  const domElements={auraResultsSection:{innerHTML:''},auraFilterBar:{innerHTML:''}};
  const doc={
    addEventListener:(n,fn)=>{listeners[n]=listeners[n]||[];listeners[n].push(fn);},
    createElement:()=>({textContent:''}),
    head:{appendChild(){}},
    getElementById:id=>domElements[id]||null
  };
  const window={
    DGL_MODULE_RENDERERS:{},
    document:doc,
    location:loc,
    addEventListener:(n,fn)=>{listeners[n]=listeners[n]||[];listeners[n].push(fn);},
    sessionStorage:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)};})(),
    DGL_MARKETING_BACKEND_ADAPTER_V55:connected?{
      isConnected:()=>true,
      getConnectionState:()=>({state:'PRIVATE_BACKEND'}),
      v6AuraExecutionReport:auraImpl||(async()=>({summary:FIXTURE_SUMMARY,records:FIXTURE_RECORDS})),
      v6Opportunities:async()=>({groups:[],summary:{}}),
      v6PipelineSummary:async()=>({total:0,byCurrentStage:{}}),
      getCampaigns:()=>[]
    }:null
  };
  const ctx={
    window,document:doc,location:loc,sessionStorage:window.sessionStorage,
    setInterval:(fn,ms)=>{timers.fn=fn;timers.ms=ms;return 1;},
    clearInterval:()=>{timers.cleared=true;},
    console,Set,Map,Object,Array,String,Number,Date,JSON
  };
  vm.createContext(ctx);
  vm.runInContext(source,ctx,{filename:'lifecycle-modules-v6.js'});
  return {window,listeners,timers,loc,domElements};
}
function fireChange(listeners,target){(listeners.change||[]).forEach(fn=>fn({target:{closest:sel=>target.matches(sel)?target:null}}));}
function fireInput(listeners,target){(listeners.input||[]).forEach(fn=>fn({target:{closest:sel=>target.matches(sel)?target:null}}));}
// Minimal fake DOM element good enough for `.closest(selector)` matching on our own data-* attributes
function fakeEl(attrs,value){
  const dataAttrs=Object.keys(attrs||{});
  return {value,matches:sel=>{const m=/\[([a-z-]+)\]/.exec(sel);return !!m&&dataAttrs.includes(m[1]);}};
}

// 1. The report renderer is wired to the live AURA endpoint, not a static view
(function testRendererUsesLiveEndpoint(){
  assert(source.includes('A().v6AuraExecutionReport()'),'reports() must call the live v6AuraExecutionReport backend action');
  assert(source.includes('R["account-campaign-reports"]=reports'),'account-campaign-reports must still be owned by the reports() renderer');
  console.log('PASS: Account & Campaign Reports renders from the live v6AuraExecutionReport endpoint');
})();

// 2. No hard-coded campaign totals in source — every KPI reads from the live summary object
(function testNoHardcodedTotals(){
  const kpiBlock=source.slice(source.indexOf('function auraPaint'),source.indexOf('function auraPaint')+2200);
  [
    'summary.campaigns','byFamily.Retention','byFamily.Reactivation','byFamily.QNB','byFamily["Cross-Sell"]',
    'summary.eligibleAccounts','summary.recipients','summary.readyToSend','summary.blocked',
    'summary.sent','summary.delivered','summary.opened','summary.clicked','summary.bounced','summary.spamComplaints',
    'summary.replies','summary.rfqs','summary.quotes','summary.loads','summary.lastAuraRun'
  ].forEach(f=>{
    assert(kpiBlock.includes(f),'AURA KPI grid must read '+f+' from the live summary, not a literal number');
  });
  console.log('PASS: every AURA KPI is sourced from the live summary object, never a hard-coded literal');
})();

// 3. Initial render: banner, KPIs, ready/blocked/results tables, owner + family grouping
(async function testFullRender(){
  const {window}=makeEnv();
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c);
  assert(c.innerHTML.includes('AURA · Campaign Activity &amp; Reports'));
  assert(c.innerHTML.includes('AURA AUTOMATION'));
  assert(c.innerHTML.includes('LIVE DATA · AUTO REFRESH 60s'));
  assert(c.innerHTML.includes('SEND PROVIDER REQUIRED'));
  // KPIs reflect the real fixture summary, not zeros
  assert(c.innerHTML.includes('12'),'RECIPIENTS KPI must show the real summed value (12)');
  // Ready to Send table shows the one READY row and its status pill splits the suffix
  assert(c.innerHTML.includes('Ready to Send'));
  assert(c.innerHTML.includes('READY TO SEND'));
  assert(c.innerHTML.includes('SEND PROVIDER REQUIRED'));
  assert(c.innerHTML.includes('CMP-1'));
  // Blocked table shows the BLOCKED row
  assert(c.innerHTML.includes('Blocked / Needs Data'));
  assert(c.innerHTML.includes('BLOCKED'));
  assert(c.innerHTML.includes('CMP-2'));
  // Results table shows all campaigns including replies/rfqs
  assert(c.innerHTML.includes('Campaign Results'));
  // Owner grouping: Alex Cifuentes has 2 campaigns, Ali Pirela has 1
  assert(c.innerHTML.includes('Owner Performance'));
  assert(c.innerHTML.includes('Alex Cifuentes'));
  assert(c.innerHTML.includes('Ali Pirela'));
  // Campaign family grouping covers all four canonical families
  assert(c.innerHTML.includes('Campaign Family'));
  ['Retention','Reactivation','Quoted Not Booked','Cross-Sell'].forEach(f=>assert(c.innerHTML.includes(f),'family summary must include '+f));
  console.log('PASS: full AURA report renders KPIs, ready/blocked/results tables and owner + family grouping from real data');
})().then(async()=>{

// 4. Filters narrow the visible rows without a full page reload (results section re-renders in place)
await (async function testFilterBehavior(){
  const {window,listeners,domElements}=makeEnv();
  const c={innerHTML:''};
  const initialPage=await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c)||c.innerHTML;
  const fullPageSnapshot=c.innerHTML;
  // Owner filter: only Ali Pirela's campaign (CMP-2) should remain in the results section
  const ownerSelect=fakeEl({'data-aura-owner':true},'Ali Pirela');
  fireChange(listeners,ownerSelect);
  assert(domElements.auraResultsSection.innerHTML.includes('CMP-2'),'owner filter must keep the selected owner\'s campaign');
  assert(!domElements.auraResultsSection.innerHTML.includes('CMP-3'),'owner filter must drop campaigns for other owners');
  // The top-level container (header/KPIs) is never re-rendered by a filter change — no full reload
  assert.equal(c.innerHTML,fullPageSnapshot,'a filter change must never touch the page container outside auraResultsSection');
  // Status filter narrows to BLOCKED only
  const statusSelect=fakeEl({'data-aura-status':true},'BLOCKED');
  fireChange(listeners,statusSelect);
  assert(domElements.auraResultsSection.innerHTML.includes('CMP-2'));
  assert(!domElements.auraResultsSection.innerHTML.includes('CMP-1'),'status=BLOCKED filter must drop the ready campaign');
  // Reset owner/status, apply a free-text search on campaign id
  fireChange(listeners,fakeEl({'data-aura-owner':true},'ALL'));
  fireChange(listeners,fakeEl({'data-aura-status':true},'ALL'));
  const searchInput=fakeEl({'data-aura-search':true},'CMP-2');
  fireInput(listeners,searchInput);
  assert(domElements.auraResultsSection.innerHTML.includes('CMP-2'));
  assert(!domElements.auraResultsSection.innerHTML.includes('CMP-1'),'search must narrow to the matching campaign id only');
  assert(!domElements.auraResultsSection.innerHTML.includes('CMP-3'));
  console.log('PASS: owner/status/search filters apply in place via delegated change/input listeners, without reloading the module');
})();

// 5. Auto-refresh: reports() schedules a 60s interval and it self-clears on navigation away
await (async function testAutoRefresh(){
  const timers={fn:null,ms:null,cleared:false};
  const {window,loc}=makeEnv({intervalCapture:timers});
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c);
  assert.equal(timers.ms,60000,'AURA report must auto-refresh every 60 seconds');
  assert(typeof timers.fn==='function','an interval callback must be registered');
  loc.hash='#/command-center';
  await timers.fn();
  assert(timers.cleared,'the auto-refresh timer must clear itself once the route is no longer #/account-campaign-reports');
  console.log('PASS: AURA report auto-refreshes every 60s and cleans up the timer when navigating away');
})();

// 6. False-zero protection: a failed refresh keeps showing the last real numbers, never zeros
await (async function testFalseZeroProtection(){
  let calls=0;
  const flaky=async()=>{calls++;if(calls===1)return{summary:FIXTURE_SUMMARY,records:FIXTURE_RECORDS};throw new Error('backend hiccup');};
  const {window}=makeEnv({auraImpl:flaky});
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c); // primes the in-memory cache
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c); // second call fails
  assert(c.innerHTML.includes('12'),'must keep showing the last real RECIPIENTS total, not a false zero');
  assert(!/RECIPIENTS[\s\S]{0,40}>0</i.test(c.innerHTML),'must never render a fabricated zero over real cached data');
  assert(c.innerHTML.includes('SHOWING LAST KNOWN DATA'),'must clearly flag that the report is stale, not fresh');
  console.log('PASS: a failed refresh keeps the last real numbers on screen and is honestly labeled stale, never a false zero');
})();

// 7. No cache at all + backend unreachable -> explicit unavailable state, never zeros
await (async function testUnavailableWithNoCache(){
  const {window}=makeEnv({auraImpl:async()=>{throw new Error('down');}});
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c);
  assert(c.innerHTML.includes('AURA REPORT TEMPORARILY UNAVAILABLE'));
  assert(!c.innerHTML.includes('kpi-value'),'must not render a KPI grid (which would show zeros) when there is no real data at all');
  console.log('PASS: with no cache and an unreachable backend, AURA report shows an explicit unavailable state, never zeros');
})();

// 8. Command Center gets one compact AURA card linking to the report
await (async function testCommandCenterCard(){
  const {window}=makeEnv();
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['command-center'](c);
  assert(c.innerHTML.includes('aura-command-card'));
  assert(c.innerHTML.includes('href="#/account-campaign-reports"'));
  assert(c.innerHTML.includes('AURA'));
  console.log('PASS: Command Center shows one compact AURA status card linking to #/account-campaign-reports');
})();

// 9. No PII field names appear anywhere in the frontend source for this report
(function testNoPiiInSource(){
  const auraBlock=source.slice(source.indexOf('AURA_FAMILIES='),source.indexOf('g.DGL_LIFECYCLE_MODULES_V6='));
  ['accountName','contactName','contactEmail','phone','creditLimit'].forEach(f=>{
    assert(!auraBlock.includes(f),'AURA reporting code must never reference '+f);
  });
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(auraBlock),'AURA reporting code must not contain email addresses');
  console.log('PASS: AURA reporting frontend code carries no PII field names or embedded data');
})();

// 10. Regression guards: existing 24-owner Safe Data Hub recovery is untouched
(function testRecoveryUntouched(){
  RECOVERY_OWNERS_EXPECTED.forEach(name=>assert(source.includes(`"${name}"`),'RECOVERY_OWNERS must still include '+name));
  assert(source.includes('R["campaign-opportunities"]=campaignOpportunitiesView'),'campaign-opportunities recovery view must be untouched');
  console.log('PASS: the existing 24-owner Safe Data Hub recovery snapshot is untouched by the AURA reporting change');
})();

// 11. Blocked table explains itself truthfully instead of implying an error
await (async function testBlockedExplanation(){
  const onlyReady=[record({status:'READY TO SEND · SEND PROVIDER REQUIRED'})];
  const {window}=makeEnv({auraImpl:async()=>({summary:Object.assign({},FIXTURE_SUMMARY,{blocked:0}),records:onlyReady})});
  const c={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](c);
  assert(c.innerHTML.includes('Nothing blocked right now'));
  assert(c.innerHTML.includes('is not an error'),'must not imply an error when there is nothing blocked');
  console.log('PASS: an empty Blocked table explains itself truthfully and never implies an error');
})();

console.log('AURA live execution report UI: ALL PASS');
}).catch(e=>{console.error(e);process.exitCode=1;});
