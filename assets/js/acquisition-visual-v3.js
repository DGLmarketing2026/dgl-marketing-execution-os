/**
 * DGL Acquisition Visual V3
 * Presentation-only layer. Loads AFTER acquisition-automation-v2.js and overrides
 * only the visual renderers for Acquisition Command Center, Landing Pages and
 * Lead Routing. Automation V2 remains the server-side engine: all real numbers
 * shown here come from DGL_ACQUISITION_AUTOMATION_V2.refresh() / DGL_ACQUISITION_BACKEND_V1.
 * No fake metrics, no invented owners, no LIVE claim without a connected backend.
 */
(function(g){
"use strict";
const R=g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};
const esc=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const icons=()=>g.lucide?.createIcons?.();
const V2=()=>g.DGL_ACQUISITION_AUTOMATION_V2;
const BACKEND=()=>g.DGL_ACQUISITION_BACKEND_V1;
const safeNum=v=>Number.isFinite(Number(v))?Number(v):0;

function head(eye,title,sub,actions=""){
  return `<div class="page-head"><div><div class="eyebrow">${esc(eye)}</div><h2>${esc(title)}</h2><p class="lede">${esc(sub)}</p></div><div class="page-head-actions">${actions}</div></div>`;
}
function badge(t,tone="muted"){return `<span class="acq-badge ${tone}">${esc(t)}</span>`;}
function metric(label,value,foot=""){
  return `<div class="kpi-card"><div class="kpi-content"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-foot">${esc(foot)}</div></div></div>`;
}
function metrics(items){return `<div class="kpi-grid">${items.map(x=>metric(...x)).join("")}</div>`;}
function flow(steps){
  return `<div class="acq-flow">${steps.map((x,i)=>`<div class="acq-flow-step"><span>${String(i+1).padStart(2,"0")}</span><strong>${esc(x)}</strong></div>`).join("")}</div>`;
}
async function statusData(force=false){
  if(!V2())return {status:{},pages:[],error:"AUTOMATION V2 NOT LOADED"};
  try{return await V2().refresh(force);}catch(e){return {status:{},pages:[],error:String(e&&e.message||e)};}
}

/* ---------- Acquisition Command Center ---------- */
const COMMAND_FLOW=["SIGNAL","COPY","DESIGN","LANDING","FORM","VALIDATE","DEDUPE","QUALIFY","SALESFORCE","OWNER","ATTRIBUTION"];

function ownerLine(s){
  const owner=s&&s.newBusinessOwner;
  return owner?`<strong>${esc(owner)}</strong>`:`<strong class="acq-pending">PENDING SALESFORCE ASSIGNMENT</strong>`;
}

async function commandCenter(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Acquisition Command Center","One automatic loop: a signal becomes copy, a design, a landing page, a form, a qualified Salesforce lead and an attributed dollar — with no manual list at any step.",
    `<button class="btn btn-secondary" data-acq-run>RUN QA NOW</button>`)+
    `<div class="acq-hero-flow"><div class="acq-hero-flow-head"><span>AUTONOMOUS ACQUISITION LOOP</span><h3>Signal → Owner → Attribution</h3></div>${flow(COMMAND_FLOW)}</div>`;
  icons();
  const d=await statusData();
  const s=d.status||{};
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Acquisition Command Center","One automatic loop: a signal becomes copy, a design, a landing page, a form, a qualified Salesforce lead and an attributed dollar — with no manual list at any step.",
    `<button class="btn btn-secondary" data-acq-run>RUN QA NOW</button>`)+
    `<div class="acq-hero-flow"><div class="acq-hero-flow-head"><span>AUTONOMOUS ACQUISITION LOOP</span><h3>Signal → Owner → Attribution</h3>${d.error?badge("BACKEND OFFLINE","warn"):badge("SERVER AUTOMATION","good")}</div>${flow(COMMAND_FLOW)}</div>`+
    metrics([
      ["SIGNALS",safeNum(s.signals),`${safeNum(s.signalsPending)} pending`],
      ["LANDINGS",safeNum(s.landingPages),`${safeNum(s.landingLive)} live · ${safeNum(s.landingReady)} ready`],
      ["NEW LEADS",safeNum(s.leads),`${safeNum(s.qualified)} qualified`],
      ["ROUTED",safeNum(s.routed),"Salesforce / New Business"],
      ["EXISTING MATCH",safeNum(s.existingMatches),"Deduplicated automatically"],
      ["NEW BUSINESS REVENUE","—","Attribution connector required"]
    ])+
    `<div class="acq-split">
      <section class="acq-panel"><div class="acq-panel-head"><div><span>NEW BUSINESS OWNER</span><h3>Assigned by Salesforce</h3></div>${badge("NO INVENTED OWNERS","good")}</div>
      <div class="acq-callout">${ownerLine(s)}<p>DGL never displays a person's name for a New Business lead until Salesforce returns the real assignment. Existing Account Growth keeps its own 24 governed AM owners, shown in Campaign Opportunities.</p></div></section>
      <section class="acq-panel"><div class="acq-panel-head"><div><span>BOUNDARY</span><h3>Existing Accounts stay separate</h3></div>${badge("CANONICAL","good")}</div>
      <div class="acq-callout"><strong>NOVA / SALESFORCE → AM INTELLIGENCE → AURA → MARKETING OS</strong><p>Retention, Reactivation, QNB and Cross-Sell remain Existing Account Growth. This loop never depends on AM.</p></div></section>
    </div>`+
    (d.error?`<p class="acq-note">${esc(d.error)}</p><div class="acq-callout"><strong>AUTOMATION RUNS SERVER-SIDE</strong><p>The acquisition engine does not depend on this browser. Connect the private backend only to inspect live status; scheduled automation continues in Apps Script.</p></div>`:"");
  c.querySelector("[data-acq-run]")?.addEventListener("click",()=>runQa(c));
  icons();
}
async function runQa(c){
  const btn=c.querySelector("[data-acq-run]");
  if(!BACKEND()||!BACKEND().isConnected()){
    if(btn){const prev=btn.textContent;btn.textContent="BACKEND REQUIRED";setTimeout(()=>btn.textContent=prev,2000);}
    return;
  }
  if(btn){btn.disabled=true;btn.textContent="RUNNING…";}
  try{await BACKEND().run();await statusData(true);await commandCenter(c);}
  catch(_){/* surfaced via statusData() error path on next render */}
  finally{if(btn){btn.disabled=false;btn.textContent="RUN QA NOW";}}
}

/* ---------- Landing Pages ---------- */
const I18N=()=>g.DGL_ACQUISITION_I18N_V4;
const LANG_LABEL={en:"English",es:"Español","pt-BR":"Português (Brasil)"};
let landingLang=(I18N()&&I18N().marketDefaultLanguage("USA"))||"en";

function designMeta(){return (I18N()&&I18N().SERVICES)||[];}

function designCard(meta,lang){
  const l=I18N().landingContent(meta.id,lang);
  return `<article class="acq-design-card skin-${meta.skin}">
    <div class="acq-design-top"><span>${esc(meta.system)}</span><strong>${esc(meta.id)}</strong></div>
    <div class="acq-design-visual" style="background-image:url('${esc(meta.asset)}')"><div class="acq-design-overlay"><p>${esc(l.headline)}</p><span class="acq-design-cta">${esc(l.cta)}</span></div></div>
    <div class="acq-design-body">
      <p class="acq-design-sub">${esc(l.subheadline)}</p>
      <p class="acq-design-support">${esc(l.supportingCopy)}</p>
      <div class="acq-design-form-preview">${["firstName","lastName","company","email","country","service"].map(k=>`<span>${esc(l.formLabels[k])}</span>`).join("")}</div>
      <p class="acq-design-confirm"><strong>Confirmation:</strong> ${esc(l.confirmation)}</p>
      <div class="acq-design-seo"><span>SEO TITLE</span><strong>${esc(l.seoTitle)}</strong><span>SEO DESCRIPTION</span><p>${esc(l.seoDescription)}</p></div>
      <div class="acq-design-meta-row"><span>/${esc(l.slug)}</span><span>${esc(l.utm.utm_source)}/${esc(l.utm.utm_medium)}/${esc(l.utm.utm_campaign)}</span></div>
    </div>
    <div class="acq-design-foot"><span>Design system preview</span><span>Not a live URL</span></div>
  </article>`;
}
function designGrid(lang){
  return `<div class="acq-design-toolbar"><span>Preview language — changes headline, subheadline, copy, CTA, form labels, confirmation, SEO and slug</span><div class="acq-lang-switch" data-acq-lang-switch>${Object.keys(LANG_LABEL).map(l=>`<button type="button" class="${l===lang?"active":""}" data-acq-lang="${l}">${esc(LANG_LABEL[l])}</button>`).join("")}</div></div>
  <div class="acq-design-grid">${designMeta().map(meta=>designCard(meta,lang)).join("")}</div>`;
}
function creativeVariant(meta,lang){
  const cr=I18N().creativeContent(meta.id,lang);
  return `<div class="acq-creative-variant"><span class="acq-creative-lang">${esc(LANG_LABEL[lang])}</span>
    <strong>${esc(cr.headline)}</strong><p>${esc(cr.supportingLine)}</p>
    <p class="acq-creative-social">${esc(cr.socialPost)}</p>
    <div class="acq-creative-hashtags">${cr.hashtags.map(h=>`<span>${esc(h)}</span>`).join("")}</div>
    <span class="acq-creative-cta">${esc(cr.cta)}</span></div>`;
}
function creativeCard(meta){
  return `<article class="acq-creative-card">
    <div class="acq-design-top"><span>${esc(meta.system)}</span><strong>${esc(meta.id)} · Social / Ad Creative</strong></div>
    <div class="acq-creative-variants">${(I18N().LANGUAGES||["en","es","pt-BR"]).map(lang=>creativeVariant(meta,lang)).join("")}</div>
  </article>`;
}
function creativesSection(){
  return `<section class="acq-panel"><div class="acq-panel-head"><div><span>ACQUISITION CREATIVES</span><h3>Social / ad posts — all 3 languages generated together</h3></div>${badge("EN · ES · PT-BR","good")}</div>
  <div class="acq-creative-grid">${designMeta().map(creativeCard).join("")}</div></section>`;
}
function landingCard(p){
  return `<article class="acq-page-card"><div class="acq-page-top"><div><span>${esc(p.objective||"Lead Generation")} · ${esc(p.service||"Multiservice")}</span><h3>${esc(p.market||"Market")} · ${esc(p.language||"en")}</h3></div>${badge(p.status,p.status==="LIVE"?"good":"muted")}</div><div class="acq-page-meta"><span>${esc(p.channel||"Channel")}</span><span>/${esc(p.slug||"")}</span><span>${esc(p.utmCampaign||"")}</span></div><p>${esc(p.headline||"")}</p><div class="acq-actions">${p.publishedUrl?`<a class="btn btn-secondary btn-sm" href="${esc(p.publishedUrl)}" target="_blank" rel="noopener">OPEN LIVE PAGE</a>`:""}</div></article>`;
}
async function landingPages(c){
  renderLanding(c,{status:{},pages:[]},true);
  const d=await statusData();
  renderLanding(c,d,false);
  bindLanding(c);
}
function renderLanding(c,d,loading){
  const s=d.status||{},pages=d.pages||[];
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Landing Page Center","Every landing and creative is generated automatically in English, Español and Português (Brasil) — real localized fields, not a literal translation. Automation V2 publishes the real pages server-side.")+
    metrics([
      ["DESIGN SYSTEMS",designMeta().length,"FTL · LTL · Drayage"],
      ["LANGUAGES PER PAGE",3,"EN · ES · PT-BR, always generated"],
      ["GENERATED",loading?"…":safeNum(s.landingPages),"From acquisition signals"],
      ["LIVE",loading?"…":safeNum(s.landingLive),"Published automatically"]
    ])+
    `<div class="acq-callout"><strong>Market routing (default language only)</strong><p>USA / International → English · LATAM → Español · Brazil → Português (Brasil). All three languages are always generated for every landing and creative; routing only decides which one opens first.</p></div>`+
    `<section class="acq-panel"><div class="acq-panel-head"><div><span>LANDING DESIGN SYSTEM</span><h3>What every generated page looks like</h3></div>${badge("VISIBLE WITHOUT BACKEND","good")}</div>
    ${designGrid(landingLang)}</section>`+
    creativesSection()+
    `<div class="acq-toolbar"><span>Normal path: Signal → Generate → Publish → Capture</span><strong>No lead PII is stored in GitHub.</strong></div>
     <div class="acq-page-grid">${pages.length?pages.map(landingCard).join(""):`<div class="acq-empty"><i data-lucide="circle-dashed"></i><strong>${loading?"Loading generated pages…":"No generated pages yet"}</strong><p>${loading?"Checking the private backend for live landing pages.":"The server scheduler creates evergreen and connector-driven landing pages once Acquisition Automation is deployed. The design system above is real and ships with every generated page, in all three languages."}</p></div>`}</div>`;
  icons();
}
function bindLanding(c){
  c.addEventListener("click",e=>{
    const b=e.target.closest("[data-acq-lang]");
    if(!b)return;
    landingLang=b.dataset.acqLang;
    statusData().then(d=>renderLanding(c,d,false));
  });
}

/* ---------- Lead Routing ---------- */
const ROUTING_FLOW=["FORM SUBMITTED","VALIDATE","DEDUPLICATE","EXISTING CONTACT CHECK","QUALIFY","SALESFORCE","OWNER"];
async function leadRouting(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Lead Routing","Automatic validation, deduplication and CRM delivery. Existing-account matches are never created as duplicate New Business leads.")+
    `<div class="acq-hero-flow"><div class="acq-hero-flow-head"><span>DEDUPLICATION-FIRST ROUTING</span><h3>Form → Owner</h3></div>${flow(ROUTING_FLOW)}</div>`;
  icons();
  const d=await statusData(),s=d.status||{};
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Lead Routing","Automatic validation, deduplication and CRM delivery. Existing-account matches are never created as duplicate New Business leads.")+
    `<div class="acq-hero-flow"><div class="acq-hero-flow-head"><span>DEDUPLICATION-FIRST ROUTING</span><h3>Form → Owner</h3></div>${flow(ROUTING_FLOW)}</div>`+
    metrics([
      ["NEW LEADS",safeNum(s.leads),"Total intake"],
      ["QUALIFIED",safeNum(s.qualified),"Complete requirement"],
      ["EXISTING MATCH",safeNum(s.existingMatches),"CRM duplicate prevented"],
      ["ROUTED",safeNum(s.routed),"Salesforce"]
    ])+
    `<div class="acq-split">
      <section class="acq-panel"><div class="acq-panel-head"><div><span>FAIL-CLOSED IDENTITY RULE</span><h3>Never a duplicate lead</h3></div>${badge("ENFORCED","good")}</div>
      <div class="acq-callout"><strong>Existing account match → Existing Account Growth</strong><p>A matched company or contact is routed by CRM policy, not created as a new-business lead. Company name alone is never treated as canonical identity.</p></div></section>
      <section class="acq-panel"><div class="acq-panel-head"><div><span>OWNERSHIP</span><h3>New Business Owner</h3></div>${badge("SALESFORCE ONLY","good")}</div>
      <div class="acq-callout">${ownerLine(s)}<p>The owner name only appears once Salesforce returns the real lead assignment. No name is ever inferred or invented in this view.</p></div></section>
    </div>`+
    (d.error?`<p class="acq-note">${esc(d.error)}</p>`:"");
  icons();
}

R["acquisition-command-center"]=commandCenter;
R["landing-pages"]=landingPages;
R["lead-routing"]=leadRouting;

g.DGL_ACQUISITION_VISUAL_V3={designMeta};
})(window);
