(function(g){
"use strict";
const KEY="dgl_v5_campaign_context";
const LOGO="https://dglmarketing2026.github.io/dgl-marketing-execution-os/assets/brand/dgl-logo-white.png";
const LANGUAGES=["ES","EN","PT"],FIELDS=["subjectA","subjectB","preheader","headline","body","body2","cta"];
const E=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const api=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55;
const Lib=()=>g.DGL_CREATIVE_LIBRARY_V5,Render=()=>g.DGL_CREATIVE_RENDER_V5;
// AURA intake: the ONLY campaign-level question Marketing answers. Everything else (per-contact
// language, premium visual system, family copy and CTA) is resolved automatically from it.
const INTAKE_QUESTION="WHAT TYPE OF CAMPAIGN IS THIS?",INTAKE_OPTIONS=["ACTIVATION","RETENTION","REACTIVATION","QUOTED_NOT_BOOKED","CROSS_SELL"];
const INTAKE_BY_OBJECTIVE={"Activation":"ACTIVATION","Retention":"RETENTION","Reactivation":"REACTIVATION","Quoted Not Booked":"QUOTED_NOT_BOOKED","Cross-Sell":"CROSS_SELL"};
function objectiveOf(context){return Lib().normalizeObjective(context.objective||context.campaignType);}
function selectionFor(context){return Render().selection({objective:objectiveOf(context),service:context.service,angle:context.messageAngle});}
function autoSystem(context){return selectionFor(context).systemId;}
function validSystem(id){return !!(id&&Lib().CREATIVE_SYSTEMS[id]);}
let model=null,mount=null,epoch=0;
function navigationId(){
  const q=new URLSearchParams((g.location.hash||"").split("?")[1]||"");
  if(q.has("campaignId"))return q.get("campaignId")||"";
  return "";
}
function createModel(context){
  const m={context:Object.freeze({...context}),language:(context.requiredLanguages||[])[0]||"ES",layout:autoSystem(context),selection:selectionFor(context),variants:{},brand:null,busy:false,error:"",pendingRevokes:new Set()};
  LANGUAGES.forEach(language=>{
    const approved=context.approvedCreativeVariants?.[language];
    m.variants[language]={copy:g.DGL_COPY_ENGINE_V5.generate({objective:objectiveOf(context),service:context.service,angle:context.messageAngle,language,qnbWindow:context.qnbWindow,ctaIntent:g.DGL_CREATIVE_LIBRARY_V5?.OBJECTIVES?.[objectiveOf(context)]?.defaultCta}),dirty:!approved,testDraftStatus:context.testDraftStatus?.[language]||(approved?"APPROVED / TEST DRAFT REQUIRED":"UNAPPROVED"),approved:!!approved,...(approved||{})};
  });return m;
}
function selectLanguage(m,language){if(!LANGUAGES.includes(language))throw Error("Unsupported language");m.language=language;}
async function revoke(m,languages){
  const ids=[];
  // Resolve latest backend approvals too: another tab may have approved since this view loaded.

  languages.forEach(l=>{
    const v=m.variants[l];if(v.creativeId)m.pendingRevokes.add(v.creativeId);
    v.dirty=true;v.approved=false;v.storedHtml=null;v.storedText=null;
    if(v.testDraftStatus==="CREATED"||v.testDraftStatus==="TEST DRAFT VERIFIED")v.testDraftStatus="STALE AFTER EDIT";
    ["creativeId","creativeVersion","approvalId","htmlChecksum","contentChecksum"].forEach(k=>delete v[k]);
  });
  m.context=Object.freeze({...m.context,creativeSetStatus:"PENDING",approvalStatus:"PENDING"});
  if(api().campaignStudioContext){const current=await api().campaignStudioContext(m.context.campaignId);languages.forEach(l=>{const id=current.approvedCreativeVariants?.[l]?.creativeId;if(id)m.pendingRevokes.add(id);});}
  for(const id of m.pendingRevokes)ids.push(id);
  for(const id of ids){await api().revokeApprovedCreative(id,"Marketing");m.pendingRevokes.delete(id);}
}
async function editCopy(m,field,value){if(!FIELDS.includes(field))return;const language=m.language,v0=m.variants[language];v0.copy[field]=value;if(v0.dirty&&!v0.approved&&!v0.creativeId&&!m.pendingRevokes.size)return;const pending=revoke(m,[language]),current=Promise.all([m.revoking?m.revoking.catch(()=>{}):Promise.resolve(),pending]);m.revoking=current;try{await current;}finally{if(m.revoking===current)m.revoking=null;}}
async function changeLayout(m,value){if(!validSystem(value))throw Error("Unknown DGL visual system");m.layout=value;await revoke(m,LANGUAGES);}
const CTA_SUBJECT={ES:"Requerimiento terrestre",PT:"Requerimento terrestre",EN:"Ground freight requirement"};
// ONE governed renderer: the existing premium DGL visual systems (creative-render-v5.js), with the
// visual system auto-selected from the campaign family. Tokens stay unmerged so the approved HTML
// is exactly what AURA later token-merges per recipient -- never redesigned downstream.
function emailHtml(m,language=m.language){
  const v=m.variants[language];if(v.storedHtml&&!v.dirty)return v.storedHtml;
  const c=m.context,objective=objectiveOf(c),service=Lib().SERVICES[c.service]||Lib().SERVICES.Multiservicio;
  const strategy={creativeSystem:m.layout,objective,service:c.service,angle:c.messageAngle,lane:c.lane||"",heroUrl:"",logoUrl:LOGO,serviceDisplay:objective==="Activation"?service.descriptor:undefined};
  return Render().render(strategy,v.copy,{ctaSubject:CTA_SUBJECT[language]});
}
function validateBrand(){
  return new Promise((resolve,reject)=>{
    const img=new Image(),timer=setTimeout(()=>reject(Error("Logo load timed out")),15000);
    img.onload=()=>{clearTimeout(timer);if(img.src!==LOGO||!img.complete||img.naturalWidth<=0)return reject(Error("Canonical logo failed validation"));resolve({url:img.src,naturalWidth:img.naturalWidth});};
    img.onerror=()=>{clearTimeout(timer);reject(Error("Canonical logo did not load"));};img.src=LOGO;
  });
}
function payload(m){
  const v=m.variants[m.language],c=v.copy;
  return {creativeId:v.creativeId,creativeVersion:v.creativeVersion,approvalId:v.approvalId,contentChecksum:v.contentChecksum,htmlChecksum:v.htmlChecksum,language:m.language,subject:c.subjectA,preheader:c.preheader,htmlBody:emailHtml(m),textBody:!v.dirty&&v.storedText!=null?v.storedText:[c.headline,c.body,c.body2,c.cta].join("\n\n"),templateId:m.layout,logoUrl:LOGO,heroUrl:"",approvedBy:"Marketing",creativeCopy:c,brandValidation:m.brand};
}
async function run(action){
  const m=model;if(!m||m.busy)return;m.busy=true;m.error="";draw();
  try{
    await (m.revoking||Promise.resolve());
    for(const id of [...m.pendingRevokes]){await api().revokeApprovedCreative(id,"Marketing");m.pendingRevokes.delete(id);}
    m.brand=await validateBrand();
    const c=await api().campaignStudioContext(m.context.campaignId);
    if(!c.audienceResolved)throw Error("Audience unresolved: approval and test drafts blocked.");
    m.context=Object.freeze({...c});
    if(action==="variant"){
      const record=await api().approveCreative(c.campaignId,payload(m));
      if(!record?.creativeId||!record.approvalId||!record.contentChecksum||!record.htmlChecksum||!(record.creativeVersion>0))throw Error("Incomplete approval record");
      Object.assign(m.variants[m.language],record,{approved:true,dirty:false,testDraftStatus:"APPROVED / TEST DRAFT REQUIRED"});
      m.context=Object.freeze(await api().campaignStudioContext(c.campaignId));
    }else if(action==="set"){
      m.context=Object.freeze(await api().approveCreativeSet(c.campaignId));
    }else if(action==="draft"){
      await api().campaignStudioTestDraft(c.campaignId,payload(m));
      m.context=Object.freeze(await api().campaignStudioContext(c.campaignId));
      const v=m.variants[m.language],e=m.context.testDraftVerifications?.[m.language];
      if(!e||e.creativeId!==v.creativeId||String(e.creativeVersion)!==String(v.creativeVersion)||String(e.contentChecksum)!==String(v.contentChecksum))throw Error("Test draft verification is missing or stale.");
      v.testDraftStatus="TEST DRAFT VERIFIED";
    }
  }catch(e){m.error=e.message||String(e);}finally{m.busy=false;if(model===m)draw();}
}
function variantStatus(v){if(v.legacyTemplate&&!v.approved)return "LEGACY DESIGN · NEW PREMIUM PREVIEW";return v.testDraftStatus==="STALE AFTER EDIT"?"STALE AFTER EDIT":!v.approved?"UNAPPROVED":v.testDraftStatus==="TEST DRAFT VERIFIED"?"TEST DRAFT VERIFIED":"APPROVED / TEST DRAFT REQUIRED";}
function canApproveSet(m){
  const c=m.context;return c.audienceResolved&&c.requiredLanguages?.length>0&&c.requiredLanguages.every(l=>{
    const v=m.variants[l],e=c.testDraftVerifications?.[l];
    return v.approved&&!v.dirty&&(!c.testDraftReviewRequired||(v.testDraftStatus==="TEST DRAFT VERIFIED"&&e&&e.creativeId===v.creativeId&&String(e.creativeVersion)===String(v.creativeVersion)&&String(e.contentChecksum)===String(v.contentChecksum)));
  });
}
// Approval actions always act on the committed system (m.layout). While Marketing is only
// inspecting another system in the gallery, they stay disabled so the approved HTML is always
// exactly the HTML in the preview.
function actionDisabled(m,a){return m.busy||!m.context.audienceResolved||(m.inspect&&m.inspect!==m.layout)||(a==="set"&&!canApproveSet(m))||(a==="draft"&&(!m.variants[m.language].approved||m.variants[m.language].dirty));}
// The preview is ALWAYS the renderer's real HTML: the governed emailHtml() for the committed
// system, or the same renderer for a system being inspected (never approved from there).
function previewHtml(m,language=m.language){
  if(!m.inspect||m.inspect===m.layout)return emailHtml(m,language);
  return emailHtml({...m,layout:m.inspect,variants:{...m.variants,[language]:{...m.variants[language],storedHtml:null,dirty:true}}},language);
}

// ---------- Layout / styles (scoped, injected once) ----------
const CSS=`.cs6{--cs6-gap:20px;color:var(--text,#fff)}.cs6 *{box-sizing:border-box}
.cs6-head{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:14px;margin-bottom:18px}
.cs6-head h2{margin:4px 0 0;font-size:22px;line-height:1.2}.cs6-eyebrow{font-size:11px;letter-spacing:1.6px;font-weight:800;color:var(--secondary,#77B82A)}
.cs6-muted{color:var(--text-secondary,#AAB3C5);font-size:13px}
.cs6-panel{background:var(--card,#1A2236);border:1px solid var(--border,rgba(255,255,255,.08));border-radius:12px;padding:16px}
.cs6-filters{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:10px;margin-bottom:12px}
.cs6-filters input,.cs6-filters select,.cs6-field textarea{width:100%;min-width:0;background:rgba(255,255,255,.04);color:inherit;border:1px solid var(--border-strong,rgba(255,255,255,.14));border-radius:8px;padding:10px 12px;font:inherit;font-size:13px}
.cs6-filters select option{color:#111}
.cs6-list{list-style:none;margin:0;padding:0;max-height:62vh;overflow:auto;border-top:1px solid var(--border,rgba(255,255,255,.08))}
.cs6-row{display:grid;grid-template-columns:minmax(0,2.4fr) repeat(4,minmax(0,1fr));gap:10px;align-items:center;width:100%;padding:11px 10px;border:0;border-bottom:1px solid var(--border,rgba(255,255,255,.08));background:none;color:inherit;text-align:left;font:inherit;font-size:13px;cursor:pointer}
.cs6-row:hover,.cs6-row:focus-visible{background:rgba(119,184,42,.08);outline:none}.cs6-row.is-active{background:rgba(119,184,42,.14)}
.cs6-row strong{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.cs6-row span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-secondary,#AAB3C5)}
.cs6-rowhead{cursor:default;font-size:11px;letter-spacing:1px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-rowhead:hover{background:none}
.cs6-count{font-size:12px;color:var(--text-secondary,#AAB3C5);margin:0 0 8px}
.cs6-ws{display:grid;grid-template-columns:minmax(0,1fr) 736px;gap:var(--cs6-gap);align-items:start}
.cs6-col{display:grid;gap:16px;min-width:0}
.cs6-kv{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0}.cs6-kv div{min-width:0}.cs6-kv dt{font-size:10.5px;letter-spacing:1px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-kv dd{margin:4px 0 0;font-size:13.5px;font-weight:700;overflow-wrap:anywhere}
.cs6-tabs{display:flex;gap:8px;flex-wrap:wrap}
.cs6-tab{flex:1 1 0;min-width:0;padding:9px 10px;border-radius:8px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:rgba(255,255,255,.03);color:inherit;font:inherit;font-size:12px;cursor:pointer;text-align:left}
.cs6-tab b{display:block;font-size:13px}.cs6-tab small{display:block;color:var(--text-secondary,#AAB3C5);font-size:10.5px;white-space:normal}
.cs6-tab[aria-selected="true"],.cs6-sys[aria-pressed="true"]{border-color:var(--secondary,#77B82A);background:rgba(119,184,42,.14)}
.cs6-systems{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.cs6-sys{padding:10px;border-radius:8px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:rgba(255,255,255,.03);color:inherit;font:inherit;font-size:12px;text-align:left;cursor:pointer;min-width:0}
.cs6-sys b{display:block;font-size:12.5px}.cs6-sys small{display:block;color:var(--text-secondary,#AAB3C5);font-size:10.5px}
.cs6-badge{display:inline-block;padding:2px 7px;border-radius:99px;background:var(--secondary,#77B82A);color:#06210a;font-size:9.5px;font-weight:900;letter-spacing:.6px;margin-left:4px;vertical-align:middle}
.cs6-why{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:var(--text-secondary,#AAB3C5)}.cs6-why strong{color:var(--text,#fff)}
.cs6-inspect{margin-top:10px;padding:10px 12px;border:1px dashed var(--warning,#F59E0B);border-radius:8px;font-size:12.5px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.cs6-field{display:block;margin-bottom:10px;font-size:11px;letter-spacing:.8px;font-weight:800;color:var(--muted,#6B7280);text-transform:uppercase}.cs6-field textarea{display:block;margin-top:5px;min-height:46px;resize:vertical;text-transform:none;letter-spacing:0;font-weight:400;color:var(--text,#fff)}
.cs6-actions{display:flex;gap:8px;flex-wrap:wrap}.cs6-actions .btn{flex:1 1 auto}
.cs6-gov{display:grid;gap:6px;font-size:12.5px}.cs6-gov div{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid var(--border,rgba(255,255,255,.08));padding-bottom:6px}.cs6-gov span:last-child{font-weight:700;text-align:right}
.cs6-previewcol{position:sticky;top:12px}
.cs6-previewbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:10px}
.cs6-device{display:flex;gap:6px}.cs6-device button{padding:6px 10px;border-radius:6px;border:1px solid var(--border-strong,rgba(255,255,255,.14));background:none;color:inherit;font:inherit;font-size:11.5px;cursor:pointer}.cs6-device button[aria-pressed="true"]{border-color:var(--secondary,#77B82A);color:var(--secondary,#77B82A)}
.cs6-frame{display:block;margin:0 auto;width:100%;max-width:704px;height:1180px;border:0;border-radius:10px;background:#F3F5F7}.cs6-frame.is-mobile{max-width:390px;height:1460px}
.cs6-alert{color:var(--danger,#EF4444);font-size:13px;min-height:1px;margin:0}
.cs6-back{white-space:nowrap}
@media (max-width:1359px){.cs6-ws{grid-template-columns:minmax(0,1fr)}.cs6-previewcol{position:static;order:-1}}
@media (max-width:760px){.cs6-filters{grid-template-columns:1fr 1fr}.cs6-filters input{grid-column:1/-1}.cs6-row{grid-template-columns:minmax(0,1fr) auto;gap:4px 10px}.cs6-row span{font-size:12px}.cs6-row .cs6-hide-m,.cs6-rowhead{display:none}.cs6-kv{grid-template-columns:1fr 1fr}.cs6-systems{grid-template-columns:1fr 1fr}.cs6-frame{height:1500px}.cs6-head h2{font-size:19px}}`;
function ensureStyles(){
  const d=g.document;if(!d||!d.head||d.getElementById("cs6-styles"))return;
  const s=d.createElement("style");s.id="cs6-styles";s.textContent=CSS;d.head.appendChild(s);
}

// ---------- Session caches (performance) ----------
// The campaign list is loaded once per session; each campaign context once per module visit.
// Approvals/test drafts always re-fetch the authoritative context inside run().
const cache={list:null,listPromise:null,contexts:new Map()};
const LIST_KEY="dgl_cs6_campaign_list_v1";
function readListCache(){try{const raw=g.sessionStorage?.getItem(LIST_KEY);return raw?JSON.parse(raw):null;}catch(_){return null;}}
function writeListCache(list){try{g.sessionStorage?.setItem(LIST_KEY,JSON.stringify(list));}catch(_){}}
function normalizeCampaign(c){
  const objective=Lib().normalizeObjective(c.objective||c.campaignType||"")||"";
  return {campaignId:String(c.campaignId||""),campaignName:String(c.campaignName||c.campaignId||""),objective:String(objective||""),service:String(c.service||""),owner:String(c.amOwner||c.owner||c.accountManager||""),status:String(c.status||"")};
}
async function loadCampaignList(force){
  if(!force&&cache.list)return cache.list;
  if(!force){const stored=readListCache();if(stored){cache.list=stored;return stored;}}
  if(!cache.listPromise)cache.listPromise=api().campaignStudioList().then(r=>{const list=(r.campaigns||[]).map(normalizeCampaign).filter(c=>c.campaignId);cache.list=list;writeListCache(list);return list;}).finally(()=>{cache.listPromise=null;});
  return cache.listPromise;
}
const view={q:"",objective:"",service:"",owner:"",status:"",device:"desktop"};
function uniq(list,k){return [...new Set(list.map(c=>c[k]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function filterCampaigns(list,f=view){
  const q=String(f.q||"").trim().toLowerCase();
  return list.filter(c=>(!q||[c.campaignName,c.campaignId,c.objective,c.service,c.owner].join(" ").toLowerCase().includes(q))&&(!f.objective||c.objective===f.objective)&&(!f.service||c.service===f.service)&&(!f.owner||c.owner===f.owner)&&(!f.status||c.status===f.status));
}
function selectorHtml(list,activeId){
  const opt=(k,label)=>'<select data-filter="'+k+'" aria-label="'+label+'"><option value="">'+label+': all</option>'+uniq(list,k).map(v=>'<option'+(view[k]===v?' selected':'')+'>'+E(v)+'</option>').join("")+'</select>';
  return '<section class="cs6-panel" data-selector><div class="cs6-filters"><input type="search" data-search placeholder="Search campaigns by name, ID, objective, service or owner" aria-label="Search campaigns" value="'+E(view.q)+'">'+opt("objective","Objective")+opt("service","Service")+opt("owner","Owner")+opt("status","Status")+'</div>'+
    '<p class="cs6-count" data-count></p><ul class="cs6-list" role="listbox" aria-label="Campaigns" data-list>'+listRowsHtml(list,activeId)+'</ul></section>';
}
function listRowsHtml(list,activeId){
  const rows=filterCampaigns(list);
  return '<li><div class="cs6-row cs6-rowhead"><span>Campaign</span><span>Objective</span><span class="cs6-hide-m">Service</span><span class="cs6-hide-m">Owner</span><span class="cs6-hide-m">Status</span></div></li>'+
    (rows.length?rows.map(c=>'<li><button type="button" role="option" class="cs6-row'+(c.campaignId===activeId?' is-active':'')+'" data-campaign="'+E(c.campaignId)+'" aria-selected="'+(c.campaignId===activeId)+'"><strong title="'+E(c.campaignName)+'">'+E(c.campaignName)+'</strong><span>'+E(c.objective||"—")+'</span><span class="cs6-hide-m">'+E(c.service||"—")+'</span><span class="cs6-hide-m">'+E(c.owner||"—")+'</span><span class="cs6-hide-m">'+E(c.status||"—")+'</span></button></li>').join(""):'<li class="cs6-muted" style="padding:14px 10px">No campaigns match these filters.</li>');
}
function bindSelector(root,list,activeId){
  const listEl=root.querySelector("[data-list]"),count=root.querySelector("[data-count]");
  const refresh=()=>{if(listEl)listEl.innerHTML=listRowsHtml(list,activeId);if(count)count.textContent=filterCampaigns(list).length+" of "+list.length+" campaigns";bindRows();};
  const bindRows=()=>root.querySelectorAll("[data-campaign]").forEach(b=>b.onclick=()=>openCampaign(b.dataset.campaign));
  const search=root.querySelector("[data-search]");if(search)search.oninput=()=>{view.q=search.value;refresh();};
  root.querySelectorAll("[data-filter]").forEach(s=>s.onchange=()=>{view[s.dataset.filter]=s.value;refresh();});
  refresh();
}
function openCampaign(id){
  // In-place navigation: update the URL without triggering the app router's full module reload.
  const hash="#/campaign-studio?campaignId="+encodeURIComponent(id);
  try{g.history?.replaceState?g.history.replaceState(null,"",hash):(g.location.hash=hash);}catch(_){g.location.hash=hash;}
  return render(mount,id);
}
function backToList(){
  try{g.history?.replaceState?g.history.replaceState(null,"","#/campaign-studio"):(g.location.hash="#/campaign-studio");}catch(_){}
  return render(mount,"");
}

// ---------- Workspace ----------
function governanceHtml(m){
  const c=m.context,rows=[["Audience",c.audienceResolved?"RESOLVED":"UNRESOLVED"],["Eligible contacts",c.eligibleContacts??"—"],["Excluded contacts",c.excludedContacts??"—"],["Creative set",c.creativeSetStatus||"PENDING"],["Required languages",(c.requiredLanguages||[]).join(" / ")||"—"],[m.language+" variant",variantStatus(m.variants[m.language])]];
  return rows.map(([k,v])=>'<div><span class="cs6-muted">'+E(k)+'</span><span'+(k===m.language+" variant"?' data-variant-status':'')+'>'+E(v)+'</span></div>').join("");
}
function systemsHtml(m){
  const auto=m.selection.systemId,shown=m.inspect||m.layout;
  return Object.values(Lib().CREATIVE_SYSTEMS).map(sys=>'<button type="button" class="cs6-sys" data-layout="'+E(sys.id)+'" aria-pressed="'+(shown===sys.id)+'" '+(m.busy?'disabled':'')+'><b>'+E(sys.name)+(sys.id===auto?'<span class="cs6-badge">AUTO</span>':'')+'</b><small>'+E(sys.use)+'</small></button>').join("");
}
function draw(){
  const m=model;if(!mount||!m)return;ensureStyles();const c=m.context,v=m.variants[m.language],sysName=id=>(Lib().CREATIVE_SYSTEMS[id]||{}).name||id;
  const inspecting=m.inspect&&m.inspect!==m.layout;
  mount.innerHTML='<div class="cs6">'+
    '<div class="cs6-head"><div><div class="cs6-eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>'+E(c.campaignName)+'</h2><div class="cs6-muted">'+E(c.campaignId)+'</div></div><button type="button" class="btn cs6-back" data-picker>&larr; All campaigns</button></div>'+
    '<div class="cs6-ws"><div class="cs6-col">'+
      '<section class="cs6-panel" data-intake><dl class="cs6-kv">'+[["Objective",objectiveOf(c)],["Service",c.service],["Angle",c.messageAngle],["Audience",c.audienceId],["Playbook",c.playbookId],["Language",c.language||"AUTO PER CONTACT"]].map(([k,val])=>'<div><dt>'+E(k)+'</dt><dd>'+E(val||"—")+'</dd></div>').join("")+'</dl>'+
        '<p class="cs6-why"><strong>'+E(INTAKE_QUESTION)+'</strong> <span class="cs6-badge" data-intake-answer>'+E(INTAKE_BY_OBJECTIVE[objectiveOf(c)]||"UNANSWERED")+'</span></p></section>'+
      '<section class="cs6-panel"><div class="cs6-eyebrow" style="margin-bottom:10px">VISUAL SYSTEM</div><div class="cs6-systems">'+systemsHtml(m)+'</div>'+
        '<p class="cs6-why" data-design-selection>Design selected automatically: <strong>'+E(sysName(m.selection.systemId))+'</strong> ('+E(m.selection.rule)+') — '+E(m.selection.reason)+'</p>'+
        (m.layout!==m.selection.systemId?'<p class="cs6-why">Committed system: <strong>'+E(sysName(m.layout))+'</strong></p>':'')+
        (inspecting?'<div class="cs6-inspect" data-inspect-note><span>Inspecting <strong>'+E(sysName(m.inspect))+'</strong> · preview only, nothing is approved or revoked.</span><span class="cs6-actions"><button type="button" class="btn" data-inspect-back>Back to '+E(sysName(m.layout))+'</button><button type="button" class="btn btn-primary" data-inspect-use>Use this system</button></span></div>':'')+
      '</section>'+
      '<section class="cs6-panel"><div class="cs6-tabs" role="tablist" aria-label="Creative language">'+LANGUAGES.map(l=>'<button type="button" class="cs6-tab" role="tab" aria-selected="'+(m.language===l)+'" data-language="'+l+'" '+(m.busy?'disabled':'')+'><b>'+l+'</b><small>'+E(variantStatus(m.variants[l]))+'</small></button>').join("")+'</div></section>'+
      '<section class="cs6-panel"><div class="cs6-eyebrow" style="margin-bottom:10px">CREATIVE FIELDS · '+E(m.language)+'</div><fieldset style="border:0;padding:0;margin:0" '+(m.busy?'disabled':'')+'>'+FIELDS.map(k=>'<label class="cs6-field">'+E(k)+'<textarea data-copy="'+k+'" rows="2">'+E(v.copy[k])+'</textarea></label>').join("")+'</fieldset></section>'+
      '<section class="cs6-panel"><div class="cs6-eyebrow" style="margin-bottom:10px">GOVERNANCE</div><div class="cs6-gov" data-governance>'+governanceHtml(m)+'</div>'+
        '<p class="cs6-alert" role="alert">'+E(m.error)+'</p><div class="cs6-actions" style="margin-top:10px">'+[["draft","Create test draft"],["variant","Approve variant"],["set","Approve creative set"]].map(([a,label])=>'<button type="button" class="btn btn-primary" data-action="'+a+'" '+(actionDisabled(m,a)?'disabled':'')+'>'+label+'</button>').join("")+'</div>'+
        '<p class="cs6-muted" style="margin:10px 0 0">Test Draft creates an unsent Gmail draft. Approval stores exactly the HTML shown in the preview; AURA only merges name/company tokens.</p></section>'+
    '</div>'+
    '<div class="cs6-col cs6-previewcol"><section class="cs6-panel"><div class="cs6-previewbar"><div><div class="cs6-eyebrow">ACTUAL EMAIL HTML · '+E(m.language)+'</div><div class="cs6-muted" data-preview-label>'+E(sysName(m.inspect||m.layout))+'</div></div><div class="cs6-device" role="group" aria-label="Preview width">'+["desktop","mobile"].map(d=>'<button type="button" data-device="'+d+'" aria-pressed="'+(view.device===d)+'">'+(d==="desktop"?"Desktop":"Mobile")+'</button>').join("")+'</div></div>'+
      '<iframe data-preview class="cs6-frame'+(view.device==="mobile"?" is-mobile":"")+'" title="'+m.language+' email preview" sandbox=""></iframe></section></div>'+
    '</div></div>';
  bindWorkspace(m);preview();
}
function bindWorkspace(m){
  const q=s=>mount.querySelector(s),qa=s=>mount.querySelectorAll(s)||[];
  const picker=q("[data-picker]");if(picker)picker.onclick=()=>backToList();
  qa("[data-language]").forEach(b=>b.onclick=()=>{selectLanguage(m,b.dataset.language);draw();});
  // Gallery: inspecting another system is preview-only (no revoke); committing uses changeLayout.
  qa("[data-layout]").forEach(b=>b.onclick=()=>{m.inspect=b.dataset.layout===m.layout?null:b.dataset.layout;draw();});
  const back=q("[data-inspect-back]");if(back)back.onclick=()=>{m.inspect=null;draw();};
  const use=q("[data-inspect-use]");if(use)use.onclick=async()=>{const target=m.inspect;m.busy=true;draw();try{await changeLayout(m,target);m.inspect=null;}catch(e){m.error=e.message;}finally{m.busy=false;draw();}};
  qa("[data-device]").forEach(b=>b.onclick=()=>{view.device=b.dataset.device;const f=q("[data-preview]");if(f&&f.classList)f.classList.toggle("is-mobile",view.device==="mobile");qa("[data-device]").forEach(x=>x.setAttribute&&x.setAttribute("aria-pressed",String(x.dataset.device===view.device)));});
  qa("[data-copy]").forEach(e=>e.oninput=()=>{editCopy(m,e.dataset.copy,e.value).catch(err=>{m.error=err.message;const a=q('[role="alert"]');if(a)a.textContent=m.error;});preview();});
  qa("[data-action]").forEach(b=>b.onclick=()=>run(b.dataset.action));
}
// Light update (no full redraw): preview HTML, statuses and action states only.
function preview(){
  if(!mount||!model)return;
  const frame=mount.querySelector("[data-preview]");if(frame)frame.srcdoc=previewHtml(model);
  (mount.querySelectorAll("[data-language]")||[]).forEach(b=>{const s=b.querySelector&&b.querySelector("small");if(s)s.textContent=variantStatus(model.variants[b.dataset.language]);});
  (mount.querySelectorAll("[data-action]")||[]).forEach(b=>b.disabled=actionDisabled(model,b.dataset.action));
  const status=mount.querySelector("[data-variant-status]");if(status)status.textContent=variantStatus(model.variants[model.language]);
}
async function render(container,explicitId){
  mount=container;ensureStyles();const ticket=++epoch,id=explicitId===undefined?navigationId():explicitId;model=null;
  container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>'+(id?'Loading campaign…':'Select a campaign')+'</h2></div></div><p class="cs6-muted">Loading private backend…</p></div>';
  try{
    if(!api()?.isConnected?.())throw Error("Connect the private backend to open Campaign Studio.");
    if(!id){
      const list=await loadCampaignList();if(ticket!==epoch)return;
      container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>Select a campaign</h2><div class="cs6-muted">Search and filter, then open a campaign to review its governed email.</div></div><button type="button" class="btn" data-reload-list>Refresh list</button></div>'+selectorHtml(list,"")+'</div>';
      const reload=container.querySelector("[data-reload-list]");if(reload)reload.onclick=async()=>{try{g.sessionStorage?.removeItem(LIST_KEY);}catch(_){}cache.list=null;await loadCampaignList(true);render(container,"");};
      bindSelector(container,list,"");
      return;
    }
    // Context and (in parallel) the campaign list warm-up; approved variants are then fetched in parallel.
    const listWarm=loadCampaignList().catch(()=>null);
    const context=cache.contexts.get(id)||await api().campaignStudioContext(id);if(ticket!==epoch)return;
    if(context.campaignId!==id)throw Error("Campaign context mismatch");
    cache.contexts.set(id,context);
    try{sessionStorage.setItem(KEY,"{}");}catch(_){}
    model=createModel(context);
    const approvedLanguages=LANGUAGES.filter(l=>model.variants[l].approved);
    const records=await Promise.all(approvedLanguages.map(l=>api().getLatestApprovedCreative(id,l).catch(()=>null)));if(ticket!==epoch)return;
    approvedLanguages.forEach((l,i)=>{
      const v=model.variants[l],record=records[i];
      // An approved creative persisted by a retired renderer (templateId not in the design
      // library, e.g. the old generic "editorial") is shown as legacy: the premium preview from
      // the automatic selection is displayed instead. Nothing is revoked or overwritten; approving
      // the new preview creates a new version that supersedes it.
      if(record?.creativeId===v.creativeId&&!validSystem(record.templateId)){v.approved=false;v.dirty=true;v.legacyTemplate=String(record.templateId||"");v.legacyCreativeVersion=record.creativeVersion;return;}
      if(record?.creativeId===v.creativeId){model.layout=record.templateId;v.storedHtml=record.htmlBody;v.storedText=record.textBody;v.copy.subjectA=record.subject;v.copy.preheader=record.preheader;if(record.creativeCopy){try{v.copy=JSON.parse(record.creativeCopy);}catch(_){}}}
      else{v.approved=false;v.dirty=true;}
    });
    draw();
    listWarm.then(()=>{});
  }catch(e){if(ticket===epoch)container.innerHTML='<div class="cs6"><div class="cs6-head"><div><div class="cs6-eyebrow">GOVERNED CAMPAIGN STUDIO</div><h2>Select a campaign</h2></div></div><p class="cs6-alert" role="alert">'+E(e.message)+'</p></div>';}
}
g.DGL_CAMPAIGN_STUDIO_V6={version:"governed-premium-v4",previewHtml,filterCampaigns,normalizeCampaign,loadCampaignList,openCampaign,INTAKE_QUESTION,INTAKE_OPTIONS,autoSystem,render,createModel,canApproveSet,variantStatus,selectLanguage,editCopy,changeLayout,emailHtml,validateBrand,navigationId,getState:()=>model};
g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};g.DGL_MODULE_RENDERERS["campaign-studio"]=render;
g.addEventListener?.("dgl:v55-backend-change",()=>{if(g.location?.hash.includes("campaign-studio")&&!model&&mount)render(mount);});
})(window);
