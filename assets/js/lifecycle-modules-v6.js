(function(g){
"use strict";

const R=g.DGL_MODULE_RENDERERS=g.DGL_MODULE_RENDERERS||{};
const A=()=>g.DGL_MARKETING_BACKEND_ADAPTER_V55;
const E=v=>String(v==null?"":v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
const U=v=>String(v||"").trim().toUpperCase();
const N=n=>Number(n||0).toLocaleString("en-US");
const C=()=>!!A()?.isConnected?.();
const P=()=>g.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus||"BULK PROVIDER NOT CONFIGURED";
const OWNER_KEY="dgl_v6_owner_filter";

const ORDER={QNB:1,RETENTION:2,REACTIVATION:3,"CROSS-SELL":4,NURTURE:5};
const FAMILY_LABEL={
  QNB:"Quoted Not Booked",
  RETENTION:"Retention",
  REACTIVATION:"Reactivation",
  "CROSS-SELL":"Cross-Sell",
  NURTURE:"Nurture / Relationship Renewal"
};

function family(v){
  const x=U(v);
  if(x.includes("QUOTE")||x.includes("QNB"))return"QNB";
  if(x.includes("RETENTION"))return"RETENTION";
  if(x.includes("REACTIVATION"))return"REACTIVATION";
  if(x.includes("CROSS"))return"CROSS-SELL";
  if(x.includes("NURTURE")||x.includes("RENEWAL"))return"NURTURE";
  return x||"UNKNOWN";
}
function slug(v){
  return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"-").replace(/^-+|-+$/g,"");
}
function normalizedWindow(v){
  const raw=String(v==null?"":v).trim(),x=raw.toUpperCase();
  if(!raw)return"";
  if(x==="3-7"||x==="8-14"||x==="0-14"||x==="0–14")return"0-14";
  if(x==="15-30"||x==="15–30")return"15-30";
  if(x===">30"||x==="30+"||x==="30 +")return"30+";
  if(/GMT|STANDARD TIME|HORA ESTÁNDAR|^\w{3}\s\w{3}\s\d{1,2}\s\d{4}/i.test(raw))return"0-14";
  return raw;
}
function selectedOwner(){return sessionStorage.getItem(OWNER_KEY)||"ALL";}
function setOwner(v){sessionStorage.setItem(OWNER_KEY,v||"ALL");}
function ownerList(groups){return[...new Set((groups||[]).map(x=>String(x.amOwner||"Unassigned").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function filterOwner(groups){const o=selectedOwner();return o==="ALL"?groups:groups.filter(x=>String(x.amOwner||"Unassigned").trim()===o);}
function fieldCoverage(groups,field){
  const rows=groups||[];
  if(!rows.length)return 0;
  return rows.filter(x=>x[field]!==undefined&&x[field]!==null&&String(x[field]).trim()!=="").length/rows.length;
}
function scopeId(x){
  return`SCOPE-${slug(x.amOwner||"UNASSIGNED")}-${slug(family(x.opportunityType))}-${slug(x.service||"MULTISERVICIO")}-${slug(normalizedWindow(x.window||""))}-${slug(x.reasonCategory||"")}`;
}
function objective(x){
  const f=family(x.opportunityType);
  if(f==="QNB")return"Quoted Not Booked";
  if(f==="CROSS-SELL")return"Cross-Sell";
  if(f==="RETENTION"||f==="NURTURE")return"Retention";
  return"Reactivation";
}
function qnbStrategy(reason){
  const r=U(reason);
  if(r.includes("HIGH PRICE")||r.includes("PRICE"))return"VALUE REPOSITIONING";
  if(r.includes("NO FEEDBACK")||r.includes("WORKING"))return"LIGHT FOLLOW-UP";
  if(r.includes("EXTERNAL"))return"LONG-TERM NURTURE";
  return"WINDOW-BASED FALLBACK";
}
function automationProfile(x){
  const f=family(x.opportunityType),reason=String(x.reasonCategory||"").trim();
  return{
    reasonStrategy:f==="QNB"?qnbStrategy(reason):"NOT REQUIRED",
    dataQuality:x.dataQualityStatus||(f==="QNB"&&!reason?"REASON SOURCE PENDING":"SOURCE SIGNAL AVAILABLE"),
    coordination:x.coordinationStatus||((f==="RETENTION"||f==="REACTIVATION")?"AM ACTIVITY EVENT NOT JOINED":"NOT REQUIRED"),
    policy:x.automationPolicy||"AUTOMATION-FIRST",
    risk:x.riskSignal||(f==="RETENTION"?"TIER / RISK SIGNAL":""),
    crossSellScore:x.crossSellScore||"",
    sourceSignalDetail:x.sourceSignalDetail||""
  };
}
function context(x){
  const id=scopeId(x),f=family(x.opportunityType),w=normalizedWindow(x.window||""),ap=automationProfile(x);
  return{
    source:"REPORT / DATA HUB",
    opportunitySource:"REPORT / DATA HUB",
    scopeId:id,audienceId:id,
    amOwner:x.amOwner||"Unassigned",
    campaignFamily:f,
    objective:objective(x),
    campaignName:`${FAMILY_LABEL[f]||f} · ${x.service||"Multiservicio"}${w?` · ${w}`:""}${x.reasonCategory?` · ${x.reasonCategory}`:""}`,
    service:x.service||"Multiservicio",
    qnbWindow:w,window:w,
    reasonCategory:x.reasonCategory||"",
    messageStrategy:ap.reasonStrategy,
    dataQualityStatus:ap.dataQuality,
    coordinationStatus:ap.coordination,
    automationPolicy:ap.policy,
    riskSignal:ap.risk,
    crossSellScore:ap.crossSellScore,
    sourceSignalDetail:ap.sourceSignalDetail,
    detectedAccounts:+x.detectedAccounts||0,
    eligibleAccounts:+x.eligibleAccounts||0,
    suppressedAccounts:+x.suppressedAccounts||0,
    accountCount:+x.eligibleAccounts||0,
    contactsStatus:"CONTACTS PENDING",
    eligibleContactCount:0,
    frequencyStatus:"PENDING BACKEND EVALUATION",
    exclusionStatus:"PENDING BACKEND EVALUATION",
    policyApprovalStatus:"AUTO BY POLICY · EXCEPT EXCEPTIONS",
    requiresHumanReview:false,
    executionReadiness:"BLOCKED",
    priority:+x.priority||ORDER[f]||99,
    lastEngineRun:x.lastEngineRun||null
  };
}
function openStudio(x){
  sessionStorage.setItem("dgl_v5_campaign_context",JSON.stringify(context(x)));
  location.hash="#/campaign-studio";
}

let cache={groups:null,summary:null,pipe:null,ts:0};
async function live(force=false){
  if(!C())return{groups:[],summary:null,pipe:null};
  if(!force&&cache.groups&&Date.now()-cache.ts<12000)return cache;
  const[o,p]=await Promise.all([
    A().v6Opportunities().catch(()=>null),
    A().v6PipelineSummary().catch(()=>null)
  ]);
  return cache={groups:o?.groups||[],summary:o?.summary||null,pipe:p||null,ts:Date.now()};
}

const badge=(t,k="info")=>`<span class="life-badge ${k}">${E(t)}</span>`;
const header=(title,sub,eye="AUTOMATION LIFECYCLE · V6")=>`<div class="page-head"><div><div class="eyebrow">${E(eye)}</div><h2>${E(title)}</h2><p class="lede">${E(sub)}</p></div><div class="page-head-actions">${C()?badge("PRIVATE BACKEND / LIVE","live"):badge("PRIVATE BACKEND REQUIRED","warn")}${C()?'<button class="btn btn-secondary" data-life-refresh>REFRESH VIEW</button>':'<button class="btn btn-primary" data-life-connect>CONNECT PRIVATE BACKEND</button>'}</div></div>`;
const kpis=a=>`<div class="kpi-grid">${a.map(([l,v,f])=>`<div class="kpi-card"><div class="kpi-content"><div class="kpi-label">${E(l)}</div><div class="kpi-value">${f===false?E(v):N(v)}</div></div></div>`).join("")}</div>`;

function required(c,title,sub){
  c.innerHTML=header(title,sub)+`<div class="life-empty"><strong>Private backend required</strong><p>No sample data is used. Connect the governed backend to load live lifecycle data.</p></div>`;
}
function ownerToolbar(groups){
  const owners=ownerList(groups),sel=selectedOwner();
  return`<div class="auto-ownerbar">
    <div><span>ACCOUNT OWNER</span><strong>${sel==="ALL"?"ALL OWNERS":E(sel)}</strong><small>${owners.length} owners detected automatically</small></div>
    <select class="auto-owner-select" data-life-owner-select aria-label="Account owner">
      <option value="ALL">All owners</option>
      ${owners.map(o=>`<option value="${E(o)}" ${sel===o?"selected":""}>${E(o)}</option>`).join("")}
    </select>
  </div>`;
}
function engineBadge(label,status,tone){
  return`<div class="auto-engine"><span>${E(label)}</span><strong>${E(status)}</strong>${badge(tone==="good"?"AUTOMATIC":tone==="warn"?"PARTIAL":"BLOCKED",tone==="good"?"live":tone==="warn"?"warn":"blocked")}</div>`;
}
function readiness(groups){
  const g=groups||[],reason=fieldCoverage(g,"reasonCategory"),coord=fieldCoverage(g,"coordinationStatus"),score=fieldCoverage(g,"crossSellScore");
  return{
    reason:reason>0.5?["REASON ROUTING","LIVE","good"]:reason>0?["REASON ROUTING","PARTIAL COVERAGE","warn"]:["REASON ROUTING","WINDOW FALLBACK","warn"],
    coordination:coord>0.5?["AM ACTIVITY COORDINATION","LIVE","good"]:["AM ACTIVITY COORDINATION","EVENT JOIN PENDING","warn"],
    scoring:score>0.5?["CROSS-SELL SCORING","LIVE","good"]:["CROSS-SELL SCORING","SERVICE GAP ONLY","warn"]
  };
}
function card(x){
  const q=context(x),ap=automationProfile(x);
  return`<article class="life-scope-card">
    <div class="life-scope-top">
      <div>
        <div class="auto-card-meta"><span class="auto-owner">${E(q.amOwner)}</span><span class="life-kicker">${E(q.campaignFamily)} · PRIORITY ${q.priority}</span></div>
        <h3>${E(q.campaignName)}</h3>
        <p>${E(q.service)}${q.window?` · ${E(q.window)}`:""}${q.reasonCategory?` · ${E(q.reasonCategory)}`:""}</p>
      </div>${badge(q.eligibleAccounts?"SCOPE READY":"NO ELIGIBLE","live")}
    </div>
    <div class="life-metric-row">
      <div><span>Detected</span><strong>${N(q.detectedAccounts)}</strong></div>
      <div><span>Eligible</span><strong>${N(q.eligibleAccounts)}</strong></div>
      <div><span>Suppressed</span><strong>${N(q.suppressedAccounts)}</strong></div>
      <div><span>Contacts</span><strong class="life-contact-block">PENDING</strong></div>
    </div>
    <div class="auto-signal-grid">
      <div><span>MESSAGE STRATEGY</span><strong>${E(ap.reasonStrategy)}</strong></div>
      <div><span>DATA QUALITY</span><strong>${E(ap.dataQuality)}</strong></div>
      <div><span>COORDINATION</span><strong>${E(ap.coordination)}</strong></div>
      <div><span>AUTOMATION POLICY</span><strong>${E(ap.policy)}</strong></div>
    </div>
    <div class="life-scope-foot">
      <div><strong>CONTACTS BLOCKED</strong><p>Scope generation is automatic. Recipient resolution is the next production gate.</p></div>
      <button class="btn btn-primary" data-life-prepare="${E(q.scopeId)}">PREPARE CAMPAIGN</button>
    </div>
  </article>`;
}
async function scopeView(c,{title,sub,fams=null,service=null,eye="CAMPAIGN ENGINE · LIVE"}){
  if(!C())return required(c,title,sub);
  const d=await live(),all=d.groups||[];
  let base=all;
  if(fams)base=base.filter(x=>fams.includes(family(x.opportunityType)));
  if(service)base=base.filter(x=>U(x.service)===U(service));
  const visible=filterOwner(base).sort((a,b)=>(+a.priority||99)-(+b.priority||99)||(+b.eligibleAccounts||0)-(+a.eligibleAccounts||0));
  const det=visible.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=visible.reduce((s,x)=>s+(+x.eligibleAccounts||0),0),sup=visible.reduce((s,x)=>s+(+x.suppressedAccounts||0),0);
  g.__DGL_LIFE_GROUPS=Object.fromEntries(all.map(x=>[scopeId(x),x]));
  c.innerHTML=header(title,sub,eye)+ownerToolbar(base)+
    kpis([["DETECTED SIGNALS",det],["ELIGIBLE ACCOUNTS",eli],["SUPPRESSED",sup],["AUTOMATIC SCOPES",visible.length]])+
    `<div class="life-status-strip"><div><span>Operating rule</span><strong>AUTOMATIC SCOPE GENERATION</strong></div><p>No recurring manual account selection. Rules decide eligibility, suppression, pressure and routing.</p></div>
     <div class="life-scope-stack">${visible.length?visible.map(card).join(""):`<div class="life-empty"><strong>No live scopes for ${E(selectedOwner())}</strong></div>`}</div>`;
}
async function commandCenter(c){
  if(!C())return required(c,"Marketing Campaign Command Center","Automatic decision system from commercial signal to retained revenue.");
  const d=await live(true),groups=d.groups||[],base=filterOwner(groups),by=d.pipe?.byCurrentStage||d.pipe?.byStage||{},fs={},rd=readiness(groups);
  base.forEach(x=>{const f=family(x.opportunityType);fs[f]=fs[f]||{d:0,e:0,s:0};fs[f].d+=+x.detectedAccounts||0;fs[f].e+=+x.eligibleAccounts||0;fs[f].s+=+x.suppressedAccounts||0;});
  const det=base.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=base.reduce((s,x)=>s+(+x.eligibleAccounts||0),0),sup=base.reduce((s,x)=>s+(+x.suppressedAccounts||0),0);
  c.innerHTML=header("Marketing Campaign Command Center","Reports → Opportunity Engine → rules → contacts → campaign → response → attribution.","AUTOMATION COMMAND · LIVE")+
    ownerToolbar(groups)+kpis([["SIGNALS",det],["ELIGIBLE",eli],["SUPPRESSED",sup],["AUTOMATIC SCOPES",base.length]])+
    `<section class="auto-panel"><div class="auto-panel-head"><div><span>AUTOMATION READINESS</span><h3>Decision engines</h3></div>${badge("AUTOMATION FIRST","live")}</div>
      <div class="auto-engine-grid">
        ${engineBadge("Signal ingestion","LIVE","good")}
        ${engineBadge("Priority conflict","LIVE","good")}
        ${engineBadge("Owner discovery","DYNAMIC","good")}
        ${engineBadge("Frequency / cooldown","LIVE","good")}
        ${engineBadge(rd.reason[0],rd.reason[1],rd.reason[2])}
        ${engineBadge("Retention risk","LIVE SOURCE","good")}
        ${engineBadge(rd.coordination[0],rd.coordination[1],rd.coordination[2])}
        ${engineBadge(rd.scoring[0],rd.scoring[1],rd.scoring[2])}
        ${engineBadge("Contact resolution","AUTHORITATIVE SOURCE REQUIRED","bad")}
        ${engineBadge("Bulk execution",P(),"bad")}
      </div>
    </section>
    <div class="life-grid-2">
      <section class="life-panel"><h3>Opportunity families</h3><div class="life-family-grid">${Object.entries(fs).sort((a,b)=>(ORDER[a[0]]||99)-(ORDER[b[0]]||99)).map(([f,v])=>`<div class="life-family-card"><span>${E(FAMILY_LABEL[f]||f)}</span><strong>${N(v.e)}</strong><small>${N(v.d)} detected · ${N(v.s)} suppressed</small></div>`).join("")}</div></section>
      <section class="life-panel"><h3>Commercial progression</h3><div class="life-funnel">${["OPPORTUNITY DETECTED","ELIGIBLE FOR CAMPAIGN","CAMPAIGN ACTIVE","RESPONDED","RFQ RECEIVED","QUOTED","LOAD / REACTIVATED","RETAINED / EXPANDED"].map(s=>`<div><span>${E(s)}</span><strong>${N(by[s])}</strong></div>`).join("")}</div></section>
    </div>`;
}
async function automationControl(c){
  if(!C())return required(c,"Automation Playbooks","Automatic policies, data readiness and campaign logic.");
  const d=await live(true),groups=d.groups||[],rd=readiness(groups);
  c.innerHTML=header("Automation Playbooks","Rules decide the next action. Humans review only strategic or restricted exceptions.","AUTOMATION POLICY · V6")+
  `<section class="auto-panel"><div class="auto-panel-head"><div><span>MASTER PRINCIPLE</span><h3>No recurring manual campaign lists</h3></div>${badge("ENFORCED","live")}</div><p class="life-copy">Detection, owner mapping, priority, suppression, cadence, campaign preparation, response stop and attribution are designed to progress from data. Manual review is an exception path, never the normal operating model.</p></section>
   <div class="auto-rule-grid">
    <article><span>QNB</span><strong>Reason-aware routing</strong><p>High Price → value repositioning · No Feedback / Working on it → light follow-up · External Decision → long-term nurture. Until Reason exists, window fallback stays active.</p>${badge(rd.reason[1],rd.reason[2]==="good"?"live":"warn")}</article>
    <article><span>RETENTION</span><strong>Risk before tier fall</strong><p>Tier/bucket signal activates retention. Recent AM activity must suppress or defer Marketing automatically once the activity event is joined.</p>${badge(rd.coordination[1],rd.coordination[2]==="good"?"live":"warn")}</article>
    <article><span>REACTIVATION</span><strong>House Account timing</strong><p>Reassigned House Accounts are detected automatically, but execution must wait for the first AM contact event. No manual campaign list.</p>${badge("EVENT JOIN REQUIRED","warn")}</article>
    <article><span>CROSS-SELL</span><strong>Scored opportunity</strong><p>Target model: service gap + lane strength + portfolio diversification + account health. Current backend is still service-gap led.</p>${badge(rd.scoring[1],rd.scoring[2]==="good"?"live":"warn")}</article>
    <article><span>CONTACT VALIDATION</span><strong>House + 90d no load</strong><p>Low-priority nurture path when authoritative contacts and delivery tracking exist. Bounce is quality risk; click/reply/RFQ rank higher than open.</p>${badge("CONTACT SOURCE BLOCKED","blocked")}</article>
    <article><span>APPROVAL</span><strong>Policy-based</strong><p>Normal governed campaigns should auto-progress when gates clear. Human approval is reserved for strategic, restricted or material exceptions.</p>${badge("POLICY DEFINED","live")}</article>
   </div>
   <section class="auto-panel"><div class="auto-panel-head"><div><span>CADENCE</span><h3>Canonical pressure rules</h3></div>${badge("10–14 DAY NORMAL FOLLOW-UP","live")}</div>
   <div class="auto-cadence">${[
      ["QNB 0–14","0, 10"],["QNB 15–30","0, 12"],["QNB 30+","0, 14, 30"],["Retention","0, 14, 30"],["Reactivation","0, 12, 30"],["Cross-Sell","0, 14, 30"],["Nurture","0, 30, 60"]
   ].map(x=>`<div><span>${x[0]}</span><strong>${x[1]} days</strong></div>`).join("")}</div></section>`;
}
async function control(c){
  if(!C())return required(c,"Campaign Control","Governed activation and execution status.");
  const campaigns=A().getCampaigns?.()||[];
  c.innerHTML=header("Campaign Control","Automatic policy gates before activation; exceptions remain reviewable.","EXECUTION CONTROL · V6")+
    kpis([["CAMPAIGNS",campaigns.length],["AUTOMATION MODE","POLICY-BASED",false],["CONTACTS","BLOCKED",false],["BULK PROVIDER",P(),false]])+
    `<div class="life-status-strip blocked"><div><span>Production execution</span><strong>${E(P())}</strong></div><p>Gmail remains Test Draft / QA only. Production remains blocked until provider + authoritative contacts + backend policy enforcement are clear.</p></div>`;
}
async function email(c){
  if(!C())return required(c,"Email Marketing","Governed email QA and delivery readiness.");
  const campaigns=A().getCampaigns?.()||[],activity=A().getActivity?.()||[];
  c.innerHTML=header("Email Marketing","QA, recipient readiness and response-safe execution. Gmail is not the bulk-send engine.","CHANNEL · EMAIL")+
    kpis([["CAMPAIGNS",campaigns.length],["TEST DRAFTS",activity.filter(x=>U(x.actionType||x.action)==="TEST_DRAFT_CREATED").length],["LIVE SENDS","BLOCKED",false],["PROVIDER",P(),false]])+
    `<div class="life-grid-3"><section class="life-panel"><h3>Test Draft</h3>${badge("QA AVAILABLE","live")}<p class="life-copy">Copy and creative validation before policy approval.</p></section><section class="life-panel"><h3>Response stop</h3>${badge("ACCOUNT ONLY","live")}<p class="life-copy">A reply stops that account only; remaining eligible campaign accounts continue.</p></section><section class="life-panel"><h3>Contact validation</h3>${badge("SOURCE REQUIRED","blocked")}<p class="life-copy">Bounce / delivered / open / click / reply / RFQ become automated contact signals once the authoritative contact source is connected.</p></section></div>`;
}
function staticView(c,title,sub,eye,cards){
  c.innerHTML=header(title,sub,eye)+`<div class="life-grid-3">${cards.map(x=>`<section class="life-panel"><div class="life-panel-head"><div><span>${E(x[0])}</span><h3>${E(x[1])}</h3></div>${badge(x[2],x[3]||"info")}</div><p class="life-copy">${E(x[4])}</p></section>`).join("")}</div>`;
}
async function priority(c){
  if(!C())return required(c,"Account Priority Queue","Priority view derived automatically from the Opportunity Engine.");
  const d=await live(),all=d.groups||[],base=filterOwner(all),x=[...base].sort((a,b)=>(+a.priority||99)-(+b.priority||99)||(+b.eligibleAccounts||0)-(+a.eligibleAccounts||0)).slice(0,40);
  g.__DGL_LIFE_GROUPS=Object.fromEntries(all.map(z=>[scopeId(z),z]));
  c.innerHTML=header("Account Priority Queue","Priority is computed from opportunity family and suppression rules, never from a hand-built list.","ACCOUNTS · AUTOMATIC PRIORITY")+ownerToolbar(all)+
  kpis([["QNB · P1",x.filter(z=>+z.priority===1).reduce((s,z)=>s+(+z.eligibleAccounts||0),0)],["RETENTION · P2",x.filter(z=>+z.priority===2).reduce((s,z)=>s+(+z.eligibleAccounts||0),0)],["REACTIVATION · P3",x.filter(z=>+z.priority===3).reduce((s,z)=>s+(+z.eligibleAccounts||0),0)],["TOP SCOPES",x.length]])+
  `<div class="life-scope-stack">${x.map(card).join("")}</div>`;
}
async function analytics(c,title="Marketing Analytics",attrib=false){
  if(!C())return required(c,title,"Real lifecycle funnel analytics.");
  const d=await live(true),all=d.groups||[],base=filterOwner(all),by=d.pipe?.byCurrentStage||d.pipe?.byStage||{},det=base.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=base.reduce((s,x)=>s+(+x.eligibleAccounts||0),0);
  const st=[["DETECTED",det],["ELIGIBLE",eli],["ACTIVE",by["CAMPAIGN ACTIVE"]],["RESPONDED",by["RESPONDED"]],["RFQ",by["RFQ RECEIVED"]],["QUOTED",by["QUOTED"]],["LOAD",by["LOAD / REACTIVATED"]],["RETAINED",by["RETAINED / EXPANDED"]]];
  c.innerHTML=header(title,attrib?"Response → RFQ → Quote → Load → retained revenue. Real outcomes only.":"One automatic funnel from source signal to retained / expanded revenue.",attrib?"ANALYTICS · ATTRIBUTION":"ANALYTICS · LIVE")+ownerToolbar(all)+
    `<div class="life-analytics-funnel">${st.map(([l,v])=>`<div><span>${l}</span><strong>${N(v)}</strong></div>`).join("")}</div>`;
}
function account360(c){
  staticView(c,"Account 360","Account/contact detail remains private. No demo identity is shown.","ACCOUNTS · PRIVATE",[
    ["ACCOUNT MASTER","MKT_ACCOUNTS","SOURCE INGESTION REQUIRED","warn","Populate automatically from authoritative Salesforce-derived account data; do not maintain by hand."],
    ["CONTACT MASTER","MKT_CONTACTS_SECURE","BLOCKED","blocked","Authoritative current contacts, email status and DNC state are required before recipient resolution."],
    ["PRIVACY","Public Pages","ENFORCED","live","Only safe aggregates reach the public frontend; customer PII remains in the private backend."]
  ]);
}
function channels(c){
  staticView(c,"Paid / Retargeting / LinkedIn","Secondary channels remain downstream of the same automatic account rules.","CHANNELS · SECONDARY",[
    ["EMAIL","Lifecycle channel","PRIMARY","live","Email is first because recipient resolution, stop-on-response and attribution rules are defined there."],
    ["PAID","Retargeting","NOT ACTIVATED","warn","Do not activate until consent, exclusions, frequency and attribution are governed."],
    ["LINKEDIN","LinkedIn","NOT ACTIVATED","warn","Must inherit the same account pressure and exclusion state before launch."]
  ]);
}
function content(c){
  const systems=Object.values(g.DGL_CREATIVE_LIBRARY_V5?.CREATIVE_SYSTEMS||{});
  c.innerHTML=header("Content & Landing Assets","Approved creative systems governed by memory and cooldown.","CREATIVE · AUTOMATED LIBRARY")+
    kpis([["CREATIVE SYSTEMS",systems.length],["COPY MEMORY","90 DAYS / ACCOUNT",false],["ASSET COOLDOWN","90 DAYS / ACCOUNT",false],["GLOBAL COOLDOWN","60 DAYS",false]]);
}
async function reports(c){
  if(!C())return required(c,"Account & Campaign Reports","Execution, audit and archive status.");
  const d=await live(true),campaigns=A().getCampaigns?.()||[];
  c.innerHTML=header("Account & Campaign Reports","Auditable outputs from opportunity, policy, execution and commercial outcome ledgers.","REPORTING · LIVE")+
    kpis([["OPPORTUNITY GROUPS",(d.groups||[]).length],["CAMPAIGNS",campaigns.length],["PIPELINE ACCOUNTS",d.pipe?.total||0],["ARCHIVE","PENDING LIVE EXECUTION",false]]);
}
function governance(c){
  staticView(c,"Governance & Approvals","Governance is encoded as automatic policy; humans handle exceptions.","ADMIN · AUTOMATION POLICY",[
    ["OPERATING MODEL","No manual campaign lists","ENFORCED","live","Report signals generate campaign scopes automatically. Manual selection is prohibited as a recurring workflow."],
    ["PRESSURE","2 touches / 30d","ENFORCED","live","Maximum 2 Marketing touches per account and per contact in a rolling 30-day window."],
    ["FOLLOW-UP","10–14 days","ENFORCED","live","Normal automated follow-up at 3–8 days is prohibited."],
    ["APPROVAL","Policy-based","DEFINED","live","Normal governed campaigns auto-progress when technical gates are clear; strategic/restricted/material exceptions require human review."],
    ["MEETING","AM–Marketing monthly","GOVERNANCE ONLY","live","Review results, exceptions and rule changes. The meeting does not create manual campaign lists."],
    ["RESPONSE","Stop account only","ENFORCED","live","Customer response stops pending automation for that account only."]
  ]);
}

R["command-center"]=commandCenter;
R["campaign-opportunities"]=c=>scopeView(c,{title:"Campaign Opportunities",sub:"All report-derived opportunities grouped into automatic governed scopes.",eye:"OPPORTUNITY ENGINE · LIVE"});
R["campaign-execution"]=control;
R["reactivation"]=c=>scopeView(c,{title:"Reactivation Campaigns",sub:"Dormant-account opportunities detected automatically. House reassignment timing becomes event-driven when the AM activity signal is joined.",fams:["REACTIVATION"],eye:"CAMPAIGN ENGINE · REACTIVATION"});
R["quoted-not-booked"]=c=>scopeView(c,{title:"Quoted Not Booked",sub:"Priority-1 recovery. Reason-aware strategy activates automatically when Reason becomes available; window routing is the safe fallback.",fams:["QNB"],eye:"PRIORITY 1 · QNB"});
R["growth"]=c=>scopeView(c,{title:"Cross-Sell Campaigns",sub:"Automatic service-gap opportunities; target state adds lane strength, portfolio diversification and account health scoring.",fams:["CROSS-SELL"],eye:"CAMPAIGN ENGINE · CROSS-SELL"});
R["retention"]=c=>scopeView(c,{title:"Retention / Nurture",sub:"Risk and relationship signals governed automatically by pressure and cooldown rules.",fams:["RETENTION","NURTURE"],eye:"CAMPAIGN ENGINE · RETENTION"});
R["service-marketing"]=c=>scopeView(c,{title:"Service Campaign Overview",sub:"Live automatic scopes across FTL, LTL, Drayage and Multiservicio.",eye:"SERVICE CAMPAIGNS · LIVE"});
R["ftl-marketing"]=c=>scopeView(c,{title:"FTL Campaigns",sub:"Automatic FTL scopes from the Opportunity Engine.",service:"FTL",eye:"SERVICE · FTL"});
R["ltl-marketing"]=c=>scopeView(c,{title:"LTL Campaigns",sub:"Automatic LTL scopes from the Opportunity Engine.",service:"LTL",eye:"SERVICE · LTL"});
R["drayage-marketing"]=c=>scopeView(c,{title:"Drayage Campaigns",sub:"Automatic Drayage scopes from the Opportunity Engine.",service:"Drayage",eye:"SERVICE · DRAYAGE"});
R["email-marketing"]=email;
R["channel-orchestration"]=channels;
R["content-library"]=content;
R["automation-playbooks"]=automationControl;
R["priority-queue"]=priority;
R["account-360"]=account360;
R["campaign-attribution"]=c=>analytics(c,"Campaign Revenue Attribution",true);
R["analytics"]=c=>analytics(c);
R["account-campaign-reports"]=reports;
R["governance"]=governance;

function rerender(){
  cache={groups:null,summary:null,pipe:null,ts:0};
  const m=document.getElementById("mainContent"),id=location.hash.replace("#/","")||"command-center";
  if(m&&R[id])R[id](m);
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("[data-life-prepare]");
  if(b){const x=(g.__DGL_LIFE_GROUPS||{})[b.dataset.lifePrepare];if(x)openStudio(x);return;}
  if(e.target.closest("[data-life-connect]")){try{await A().connect();rerender();}catch(err){console.error(err)}return;}
  if(e.target.closest("[data-life-refresh]"))rerender();
});
document.addEventListener("change",e=>{
  const s=e.target.closest("[data-life-owner-select]");
  if(s){setOwner(s.value);rerender();}
});

const style=document.createElement("style");
style.textContent=`
.auto-ownerbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 18px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.025)}
.auto-ownerbar span,.auto-panel-head span,.auto-rule-grid article>span,.auto-signal-grid span{display:block;font-size:8px;letter-spacing:.08em;color:#788399;font-weight:850;text-transform:uppercase}
.auto-ownerbar strong{display:block;margin-top:3px;font-size:12px;color:#fff}.auto-ownerbar small{display:block;margin-top:3px;color:#667085;font-size:9px}
.auto-owner-select{min-height:42px;min-width:210px;padding:0 34px 0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#111827;color:#fff;font-size:11px;font-weight:750}
.auto-card-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.auto-owner{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;background:rgba(5,3,92,.95);border:1px solid rgba(119,184,42,.32);color:#fff;font-size:9px;font-weight:850}
.auto-signal-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
.auto-signal-grid>div{padding:12px 15px;border-right:1px solid rgba(255,255,255,.06)}.auto-signal-grid>div:last-child{border-right:0}.auto-signal-grid strong{display:block;margin-top:6px;color:#dce3ef;font-size:10px;line-height:1.35}
.auto-panel{margin:18px 0;padding:18px;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.02)}.auto-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.auto-panel-head h3{margin:4px 0 0;color:#fff}
.auto-engine-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:16px}.auto-engine{min-height:104px;padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:#0d1221}.auto-engine span{display:block;color:#7f8aa0;font-size:8px;font-weight:850;letter-spacing:.05em}.auto-engine strong{display:block;min-height:30px;margin:7px 0;color:#fff;font-size:10px;line-height:1.35}
.auto-rule-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.auto-rule-grid article{padding:17px;border:1px solid rgba(255,255,255,.08);border-radius:15px;background:#0d1221}.auto-rule-grid h3{margin:5px 0}.auto-rule-grid article>strong{display:block;margin:6px 0;color:#fff;font-size:14px}.auto-rule-grid p{min-height:78px;color:#8f9aaf;font-size:11px;line-height:1.55}
.auto-cadence{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:15px}.auto-cadence>div{padding:12px;border-radius:11px;background:#0d1221;border:1px solid rgba(255,255,255,.06)}.auto-cadence span{display:block;color:#7d8799;font-size:9px}.auto-cadence strong{display:block;margin-top:6px;color:#fff;font-size:11px}
@media(max-width:1100px){.auto-engine-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.auto-rule-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.auto-signal-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.auto-cadence{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.auto-ownerbar{align-items:stretch;flex-direction:column}.auto-owner-select{width:100%}.auto-engine-grid,.auto-rule-grid,.auto-signal-grid,.auto-cadence{grid-template-columns:1fr}.auto-signal-grid>div{border-right:0;border-bottom:1px solid rgba(255,255,255,.06)}}
`;
document.head.appendChild(style);

g.DGL_LIFECYCLE_MODULES_V6={version:"6.4-automation-first",scopeId,contextFor:context,openStudio,loadLive:live,normalizeWindow:normalizedWindow,automationProfile};
})(window);