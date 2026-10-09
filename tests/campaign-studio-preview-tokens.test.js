// Campaign Studio V6 (2026-10-09): the preview iframe shows sample values for {{firstName}} and
// {{company}} while the approved HTML keeps the tokens; governance states carry a plain-language
// explanation; the QA fixture rejects Studio write actions explicitly (no simulated approval).
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),ID='CMP-CAMPANA-A-HA-PRIORITARIA';
function browser(adapter){
  const window={location:{hash:'#/campaign-studio?campaignId='+ID},addEventListener(){},history:{replaceState(){}},DGL_MARKETING_BACKEND_ADAPTER_V55:adapter};
  const b={window,document:{getElementById:()=>null,addEventListener(){},head:null},URLSearchParams,setTimeout,clearTimeout,console,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
  window.document=b.document;vm.createContext(b);
  ['creative-library-v5','creative-render-v5','copy-engine-v5','campaign-studio-v6'].forEach(n=>vm.runInContext(fs.readFileSync(path.join(root,'assets/js',n+'.js'),'utf8'),b,{filename:n+'.js'}));
  return {window,b};
}
(async()=>{
  // 1. Studio with the QA fixture: preview tokens resolved, approved HTML untouched, states explained.
  const {window,b}=browser({});
  b.document.addEventListener=()=>{};
  vm.runInContext(fs.readFileSync(path.join(root,'tools/growth-qa/fixture-adapter.js'),'utf8'),b,{filename:'fixture-adapter.js'});
  const A=window.DGL_MARKETING_BACKEND_ADAPTER_V55,S=window.DGL_CAMPAIGN_STUDIO_V6;
  const frame={srcdoc:''},help={textContent:''};
  const ws={innerHTML:'',querySelector:s=>s==='[data-preview]'?frame:s==='[data-status-help]'?help:null,querySelectorAll:()=>[]};
  await S.render(ws,ID);
  const m=S.getState();
  for(const l of ['ES','EN']){
    S.selectLanguage(m,l);
    const html=S.previewHtml(m);
    assert(/\{\{company\}\}|\{\{firstName\}\}/.test(html),l+': approved/preview source keeps the tokens');
    const shown=S.sampleMerge(html);
    assert(!/\{\{(company|firstName)\}\}/.test(shown),l+': iframe shows no unresolved tokens');
    assert(/ABC Logistics|Laura/.test(shown),l+': sample values shown');
  }
  assert(!/\{\{(company|firstName)\}\}/.test(frame.srcdoc)&&frame.srcdoc.length>0,'workspace iframe receives the sample-merged HTML');
  assert(ws.innerHTML.includes('data-sample-note'),'sample values are labelled');
  console.log('PASS preview resolves {{firstName}}/{{company}} with sample values; approved HTML keeps tokens');
  S.selectLanguage(m,'ES');
  const text=S.statusHelp(m);
  assert(/Creative set PENDING/.test(text)&&/Still missing: ES \/ EN/.test(text)&&/ES variant UNAPPROVED/.test(text),'PENDING / UNAPPROVED explained');
  assert(ws.innerHTML.includes('data-status-help'),'explanation rendered in Governance');
  console.log('PASS PENDING / UNAPPROVED states explained in plain language');
  // 2. QA fixture: write actions fail with an explicit message; nothing is approved.
  for(const k of ['approveCreative','approveCreativeSet','campaignStudioTestDraft','revokeApprovedCreative']){
    await assert.rejects(()=>A[k](ID,{}),e=>/backend privado/.test(e.message)&&!/unauthoriz|forbidden|invalid token|token required/i.test(e.message),k+' rejects explicitly');
  }
  assert(!S.getState().variants.ES.approved,'no approval simulated');
  console.log('PASS QA fixture rejects Studio write actions explicitly, no simulated approval');
  console.log('3/3 Campaign Studio preview-token checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
