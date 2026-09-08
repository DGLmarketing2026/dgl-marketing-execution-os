/**
 * DGL New Business Acquisition Experience V1
 * Channels is a new-lead acquisition engine. It is intentionally separate
 * from NOVA -> AM -> AURA -> Existing Account Growth.
 */
(function(g){
"use strict";
const R = g.DGL_MODULE_RENDERERS = g.DGL_MODULE_RENDERERS || {};
const esc = v => String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const LS = "dgl_acquisition_landing_pages_v1";
const uid = p => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
const icons = () => g.lucide?.createIcons?.();
const provider = () => g.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus || "BULK PROVIDER NOT CONFIGURED";

function head(eye,title,sub,actions=""){
  return `<div class="page-head"><div><div class="eyebrow">${esc(eye)}</div><h2>${esc(title)}</h2><p class="lede">${esc(sub)}</p></div><div class="page-head-actions">${actions}</div></div>`;
}
function badge(t,tone="muted"){ return `<span class="acq-badge ${tone}">${esc(t)}</span>`; }
function metric(label,value,foot=""){
  return `<div class="kpi-card"><div class="kpi-content"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-foot">${esc(foot)}</div></div></div>`;
}
function metrics(items){ return `<div class="kpi-grid">${items.map(x=>metric(...x)).join("")}</div>`; }
function empty(title,text){ return `<div class="acq-empty"><i data-lucide="circle-dashed"></i><strong>${esc(title)}</strong><p>${esc(text)}</p></div>`; }

function readPages(){
  try { return JSON.parse(localStorage.getItem(LS) || "[]"); } catch(_) { return []; }
}
function writePages(rows){ localStorage.setItem(LS, JSON.stringify(rows)); }
function normalizeLang(v){ return v==="pt-BR" ? "pt-BR" : v==="en" ? "en" : "es"; }
const langName = {es:"Español",en:"English","pt-BR":"Português (Brasil)"};
const formLabels = {
  es:{firstName:"Nombre",lastName:"Apellido",company:"Empresa",email:"Email corporativo",country:"País",service:"Servicio",origin:"Origen",destination:"Destino",notes:"Requerimiento",button:"ENVIAR REQUERIMIENTO",thanks:"Gracias. Recibimos su requerimiento."},
  en:{firstName:"First name",lastName:"Last name",company:"Company",email:"Business email",country:"Country",service:"Service",origin:"Origin",destination:"Destination",notes:"Requirement",button:"SUBMIT REQUIREMENT",thanks:"Thank you. We received your requirement."},
  "pt-BR":{firstName:"Nome",lastName:"Sobrenome",company:"Empresa",email:"E-mail corporativo",country:"País",service:"Serviço",origin:"Origem",destination:"Destino",notes:"Necessidade",button:"ENVIAR NECESSIDADE",thanks:"Obrigado. Recebemos sua solicitação."}
};
function defaultContent(lang="en"){
  const c = {
    es:{headline:"¿Necesita mover carga terrestre en Estados Unidos?",subheadline:"Compártanos la ruta y el requerimiento. DGL revisa opciones FTL, LTL y Drayage para su operación inland.",cta:"ENVIAR REQUERIMIENTO"},
    en:{headline:"Need a reliable inland freight partner?",subheadline:"Share your lane and requirements. DGL can review FTL, LTL and Drayage options across the U.S.",cta:"REQUEST A QUOTE"},
    "pt-BR":{headline:"Precisa movimentar carga terrestre nos Estados Unidos?",subheadline:"Envie a rota e os detalhes da operação. A DGL avalia opções de FTL, LTL e Drayage para sua carga nos EUA.",cta:"SOLICITAR COTAÇÃO"}
  };
  return c[normalizeLang(lang)];
}
function slugify(v){ return String(v||"landing").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80); }

function command(c){
  const pages = readPages(), live = pages.filter(x=>x.status==="LIVE").length;
  c.innerHTML = head("NEW BUSINESS ACQUISITION","Acquisition Command Center","Captación de nuevos leads desde tráfico, prospección y medios. Separado del ciclo AM/AURA de cuentas existentes.")+
    metrics([
      ["LANDING PAGES",pages.length,"Configuraciones locales / gobernadas"],
      ["LIVE",live,"Solo páginas con URL publicada confirmada"],
      ["LEADS","—","Backend de captación requerido"],
      ["NEW BUSINESS REVENUE","—","Salesforce attribution requerido"]
    ])+
    `<div class="acq-split">
      <section class="acq-panel"><div class="acq-panel-head"><div><span>ACQUISITION FUNNEL</span><h3>Prospect → Lead → Opportunity → Customer</h3></div>${badge("NO FAKE DATA","good")}</div>
      <div class="acq-flow">${["TRAFFIC / PROSPECTING","CHANNEL","LANDING / LEAD FORM","VALIDATE","DEDUPLICATE","SCORE","SALESFORCE","NEW BUSINESS","OPPORTUNITY","CUSTOMER"].map((x,i)=>`<div class="acq-flow-step"><span>${String(i+1).padStart(2,"0")}</span><strong>${x}</strong></div>`).join("")}</div></section>
      <section class="acq-panel"><div class="acq-panel-head"><div><span>BOUNDARY</span><h3>Existing Accounts stay separate</h3></div>${badge("CANONICAL","good")}</div>
      <div class="acq-callout"><strong>NOVA / SALESFORCE → AM INTELLIGENCE → AURA → MARKETING OS</strong><p>Retention, Reactivation, QNB and Cross-Sell remain Existing Account Growth. Landing Pages and Channels do not depend on AM.</p></div></section>
    </div>`;
  icons();
}

function channel(c){
  const rows = [
    ["Landing Pages","Capture new inbound demand","READY","Private lead-intake backend required for live forms"],
    ["Paid Media","Generate qualified traffic","NOT CONFIGURED","Connect Meta / Google Ads before reporting performance"],
    ["LinkedIn","Lead generation / prospecting","NOT CONFIGURED","Connect LinkedIn Ads / Lead Gen or approved workflow"],
    ["Outbound / Lead Nurture","Create conversations with cold prospects","NOT CONFIGURED",provider()],
    ["Retargeting","Bring qualified visitors back","NOT CONFIGURED","Pixel/audience provider not connected"],
    ["Salesforce New Business","Lead routing + revenue loop","NOT CONFIGURED","CRM intake/ownership contract required"]
  ];
  c.innerHTML = head("NEW BUSINESS ACQUISITION","Channel Orchestration","Coordina canales de captación de nuevos leads. No participa en Retention, Reactivation, QNB o Cross-Sell.")+
    `<div class="acq-channel-grid">${rows.map(r=>`<article class="acq-channel-card"><div><span>${esc(r[1])}</span><h3>${esc(r[0])}</h3></div>${badge(r[2],r[2]==="READY"?"good":"warn")}<p>${esc(r[3])}</p></article>`).join("")}</div>
    <div class="acq-callout"><strong>Operating rule</strong><p>No channel may display LIVE metrics until its real provider/backend is connected. Traffic and leads must flow to New Business, not to AM.</p></div>`;
  icons();
}

function landingList(c){
  const pages = readPages();
  c.innerHTML = head("NEW BUSINESS ACQUISITION","Landing Page Center","Crea experiencias de conversión para nuevos leads en Español, English y Português (Brasil).",
    `<button class="btn btn-primary" data-acq-new-page><i data-lucide="plus"></i>Nueva Landing</button>`)+
    metrics([
      ["TOTAL",pages.length,"Landing configurations"],
      ["DRAFT",pages.filter(x=>x.status==="DRAFT").length,"Not publicly capturing leads"],
      ["LIVE",pages.filter(x=>x.status==="LIVE").length,"Published URL confirmed"],
      ["CONVERSIONS","—","Lead backend + analytics required"]
    ])+
    `<div class="acq-toolbar"><span>Objective: New Business Acquisition</span><strong>Landing pages are not AM/AURA assets.</strong></div>
     <div class="acq-page-grid">${pages.length?pages.map(pageCard).join(""):empty("No landing pages yet","Create the first new-business landing. Draft content is stored locally; publishing remains blocked until a private lead-intake endpoint exists.")}</div>
     <div id="acqEditorMount"></div>`;
  c.querySelector("[data-acq-new-page]")?.addEventListener("click",()=>openEditor(c,null));
  c.querySelectorAll("[data-acq-edit]").forEach(b=>b.addEventListener("click",()=>openEditor(c,b.dataset.acqEdit)));
  c.querySelectorAll("[data-acq-dup]").forEach(b=>b.addEventListener("click",()=>duplicatePage(c,b.dataset.acqDup)));
  c.querySelectorAll("[data-acq-delete]").forEach(b=>b.addEventListener("click",()=>deletePage(c,b.dataset.acqDelete)));
  icons();
}
function pageCard(p){
  return `<article class="acq-page-card">
    <div class="acq-page-top"><div><span>${esc(p.objective)} · ${esc(p.service)}</span><h3>${esc(p.name)}</h3></div>${badge(p.status,p.status==="LIVE"?"good":"muted")}</div>
    <div class="acq-page-meta"><span>${esc(langName[p.language]||p.language)}</span><span>/${esc(p.slug)}</span><span>${esc(p.source||"Direct")}</span></div>
    <p>${esc(p.headline)}</p>
    <div class="acq-actions"><button class="btn btn-secondary btn-sm" data-acq-edit="${esc(p.id)}">Edit</button><button class="btn btn-secondary btn-sm" data-acq-dup="${esc(p.id)}">Duplicate</button><button class="btn btn-secondary btn-sm" data-acq-delete="${esc(p.id)}">Delete</button></div>
  </article>`;
}
function duplicatePage(c,id){
  const rows=readPages(), p=rows.find(x=>x.id===id); if(!p)return;
  const q={...p,id:uid("LP"),name:p.name+" Copy",slug:slugify(p.slug+"-copy"),status:"DRAFT",publishedUrl:"",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  rows.push(q);writePages(rows);landingList(c);
}
function deletePage(c,id){
  writePages(readPages().filter(x=>x.id!==id)); landingList(c);
}
function openEditor(c,id){
  const rows=readPages(), existing=rows.find(x=>x.id===id);
  const d=defaultContent(existing?.language||"en");
  const p=existing||{
    id:uid("LP"),name:"New Business · Inland Freight",objective:"Lead Generation",service:"Multiservice",language:"en",market:"USA",
    source:"Direct / Organic",slug:"inland-freight-usa",headline:d.headline,subheadline:d.subheadline,cta:d.cta,
    status:"DRAFT",publishedUrl:"",utmSource:"",utmMedium:"",utmCampaign:"",heroAsset:"",createdAt:new Date().toISOString()
  };
  const mount=c.querySelector("#acqEditorMount"); if(!mount)return;
  mount.innerHTML=`<div class="acq-editor">
    <div class="acq-editor-head"><div><span>LANDING BUILDER</span><h3>${existing?"Edit":"Create"} landing page</h3></div>${badge("NEW BUSINESS ONLY","good")}<button class="btn btn-secondary btn-sm" data-acq-close>Close</button></div>
    <div class="acq-editor-grid">
      <div class="acq-fields">
        ${field("lpName","Name",p.name)}
        <div class="acq-row">${select("lpLanguage","Language",[["es","Español"],["en","English"],["pt-BR","Português (Brasil)"]],p.language)}${select("lpService","Service",[["FTL","FTL"],["LTL","LTL"],["Drayage","Drayage"],["Multiservice","Multiservice"]],p.service)}</div>
        <div class="acq-row">${field("lpMarket","Market",p.market)}${field("lpSource","Acquisition source",p.source)}</div>
        ${field("lpSlug","Slug",p.slug)}
        ${field("lpHeadline","Headline",p.headline)}
        ${textarea("lpSubheadline","Subheadline",p.subheadline)}
        ${field("lpCta","CTA",p.cta)}
        <div class="acq-row">${field("lpUtmSource","utm_source",p.utmSource)}${field("lpUtmMedium","utm_medium",p.utmMedium)}</div>
        ${field("lpUtmCampaign","utm_campaign",p.utmCampaign)}
        <div class="acq-actions"><button class="btn btn-primary" data-acq-save>Save Draft</button><button class="btn btn-secondary" data-acq-publish>Publish</button></div>
        <p class="acq-note">Publish is fail-closed: a live form requires a private lead-intake backend. No lead PII is stored in this frontend.</p>
      </div>
      <div class="acq-preview-wrap"><div class="acq-preview-toolbar"><strong>Preview</strong><span>Desktop</span></div><div id="acqLandingPreview"></div></div>
    </div>
  </div>`;
  const rerender=()=>renderPreview(mount);
  mount.querySelectorAll("input,select,textarea").forEach(x=>x.addEventListener("input",rerender));
  mount.querySelector("#lpLanguage")?.addEventListener("change",e=>{
    const l=e.target.value,dc=defaultContent(l);
    mount.querySelector("#lpHeadline").value=dc.headline;mount.querySelector("#lpSubheadline").value=dc.subheadline;mount.querySelector("#lpCta").value=dc.cta;rerender();
  });
  mount.querySelector("[data-acq-close]")?.addEventListener("click",()=>mount.innerHTML="");
  mount.querySelector("[data-acq-save]")?.addEventListener("click",()=>{
    const saved=collectLanding(mount,p,"DRAFT");upsertPage(saved);landingList(c);
  });
  mount.querySelector("[data-acq-publish]")?.addEventListener("click",()=>{
    const box=mount.querySelector(".acq-note");box.textContent="BLOCKED: configure a private lead-intake endpoint and publishing host before marking this landing LIVE.";box.classList.add("blocked");
  });
  renderPreview(mount);icons();
}
function field(id,label,value){return `<label class="acq-field"><span>${esc(label)}</span><input id="${id}" value="${esc(value||"")}"></label>`;}
function textarea(id,label,value){return `<label class="acq-field"><span>${esc(label)}</span><textarea id="${id}" rows="3">${esc(value||"")}</textarea></label>`;}
function select(id,label,opts,value){return `<label class="acq-field"><span>${esc(label)}</span><select id="${id}">${opts.map(o=>`<option value="${esc(o[0])}" ${o[0]===value?"selected":""}>${esc(o[1])}</option>`).join("")}</select></label>`;}
function val(m,id){return m.querySelector("#"+id)?.value?.trim()||"";}
function collectLanding(m,p,status){
  return {...p,name:val(m,"lpName"),language:normalizeLang(val(m,"lpLanguage")),service:val(m,"lpService"),market:val(m,"lpMarket"),source:val(m,"lpSource"),slug:slugify(val(m,"lpSlug")||val(m,"lpName")),headline:val(m,"lpHeadline"),subheadline:val(m,"lpSubheadline"),cta:val(m,"lpCta"),utmSource:val(m,"lpUtmSource"),utmMedium:val(m,"lpUtmMedium"),utmCampaign:val(m,"lpUtmCampaign"),status,updatedAt:new Date().toISOString()};
}
function upsertPage(p){const rows=readPages(),i=rows.findIndex(x=>x.id===p.id);if(i>=0)rows[i]=p;else rows.push(p);writePages(rows);}
function renderPreview(m){
  const lang=normalizeLang(val(m,"lpLanguage")), f=formLabels[lang], headline=val(m,"lpHeadline"), sub=val(m,"lpSubheadline"), cta=val(m,"lpCta");
  m.querySelector("#acqLandingPreview").innerHTML=`<div class="lp-preview">
    <div class="lp-brand">DGL <span>Dedicated Ground Logistics</span></div>
    <div class="lp-hero"><div><span>INLAND FREIGHT BROKER</span><h2>${esc(headline)}</h2><p>${esc(sub)}</p><a href="#lpForm">${esc(cta)}</a></div><div class="lp-visual"><span>FTL</span><span>LTL</span><span>DRAYAGE</span></div></div>
    <div class="lp-value"><strong>USA Inland Freight</strong><p>FTL · LTL · Drayage · Cross-border support</p></div>
    <form id="lpForm" class="lp-form">${["firstName","lastName","company","email","country","service","origin","destination"].map(k=>`<label><span>${esc(f[k])}</span><input disabled></label>`).join("")}<label class="full"><span>${esc(f.notes)}</span><textarea disabled></textarea></label><button type="button">${esc(f.button)}</button><small>Preview only · private lead intake required for live submission</small></form>
  </div>`;
}
function acquisitionGeneric(c,title,sub,rows){
  c.innerHTML=head("NEW BUSINESS ACQUISITION",title,sub)+`<div class="acq-channel-grid">${rows.map(r=>`<article class="acq-channel-card"><div><span>${esc(r[1])}</span><h3>${esc(r[0])}</h3></div>${badge(r[2],r[2]==="READY"?"good":"warn")}<p>${esc(r[3])}</p></article>`).join("")}</div>`;icons();
}
function paid(c){acquisitionGeneric(c,"Paid Media","Captación pagada de nuevos leads; no reporta métricas hasta conectar proveedores.",[
  ["Google Ads","Search intent","NOT CONFIGURED","Connect account, campaign IDs, spend and conversion events."],
  ["Meta Ads","Demand generation","NOT CONFIGURED","Connect lead/traffic campaigns and landing attribution."],
  ["LinkedIn Ads","B2B targeting","NOT CONFIGURED","Connect campaign + Lead Gen / landing conversions."],
  ["Retargeting","Return qualified visitors","NOT CONFIGURED","Requires consent, pixel/audience infrastructure and provider."]
]);}
function linkedin(c){acquisitionGeneric(c,"LinkedIn Acquisition","Captación B2B desde LinkedIn para New Business.",[
  ["LinkedIn Ads","Paid acquisition","NOT CONFIGURED","Campaign and conversion connector required."],
  ["Lead Gen Forms","Native lead capture","NOT CONFIGURED","Webhook/API intake required."],
  ["Organic → Landing","Content-assisted acquisition","READY","Use tracked landing URLs; live analytics requires event backend."],
  ["Prospecting","Outbound workflow","NOT CONFIGURED","Keep separate from inbound lead qualification."]
]);}
function outbound(c){acquisitionGeneric(c,"Outbound / Lead Nurture","Prospección y nurture de leads nuevos. No usar listas de AM ni cuentas existentes.",[
  ["Cold Outbound","New prospects only","NOT CONFIGURED",`${provider()}. Deduplication against Salesforce required before send.`],
  ["Lead Nurture","Captured leads","NOT CONFIGURED","Requires lead state + consent + provider."],
  ["Landing CTA","Conversion destination","READY","Landing drafts available; live form endpoint still required."]
]);}
function leadCapture(c){acquisitionGeneric(c,"Lead Capture","Punto único para recibir nuevos leads desde landing pages y formularios.",[
  ["Landing Forms","Inbound","BLOCKED","Private lead-intake endpoint not configured."],
  ["LinkedIn Lead Gen","Inbound","NOT CONFIGURED","Provider integration required."],
  ["Meta Lead Forms","Inbound","NOT CONFIGURED","Provider integration required."],
  ["Website Forms","Inbound","NOT CONFIGURED","Existing website form contract not connected."]
]);}
function leadRouting(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Lead Routing","Valida, deduplica y entrega nuevos leads a Salesforce / New Business. AM no participa en este funnel.")+
  `<div class="acq-flow">${["FORM SUBMITTED","VALIDATE","DEDUPLICATE","EXISTING ACCOUNT CHECK","SCORE","SALESFORCE LEAD","NEW BUSINESS OWNER"].map((x,i)=>`<div class="acq-flow-step"><span>${String(i+1).padStart(2,"0")}</span><strong>${x}</strong></div>`).join("")}</div>
   <div class="acq-callout"><strong>Fail-closed identity rule</strong><p>If the company/contact already exists, do not create a duplicate new-business lead. Route by CRM policy. Do not use account name alone as the canonical identity.</p></div>
   <div class="acq-channel-grid">
    <article class="acq-channel-card"><div><span>CRM</span><h3>Salesforce Intake</h3></div>${badge("NOT CONFIGURED","warn")}<p>Lead creation/ownership contract required.</p></article>
    <article class="acq-channel-card"><div><span>SCORING</span><h3>Qualification Model</h3></div>${badge("DESIGN READY","good")}<p>Weights must be calibrated with real lead-to-opportunity outcomes; no arbitrary production score is enabled.</p></article>
   </div>`;icons();
}
function attribution(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Acquisition Attribution","Mide source → lead → opportunity → customer → revenue sin mezclar revenue de cartera existente.")+
  metrics([["LEADS","—","Lead backend required"],["OPPORTUNITIES","—","Salesforce required"],["CUSTOMERS","—","Salesforce required"],["REVENUE","—","Closed-loop attribution required"]])+
  `<div class="acq-flow">${["SOURCE","CAMPAIGN","LANDING / FORM","LEAD","QUALIFIED","OPPORTUNITY","CUSTOMER","REVENUE"].map((x,i)=>`<div class="acq-flow-step"><span>${String(i+1).padStart(2,"0")}</span><strong>${x}</strong></div>`).join("")}</div>
  <div class="acq-callout"><strong>No vanity metrics</strong><p>Clicks and visits are diagnostics. The executive outcome is qualified leads, opportunities, customers and new-business revenue.</p></div>`;icons();
}
function content(c){
  c.innerHTML=head("CONTENT","Content & Asset Library","Biblioteca transversal. Landing Pages live in their own acquisition module.")+
  `<div class="acq-channel-grid">${[
    ["Email Creative","Campaign content","READY","Reusable approved email assets."],
    ["Landing Hero","Acquisition visual","READY","Hero assets for landing-page templates."],
    ["Social","Organic / paid creative","READY","Reusable social content."],
    ["Case Study","Proof","READY","Commercial proof asset."],
    ["One-Pager / Brochure","Sales enablement","READY","Reusable capability material."],
    ["Video / Graphic","Visual content","READY","Reusable media."]
  ].map(r=>`<article class="acq-channel-card"><div><span>${r[1]}</span><h3>${r[0]}</h3></div>${badge(r[2],"good")}<p>${r[3]}</p></article>`).join("")}</div>
  <div class="acq-callout"><strong>Required metadata</strong><p>objective · service · language · market · campaign · approval · status · lastUsed · performance. Content Library is not a landing-page builder.</p></div>`;icons();
}
function journeys(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Acquisition Journeys","Automations for new leads only. Existing-account journeys remain governed by AURA.")+
  `<div class="acq-flow">${["NEW LEAD","VALIDATE","SCORE","ROUTE","NURTURE IF NEEDED","SALES FOLLOW-UP","OPPORTUNITY"].map((x,i)=>`<div class="acq-flow-step"><span>${String(i+1).padStart(2,"0")}</span><strong>${x}</strong></div>`).join("")}</div>
  <div class="acq-callout"><strong>Not active yet</strong><p>Journey execution requires Salesforce lead-state and an approved outbound provider. The UI will not claim LIVE until those dependencies are connected.</p></div>`;icons();
}

Object.assign(R,{
  "acquisition-command-center":command,
  "landing-pages":landingList,
  "channel-orchestration":channel,
  "paid-media":paid,
  "linkedin-acquisition":linkedin,
  "outbound-acquisition":outbound,
  "lead-capture":leadCapture,
  "lead-routing":leadRouting,
  "acquisition-attribution":attribution,
  "content-library":content,
  "automation-playbooks":journeys
});
g.DGL_ACQUISITION_V1={readPages,writePages,defaultContent,formLabels};
})(window);
