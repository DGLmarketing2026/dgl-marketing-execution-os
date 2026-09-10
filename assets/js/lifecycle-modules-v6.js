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
// AURA live reporting: last successfully loaded MKT_AURA_EXECUTION_REPORT
// projection for this browser session (never demo data — only ever set from
// a real v6AuraExecutionReport response), current in-memory filter state and
// the auto-refresh interval handle for #/account-campaign-reports.
let auraCache=null,auraFilters={owner:"ALL",family:"ALL",status:"ALL",search:""},auraTimer=null,auraGmailCache=null;
async function live(force=false){
  if(!C())return{groups:[],summary:null,pipe:null};
  if(!force&&cache.groups&&Date.now()-cache.ts<12000)return cache;
  const[o,p]=await Promise.all([
    A().v6Opportunities().catch(()=>null),
    A().v6PipelineSummary().catch(()=>null)
  ]);
  return cache={groups:o?.groups||[],summary:o?.summary||null,pipe:p||null,ts:Date.now()};
}

// Safe Data Hub recovery snapshot: owner-level opportunity aggregates only.
// No account name, contact, quote or load identifier is present in this data.
const RECOVERY_SNAPSHOT_AT="2026-09-03T13:52:00-05:00";
const RECOVERY_OWNERS=["Alejandro Ochoa","Alex Cifuentes","Ali Pirela","Andres Bernal","Andy J. McNelly","Caroline Salamanca","Cindy Ave","Cristian Serna","DGL Accounts","Daniel Martin","David Cuestas","Fabian Lopez","German Cano","House Account","Juan Rodriguez","Juan Ruiz","Luis Simoes","Manuel Arias","Mateo Matallana","Nicolas Monroy","Santiago Villegas","Sebastian Crespo","Tatiana Lozano","Valentina Rico"];
const RECOVERY_TYPES=["CROSS-SELL","NURTURE","QNB","REACTIVATION","RETENTION"];
const RECOVERY_SERVICES=["Drayage","FTL","LTL","Multiservicio"];
const RECOVERY_WINDOWS=["","0-14","15-30","30+"];
const RECOVERY_GROUPS_RAW=[[5,2,2,1,15,15,0],[2,2,2,2,14,14,0],[2,2,2,1,12,12,0],[16,2,0,3,12,12,0],[5,2,2,2,11,11,0],[2,2,2,3,10,10,0],[12,2,2,3,10,10,0],[16,2,2,1,8,8,0],[2,2,1,3,7,7,0],[17,2,2,3,6,6,0],[7,2,1,2,5,5,0],[11,2,0,3,5,5,0],[0,2,2,1,4,4,0],[2,2,1,1,4,4,0],[5,2,2,3,4,4,0],[11,2,1,3,4,4,0],[16,2,2,2,4,4,0],[20,2,2,1,4,4,0],[2,2,0,2,3,3,0],[5,2,1,2,3,3,0],[7,2,1,1,3,3,0],[7,2,1,3,3,3,0],[7,2,2,1,3,3,0],[12,2,2,2,3,3,0],[16,2,1,3,3,3,0],[16,2,1,1,3,3,0],[16,2,0,2,3,3,0],[20,2,2,3,3,3,0],[23,2,1,3,3,3,0],[23,2,1,1,3,3,0],[0,2,0,1,2,2,0],[2,2,1,2,2,2,0],[3,2,1,2,2,2,0],[5,2,0,1,2,2,0],[7,2,0,3,2,2,0],[7,2,2,3,2,2,0],[11,2,0,1,2,2,0],[11,2,2,3,2,2,0],[11,2,2,1,2,2,0],[12,2,1,3,2,2,0],[12,2,0,3,2,2,0],[16,2,0,1,2,2,0],[17,2,2,1,2,2,0],[17,2,1,3,2,2,0],[20,2,0,3,2,2,0],[23,2,2,1,2,2,0],[23,2,1,2,2,2,0],[0,2,2,3,1,1,0],[0,2,0,3,1,1,0],[0,2,1,3,1,1,0],[0,2,1,1,1,1,0],[1,2,0,3,1,1,0],[2,2,0,1,1,1,0],[3,2,1,3,1,1,0],[5,2,1,3,1,1,0],[5,2,0,2,1,1,0],[5,2,0,3,1,1,0],[5,2,1,1,1,1,0],[7,2,2,2,1,1,0],[11,2,1,1,1,1,0],[11,2,1,2,1,1,0],[11,2,2,2,1,1,0],[12,2,0,1,1,1,0],[12,2,1,1,1,1,0],[12,2,2,1,1,1,0],[14,2,2,2,1,1,0],[14,2,2,1,1,1,0],[15,2,0,1,1,1,0],[15,2,2,1,1,1,0],[16,2,1,2,1,1,0],[16,2,2,3,1,1,0],[17,2,0,1,1,1,0],[17,2,0,2,1,1,0],[17,2,0,3,1,1,0],[17,2,1,1,1,1,0],[20,2,1,3,1,1,0],[20,2,2,2,1,1,0],[20,2,1,1,1,1,0],[23,2,0,2,1,1,0],[23,2,2,2,1,1,0],[23,2,2,3,1,1,0],[13,2,2,3,14,0,14],[13,2,2,2,11,0,11],[13,2,2,1,4,0,4],[13,2,0,3,2,0,2],[7,2,3,3,1,0,1],[13,2,1,1,1,0,1],[13,2,0,1,1,0,1],[23,2,3,2,1,0,1],[12,4,3,0,8,4,4],[11,4,3,0,7,4,3],[2,4,3,0,12,3,9],[1,4,3,0,4,3,1],[5,4,3,0,9,2,7],[16,4,3,0,6,2,4],[20,4,3,0,5,2,3],[3,4,3,0,1,1,0],[9,4,3,0,1,1,0],[16,4,2,0,1,1,0],[16,4,1,0,1,1,0],[18,4,3,0,1,1,0],[20,4,0,0,1,1,0],[8,4,3,0,6,0,6],[0,4,3,0,2,0,2],[5,4,2,0,2,0,2],[13,4,3,0,2,0,2],[17,4,3,0,2,0,2],[5,4,1,0,1,0,1],[18,3,3,0,5,5,0],[5,3,3,0,10,4,6],[12,3,3,0,3,2,1],[17,3,3,0,3,2,1],[2,3,3,0,11,1,10],[16,3,3,0,7,1,6],[11,3,3,0,2,1,1],[23,3,3,0,2,1,1],[13,3,3,0,98,0,98],[8,3,3,0,28,0,28],[5,3,2,0,3,0,3],[16,3,2,0,3,0,3],[0,3,3,0,2,0,2],[3,3,3,0,2,0,2],[4,3,1,0,2,0,2],[0,3,2,0,1,0,1],[7,3,2,0,1,0,1],[11,3,2,0,1,0,1],[15,3,2,0,1,0,1],[16,3,1,0,1,0,1],[16,3,0,0,1,0,1],[20,3,3,0,1,0,1],[21,0,3,0,43,6,37],[10,0,3,0,6,2,4],[4,0,3,0,4,2,2],[14,0,3,0,4,2,2],[0,0,3,0,3,2,1],[1,0,3,0,3,2,1],[19,0,3,0,17,1,16],[6,0,3,0,4,1,3],[12,0,3,0,3,1,2],[20,0,3,0,3,1,2],[22,0,3,0,3,1,2],[3,0,3,0,6,0,6],[15,0,3,0,1,0,1],[5,1,3,0,4,1,3],[20,1,3,0,1,1,0],[5,1,2,0,3,0,3],[23,1,3,0,3,0,3],[2,1,3,0,2,0,2],[7,1,2,0,2,0,2],[11,1,0,0,2,0,2],[11,1,2,0,2,0,2],[0,1,1,0,1,0,1],[0,1,3,0,1,0,1],[0,1,2,0,1,0,1],[2,1,2,0,1,0,1],[12,1,3,0,1,0,1],[15,1,2,0,1,0,1],[16,1,3,0,1,0,1],[16,1,0,0,1,0,1],[16,1,2,0,1,0,1],[17,1,3,0,1,0,1],[20,1,1,0,1,0,1]];

function recoveryGroups(){
  return RECOVERY_GROUPS_RAW.map((r,i)=>({
    groupId:`RECOVERY-GROUP-${i+1}`,
    amOwner:RECOVERY_OWNERS[r[0]],
    opportunityType:RECOVERY_TYPES[r[1]],
    service:RECOVERY_SERVICES[r[2]],
    window:RECOVERY_WINDOWS[r[3]],
    qnbWindow:RECOVERY_WINDOWS[r[3]],
    reasonCategory:"",
    detectedAccounts:r[4],
    eligibleAccounts:r[5],
    suppressedAccounts:r[6],
    priority:ORDER[family(RECOVERY_TYPES[r[1]])]||99,
    lastEngineRun:RECOVERY_SNAPSHOT_AT,
    recoverySnapshot:true
  }));
}
async function liveWithRecovery(force=false){
  let groups=[],failed=false;
  if(C()){
    try{
      const d=await live(force);
      groups=d.groups||[];
      if(!groups.length)failed=true;
    }catch(_){failed=true;}
  }else failed=true;
  if(groups.length)return{groups,recovered:false};
  return{groups:recoveryGroups(),recovered:true};
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
  // Retention/Reactivation/QNB/Cross-Sell must never show a false empty
  // state: fall back to the same Safe Data Hub Recovery snapshot Campaign
  // Opportunities uses whenever live V6 is disconnected or returns an
  // invalid/empty payload. Owners and scopes stay visible either way.
  const {groups:all,recovered}=await liveWithRecovery();
  let base=all;
  if(fams)base=base.filter(x=>fams.includes(family(x.opportunityType)));
  if(service)base=base.filter(x=>U(x.service)===U(service));
  const visible=filterOwner(base).sort((a,b)=>(+a.priority||99)-(+b.priority||99)||(+b.eligibleAccounts||0)-(+a.eligibleAccounts||0));
  const det=visible.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=visible.reduce((s,x)=>s+(+x.eligibleAccounts||0),0),sup=visible.reduce((s,x)=>s+(+x.suppressedAccounts||0),0);
  g.__DGL_LIFE_GROUPS=Object.fromEntries(all.map(x=>[scopeId(x),x]));
  const statusBadge=recovered?badge("SAFE DATA HUB RECOVERY","warn"):badge("PRIVATE BACKEND / LIVE","live");
  const head=`<div class="page-head"><div><div class="eyebrow">${E(eye)}</div><h2>${E(title)}</h2><p class="lede">${E(sub)}</p></div><div class="page-head-actions">${statusBadge}${C()?'<button class="btn btn-secondary" data-life-refresh>REFRESH VIEW</button>':'<button class="btn btn-primary" data-life-connect>CONNECT PRIVATE BACKEND</button>'}</div></div>`;
  const recoveryNotice=recovered?`<div class="life-status-strip warn"><div><span>DATA SOURCE</span><strong>SAFE DATA HUB RECOVERY</strong></div><p>Live V6 routing is not responding; owner and opportunity aggregates are restored from the governed Data Hub snapshot (${E(RECOVERY_SNAPSHOT_AT)}). Only owner-level counts are shown — no account, contact or quote identifier is included.</p></div>`:"";
  c.innerHTML=head+ownerToolbar(base)+recoveryNotice+
    kpis([["DETECTED SIGNALS",det],["ELIGIBLE ACCOUNTS",eli],["SUPPRESSED",sup],["AUTOMATIC SCOPES",visible.length]])+
    `<div class="life-status-strip"><div><span>Operating rule</span><strong>AUTOMATIC SCOPE GENERATION</strong></div><p>No recurring manual account selection. Rules decide eligibility, suppression, pressure and routing.</p></div>
     <div class="life-scope-stack">${visible.length?visible.map(card).join(""):`<div class="life-empty"><strong>No scopes for ${E(selectedOwner())}</strong></div>`}</div>`;
}
async function campaignOpportunitiesView(c){
  const title="Campaign Opportunities",sub="All report-derived opportunities grouped into automatic governed scopes.";
  const {groups:all,recovered}=await liveWithRecovery();
  const visible=filterOwner(all).sort((a,b)=>(+a.priority||99)-(+b.priority||99)||(+b.eligibleAccounts||0)-(+a.eligibleAccounts||0));
  const det=visible.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=visible.reduce((s,x)=>s+(+x.eligibleAccounts||0),0),sup=visible.reduce((s,x)=>s+(+x.suppressedAccounts||0),0);
  g.__DGL_LIFE_GROUPS=Object.fromEntries(all.map(x=>[scopeId(x),x]));
  const statusBadge=recovered?badge("SAFE DATA HUB RECOVERY","warn"):badge("PRIVATE BACKEND / LIVE","live");
  const head=`<div class="page-head"><div><div class="eyebrow">OPPORTUNITY ENGINE · ${recovered?"RECOVERY":"LIVE"}</div><h2>${E(title)}</h2><p class="lede">${E(sub)}</p></div><div class="page-head-actions">${statusBadge}${C()?'<button class="btn btn-secondary" data-life-refresh>REFRESH VIEW</button>':'<button class="btn btn-primary" data-life-connect>CONNECT PRIVATE BACKEND</button>'}</div></div>`;
  const recoveryNotice=recovered?`<div class="life-status-strip warn"><div><span>DATA SOURCE</span><strong>SAFE DATA HUB RECOVERY</strong></div><p>Live V6 routing is not responding; owner and opportunity aggregates are restored from the governed Data Hub snapshot (${E(RECOVERY_SNAPSHOT_AT)}). Only owner-level counts are shown — no account, contact or quote identifier is included.</p></div>`:"";
  c.innerHTML=head+ownerToolbar(all)+recoveryNotice+
    kpis([["DETECTED SIGNALS",det],["ELIGIBLE ACCOUNTS",eli],["SUPPRESSED",sup],["AUTOMATIC SCOPES",visible.length]])+
    `<div class="life-status-strip"><div><span>Operating rule</span><strong>AUTOMATIC SCOPE GENERATION</strong></div><p>No recurring manual account selection. Rules decide eligibility, suppression, pressure and routing.</p></div>
     <div class="life-scope-stack">${visible.length?visible.map(card).join(""):`<div class="life-empty"><strong>No scopes for ${E(selectedOwner())}</strong></div>`}</div>`;
}
function auraCommandCardHtml(summary){
  if(!summary)return"";
  return`<a href="#/account-campaign-reports" class="aura-command-card">
    <div class="aura-command-head"><span>AURA · CAMPAIGN ACTIVITY</span>${badge("LIVE","live")}</div>
    <div class="aura-command-grid">
      <div><span>Live campaigns</span><strong>${N(summary.campaigns)}</strong></div>
      <div><span>Ready to send</span><strong>${N(summary.readyToSend)}</strong></div>
      <div><span>Blocked</span><strong>${N(summary.blocked)}</strong></div>
      <div><span>Recipients</span><strong>${N(summary.recipients)}</strong></div>
    </div>
    <div class="aura-command-foot">Last activity: ${E(auraFmtDate(summary.lastUpdated))}</div>
  </a>`;
}
async function commandCenter(c){
  if(!C())return required(c,"Marketing Campaign Command Center","Automatic decision system from commercial signal to retained revenue.");
  const d=await live(true),groups=d.groups||[],base=filterOwner(groups),by=d.pipe?.byCurrentStage||d.pipe?.byStage||{},fs={},rd=readiness(groups);
  const auraRes=await auraLoad();
  base.forEach(x=>{const f=family(x.opportunityType);fs[f]=fs[f]||{d:0,e:0,s:0};fs[f].d+=+x.detectedAccounts||0;fs[f].e+=+x.eligibleAccounts||0;fs[f].s+=+x.suppressedAccounts||0;});
  const det=base.reduce((s,x)=>s+(+x.detectedAccounts||0),0),eli=base.reduce((s,x)=>s+(+x.eligibleAccounts||0),0),sup=base.reduce((s,x)=>s+(+x.suppressedAccounts||0),0);
  c.innerHTML=header("Marketing Campaign Command Center","Reports → Opportunity Engine → rules → contacts → campaign → response → attribution.","AUTOMATION COMMAND · LIVE")+
    ownerToolbar(groups)+kpis([["SIGNALS",det],["ELIGIBLE",eli],["SUPPRESSED",sup],["AUTOMATIC SCOPES",base.length]])+
    auraCommandCardHtml(auraRes.data?.summary)+
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
// --- AURA live reporting (#/account-campaign-reports) -----------------------
// Reads ONLY the safe operational projection of MKT_AURA_EXECUTION_REPORT via
// v6AuraExecutionReport (backend/apps-script-v6/MarketingV6AuraAutomation.gs).
// No account/contact identity, price or credit field ever reaches this file —
// see MKT_V6_AURA_REPORT_SAFE_FIELDS on the backend. Numbers here are never
// hard-coded and never fabricated: every KPI, table row and grouping is
// derived at render time from the live response (or, if a refresh fails,
// from the last successfully loaded response for this browser session).
const AURA_FAMILIES=["Retention","Reactivation","Quoted Not Booked","Cross-Sell"];
function auraFmtDate(v){
  if(!v)return"—";
  const d=new Date(v);
  if(isNaN(d.getTime()))return String(v);
  return d.toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});
}
function auraStatusBucket(status){
  const s=U(status);
  if(s.indexOf("READY TO SEND")===0)return"READY";
  if(s==="BLOCKED")return"BLOCKED";
  return"OTHER";
}
function auraStatusPill(status){
  const bucket=auraStatusBucket(status),raw=String(status||"");
  if(bucket==="READY"){
    const sub=raw.replace(/^READY TO SEND\s*[·-]?\s*/i,"").trim();
    return`<div class="aura-pill ready">READY TO SEND${sub&&U(sub)!=="READY TO SEND"?`<small>${E(sub)}</small>`:""}</div>`;
  }
  if(bucket==="BLOCKED")return`<div class="aura-pill blocked">BLOCKED</div>`;
  return`<div class="aura-pill other">${E(raw||"PREPARING")}</div>`;
}
function auraFilterRecords(records){
  const f=auraFilters,q=U(f.search);
  return(records||[]).filter(r=>{
    const owner=String(r.owner||"Unassigned").trim()||"Unassigned";
    if(f.owner!=="ALL"&&owner!==f.owner)return false;
    if(f.family!=="ALL"&&String(r.campaignFamily||"")!==f.family)return false;
    if(f.status!=="ALL"&&auraStatusBucket(r.status)!==f.status)return false;
    if(q&&!U(`${owner} ${r.campaignId||""} ${r.executionId||""}`).includes(q))return false;
    return true;
  });
}
function auraOwnerSummary(records){
  const by={};
  (records||[]).forEach(r=>{
    const o=String(r.owner||"Unassigned").trim()||"Unassigned";
    const b=by[o]=by[o]||{owner:o,campaigns:0,eligibleAccounts:0,recipients:0,ready:0,blocked:0,sent:0,replies:0,rfqs:0,quotes:0,loads:0};
    b.campaigns++;b.eligibleAccounts+=+r.eligibleAccounts||0;b.recipients+=+r.recipients||0;b.sent+=+r.sent||0;b.replies+=+r.replies||0;b.rfqs+=+r.rfqs||0;b.quotes+=+r.quotes||0;b.loads+=+r.loads||0;
    const bucket=auraStatusBucket(r.status);
    if(bucket==="READY")b.ready++;else if(bucket==="BLOCKED")b.blocked++;
  });
  return Object.values(by).sort((a,b)=>b.campaigns-a.campaigns||a.owner.localeCompare(b.owner));
}
function auraFamilySummary(records){
  const by={};
  AURA_FAMILIES.forEach(f=>by[f]={family:f,count:0,eligibleAccounts:0,recipients:0,ready:0,blocked:0});
  (records||[]).forEach(r=>{
    const f=String(r.campaignFamily||"")||"Unclassified";
    if(!by[f])by[f]={family:f,count:0,eligibleAccounts:0,recipients:0,ready:0,blocked:0};
    const b=by[f];
    b.count++;b.eligibleAccounts+=+r.eligibleAccounts||0;b.recipients+=+r.recipients||0;
    const bucket=auraStatusBucket(r.status);
    if(bucket==="READY")b.ready++;else if(bucket==="BLOCKED")b.blocked++;
  });
  return Object.keys(by).map(f=>by[f]);
}
function auraFilterBar(records){
  const owners=[...new Set((records||[]).map(r=>String(r.owner||"Unassigned").trim()||"Unassigned"))].sort((a,b)=>a.localeCompare(b));
  const f=auraFilters;
  return`<div class="aura-filterbar">
    <div class="aura-filter"><span>OWNER</span><select data-aura-owner class="auto-owner-select">
      <option value="ALL" ${f.owner==="ALL"?"selected":""}>All owners</option>
      ${owners.map(o=>`<option value="${E(o)}" ${f.owner===o?"selected":""}>${E(o)}</option>`).join("")}
    </select></div>
    <div class="aura-filter"><span>CAMPAIGN FAMILY</span><select data-aura-family class="auto-owner-select">
      <option value="ALL" ${f.family==="ALL"?"selected":""}>All families</option>
      ${AURA_FAMILIES.map(x=>`<option value="${E(x)}" ${f.family===x?"selected":""}>${E(x)}</option>`).join("")}
    </select></div>
    <div class="aura-filter"><span>STATUS</span><select data-aura-status class="auto-owner-select">
      <option value="ALL" ${f.status==="ALL"?"selected":""}>All</option>
      <option value="READY" ${f.status==="READY"?"selected":""}>Ready to send</option>
      <option value="BLOCKED" ${f.status==="BLOCKED"?"selected":""}>Blocked</option>
    </select></div>
    <div class="aura-filter aura-filter-search"><span>SEARCH</span><input type="text" data-aura-search class="aura-search-input" placeholder="Owner, campaign ID or execution ID" value="${E(f.search)}"/></div>
  </div>`;
}
function auraTable(rows,cols,empty){
  if(!rows.length)return`<div class="life-empty"><strong>${E(empty[0])}</strong><p>${E(empty[1])}</p></div>`;
  return`<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map(cl=>`<th>${E(cl[0])}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(cl=>`<td>${cl[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
function auraCampaignCell(r){return`<strong>${E(r.campaignFamily||"—")}</strong><br><small class="aura-muted">${E(r.campaignId||"")}</small>`;}
function auraReadyBlockedRows(records,bucket){return records.filter(r=>auraStatusBucket(r.status)===bucket).sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));}
const AURA_RB_COLS=[["Owner",r=>E(r.owner||"Unassigned")],["Campaign",auraCampaignCell],["Service",r=>E(r.service||"—")],["Detected",r=>N(r.detectedAccounts)],["Eligible",r=>N(r.eligibleAccounts)],["Recipients",r=>N(r.recipients)],["Status",r=>auraStatusPill(r.status)],["Last Updated",r=>E(auraFmtDate(r.updatedAt))]];
function auraReadyTableHtml(records){return auraTable(auraReadyBlockedRows(records,"READY"),AURA_RB_COLS,["No campaigns ready to send yet","AURA will surface a campaign here the moment recipient resolution and every execution gate clear except the bulk send provider."]);}
function auraBlockedTableHtml(records){return auraTable(auraReadyBlockedRows(records,"BLOCKED"),AURA_RB_COLS,["Nothing blocked right now","Blocked means AURA found the campaign opportunity but could not resolve a safe, eligible recipient, or another execution gate prevented progress. It is not an error, and recipients are never invented to clear it."]);}
function auraResultsTableHtml(records){
  const rows=[...records].sort((a,b)=>String(b.updatedAt||"").localeCompare(String(a.updatedAt||"")));
  return auraTable(rows,[["Owner",r=>E(r.owner||"Unassigned")],["Campaign",auraCampaignCell],["Service",r=>E(r.service||"—")],["Recipients",r=>N(r.recipients)],["Sent",r=>N(r.sent)],["Delivered",r=>N(r.delivered)],["Bounced",r=>N(r.bounced)],["Clicks",r=>N(r.clicks)],["Replies",r=>N(r.replies)],["RFQs",r=>N(r.rfqs)],["Quotes",r=>N(r.quotes)],["Loads",r=>N(r.loads)]],
    ["No campaign results yet","Sent, delivered, click and reply counts populate automatically as campaigns execute and response events are classified. Zero is shown honestly, never fabricated."]);
}
function auraOwnerTableHtml(records){
  return auraTable(auraOwnerSummary(records),[["Owner",r=>E(r.owner)],["Campaigns",r=>N(r.campaigns)],["Eligible",r=>N(r.eligibleAccounts)],["Recipients",r=>N(r.recipients)],["Ready",r=>N(r.ready)],["Blocked",r=>N(r.blocked)],["Sent",r=>N(r.sent)],["Replies",r=>N(r.replies)],["RFQs",r=>N(r.rfqs)],["Quotes",r=>N(r.quotes)],["Loads",r=>N(r.loads)]],
    ["No owner activity yet","Owner performance populates automatically once AURA creates campaigns for that owner's accounts."]);
}
function auraFamilyGridHtml(records){
  return`<div class="life-family-grid aura-family-grid">${auraFamilySummary(records).map(r=>`<div class="life-family-card"><span>${E(r.family)}</span><strong>${N(r.count)}</strong><small>${N(r.eligibleAccounts)} eligible · ${N(r.recipients)} recipients · ${N(r.ready)} ready · ${N(r.blocked)} blocked</small></div>`).join("")}</div>`;
}
function auraResultsSectionHtml(allRecords){
  const filtered=auraFilterRecords(allRecords);
  return`<section class="life-panel"><div class="life-panel-head"><div><span>ACTIVE</span><h3>Ready to Send</h3></div>${badge(String(auraReadyBlockedRows(filtered,"READY").length),"live")}</div>${auraReadyTableHtml(filtered)}</section>
    <section class="life-panel"><div class="life-panel-head"><div><span>NEEDS ATTENTION</span><h3>Blocked / Needs Data</h3></div>${badge(String(auraReadyBlockedRows(filtered,"BLOCKED").length),"warn")}</div>${auraBlockedTableHtml(filtered)}</section>
    <section class="life-panel"><div class="life-panel-head"><div><span>OUTCOMES</span><h3>Campaign Results</h3></div></div>${auraResultsTableHtml(filtered)}</section>
    <div class="life-grid-2">
      <section class="life-panel"><h3>Owner Performance</h3>${auraOwnerTableHtml(filtered)}</section>
      <section class="life-panel"><h3>Campaign Family</h3>${auraFamilyGridHtml(filtered)}</section>
    </div>`;
}
function auraRerenderResults(){
  const el=document.getElementById("auraResultsSection");
  if(!el||!auraCache)return;
  el.innerHTML=auraResultsSectionHtml(auraCache.records||[]);
}
function auraBannerHtml(summary,opts){
  const activity=`Last activity: ${auraFmtDate(summary.lastUpdated)}`;
  if(opts.disconnected)return`<div class="life-status-strip blocked"><div><span>AURA AUTOMATION</span><strong>DISCONNECTED</strong></div><p>Showing the last report successfully loaded in this browser session. Reconnect the private backend to resume live updates.</p></div>`;
  if(opts.stale)return`<div class="life-status-strip warn"><div><span>AURA AUTOMATION</span><strong>LIVE · SHOWING LAST KNOWN DATA</strong></div><p>${E("The most recent refresh did not return a valid report — showing the last successfully loaded data. "+activity)}</p></div>`;
  return`<div class="life-status-strip"><div><span>AURA AUTOMATION</span><strong>LIVE</strong></div><p>${E(activity)} ${badge("LIVE DATA · AUTO REFRESH 60s","live")}</p></div>`;
}
function auraProviderNoticeHtml(){
  return`<div class="life-status-strip warn"><div><span>EMAIL EXECUTION</span><strong>READY TO SEND · SEND PROVIDER REQUIRED</strong></div><p>AURA has already detected, segmented, assigned owner, resolved eligible recipients, created campaigns and executions, and generated this report. Sending is the only step still pending a configured bulk email provider.</p></div>`;
}
// Gmail is the recurring INPUT source for Existing Account Growth (Luis
// Simoes's AM report to the governed AURA_GMAIL_SOURCE_MAILBOX, ingested
// automatically server-side — see MarketingV6AuraGmailIngest.gs). This
// strip is informational only: if
// the freshness check fails, the rest of the AURA report still renders from
// MKT_AURA_EXECUTION_REPORT as usual.
function auraGmailSourceHtml(gmail){
  if(!gmail||gmail.status==="NO_REPORT_RECEIVED"){
    return`<div class="life-status-strip warn"><div><span>DATA SOURCE</span><strong>GMAIL · ACCOUNT MANAGEMENT</strong></div><p>No AM report has been ingested yet from Gmail.</p></div>`;
  }
  if(gmail.status!=="OK")return"";
  const tone=gmail.freshness==="STALE"?"blocked":gmail.freshness==="AGING"?"warn":"";
  return`<div class="life-status-strip ${tone}"><div><span>DATA SOURCE</span><strong>${E(gmail.source||"GMAIL · ACCOUNT MANAGEMENT")}</strong></div><p>Latest report: ${E(auraFmtDate(gmail.lastReportReceivedAt))} · Processed: ${E(auraFmtDate(gmail.lastReportProcessedAt))} · Freshness: ${E(gmail.freshness||"—")} · ${N(gmail.rowsAccepted)} rows accepted · ${N(gmail.opportunitiesUpdated)} opportunities updated</p></div>`;
}
function auraPaint(c,data,opts={},gmail){
  const summary=data.summary||{},records=data.records||[];
  c.innerHTML=header("AURA · Campaign Activity & Reports","Live execution activity generated automatically by AURA from the governed DGL Data Hub.","AURA · REPORTING")+
    auraBannerHtml(summary,opts)+
    (opts.disconnected?"":auraGmailSourceHtml(gmail))+
    (opts.disconnected?"":auraProviderNoticeHtml())+
    kpis([["TOTAL CAMPAIGNS",summary.campaigns],["READY TO SEND",summary.readyToSend],["BLOCKED",summary.blocked],["RECIPIENTS",summary.recipients],["ELIGIBLE ACCOUNTS",summary.eligibleAccounts],["OWNERS",summary.owners],["SENT",summary.sent],["REPLIES",summary.replies],["RFQs",summary.rfqs],["LOADS",summary.loads]])+
    `<div id="auraFilterBar">${auraFilterBar(records)}</div>`+
    `<div id="auraResultsSection">${auraResultsSectionHtml(records)}</div>`;
}
async function auraLoad(){
  if(!C())return{ok:false,disconnected:true,data:auraCache};
  try{
    const res=await A().v6AuraExecutionReport();
    if(res&&res.summary&&Array.isArray(res.records)){auraCache=res;return{ok:true,disconnected:false,data:res};}
    return{ok:false,disconnected:false,data:auraCache};
  }catch(_){return{ok:false,disconnected:false,data:auraCache};}
}
async function auraGmailLoad(){
  if(!C())return auraGmailCache;
  try{
    const res=await A().v6AuraGmailFreshness();
    if(res&&res.status){auraGmailCache=res;return res;}
    return auraGmailCache;
  }catch(_){return auraGmailCache;}
}
async function auraRenderPage(c){
  const[res,gmail]=await Promise.all([auraLoad(),auraGmailLoad()]);
  if(res.ok)return auraPaint(c,res.data,{},gmail);
  if(res.data)return auraPaint(c,res.data,{stale:!res.disconnected,disconnected:res.disconnected},gmail);
  if(res.disconnected)return required(c,"AURA · Campaign Activity & Reports","Live execution activity generated automatically by AURA from the governed DGL Data Hub.");
  c.innerHTML=header("AURA · Campaign Activity & Reports","Live execution activity generated automatically by AURA from the governed DGL Data Hub.","AURA · REPORTING")+
    `<div class="life-empty"><strong>AURA REPORT TEMPORARILY UNAVAILABLE</strong><p>The private backend did not return a valid AURA report this time. No number is ever shown as zero unless it is real — retry shortly or refresh the view.</p></div>`;
}
async function reports(c){
  if(auraTimer){clearInterval(auraTimer);auraTimer=null;}
  await auraRenderPage(c);
  auraTimer=setInterval(()=>{
    if(location.hash!=="#/account-campaign-reports"){clearInterval(auraTimer);auraTimer=null;return;}
    auraRenderPage(c);
  },60000);
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
R["campaign-opportunities"]=campaignOpportunitiesView;
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
  if(s){setOwner(s.value);rerender();return;}
  const fo=e.target.closest("[data-aura-owner]");
  if(fo){auraFilters.owner=fo.value;auraRerenderResults();return;}
  const ff=e.target.closest("[data-aura-family]");
  if(ff){auraFilters.family=ff.value;auraRerenderResults();return;}
  const fs=e.target.closest("[data-aura-status]");
  if(fs){auraFilters.status=fs.value;auraRerenderResults();return;}
});
document.addEventListener("input",e=>{
  const q=e.target.closest("[data-aura-search]");
  if(q){auraFilters.search=q.value;auraRerenderResults();}
});
g.addEventListener?.("hashchange",()=>{
  if(location.hash!=="#/account-campaign-reports"&&auraTimer){clearInterval(auraTimer);auraTimer=null;}
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
.aura-filterbar{display:flex;flex-wrap:wrap;gap:12px;margin:0 0 18px;padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:rgba(255,255,255,.02)}
.aura-filter{display:flex;flex-direction:column;gap:6px;min-width:170px}.aura-filter span{font-size:8px;letter-spacing:.08em;color:#788399;font-weight:850;text-transform:uppercase}
.aura-filter-search{flex:1;min-width:240px}
.aura-search-input{min-height:42px;padding:0 12px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:#111827;color:#fff;font-size:11px;font-weight:600}
.aura-muted{color:#6F7A8F;font-size:10px}
.aura-pill{display:inline-flex;flex-direction:column;align-items:flex-start;gap:2px;padding:6px 10px;border-radius:10px;font-size:9px;font-weight:850;letter-spacing:.04em;text-transform:uppercase}
.aura-pill small{font-size:8px;font-weight:700;letter-spacing:.02em;text-transform:none;opacity:.85}
.aura-pill.ready{background:rgba(119,184,42,.12);color:#A8D879;border:1px solid rgba(119,184,42,.3)}
.aura-pill.blocked{background:rgba(239,68,68,.10);color:#FCA5A5;border:1px solid rgba(239,68,68,.28)}
.aura-pill.other{background:rgba(148,163,184,.10);color:#CBD5E1;border:1px solid rgba(148,163,184,.25)}
.aura-family-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
.aura-command-card{display:block;margin:16px 0;padding:16px 18px;border-radius:16px;border:1px solid rgba(119,184,42,.22);background:linear-gradient(145deg,#182136,#111827);text-decoration:none;transition:transform .15s ease,border-color .15s ease}
.aura-command-card:hover{transform:translateY(-2px);border-color:rgba(119,184,42,.45)}
.aura-command-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.aura-command-head span{font-size:9px;letter-spacing:.08em;color:#8FD43D;font-weight:850;text-transform:uppercase}
.aura-command-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
.aura-command-grid span{display:block;font-size:8px;color:#788399;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.aura-command-grid strong{display:block;margin-top:5px;color:#fff;font-size:18px}
.aura-command-foot{color:#8994A7;font-size:10px}
@media(max-width:900px){.aura-family-grid{grid-template-columns:1fr 1fr}}
@media(max-width:720px){.aura-filterbar{flex-direction:column}.aura-filter{min-width:0}.aura-command-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
document.head.appendChild(style);

g.DGL_LIFECYCLE_MODULES_V6={version:"6.4-automation-first",scopeId,contextFor:context,openStudio,loadLive:live,normalizeWindow:normalizedWindow,automationProfile};
})(window);