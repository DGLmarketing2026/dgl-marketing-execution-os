(function(global){
"use strict";

const KEY="dgl_v5_campaign_context";
const OWNER_KEY="dgl_v6_owner_filter";
const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||"{}")}catch(_){return{}}};
const write=x=>sessionStorage.setItem(KEY,JSON.stringify(x||{}));
const clean=v=>String(v==null?"":v).trim(),upper=v=>clean(v).toUpperCase();
const automatic=x=>!!(x&&(x.scopeId||(x.audienceId&&String(x.audienceId).startsWith("SCOPE-")&&!String(x.audienceId).startsWith("SCOPE-AMR-"))));
const providerStatus=()=>global.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus||"BULK PROVIDER NOT CONFIGURED";
const providerReady=()=>!upper(providerStatus()).includes("NOT CONFIGURED")&&!upper(providerStatus()).includes("BLOCKED");
const policy=()=>global.DGL_MARKETING_PLAYBOOKS;
const adapter=()=>global.DGL_MARKETING_BACKEND_ADAPTER_V55;

function tone(v){
  const x=upper(v);
  if(x.includes("READY")||x.includes("CLEAR")||x.includes("LIVE")||x.includes("AUTO BY POLICY")||x.includes("AVAILABLE")||x.includes("REPORT-DERIVED"))return"is-good";
  if(x.includes("BLOCK")||x.includes("REQUIRED")||x.includes("NOT CONFIGURED")||x.includes("FAILED"))return"is-blocked";
  if(x.includes("PENDING")||x.includes("WAIT")||x.includes("PARTIAL")||x.includes("FALLBACK")||x.includes("REVIEW")||x.includes("LOADING"))return"is-warn";
  return"";
}
function policyState(x){
  const d=policy()?.policyDecision?.(x);
  return d||{status:x.requiresHumanReview?"HUMAN EXCEPTION REVIEW":"AUTO BY POLICY",autoApproved:!x.requiresHumanReview};
}
function gates(x){
  const detected=Number(x.detectedAccounts||x.accountCount||0),
        eligible=Number(x.eligibleAccounts||x.accountCount||0),
        suppressed=Number(x.suppressedAccounts||Math.max(0,detected-eligible)||0),
        contacts=Number(x.eligibleContactCount||x.recipientCount||0),
        p=policyState(x);
  return[
    {n:"Automatic scope",v:automatic(x)?(x.scopeId||x.audienceId||"AUTOMATIC SCOPE"):"AUTOMATIC SCOPE REQUIRED"},
    {n:"Detected accounts",v:detected,num:true},
    {n:"Eligible accounts",v:eligible,num:true},
    {n:"Suppressed accounts",v:suppressed,num:true},
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
  if(x.__autoLoading)return{label:"AUTO-SELECTING SCOPE",tone:"warn",detail:"Opportunity Engine is selecting the highest-priority eligible scope automatically."};
  if(!automatic(x))return{label:"SCOPE REQUIRED",tone:"blocked",detail:"No eligible report-derived scope could be loaded automatically."};
  if(Number(x.eligibleContactCount||x.recipientCount||0)<1)return{label:"CONTACTS BLOCKED",tone:"blocked",detail:"Automatic strategy is prepared; recipient resolution is the next gate."};
  if(!policyState(x).autoApproved)return{label:"EXCEPTION REVIEW",tone:"warn",detail:"Normal campaigns are automatic; this scope triggered an exception policy."};
  if(!providerReady())return{label:"EXECUTION BLOCKED",tone:"blocked",detail:"Policy may be clear, but the production provider is not configured."};
  return{label:"AUTO-READY FOR ACTIVATION",tone:"good",detail:"Automatic scope, policy and production gates are clear."};
}
function polishHeader(x){
  const top=document.querySelector(".v5-topbar");if(!top)return;
  const kicker=top.querySelector(".v5-kicker"),title=top.querySelector("h1"),desc=top.querySelector("p"),actions=top.querySelector(".v5-top-actions");
  if(kicker)kicker.textContent="AUTOMATED CAMPAIGN EXECUTION";
  if(title)title.innerHTML=`Campaign Studio <span class="v6-version">V6.6</span>`;
  if(desc)desc.textContent="Studio auto-selects the highest-priority eligible report scope. Strategy, cadence, pressure, exclusions and policy are rule-driven; humans review exceptions only.";
  if(actions)actions.innerHTML=`<span class="v5-badge ${automatic(x)?"green":""}">${x.__autoLoading?"AUTO-SELECTING":automatic(x)?"AUTOMATIC SCOPE":"NO ELIGIBLE SCOPE"}</span><a class="v5-btn" href="#/campaign-opportunities">← Opportunities</a>`;
}
function polishBrief(x){
  const bar=document.querySelector(".v5-briefbar");if(!bar)return;
  const map={"SOURCE":"OPPORTUNITY SOURCE","PORTFOLIO":"AUTOMATIC SCOPE","ACCOUNTS":"DETECTED ACCOUNTS","CAMPAIGN AUDIENCE":"RECIPIENT STATUS","OBJECTIVE":"CAMPAIGN FAMILY"};
  [...bar.querySelectorAll(".v5-briefcell")].forEach(cell=>{
    const l=cell.querySelector("span"),v=cell.querySelector("strong");if(!l)return;const key=upper(l.textContent);
    if(map[key])l.textContent=map[key];
    if(v&&key==="SOURCE"){
      if(x.__autoLoading)v.textContent="Selecting highest-priority scope…";
      else if(!automatic(x))v.textContent="No eligible automatic scope";
      else v.textContent="REPORT / DATA HUB";
    }
    if(v&&key==="PORTFOLIO"){
      if(x.__autoLoading)v.textContent="Auto-selecting…";
      else if(!automatic(x))v.textContent="Unavailable";
      else v.textContent=x.scopeId||x.audienceId||"AUTOMATIC SCOPE";
    }
    if(v&&key==="CAMPAIGN AUDIENCE"&&Number(x.eligibleContactCount||0)<1)v.textContent="Contacts pending";
  });
  const audience=document.getElementById("v5Audience");
  if(audience){audience.disabled=true;audience.title="Audience is governed by the automatic scope and private recipient resolver.";}
}
function inject(xOverride){
  const x=xOverride||read();polishHeader(x);polishBrief(x);
  document.querySelectorAll("[data-v6-studio-gates]").forEach(n=>n.remove());
  const anchor=document.querySelector(".v5-briefbar")||document.querySelector(".v5-stepper");if(!anchor)return;
  const state=overall(x),issues=x.__autoLoading?[]:blockers(x),panel=document.createElement("section");
  panel.className="v6-studio-gates";panel.dataset.v6StudioGates="true";
  panel.innerHTML=`<div class="v6-gates-head"><div><div class="eyebrow-line">AUTOMATION READINESS</div><h2>Production readiness</h2><p>Automatic signal → scope → strategy → policy → contacts → execution → response stop → attribution.</p></div><span class="v6-qa-chip">TEST DRAFT · QA AVAILABLE</span></div>
  <div class="v6-readiness-banner ${state.tone}"><div><span>CAMPAIGN STATE</span><strong>${state.label}</strong></div><p>${state.detail}</p></div>
  <div class="v6-status-grid">${gates(x).map(g=>`<div class="v6-status-card ${tone(g.v)}"><span class="label">${g.n}</span><span class="value ${g.num?"numeric":""}">${g.v}</span></div>`).join("")}</div>
  <div class="v6-blocker-bar"><div class="v6-blocker-icon">!</div><div><strong>${x.__autoLoading?"Selecting automatic scope…":issues.length?`${issues.length} production gate${issues.length===1?"":"s"} remaining`:"Automatic production gates clear"}</strong><p>${x.__autoLoading?"No manual selection is required.":issues.length?issues.join(" · "):"Campaign can progress automatically under policy."}</p></div></div>`;
  anchor.parentNode.insertBefore(panel,anchor.nextSibling);
}

function priorityOf(x){return Number(x.priority||x.priorityRank||99);}
function eligibleOf(x){return Number(x.eligibleAccounts||0);}
function selectedOwner(){return sessionStorage.getItem(OWNER_KEY)||"ALL";}

async function chooseAutomaticScope(){
  const current=read();
  if(automatic(current))return current;
  const a=adapter();
  if(!a?.isConnected?.())return current;

  let groups=[];
  try{
    const life=global.DGL_LIFECYCLE_MODULES_V6;
    if(life?.loadLive){
      const data=await life.loadLive(true);
      groups=Array.isArray(data?.groups)?data.groups:[];
    }else if(a.v6Opportunities){
      const data=await a.v6Opportunities();
      groups=Array.isArray(data?.groups)?data.groups:[];
    }
  }catch(error){
    console.error("Campaign Studio automatic scope load failed",error);
    return current;
  }

  groups=groups.filter(x=>eligibleOf(x)>0);
  const owner=selectedOwner();
  if(owner!=="ALL"){
    const owned=groups.filter(x=>clean(x.amOwner)===owner);
    if(owned.length)groups=owned;
  }
  groups.sort((a,b)=>priorityOf(a)-priorityOf(b)||eligibleOf(b)-eligibleOf(a)||Number(b.detectedAccounts||0)-Number(a.detectedAccounts||0));
  const candidate=groups[0];
  if(!candidate)return current;

  let ctx;
  const life=global.DGL_LIFECYCLE_MODULES_V6;
  if(life?.contextFor)ctx=life.contextFor(candidate);
  else{
    const fam=upper(candidate.opportunityType).includes("QUOTE")?"QNB":upper(candidate.opportunityType);
    ctx={
      source:"REPORT / DATA HUB",opportunitySource:"REPORT / DATA HUB",
      scopeId:candidate.groupId||`AUTO-${Date.now()}`,audienceId:candidate.groupId||`AUTO-${Date.now()}`,
      amOwner:candidate.amOwner||"Unassigned",campaignFamily:fam,
      service:candidate.service||"Multiservicio",window:candidate.window||"",
      detectedAccounts:Number(candidate.detectedAccounts||0),eligibleAccounts:Number(candidate.eligibleAccounts||0),
      suppressedAccounts:Number(candidate.suppressedAccounts||0),eligibleContactCount:0,
      contactsStatus:"CONTACTS PENDING",frequencyStatus:"PENDING BACKEND EVALUATION",
      exclusionStatus:"PENDING BACKEND EVALUATION",automationPolicy:"AUTOMATION-FIRST"
    };
  }
  ctx.autoSelectedByStudio=true;
  ctx.autoSelectionReason=owner!=="ALL"?`Highest-priority eligible scope for ${owner}`:"Highest-priority eligible scope globally";
  ctx.autoSelectedAt=new Date().toISOString();
  write(ctx);
  return ctx;
}

const baseRenderer=global.DGL_MODULE_RENDERERS?.["campaign-studio"];
if(baseRenderer){
  global.DGL_MODULE_RENDERERS["campaign-studio"]=c=>{
    baseRenderer(c);
    const current=read();
    if(automatic(current)){inject(current);return;}
    const loading={...current,__autoLoading:true};
    inject(loading);
    chooseAutomaticScope().then(ctx=>{
      if(!c?.isConnected||!global.location?.hash.includes("campaign-studio"))return;
      baseRenderer(c);
      inject(ctx);
    }).catch(error=>{
      console.error("Campaign Studio auto-selection failed",error);
      inject(read());
    });
  };
}

global.addEventListener?.("dgl:v55-backend-change",event=>{
  if(!global.location?.hash.includes("campaign-studio"))return;
  const detail=event.detail||{};
  if(detail.state!=="PRIVATE_BACKEND")return;
  const mount=document.getElementById("mainContent");
  if(mount&&global.DGL_MODULE_RENDERERS?.["campaign-studio"])global.DGL_MODULE_RENDERERS["campaign-studio"](mount);
});

global.DGL_CAMPAIGN_STUDIO_V6={
  version:"6.6-auto-scope",
  gateData:gates,blockers,overallState:overall,inject,
  chooseAutomaticScope
};
})(window);