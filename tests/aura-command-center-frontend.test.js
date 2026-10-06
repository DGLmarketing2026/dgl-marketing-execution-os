// Frontend performance + safety regression for the AURA Command Center:
// request counts (connect, Overview, post-mutation refresh), read cache / in-flight dedupe,
// cache invalidation on writes, no browser storage of report data, scoped KPI rendering.
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const adapterSource=fs.readFileSync(path.join(root,'assets/js/marketing-backend-adapter-v55.js'),'utf8');
const dashboardSource=fs.readFileSync(path.join(root,'assets/js/aura-dashboard-v1.js'),'utf8');
function makeEnv(responses){
  const localStore=new Map([['dgl_mkt_v55_token_session','TOKEN']]),sessionStore=new Map(),log=[];
  const win={};win.window=win;
  win.localStorage={getItem:k=>localStore.has(k)?localStore.get(k):null,setItem:(k,v)=>localStore.set(k,String(v)),removeItem:k=>localStore.delete(k)};
  win.sessionStorage={getItem:k=>sessionStore.has(k)?sessionStore.get(k):null,setItem:(k,v)=>sessionStore.set(k,String(v)),removeItem:k=>sessionStore.delete(k)};
  win.location={hash:'#/aura-overview'};win.prompt=()=>null;win.confirm=()=>true;
  win.CustomEvent=class{constructor(t,i){this.type=t;this.detail=i&&i.detail;}};win.dispatchEvent=()=>{};
  const listeners=[];
  const doc={createElement:()=>({src:'',remove(){}}),
    head:{appendChild(script){const u=new URL(script.src),action=u.searchParams.get('action'),cb=u.searchParams.get('callback');log.push(action);const r=responses[action];queueMicrotask(()=>{const v=typeof r==='function'?r(u):r;if(win[cb])win[cb](v===undefined?{ok:true,data:{}}:v);});}},
    body:{append(){}},addEventListener:(t,fn)=>listeners.push([t,fn]),getElementById:()=>null};
  win.document=doc;
  const ctx={window:win,document:doc,localStorage:win.localStorage,sessionStorage:win.sessionStorage,CustomEvent:win.CustomEvent,URLSearchParams,URL,setTimeout,clearTimeout,Date,JSON,console,queueMicrotask};
  vm.createContext(ctx);vm.runInContext(adapterSource,ctx);
  return {win,ctx,log,localStore,sessionStore,listeners,adapter:win.DGL_MARKETING_BACKEND_ADAPTER_V55};
}
const scope=(o)=>Object.assign({sent:0,delivered:0,bounced:0,failed:0,replied:0,opened:null,clicked:null,openRate:null,ctr:null,ctor:null},o);
const BUNDLE={ok:true,data:{meta:{backendMs:812,contract:'AURA_COMMAND_CENTER_V1'},
  agent:{status:{runtime:'INACTIVE',lastRun:null},priorities:[],opportunities:[{taskId:'T1',title:'QNB: 2 eligible accounts',scope:'QNB',state:'APPROVAL',policy:'APPROVAL_REQUIRED',approvalId:'AP:T1',approvalStatus:'PENDING'}],actionQueue:[],waitingApproval:[{taskId:'T1',title:'QNB: 2 eligible accounts',scope:'QNB',state:'APPROVAL',policy:'APPROVAL_REQUIRED',approvalId:'AP:T1',approvalStatus:'PENDING'}],running:[],blocked:[],completed:[],nextBestActions:[],recentResults:[]},
  performance:{summary:{sent:323,failed:0,bounced:4,replied:2,opened:null,clicked:null},rows:[],tracking:{opened:'NOT_TRACKED',clicked:'NOT_TRACKED'},
    scopes:{'CMP-CAMPANA-A-HA-PRIORITARIA':{campaignId:'CMP-CAMPANA-A-HA-PRIORITARIA',currentFamily:'Reactivation',latestRunId:'GL-1',lastSentAt:'2026-10-01',historicalFamilies:{Retention:109},
      currentRun:scope({sent:214,delivered:210,bounced:4,replied:2}),currentFamilyRun:scope({sent:214,delivered:210,bounced:4,replied:2}),historical:scope({sent:109,delivered:109}),allTime:scope({sent:323,delivered:319,bounced:4,replied:2}),pipeline:{rfq:1,quote:0,load:0}}}},
  retention:{},campanaA:{realSendsDetected:323},execution:{records:[]},latestRun:null}};
const BASE={v6Opportunities:{ok:true,data:{groups:[]}},v55Requests:{ok:true,data:{requests:[]}},v55Campaigns:{ok:true,data:{campaigns:[]}},v55Activity:{ok:true,data:{activity:[]}},v6AuraExecutionReport:{ok:true,data:{records:[]}}};
let checks=0;async function test(n,fn){await fn();checks++;console.log('PASS '+n);}
const tick=()=>new Promise(r=>setTimeout(r,0));
(async()=>{
  await test('connect = 5 requests; cached reads, in-flight dedupe, force and write invalidation',async()=>{
    const e=makeEnv(Object.assign({},BASE,{v6AuraCommandCenter:BUNDLE,v6AuraAgentDecide:{ok:true,data:{status:'RECORDED'}}}));
    await e.adapter.connect();assert.equal(e.log.length,5);
    const [a,b]=await Promise.all([e.adapter.v6AuraCommandCenter(),e.adapter.v6AuraCommandCenter()]);
    assert.equal(e.log.filter(x=>x==='v6AuraCommandCenter').length,1,'concurrent reads de-duplicated');assert.deepEqual(a,b);
    await e.adapter.v6AuraCommandCenter();assert.equal(e.log.filter(x=>x==='v6AuraCommandCenter').length,1,'TTL cache hit');
    await e.adapter.v6AuraCommandCenter({force:true});assert.equal(e.log.filter(x=>x==='v6AuraCommandCenter').length,2,'force bypasses cache');
    await e.adapter.agentDecide('AP:T1','APPROVED','');await e.adapter.v6AuraCommandCenter();
    assert.equal(e.log.filter(x=>x==='v6AuraCommandCenter').length,3,'a write invalidates cached reads');
    const m=e.adapter.getRequestMetrics();assert(m.cacheHits>=1&&m.dedupeHits>=1);
    assert.deepEqual([...e.localStore.keys()],['dgl_mkt_v55_token_session'],'no report data in localStorage');assert.equal(e.sessionStore.size,0);
  });
  await test('post-mutation refresh re-reads datasets only (3 requests instead of 5)',async()=>{
    const e=makeEnv(Object.assign({},BASE,{v55PauseCampaign:{ok:true,data:{}}}));
    await e.adapter.connect();e.log.length=0;
    await e.adapter.pauseCampaign?await e.adapter.pauseCampaign('C1'):await e.adapter.mutate('v55PauseCampaign',{campaignId:'C1'});
    assert.deepEqual(e.log.slice().sort(),['v55Activity','v55Campaigns','v55PauseCampaign','v55Requests'].sort());
  });
  await test('Command Center loads in ONE request and renders scoped KPIs and approval controls',async()=>{
    const e=makeEnv(Object.assign({},BASE,{v6AuraCommandCenter:BUNDLE}));await e.adapter.connect();e.log.length=0;
    vm.runInContext(dashboardSource,e.ctx);
    const mount={innerHTML:'',querySelector:()=>null};
    await e.win.DGL_MODULE_RENDERERS['aura-overview'](mount);
    assert.deepEqual(e.log,['v6AuraCommandCenter']);
    const h=mount.innerHTML;
    for(const s of ['AURA STATUS',"TODAY'S PRIORITIES",'DETECTED OPPORTUNITIES','ACTION QUEUE','WAITING FOR APPROVAL','RUNNING','BLOCKED','COMPLETED','NEXT BEST ACTIONS','RECENT RESULTS'])assert(h.includes(s),s);
    for(const s of ['CURRENT RUN','CURRENT CAMPAIGN FAMILY','HISTORICAL (OTHER FAMILIES)','ALL-TIME','DELIVERED (SENT − BOUNCED)','SENT is not DELIVERED'])assert(h.includes(s),s);
    assert(/data-scope="currentRun" data-metric="sent">214</.test(h));assert(/data-scope="historical" data-metric="sent">109</.test(h));assert(/data-scope="allTime" data-metric="sent">323</.test(h));
    assert(/data-scope="currentRun" data-metric="openRate">N\/A</.test(h),'untracked rate is N/A, never 0%');
    assert(h.includes('data-agent-decide="APPROVED"')&&h.includes('data-approval="AP:T1"'));
    assert(h.includes('Sent real (all families, all-time)'));assert(!/RUN_AURA_/.test(h),'users never see RUN_AURA_* names');
  });
  await test('older backend without the bundle falls back to the previous per-report calls',async()=>{
    const e=makeEnv(Object.assign({},BASE,{v6AuraCommandCenter:{ok:false,error:'UNKNOWN_ACTION'}}));await e.adapter.connect();e.log.length=0;
    vm.runInContext(dashboardSource,e.ctx);const mount={innerHTML:'',querySelector:()=>null};
    await e.win.DGL_MODULE_RENDERERS['aura-overview'](mount);
    assert.equal(e.log[0],'v6AuraCommandCenter');assert(e.log.includes('v6AuraEmailPerformance'));assert(e.log.includes('v6AuraCampanaAAudit'));
    assert(mount.innerHTML.includes('not available on this backend version yet'));
  });
  console.log(checks+'/'+checks+' command center frontend checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
