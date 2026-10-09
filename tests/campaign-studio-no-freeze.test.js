// Regression: Campaign Studio must not re-render in a loop when the context call fails and the
// backend adapter emits "dgl:v55-backend-change" from inside the render (froze the page:
// "La página no responde"). Also: a real connect transition still re-renders once.
const assert=require('assert'),fs=require('fs'),vm=require('vm');
function load(studioSrc){
  const listeners={},calls={context:0};
  const window={location:{hash:'#/campaign-studio?campaignId=CMP-X'},addEventListener:(t,f)=>{(listeners[t]=listeners[t]||[]).push(f);},dispatchEvent:e=>{(listeners[e.type]||[]).forEach(f=>f(e));}};
  const b={window,URLSearchParams,setTimeout,clearTimeout,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},CustomEvent:class{constructor(t,i){this.type=t;this.detail=i&&i.detail;}},Image:class{set src(v){this.complete=true;this.naturalWidth=184;}}};
  vm.createContext(b);
  ['creative-library-v5','creative-render-v5','copy-engine-v5'].forEach(n=>vm.runInContext(fs.readFileSync('assets/js/'+n+'.js','utf8'),b));
  window.DGL_MARKETING_BACKEND_ADAPTER_V55={isConnected:()=>true,campaignStudioList:async()=>({campaigns:[]}),
    campaignStudioContext:async()=>{calls.context++;if(calls.context>60)return new Promise(()=>{});window.dispatchEvent(new b.CustomEvent('dgl:v55-backend-change',{detail:{state:'PRIVATE_BACKEND'}}));throw new Error('Private backend token required');}};
  vm.runInContext(studioSrc,b);
  return {window,calls,b};
}
const mount=()=>({innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]});
(async()=>{
  let n=0;const ok=m=>{n++;console.log('PASS '+m);};
  const cur=load(fs.readFileSync('assets/js/campaign-studio-v6.js','utf8'));
  const m=mount();await cur.window.DGL_MODULE_RENDERERS['campaign-studio'](m);await new Promise(r=>setTimeout(r,50));
  assert.equal(cur.calls.context,1,'context requested once, no re-render loop');assert(/Private backend token required/.test(m.innerHTML),'error shown to the user');
  ok('failing context + backend-change event: one request, error shown, no loop');
  cur.window.dispatchEvent(new cur.b.CustomEvent('dgl:v55-backend-change',{detail:{state:'AUTH_ERROR'}}));
  cur.window.dispatchEvent(new cur.b.CustomEvent('dgl:v55-backend-change',{detail:{state:'PRIVATE_BACKEND'}}));
  await new Promise(r=>setTimeout(r,50));
  assert.equal(cur.calls.context,2,'a genuine transition to connected re-renders exactly once');
  ok('real reconnect still refreshes Studio exactly once');
  console.log(n+'/'+n+' Campaign Studio no-freeze checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
