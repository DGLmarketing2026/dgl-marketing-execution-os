const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/js/lifecycle-modules-v6.js'),'utf8');

const RECOVERY_OWNERS_EXPECTED=["Alejandro Ochoa","Alex Cifuentes","Ali Pirela","Andres Bernal","Andy J. McNelly","Caroline Salamanca","Cindy Ave","Cristian Serna","DGL Accounts","Daniel Martin","David Cuestas","Fabian Lopez","German Cano","House Account","Juan Rodriguez","Juan Ruiz","Luis Simoes","Manuel Arias","Mateo Matallana","Nicolas Monroy","Santiago Villegas","Sebastian Crespo","Tatiana Lozano","Valentina Rico"];

function load(){
  const listeners={};
  const window={
    DGL_MODULE_RENDERERS:{},
    document:{addEventListener:(n,fn)=>{listeners[n]=listeners[n]||[];listeners[n].push(fn);},createElement:()=>({textContent:''}),head:{appendChild(){}}},
    location:{hash:'#/campaign-opportunities'},
    sessionStorage:(()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)};})(),
    DGL_MARKETING_BACKEND_ADAPTER_V55:null // disconnected: forces the recovery path
  };
  vm.runInNewContext(source,{window,document:window.document,sessionStorage:window.sessionStorage,console,Set,Map,Object,Array,String,Number,Date});
  return {window,listeners};
}

(function testAllOwnersPresent(){
  const {window}=load();
  RECOVERY_OWNERS_EXPECTED.forEach(name=>assert(source.includes(`"${name}"`),`RECOVERY_OWNERS must include ${name}`));
  console.log('PASS: all 24 governed AM owners are present in the Safe Data Hub recovery snapshot');
})();

(async function testRecoveryRendersWhenDisconnected(){
  const {window}=load();
  const container={innerHTML:''};
  await window.DGL_MODULE_RENDERERS['campaign-opportunities'](container);
  assert(container.innerHTML.includes('SAFE DATA HUB RECOVERY'),'must show the Safe Data Hub Recovery banner when V6 live is disconnected');
  assert(container.innerHTML.includes('24 owners detected automatically'),'owner toolbar must reflect all 24 recovered owners');
  RECOVERY_OWNERS_EXPECTED.slice(0,3).forEach(name=>assert(container.innerHTML.includes(name),`recovered owner ${name} must appear in the owner selector`));
  assert(!container.innerHTML.includes('Private backend required'),'recovery must render real aggregates instead of the empty "private backend required" state');
  console.log('PASS: Campaign Opportunities renders Safe Data Hub Recovery with all 24 owners when disconnected');
})().then(()=>{

// --- No PII in the recovery snapshot: only owner + aggregate counts ---
(function testNoPiiInRecovery(){
  assert(!/accountName|contactName|contactId|accountId/.test(source.match(/RECOVERY_[A-Z_]+_RAW=\[[\s\S]*?\];/g)?.join('')||''),'recovery snapshot arrays must never carry account/contact identifiers');
  assert(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(source),'lifecycle module source must not contain email addresses');
  console.log('PASS: Safe Data Hub recovery snapshot carries only owner-level aggregates, no account/contact PII');
})();

// --- Recovery is scoped to Campaign Opportunities only (per explicit instruction) ---
(function testScopedToOpportunitiesOnly(){
  assert(source.includes('R["campaign-opportunities"]=campaignOpportunitiesView'),'campaign-opportunities must use the dedicated recovery-aware view');
  assert(source.includes('R["retention"]=c=>scopeView('),'other Existing Account Growth routes must keep using the standard (non-recovery) scopeView');
  console.log('PASS: Safe Data Hub recovery is scoped to Campaign Opportunities; other AM routes are unaffected');
})();

console.log('Lifecycle Safe Data Hub recovery: ALL PASS');
}).catch(e=>{console.error(e);process.exitCode=1;});
