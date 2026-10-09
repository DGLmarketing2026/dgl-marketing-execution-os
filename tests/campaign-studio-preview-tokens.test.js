// Campaign Studio V6 (2026-10-09): Audiencia → Diseño → Vista previa → Aprobación.
// The personalized preview fills {{firstName}}/{{company}} ONLY from a contact record in the
// campaign context; without one the tokens are shown as marked placeholders (never invented).
// The approved HTML keeps the tokens; states and connection errors are explained without
// changing their codes; the QA fixture rejects Studio write actions (no simulated approval).
const assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..'),ID='CMP-CAMPANA-A-HA-PRIORITARIA';
function browser(adapter){
  const window={location:{hash:'#/campaign-studio?campaignId='+ID},addEventListener(){},history:{replaceState(){}},DGL_MARKETING_BACKEND_ADAPTER_V55:adapter};
  const b={window,document:{getElementById:()=>null,addEventListener(){},head:null},URLSearchParams,setTimeout,clearTimeout,console,sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}};
  window.document=b.document;vm.createContext(b);
  ['creative-library-v5','creative-render-v5','copy-engine-v5','campaign-studio-v6'].forEach(n=>vm.runInContext(fs.readFileSync(path.join(root,'assets/js',n+'.js'),'utf8'),b,{filename:n+'.js'}));
  return {window,b};
}
function workspace(){const frame={srcdoc:''};return {frame,ws:{innerHTML:'',querySelector:s=>s==='[data-preview]'?frame:null,querySelectorAll:()=>[]}};}
(async()=>{
  let n=0;const ok=m=>{n++;console.log('PASS '+m);};
  // 1. QA fixture: synthetic contact record → tokens resolved in the iframe only.
  const {window,b}=browser({});
  vm.runInContext(fs.readFileSync(path.join(root,'tools/growth-qa/fixture-adapter.js'),'utf8'),b,{filename:'fixture-adapter.js'});
  const A=window.DGL_MARKETING_BACKEND_ADAPTER_V55,S=window.DGL_CAMPAIGN_STUDIO_V6;
  const {frame,ws}=workspace();
  await S.render(ws,ID);
  const m=S.getState();
  for(const l of ['ES','EN']){
    S.selectLanguage(m,l);
    const html=S.previewHtml(m);
    assert(/\{\{company\}\}/.test(html),l+': approved/preview source keeps the tokens');
    const shown=S.personalizePreview(html,S.previewRecipient(m));
    assert(!/\{\{(company|firstName)\}\}|\[Empresa\]|\[Nombre\]/.test(shown)&&shown.includes('Empresa Demo QA'),l+': company resolved from the contact record');
  }
  assert(frame.srcdoc.includes('Empresa Demo QA')&&!/\{\{\w+\}\}/.test(frame.srcdoc),'iframe receives the personalized HTML');
  assert(ws.innerHTML.includes('Personalizada para')&&ws.innerHTML.includes('contacto sintético de QA'),'source of the personalization is shown');
  ok('{{company}} resolved in the personalized preview from the (synthetic QA) contact record; approved HTML keeps tokens');
  // 2. No verified contact data: marked placeholders, never invented values; partial data stays partial.
  const html=S.previewHtml(m),none=S.personalizePreview(html,null),partial=S.personalizePreview('<title>{{company}}</title><p title="{{company}}">{{firstName}}, {{company}}</p>',{firstName:'Ana'});
  assert(partial.startsWith('<title>[Empresa]</title><p title="[Empresa]">Ana, <mark'),'no markup inside <title> or attributes');
  assert(!/\{\{(company|firstName)\}\}/.test(none)&&none.includes('<mark')&&none.includes('[Empresa]')&&!/Laura|ABC Logistics|Empresa Demo/.test(none),'placeholders only');
  assert(partial.includes('Ana')&&partial.includes('[Empresa]'),'a missing company stays a placeholder');
  const ctxNoRecipient=Object.assign({},m.context,{previewRecipient:undefined});
  assert.equal(S.previewRecipient({context:ctxNoRecipient}),null);
  ok('without verified data the variables are shown as marked placeholders');
  // 3. Flow, technical details and plain-language states (codes unchanged).
  ['Audiencia','Diseño','Vista previa','Aprobación'].forEach(s=>assert(ws.innerHTML.includes(s),'step '+s));
  assert(/<details class="cs6-panel cs6-tech"[^>]*><summary>Detalles técnicos<\/summary>[\s\S]*CMP-CAMPANA-A-HA-PRIORITARIA[\s\S]*Design selected automatically/.test(ws.innerHTML),'technical info inside the expandable panel');
  S.selectLanguage(m,'ES');
  assert.equal(S.variantStatus(m.variants.ES),'UNAPPROVED','state code unchanged');
  const help=S.statusHelp(m);
  assert(/aún no está aprobado/.test(help)&&/Falta: ES \/ EN/.test(help)&&/Nadie ha aprobado todavía la variante ES/.test(help),'PENDING / UNAPPROVED explained');
  assert(ws.innerHTML.includes('<code>PENDING</code>')&&ws.innerHTML.includes('<code>UNAPPROVED</code>'),'codes still visible next to the explanation');
  const auth=S.friendlyError('PRIVATE BACKEND AUTHENTICATION FAILED');
  assert(/token falta o fue rechazado/.test(auth)&&auth.includes('PRIVATE BACKEND AUTHENTICATION FAILED'),'connection error explained, original kept');
  ok('4-step flow, "Detalles técnicos" panel, states and connection errors explained');
  // 4. QA fixture: write actions fail with an explicit message; nothing is approved.
  for(const k of ['approveCreative','approveCreativeSet','campaignStudioTestDraft','revokeApprovedCreative']){
    await assert.rejects(()=>A[k](ID,{}),e=>/backend privado/.test(e.message)&&!/unauthoriz|forbidden|invalid token|token required/i.test(e.message),k+' rejects explicitly');
  }
  assert(!S.getState().variants.ES.approved,'no approval simulated');
  ok('QA fixture rejects Studio write actions explicitly, no simulated approval');
  console.log(n+'/'+n+' Campaign Studio preview checks passed');
})().catch(e=>{console.error(e);process.exit(1);});
