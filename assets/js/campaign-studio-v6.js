(function(global){
"use strict";

const read=()=>{try{return JSON.parse(sessionStorage.getItem("dgl_v5_campaign_context")||"{}")}catch(_){return{}}};
const clean=v=>String(v==null?"":v).trim(),upper=v=>clean(v).toUpperCase();
const automatic=x=>!!(x.scopeId||(x.audienceId&&String(x.audienceId).startsWith("SCOPE-")&&!String(x.audienceId).startsWith("SCOPE-AMR-")));
const providerStatus=()=>global.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus||"BULK PROVIDER NOT CONFIGURED";
const providerReady=()=>!upper(providerStatus()).includes("NOT CONFIGURED")&&!upper(providerStatus()).includes("BLOCKED");
const policy=()=>global.DGL_MARKETING_PLAYBOOKS;

function tone(v){
  const x=upper(v);
  if(x.includes("READY")||x.includes("CLEAR")||x.includes("LIVE")||x.includes("AUTO BY POLICY")||x.includes("AVAILABLE"))return"is-good";
  if(x.includes("BLOCK")||x.includes("REQUIRED")||x.includes("NOT CONFIGURED")||x.includes("FAILED"))return"is-blocked";
  if(x.includes("PENDING")||x.includes("WAIT")||x.includes("PARTIAL")||x.includes("FALLBACK")||x.includes("REVIEW"))return"is-warn";
  return"";
}
function policyState(x){
  const d=policy()?.policyDecision?.(x);
  return d||{status:x.requiresHumanReview?"HUMAN EXCEPTION REVIEW":"AUTO BY POLICY",autoApproved:!x.requiresHumanReview};
}
function gates(x){
  const detected=Number(x.detectedAccounts||x.accountCount||0),eligible=Number(x.eligibleAccounts||x.accountCount||0),suppressed=Number(x.suppressedAccounts||Math.max(0,detected-eligible)||0),contacts=Number(x.eligibleContactCount||x.recipientCount||0),p=policyState(x);
  return[
    {n:"Automatic scope",v:automatic(x)?(x.scopeId||x.audienceId||"AUTOMATIC SCOPE"):"AUTOMATIC SCOPE REQUIRED"},
    {n:"Detected accounts",v:detected,num:true},{n:"Eligible accounts",v:eligible,num:true},{n:"Suppressed accounts",v:suppressed,num:true},
    {n:"Owner source",v:x.amOwner?"REPORT-DERIVED":"OWNER SOURCE PENDING"},
    {n:"Message strategy",v:x.messageStrategy||"PLAYBOOK DEFAULT"},
    {n:"Data quality",v:x.dataQualityStatus||"SOURCE SIGNAL AVAILABLE"},
    {n:"AM activity coordination",v:x.coordinationStatus||"NOT REQUIRED / EVENT NOT JOINED"},
    {n:"Frequency guard",v:x.frequencyStatus||"PENDING BACKEND EVALUATION"},
    {n:"Exclusions",v:x.exclusionStatus||x.exclusionsStatus||"PENDING BACKEND EVALUATION"},
    {n:"Policy decision",v:p.status},
    {n:"Eligible contacts",v:contacts,num:true},
    {n:"Bulk provider",v:providerStatus()},
    {n:"Drive archive",v:x.csvArchiveReady?"ARCHIVE READY":"ARCHIVE PENDING"}
  ];
}
function blockers(x){
  const out=[],p=policyState(x),contacts=Number(x.eligibleContactCount||x.recipientCount||0),frequency=upper(x.frequencyStatus||"PENDING BACKEND EVALUATION");
  if(!automatic(x))out.push("Automatic report-derived scope is required.");
  if(automatic(x)&&contacts<1)out.push("Authoritative contact source is required before recipient resolution.");
  if(frequency.includes("BLOCK"))out.push("Frequency / cooldown policy is blocking this scope.");
  if(!p.autoApproved)out.push("This campaign is an exception and requires human review.");
  if(!providerReady())out.push("Production bulk provider is not configured. Gmail remains QA-only.");
  if(!x.csvArchiveReady)out.push("Execution archive is not ready; live runs must archive CSV / HTML / copy / creative.");
  return out;
}
function overall(x){
  if(!automatic(x))return{label:"SCOPE REQUIRED",tone:"blocked",detail:"Start from a report-derived Campaign Opportunity."};
  if(Number(x.eligibleContactCount||x.recipientCount||0)<1)return{label:"CONTACTS BLOCKED",tone:"blocked",detail:"Automatic strategy is prepared; recipient resolution is the next gate."};
  if(!policyState(x).autoApproved)return{label:"EXCEPTION REVIEW",tone:"warn",detail:"Normal campaigns are automatic; this scope triggered an exception policy."};
  if(!providerReady())return{label:"EXECUTION BLOCKED",tone:"blocked",detail:"Policy may be clear, but the production provider is not configured."};
  return{label:"AUTO-READY FOR ACTIVATION",tone:"good",detail:"Automatic scope, policy and production gates are clear."};
}
function polishHeader(x){
  const top=document.querySelector(".v5-topbar");if(!top)return;
  const kicker=top.querySelector(".v5-kicker"),title=top.querySelector("h1"),desc=top.querySelector("p"),actions=top.querySelector(".v5-top-actions");
  if(kicker)kicker.textContent="AUTOMATED CAMPAIGN EXECUTION";
  if(title)title.innerHTML=`Campaign Studio <span class="v6-version">V6.4</span>`;
  if(desc)desc.textContent="Automatic scopes arrive from commercial reports. Strategy, cadence, pressure, exclusions and policy are calculated from rules; humans only review exceptions.";
  if(actions)actions.innerHTML=`<span class="v5-badge ${automatic(x)?"green":""}">${automatic(x)?"AUTOMATIC SCOPE":"SCOPE REQUIRED"}</span><a class="v5-btn" href="#/campaign-opportunities">← Opportunities</a>`;
}
function polishBrief(x){
  const bar=document.querySelector(".v5-briefbar");if(!bar)return;
  const map={"SOURCE":"OPPORTUNITY SOURCE","PORTFOLIO":"AUTOMATIC SCOPE","ACCOUNTS":"DETECTED ACCOUNTS","CAMPAIGN AUDIENCE":"RECIPIENT STATUS","OBJECTIVE":"CAMPAIGN FAMILY"};
  [...bar.querySelectorAll(".v5-briefcell")].forEach(cell=>{
    const l=cell.querySelector("span"),v=cell.querySelector("strong");if(!l)return;const key=upper(l.textContent);
    if(map[key])l.textContent=map[key];
    if(v&&key==="SOURCE"&&!automatic(x))v.textContent="Awaiting automatic scope";
    if(v&&key==="PORTFOLIO"&&!automatic(x))v.textContent="Not selected";
    if(v&&key==="CAMPAIGN AUDIENCE"&&Number(x.eligibleContactCount||0)<1)v.textContent="Contacts pending";
  });
  const audience=document.getElementById("v5Audience");if(audience){audience.disabled=true;audience.title="Audience is governed by the automatic scope and private recipient resolver.";}
}
function inject(){
  const x=read();polishHeader(x);polishBrief(x);
  document.querySelectorAll("[data-v6-studio-gates]").forEach(n=>n.remove());
  const anchor=document.querySelector(".v5-briefbar")||document.querySelector(".v5-stepper");if(!anchor)return;
  const state=overall(x),issues=blockers(x),panel=document.createElement("section");panel.className="v6-studio-gates";panel.dataset.v6StudioGates="true";
  panel.innerHTML=`<div class="v6-gates-head"><div><div class="eyebrow-line">AUTOMATION READINESS</div><h2>Production readiness</h2><p>Automatic signal → scope → strategy → policy → contacts → execution → response stop → attribution.</p></div><span class="v6-qa-chip">TEST DRAFT · QA AVAILABLE</span></div>
  <div class="v6-readiness-banner ${state.tone}"><div><span>CAMPAIGN STATE</span><strong>${state.label}</strong></div><p>${state.detail}</p></div>
  <div class="v6-status-grid">${gates(x).map(g=>`<div class="v6-status-card ${tone(g.v)}"><span class="label">${g.n}</span><span class="value ${g.num?"numeric":""}">${g.v}</span></div>`).join("")}</div>
  <div class="v6-blocker-bar"><div class="v6-blocker-icon">!</div><div><strong>${issues.length?`${issues.length} production gate${issues.length===1?"":"s"} remaining`:"Automatic production gates clear"}</strong><p>${issues.length?issues.join(" · "):"Campaign can progress automatically under policy."}</p></div></div>`;
  anchor.parentNode.insertBefore(panel,anchor.nextSibling);
}
const renderer=global.DGL_MODULE_RENDERERS?.["campaign-studio"];
if(renderer)global.DGL_MODULE_RENDERERS["campaign-studio"]=c=>{renderer(c);inject();};
global.DGL_CAMPAIGN_STUDIO_V6={version:"6.4-automation-first",gateData:gates,blockers,overallState:overall,inject};
})(window);