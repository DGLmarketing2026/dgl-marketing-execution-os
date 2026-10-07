// AURA Overview KPI/UI regression: technical / QA campaigns stay out of commercial KPIs (but remain
// available as technical evidence), no "CURRENT FAMILY: UNKNOWN" for QA, dark METRIC column,
// Campaign A 214 / 109 / 323 unchanged.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const src=fs.readFileSync('assets/js/aura-dashboard-v1.js','utf8'),css=fs.readFileSync('assets/css/aura-dashboard-v1.css','utf8');
const sc=o=>Object.assign({sent:0,delivered:0,bounced:0,failed:0,replied:0,opened:null,clicked:null,openRate:null,ctr:null,ctor:null},o);
const A='CMP-CAMPANA-A-HA-PRIORITARIA',QA='CMP-AURA-TRACKING-QA';
const rows=[];
for(let i=0;i<214;i++)rows.push({jobId:'R'+i,campaignId:A,playbookId:'Reactivation',sendStatus:'SENT',email:'r'+i+'@x.com',accountId:'AC'+(i%120),opened:null,clicked:null,sentAt:'2026-10-01'});
for(let i=0;i<109;i++)rows.push({jobId:'H'+i,campaignId:A,playbookId:'Retention',sendStatus:'SENT',email:'h'+i+'@x.com',accountId:'AC'+(i%60),opened:null,clicked:null,sentAt:'2026-07-01'});
rows.push({jobId:'Q1',campaignId:QA,playbookId:'TRACKING_QA',sendStatus:'SENT',email:'qa@dglus.com',accountId:'QA-INTERNAL',opened:true,clicked:true,sentAt:'2026-10-07'},{jobId:'Q2',campaignId:QA,playbookId:'TRACKING_QA',sendStatus:'SENT',email:'qa@dglus.com',accountId:'QA-INTERNAL',opened:true,clicked:false,sentAt:'2026-10-07'});
const perf={summary:{sent:325,failed:0,bounced:0,replied:2,opened:2,clicked:1,sentUniqueEmails:324,sentUniqueAccounts:121},rows,tracking:{opened:'TRACKED'},
  scopes:{[A]:{campaignId:A,currentFamily:'Reactivation',latestRunId:'GL-1',lastSentAt:'2026-10-01',historicalFamilies:{Retention:109},currentRun:sc({sent:214,delivered:214}),currentFamilyRun:sc({sent:214,delivered:214}),historical:sc({sent:109,delivered:109}),allTime:sc({sent:323,delivered:323}),pipeline:{rfq:0,quote:0,load:0}},
    [QA]:{campaignId:QA,currentFamily:'',latestRunId:'',lastSentAt:'2026-10-07',historicalFamilies:{TRACKING_QA:2},currentRun:sc({}),currentFamilyRun:sc({}),historical:sc({sent:2,delivered:2,opened:2,clicked:1,openRate:100,ctr:50,ctor:50}),allTime:sc({sent:2,delivered:2,opened:2,clicked:1,openRate:100,ctr:50,ctor:50}),pipeline:{rfq:0,quote:0,load:0}}}};
const win={location:{hash:'#/aura-overview'},addEventListener(){},confirm:()=>true,
  DGL_MARKETING_BACKEND_ADAPTER_V55:{isConnected:()=>true,getConnectionState:()=>({state:'PRIVATE_BACKEND'}),v6AuraCommandCenter:async()=>({meta:{backendMs:1},agent:{status:{},priorities:[],opportunities:[],actionQueue:[],waitingApproval:[],running:[],blocked:[],completed:[],nextBestActions:[],recentResults:[]},performance:perf,retention:{},campanaA:{},execution:{records:[]},latestRun:null})}};
const ctx={window:win,document:{addEventListener(){}},console,setTimeout,clearTimeout,Date,JSON};
vm.createContext(ctx);vm.runInContext(src.replace(/\}\)\(window\);\s*$/,'})(window);'),ctx);
let checks=0;const ok=n=>{checks++;console.log('PASS '+n);};
(async()=>{
  const mount={innerHTML:'',querySelector:()=>null};await win.DGL_MODULE_RENDERERS['aura-overview'](mount);const h=mount.innerHTML;
  const scoped=h.slice(h.indexOf('aura-scoped'),h.indexOf('aura-performance card'));
  const commercial=scoped.slice(0,scoped.indexOf('<details class="aura-technical">')),technical=scoped.slice(scoped.indexOf('<details class="aura-technical">'));
  assert(!commercial.includes(QA),'QA campaign not in commercial KPI cards');assert(commercial.includes(A));
  assert(technical.includes(QA)&&technical.includes('TECHNICAL / QA'),'QA kept as technical evidence');
  assert(!/TECHNICAL \/ QA[\s\S]*CURRENT FAMILY: UNKNOWN/.test(technical)&&!h.includes('CURRENT FAMILY: UNKNOWN'),'no UNKNOWN family label for QA');
  ok('QA campaigns excluded from commercial KPI cards and classified TECHNICAL / QA');
  const card=commercial.slice(commercial.indexOf('data-scope-campaign="'+A+'"'));
  assert(/data-scope="currentRun" data-metric="sent">214</.test(card));assert(/data-scope="historical" data-metric="sent">109</.test(card));assert(/data-scope="allTime" data-metric="sent">323</.test(card));
  assert(/data-scope="historical" data-metric="sent">2</.test(technical),'QA evidence (2 sends, opens/clicks) still rendered');assert(/data-scope="allTime" data-metric="openRate">100%</.test(technical));
  ok('Campaign A 214 / 109 / 323 unchanged; QA OPEN/CLICK evidence still available');
  const perfHtml=h.slice(h.indexOf('aura-performance card'));
  assert(/Email Performance · commercial campaigns/.test(perfHtml));assert(/data-perf-kpi="sent"[^>]*><span>SENT<\/span><strong>323<\/strong>/.test(perfHtml),'commercial SENT excludes the 2 QA sends');
  assert(/data-perf-kpi="opened"[^>]*><span>OPENED<\/span><strong>N\/A<\/strong><small>NOT TRACKED/.test(perfHtml),'commercial opens untracked -> N/A, QA opens not mixed in');
  assert(/data-perf-technical/.test(perfHtml));
  const P=win.DGL_AURA_PERFORMANCE,base={metric:'',search:'',campaignId:'',campaignFamily:'',sendStatus:'',language:'',from:'',to:''};
  assert.equal(P.filter(rows,Object.assign({},base,{technical:false})).length,323);assert.equal(P.filter(rows,Object.assign({},base,{technical:true})).length,325);assert.equal(P.filter(rows,Object.assign({},base,{campaignId:QA})).length,2,'explicit campaign filter shows technical evidence');
  ok('performance table and KPIs exclude QA by default; toggle / filter keep technical evidence reachable');
  assert(/<th scope="row" class="aura-metric-cell">SENT<\/th>/.test(h));
  assert(/\.aura-scope-table tbody th\.aura-metric-cell \{[^}]*background: var\(--card, #1A2236\)[^}]*color: var\(--text, #FFFFFF\)/.test(css));
  assert(/\.aura-performance-scroll tbody th,/.test(css),'tbody row headers no longer inherit the light sticky header background');
  ok('METRIC column uses the dark theme');
  console.log(checks+'/'+checks+' overview KPI/UI checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
