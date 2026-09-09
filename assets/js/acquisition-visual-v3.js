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
    cyclePanel(s)+
    (d.error?`<p class="acq-note">${esc(d.error)}</p><div class="acq-callout"><strong>AUTOMATION RUNS SERVER-SIDE</strong><p>The acquisition engine does not depend on this browser. Connect the private backend only to inspect live status; scheduled automation continues in Apps Script.</p></div>`:"");
  c.querySelector("[data-acq-run]")?.addEventListener("click",()=>runQa(c));
  icons();
}
function cyclePanel(s){
  const cycle=s.cycle;
  if(!cycle)return "";
  const inSync=cycle.gateInSync,current=cycle.current;
  return `<section class="acq-panel"><div class="acq-panel-head"><div><span>BIMONTHLY PUBLISHING CYCLE</span><h3>${esc(cycle.dueLabel||cycle.dueCycleId||"—")}</h3></div>${badge(inSync?"CYCLE OPEN":"AWAITING NEXT TICK",inSync?"good":"warn")}</div>
    <div class="acq-callout"><strong>Sep → Nov → Jan → Mar → May → Jul, evergreen pages upserted, never duplicated</strong><p>${current?`Cycle ${esc(current.cycleId)} is ${esc(current.status||"OPEN")}${current.leads?`, ${esc(current.leads)} leads`:""}. The hourly heartbeat opens/closes cycles automatically — no manual scheduler run required.`:"No cycle has been opened yet; the next hourly tick will open the due cycle automatically."}</p></div>
  </section>`;
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
  return `<div class="acq-creative-variant">
    <div class="acq-creative-visual" style="background-image:url('${esc(meta.asset)}')"><div class="acq-creative-overlay"><span class="acq-creative-lang">${esc(LANG_LABEL[lang])}</span><strong>${esc(cr.headline)}</strong><p>${esc(cr.supportingLine)}</p><span class="acq-creative-cta">${esc(cr.cta)}</span></div></div>
    <div class="acq-creative-copy">
      <p class="acq-creative-social">${esc(cr.socialPost)}</p>
      <p class="acq-creative-desc">${esc(cr.description)}</p>
      <div class="acq-creative-hashtags">${cr.hashtags.map(h=>`<span>${esc(h)}</span>`).join("")}</div>
    </div>
  </div>`;
}
function creativeCard(meta){
  return `<article class="acq-creative-card">
    <div class="acq-design-top"><span>${esc(meta.system)}</span><strong>${esc(meta.id)} · Social / Ad Creative</strong></div>
    <div class="acq-creative-variants">${(I18N().LANGUAGES||["en","es","pt-BR"]).map(lang=>creativeVariant(meta,lang)).join("")}</div>
  </article>`;
}
function creativesSection(){
  return `<section class="acq-panel"><div class="acq-panel-head"><div><span>ACQUISITION CREATIVES</span><h3>Social / ad posts — generated automatically from the signal, all 3 languages together</h3></div>${badge("VISUAL CREATIVE READY","good")}${badge("PUBLISH CONNECTOR REQUIRED","warn")}</div>
  <p class="acq-note">The visual template and copy are real and generated automatically per signal. No server-side PNG export or social publish connector exists yet — DGL does not claim a post was published until that connector is built and configured.</p>
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

/* ---------- Channels audit: function / status / input / output / connector / next action / blocker ---------- */
function channelDetail(x){
  const ready=x.status==="READY";
  return `<article class="acq-channel-detail">
    <div class="acq-channel-detail-top"><h3>${esc(x.name)}</h3>${badge(x.status,ready?"good":"warn")}</div>
    <p class="acq-channel-fn">${esc(x.fn)}</p>
    <div class="acq-channel-grid-mini">
      <div><span>INPUT</span><strong>${esc(x.input)}</strong></div>
      <div><span>OUTPUT</span><strong>${esc(x.output)}</strong></div>
      <div><span>CONNECTOR</span><strong>${esc(x.connector)}</strong></div>
      <div><span>NEXT AUTOMATIC ACTION</span><strong>${esc(x.nextAction)}</strong></div>
    </div>
    ${ready?"":`<div class="acq-channel-blocker"><strong>BLOCKER</strong><p>${esc(x.blocker)}</p></div>`}
  </article>`;
}
function channelSpecs(h){
  h=h||{};
  return [
    {key:"paidMedia",name:"Paid Media",fn:"Generates qualified paid traffic (Google / Meta) into the same automatic lead pipeline as every other channel.",input:"Campaign budget and targeting set in the ad platform",output:"Traffic → Landing Page → Lead Capture",connector:"ACQ_PAID_CONNECTOR",nextAction:"Connect the provider so spend, CPL and conversions can be reported truthfully",blocker:"ACQ_PAID_CONNECTOR is not configured. No spend, CPL or conversion number is shown until it is connected — DGL does not invent paid performance data."},
    {key:"linkedin",name:"LinkedIn Acquisition",fn:"B2B lead generation and prospecting on LinkedIn, routed into the same New Business pipeline.",input:"LinkedIn Ads / Lead Gen Forms campaign",output:"Lead → Validate → Dedupe → Salesforce",connector:"ACQ_LINKEDIN_CONNECTOR",nextAction:"Connect LinkedIn Ads / Lead Gen so campaign and conversion data can be reported truthfully",blocker:"ACQ_LINKEDIN_CONNECTOR is not configured. No LinkedIn spend or lead count is shown until it is connected."},
    {key:"outbound",name:"Outbound / Lead Nurture",fn:"Cold prospecting and lead nurture for new prospects only — never existing DGL accounts.",input:"Prospect list from an approved outbound provider (not AM/AURA accounts)",output:"Reply / Meeting → New Business lead",connector:"ACQ_OUTBOUND_CONNECTOR",nextAction:"Connect an approved bulk provider; deduplicate against Salesforce before any send",blocker:"ACQ_OUTBOUND_CONNECTOR is not configured. No outbound send happens until a provider is connected and dedupe against existing accounts is verified."},
    {key:"leadIntake",name:"Lead Capture",fn:"Public landing forms (EN/ES/PT-BR) write directly to the private Data Hub — never to GitHub.",input:"Landing form submission",output:"New row in MKT_ACQ_LEADS (private)",connector:"AcquisitionPublicRuntime.gs (public web app)",nextAction:"Validate → Deduplicate → Qualify → Route to Salesforce",blocker:"ACQ_PUBLIC_LANDING_BASE_URL is not configured. Landing pages exist as a governed design system but cannot capture real leads until the public runtime is deployed."},
    {key:"attribution",name:"Acquisition Attribution",fn:"Closes the loop from source to new-business revenue: source → landing → lead → opportunity → customer.",input:"Routed Salesforce leads and their outcomes",output:"Opportunity / Customer / New Business revenue",connector:"ACQ_ATTRIBUTION_CONNECTOR",nextAction:"Connect the Salesforce outcome sync so revenue can be attributed truthfully",blocker:"ACQ_ATTRIBUTION_CONNECTOR is not configured. Revenue is shown as — rather than a fabricated number."},
    {key:"wordpress",name:"WordPress Publisher",fn:"Upserts governed, DGL-branded landing pages (EN/ES/PT-BR) to dglus.com — evergreen pages updated in place, never duplicated.",input:"Generated landing variant (headline, copy, CTA, SEO, UTM)",output:"Published/updated WordPress page, form posts back into this same pipeline",connector:"ACQ_WP_BASE_URL / ACQ_WP_USERNAME / ACQ_WP_APP_PASSWORD",nextAction:"Create a WordPress application password and set the 3 Script Properties",blocker:"WordPress credentials are not configured. No page is published until all 3 are set."},
    {key:"ga4",name:"GA4 Analytics",fn:"Connector contract only — decides whether traffic/conversion reporting can ever appear.",input:"GA4 property id",output:"Traffic/conversion metrics (once the Data API integration is built)",connector:"ACQ_GA4_PROPERTY_ID",nextAction:"Set the property id, then build the GA4 Data API integration",blocker:h.ga4==="CONNECTOR REQUIRED"?"Property id is set, but the GA4 Data API integration is not built yet — no traffic number is shown.":"ACQ_GA4_PROPERTY_ID is not configured."}
  ].map(spec=>({...spec,status:spec.key==="ga4"?(h.ga4||"NOT CONFIGURED"):((h[spec.key]||"NOT CONFIGURED")==="READY"?"READY":"NOT CONFIGURED")}));
}
async function channelOrchestration(c){
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Channel Orchestration","Every acquisition channel funnels into one lead pipeline. No channel keeps its own manual list or its own owner.")+`<div class="acq-empty"><i data-lucide="loader-circle"></i><strong>Loading channel health…</strong></div>`;
  icons();
  const d=await statusData(),h=(d.status||{}).health||{};
  c.innerHTML=head("NEW BUSINESS ACQUISITION","Channel Orchestration","Every acquisition channel funnels into one lead pipeline. No channel keeps its own manual list or its own owner.")+
    `<div class="acq-channel-detail-grid">${channelSpecs(h).map(channelDetail).join("")}</div>`+
    (d.error?`<p class="acq-note">${esc(d.error)}</p>`:"");
  icons();
}
async function channelPage(c,key,title,sub){
  c.innerHTML=head("NEW BUSINESS ACQUISITION",title,sub)+`<div class="acq-empty"><i data-lucide="loader-circle"></i><strong>Loading channel health…</strong></div>`;
  icons();
  const d=await statusData(),h=(d.status||{}).health||{},spec=channelSpecs(h).find(x=>x.key===key);
  c.innerHTML=head("NEW BUSINESS ACQUISITION",title,sub)+
    `<div class="acq-channel-detail-grid">${channelDetail(spec)}</div>`+
    (d.error?`<p class="acq-note">${esc(d.error)}</p>`:"");
  icons();
}

R["acquisition-command-center"]=commandCenter;
R["landing-pages"]=landingPages;
R["lead-routing"]=leadRouting;
R["channel-orchestration"]=channelOrchestration;
R["paid-media"]=c=>channelPage(c,"paidMedia","Paid Media","Paid campaigns feed the same automatic lead pipeline; the UI never invents spend, CPL or conversions.");
R["linkedin-acquisition"]=c=>channelPage(c,"linkedin","LinkedIn Acquisition","LinkedIn campaigns and Lead Gen enter the same automated lead pipeline as every other channel.");
R["outbound-acquisition"]=c=>channelPage(c,"outbound","Outbound / Lead Nurture","Cold prospects only, deduplicated against Salesforce before any production send.");
R["lead-capture"]=c=>channelPage(c,"leadIntake","Lead Capture","The single point where new leads from landing pages and forms enter the private Data Hub.");
R["acquisition-attribution"]=c=>channelPage(c,"attribution","Acquisition Attribution","Closed loop from source to new-business revenue, never mixed with Existing Account Growth revenue.");

g.DGL_ACQUISITION_VISUAL_V3={designMeta,channelSpecs};
})(window);
