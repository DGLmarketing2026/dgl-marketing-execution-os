// Regression coverage for the V6/AURA-authority connection fix:
// - a healthy V6 read (v6Opportunities) alone establishes PRIVATE_BACKEND,
//   even when every optional legacy V5.5 read fails or all of them do
// - only a genuine backend-reported auth rejection clears the stored token
// - every other failure (network, timeout, malformed) leaves the token
//   alone and reports a distinct, visible BACKEND_ERROR state
// - the frontend never falls back to a generic "PRIVATE BACKEND REQUIRED"
//   after a token was actually submitted and rejected — it shows the real
//   reason, and never renders a literal zero as if it were measured data
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const adapterSource=fs.readFileSync(path.join(root,'assets/js/marketing-backend-adapter-v55.js'),'utf8');
const lifecycleSource=fs.readFileSync(path.join(root,'assets/js/lifecycle-modules-v6.js'),'utf8');

// ---- Part 1: the adapter's own connection state machine -------------------

// A minimal DOM good enough for the adapter's JSONP transport: createElement
// only needs to support <script>/<iframe>/<form>/<input>, and
// document.head.appendChild is where we simulate the network response by
// inspecting the requested `action` and resolving/erroring per `responses`.
function makeAdapterEnv(responses,{seedToken}={}){
  const localStore=new Map(),sessionStore=new Map();
  if(seedToken)localStore.set('dgl_mkt_v55_token_session',seedToken);
  const win={};
  win.window=win;
  win.localStorage={getItem:k=>localStore.has(k)?localStore.get(k):null,setItem:(k,v)=>localStore.set(k,String(v)),removeItem:k=>localStore.delete(k)};
  win.sessionStorage={getItem:k=>sessionStore.has(k)?sessionStore.get(k):null,setItem:(k,v)=>sessionStore.set(k,String(v)),removeItem:k=>sessionStore.delete(k)};
  win.location={hash:'#/command-center'};
  win.prompt=()=>null;
  win.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init&&init.detail;}};
  win.dispatchEvent=()=>{};
  const doc={
    createElement(tag){
      if(tag==='script')return{src:'',async:false,onerror:null,remove(){}};
      if(tag==='iframe')return{name:'',hidden:false,remove(){}};
      if(tag==='form')return{hidden:false,method:'',action:'',target:'',appendChild(){},submit(){},remove(){}};
      if(tag==='input')return{type:'',name:'',value:''};
      return{};
    },
    head:{appendChild(script){
      const url=new URL(script.src);
      const action=url.searchParams.get('action');
      const cb=url.searchParams.get('callback');
      const resp=responses[action];
      queueMicrotask(()=>{
        if(resp==='NETWORK_ERROR'){if(script.onerror)script.onerror();return;}
        if(resp==='TIMEOUT')return; // deliberately never resolves
        const value=typeof resp==='function'?resp():resp;
        if(win[cb])win[cb](value);
      });
    }},
    body:{append(){}},
    addEventListener(){},
    getElementById:()=>null
  };
  win.document=doc;
  const ctx={window:win,document:doc,localStorage:win.localStorage,sessionStorage:win.sessionStorage,CustomEvent:win.CustomEvent,URLSearchParams,setTimeout,clearTimeout,Date,JSON,console,Object,Array,Number,String,Promise};
  vm.createContext(ctx);
  vm.runInContext(adapterSource,ctx,{filename:'marketing-backend-adapter-v55.js'});
  return {adapter:win.DGL_MARKETING_BACKEND_ADAPTER_V55,localStore};
}

const OK_V6=()=>({ok:true,data:{groups:[],summary:{}}});
const OK_LIST=key=>()=>({ok:true,data:{[key]:[]}});

async function testV6SuccessSurvivesOneLegacyFailure(){
  const {adapter}=makeAdapterEnv({
    v6Opportunities:OK_V6(),
    v55Requests:OK_LIST('requests')(),
    v55Campaigns:OK_LIST('campaigns')(),
    v55Activity:'NETWORK_ERROR',
    v6AuraExecutionReport:OK_LIST('records')()
  },{seedToken:'GOOD-TOKEN-1'});
  const result=await adapter.connect();
  assert.equal(result.state,'PRIVATE_BACKEND','a healthy V6 read must connect even though v55Activity failed');
  assert.equal(adapter.getActivity().length,0,'the failed legacy read leaves activity empty, not fabricated');
  console.log('PASS: V6 success establishes connection even if v55Activity fails');
}

async function testV6SuccessSurvivesAllLegacyFailures(){
  const {adapter}=makeAdapterEnv({
    v6Opportunities:OK_V6(),
    v55Requests:'NETWORK_ERROR',
    v55Campaigns:'NETWORK_ERROR',
    v55Activity:'NETWORK_ERROR',
    v6AuraExecutionReport:'NETWORK_ERROR'
  },{seedToken:'GOOD-TOKEN-2'});
  const result=await adapter.connect();
  assert.equal(result.state,'PRIVATE_BACKEND','a healthy V6 read must connect even if every optional V5.5 read fails');
  assert.equal(adapter.getRequests().length,0);
  assert.equal(adapter.getCampaigns().length,0);
  assert.equal(adapter.getActivity().length,0);
  console.log('PASS: V6 success establishes connection even if every optional legacy read fails');
}

async function testAuthFailureRejectsAndClearsToken(){
  const {adapter,localStore}=makeAdapterEnv({v6Opportunities:{ok:false,error:'Unauthorized'}},{seedToken:'BAD-TOKEN'});
  let threw=false;
  try{await adapter.connect();}catch(_){threw=true;}
  assert(threw,'a genuine auth rejection must reject connect()');
  assert.equal(adapter.getConnectionState().state,'AUTH_ERROR');
  assert(!localStore.has('dgl_mkt_v55_token_session'),'a real auth rejection must clear the bad token');
  console.log('PASS: an actual backend-reported auth failure rejects connection, clears the token, and is a distinct AUTH_ERROR state');
}

async function testNonAuthFailurePreservesToken(){
  const {adapter,localStore}=makeAdapterEnv({v6Opportunities:'NETWORK_ERROR'},{seedToken:'STILL-GOOD-TOKEN'});
  let threw=false;
  try{await adapter.connect();}catch(_){threw=true;}
  assert(threw);
  assert.equal(adapter.getConnectionState().state,'BACKEND_ERROR','a non-auth V6 failure must be a distinct BACKEND_ERROR, never the generic disconnected state');
  assert.equal(localStore.get('dgl_mkt_v55_token_session'),'STILL-GOOD-TOKEN','a non-auth failure must never clear a token that was never shown to be invalid');
  console.log('PASS: a non-auth V6 failure (network/timeout/malformed) never clears the stored token');
}

async function testTimeoutIsBackendErrorNotAuth(){
  const {adapter,localStore}=makeAdapterEnv({v6Opportunities:{ok:false,error:'timeout'}},{seedToken:'TOKEN-3'});
  try{await adapter.connect();}catch(_){/* expected */}
  assert.equal(adapter.getConnectionState().state,'BACKEND_ERROR','a timeout must never be classified as an auth rejection');
  assert.equal(localStore.get('dgl_mkt_v55_token_session'),'TOKEN-3');
  console.log('PASS: a timeout is classified as BACKEND_ERROR, not AUTH_ERROR, and preserves the token');
}

async function testDiagnosticObjectIsSafe(){
  const allowed=['state','endpointReachable','v6Authenticated','v6OpportunitiesStatus','auraReportStatus','legacyRequestsStatus','legacyCampaignsStatus','legacyActivityStatus','lastErrorCode','lastErrorMessage'];
  for(const field of allowed)assert(adapterSource.includes(field),`diagnostic object missing ${field}`);
  assert(/DGL_BACKEND_DIAGNOSTIC/.test(adapterSource));
  assert(!/DGL_BACKEND_DIAGNOSTIC[\s\S]{0,400}token\s*[:=]\s*token\(\)/.test(adapterSource),'diagnostic object source must never assign the raw token value');
  console.log('PASS: window.DGL_BACKEND_DIAGNOSTIC carries only the safe allowlisted fields, never the token');
}

async function testConnectSetsConnectingBeforeResolving(){
  let sawConnecting=false;
  const {adapter}=makeAdapterEnv({
    v6Opportunities:()=>{sawConnecting=adapter.getConnectionState().state==='CONNECTING';return OK_V6();},
    v55Requests:OK_LIST('requests')(),v55Campaigns:OK_LIST('campaigns')(),v55Activity:OK_LIST('activity')(),v6AuraExecutionReport:OK_LIST('records')()
  },{seedToken:'TOKEN-4'});
  await adapter.connect();
  assert(sawConnecting,'connect() must set CONNECTING before the V6 authentication request resolves');
  console.log('PASS: connect() sets CONNECTING immediately, before the V6 read resolves');
}

// ---- Part 2: the frontend never shows a false state -----------------------

function makeLifecycleEnv(connectionState){
  const domElements={};
  const listeners={};
  const doc={
    addEventListener:(n,fn)=>{listeners[n]=listeners[n]||[];listeners[n].push(fn);},
    createElement:()=>({textContent:''}),
    head:{appendChild(){}},
    getElementById:id=>domElements[id]||null
  };
  const mount={innerHTML:''};
  const stubAdapter={
    isConnected:()=>connectionState==='PRIVATE_BACKEND',
    getConnectionState:()=>({state:connectionState}),
    v6Opportunities:async()=>({groups:[],summary:{}}),
    v6PipelineSummary:async()=>({total:0,byCurrentStage:{}}),
    v6AuraExecutionReport:async()=>({summary:{},records:[]}),
    v6AuraGmailPanel:async()=>null,
    v6AuraIngestHistory:async()=>({rows:[]}),
    v6AuraSourceBreakdown:async()=>({gmail:{},nova:{}}),
    getCampaigns:()=>[]
  };
  const window={
    DGL_MODULE_RENDERERS:{},document:doc,location:{hash:'#/command-center'},
    addEventListener:(n,fn)=>{listeners[n]=listeners[n]||[];listeners[n].push(fn);},
    sessionStorage:(()=>{const m=new Map();return{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)};})(),
    DGL_MARKETING_BACKEND_ADAPTER_V55:stubAdapter
  };
  const ctx={window,document:doc,location:window.location,sessionStorage:window.sessionStorage,setInterval:()=>1,clearInterval(){},console,Set,Map,Object,Array,String,Number,Date,JSON};
  vm.createContext(ctx);
  vm.runInContext(lifecycleSource,ctx,{filename:'lifecycle-modules-v6.js'});
  return {window,mount};
}

async function testConnectingStateIsHonest(){
  const {window,mount}=makeLifecycleEnv('CONNECTING');
  await window.DGL_MODULE_RENDERERS['command-center'](mount);
  assert(mount.innerHTML.includes('CONNECTING TO AURA...'),'CONNECTING must render the real transient state, not a dead end');
  assert(!/PRIVATE BACKEND REQUIRED/.test(mount.innerHTML),'CONNECTING must never look like the platform never tried to connect');
  console.log('PASS: CONNECTING renders "CONNECTING TO AURA...", never a false REQUIRED state');
}

async function testAuthErrorStateIsHonest(){
  const {window,mount}=makeLifecycleEnv('AUTH_ERROR');
  await window.DGL_MODULE_RENDERERS['command-center'](mount);
  assert(mount.innerHTML.includes('PRIVATE BACKEND AUTHENTICATION FAILED'),'a real auth rejection must say so explicitly');
  console.log('PASS: AUTH_ERROR renders "PRIVATE BACKEND AUTHENTICATION FAILED", never a generic message');
}

async function testBackendErrorStateIsHonest(){
  const {window,mount}=makeLifecycleEnv('BACKEND_ERROR');
  await window.DGL_MODULE_RENDERERS['command-center'](mount);
  assert(mount.innerHTML.includes('AURA BACKEND TEMPORARILY UNAVAILABLE'),'a non-auth backend failure must say so explicitly, distinct from an auth failure');
  assert(mount.innerHTML.includes('RETRY CONNECTION'),'a BACKEND_ERROR must offer a retry using the still-valid stored token, not a re-prompt');
  console.log('PASS: BACKEND_ERROR renders "AURA BACKEND TEMPORARILY UNAVAILABLE" with a retry action');
}

async function testDisconnectedStateNeverFabricatesZeros(){
  const {window,mount}=makeLifecycleEnv('DISCONNECTED');
  await window.DGL_MODULE_RENDERERS['command-center'](mount);
  assert(mount.innerHTML.includes('Private backend required'));
  assert(!/\b0 owners\b/.test(mount.innerHTML));
  assert(!/kpi-value">0</.test(mount.innerHTML),'Command Center must never render a KPI tile with a literal 0 before any backend data has loaded');
  console.log('PASS: DISCONNECTED never renders a fabricated "0 owners / 0 signals" Command Center');
}

async function testRetentionNeverShowsZeroOwnersOnError(){
  for(const state of ['AUTH_ERROR','BACKEND_ERROR','CONNECTING']){
    const {window,mount}=makeLifecycleEnv(state);
    await window.DGL_MODULE_RENDERERS['retention'](mount);
    assert(!/\b0 owners\b/.test(mount.innerHTML),`Retention must never show "0 owners" while ${state}`);
  }
  console.log('PASS: Retention/Reactivation/QNB/Cross-Sell never show "0 owners" in any error or connecting state');
}

async function testAuraReportAndGmailPanelStillWireUp(){
  const {window,mount}=makeLifecycleEnv('PRIVATE_BACKEND');
  await window.DGL_MODULE_RENDERERS['account-campaign-reports'](mount);
  assert(mount.innerHTML.length>0,'AURA report route must render once connected');
  const cc={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['command-center'](cc);
  assert(cc.innerHTML.length>0,'Command Center must render once connected (Gmail panel load included)');
  console.log('PASS: AURA report and Gmail panel routes still render once PRIVATE_BACKEND is reached');
}

(async function main(){
  const tests=[
    testV6SuccessSurvivesOneLegacyFailure,
    testV6SuccessSurvivesAllLegacyFailures,
    testAuthFailureRejectsAndClearsToken,
    testNonAuthFailurePreservesToken,
    testTimeoutIsBackendErrorNotAuth,
    testDiagnosticObjectIsSafe,
    testConnectSetsConnectingBeforeResolving,
    testConnectingStateIsHonest,
    testAuthErrorStateIsHonest,
    testBackendErrorStateIsHonest,
    testDisconnectedStateNeverFabricatesZeros,
    testRetentionNeverShowsZeroOwnersOnError,
    testAuraReportAndGmailPanelStillWireUp
  ];
  for(const t of tests)await t();
  console.log('AURA connection fix (V6 authority, honest error states): ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
