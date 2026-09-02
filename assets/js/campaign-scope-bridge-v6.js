(function(global){
"use strict";
const KEY="dgl_v5_campaign_context";
const PENDING="AUTOMATIC SCOPE READY · CONTACTS PENDING";
let phase="IDLE",activePromise=null,lastError="";
const clean=v=>String(v==null?"":v).trim();
const upper=v=>clean(v).toUpperCase();
const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_){return null}};
const write=x=>{sessionStorage.setItem(KEY,JSON.stringify(x||{}));return x||{}};
const automatic=x=>!!(x&&(x.scopeId||String(x.audienceId||"").startsWith("SCOPE-")));
const count=x=>Number(x&&(x.eligibleAccounts??x.accountCount??x.audienceCount)||0);
const api=()=>global.DGL_MARKETING_BACKEND_ADAPTER_V55;
const playbooks=()=>global.DGL_MARKETING_PLAYBOOKS;

function normalize(x){
  const n={...(x||{})};
  if(!automatic(n))return n;
  n.audienceId=n.audienceId||n.scopeId;
  n.scopeId=n.scopeId||n.audienceId;
  n.audienceMode="AUTOMATIC_REPORT_SCOPE";
  n.source=n.source||"REPORT / DATA HUB";
  n.opportunitySource=n.opportunitySource||"REPORT / DATA HUB";
  n.audienceResolved=n.audienceResolved===true;
  n.audienceStatus=n.audienceResolved?"RECIPIENTS RESOLVED":clean(n.audienceStatus)||PENDING;
  n.eligibleContactCount=Number(n.eligibleContactCount||0);
  n.excludedContactCount=Number(n.excludedContactCount||0);
  n.policyApprovalStatus=n.policyApprovalStatus||n.approvalStatus||"PENDING POLICY DECISION";
  return n;
}
function label(x){
  const parts=[x.amOwner,x.campaignFamily||x.objective,x.service,x.window||x.qnbWindow].map(clean).filter(Boolean);
  return `${parts.join(" · ")} · ${count(x)} pre-gate eligible accounts`;
}
function actionState(n){
  if(lastError)return ["alert-triangle","RETRY AUTOMATION"];
  if(phase==="CREATING_REQUEST")return ["loader-circle","CREATING SYSTEM RECORD"];
  if(phase==="CREATING_CAMPAIGN")return ["loader-circle","CREATING CAMPAIGN RECORD"];
  if(phase==="RESOLVING_RECIPIENTS")return ["loader-circle","RESOLVING RECIPIENTS"];
  if(phase==="POLICY_APPROVAL")return ["loader-circle","APPLYING POLICY"];
  if(!n.campaignId)return ["workflow","AUTO-CREATE CAMPAIGN"];
  if(!n.audienceResolved)return ["users","AUTO-RESOLVE RECIPIENTS"];
  if(upper(n.policyApprovalStatus).includes("HUMAN"))return ["shield-alert","EXCEPTION REVIEW REQUIRED"];
  if(upper(n.policyApprovalStatus).includes("APPROVED")||upper(n.policyApprovalStatus).includes("AUTO BY POLICY"))return ["check-circle-2","AUTOMATION GATES ADVANCED"];
  return ["shield-check","APPLY POLICY"];
}
function sync(x){
  const n=normalize(x||read()||{});
  if(!automatic(n))return;
  write(n);
  const selector=document.getElementById("v5Audience");
  if(selector){
    let option=[...selector.options].find(o=>o.value===n.audienceId);
    if(!option){option=document.createElement("option");option.value=n.audienceId;selector.appendChild(option);}
    option.textContent=label(n);
    selector.value=n.audienceId;
    selector.disabled=true;
  }
  const brief=document.getElementById("v5AudienceValue");
  if(brief)brief.textContent=`${count(n)} pre-gate eligible accounts · automatic scope`;
  const source=document.getElementById("v5SourceValue");
  if(source)source.textContent="REPORT / DATA HUB";
  const action=document.querySelector("[data-v5-audience]");
  if(action){
    const [icon,text]=actionState(n);
    action.disabled=!!activePromise||upper(n.policyApprovalStatus).includes("HUMAN")||upper(n.policyApprovalStatus).includes("APPROVED")||upper(n.policyApprovalStatus).includes("AUTO BY POLICY");
    action.innerHTML=`<i data-lucide="${icon}"></i>${text}`;
    action.title=lastError||"Automatic V6 campaign bootstrap and governance progression.";
  }
  global.lucide?.createIcons();
}
function systemRequest(n){
  return {
    sourceType:"AUTOMATION_V6",sourceLabel:n.scopeId,sourceKey:n.scopeId,
    amOwner:n.amOwner||"Unassigned",portfolioName:n.scopeId,accountName:"",
    accountCount:count(n),audienceCount:count(n),audienceId:n.audienceId,audienceMode:"AUTOMATIC_REPORT_SCOPE",
    objective:n.objective||n.campaignFamily||"Reactivation",service:n.service||"Multiservicio",
    messageAngle:n.messageStrategy||"",priority:n.priority||"",commercialContext:"Report-derived automatic scope",
    requestedOutcome:"RFQ / LOAD",targetWindow:n.window||n.qnbWindow||"",lane:n.lane||"",qnbWindow:n.qnbWindow||n.window||"",
    exclusions:"GOVERNED BACKEND EXCLUSIONS",status:"AUTOMATION READY",automationStatus:"AUTOMATION READY",
    marketingStatus:"AUTOMATION READY",campaignName:n.campaignName||`${n.objective||n.campaignFamily||"Campaign"} · ${n.service||"Multiservicio"}`
  };
}
async function ensureCampaignRecord(input){
  let n=normalize(input||read()||{});
  if(!automatic(n))throw new Error("Automatic scope required.");
  const a=api();if(!a?.isConnected?.())throw new Error("Private backend required.");
  if(n.campaignId)return n;
  if(!n.requestId){
    phase="CREATING_REQUEST";sync(n);
    const savedRequest=await a.createRequest(systemRequest(n));
    const requestId=clean(savedRequest?.requestId||savedRequest?.id);
    if(!requestId)throw new Error("Private backend did not return a system requestId.");
    n=write(normalize({...n,requestId,systemGeneratedRequest:true,automationStage:"SYSTEM RECORD CREATED"}));
  }
  phase="CREATING_CAMPAIGN";sync(n);
  const resolved=playbooks()?.resolveStrategy?.(n);
  if(resolved&&resolved.valid===false)throw new Error(`Campaign strategy blocked: ${(resolved.missingFields||[]).join(", ")||"validation failed"}.`);
  const strategy={...(resolved?.strategy||{}),...n,audienceId:n.audienceId,audienceMode:"AUTOMATIC_REPORT_SCOPE",accountCount:count(n),audienceCount:count(n)};
  const saved=await a.createCampaign({requestId:n.requestId,strategy});
  const campaignId=clean(saved?.campaignId||saved?.id);
  if(!campaignId)throw new Error("Private backend did not return a campaignId.");
  n=write(normalize({...n,campaignId,automationStage:"CAMPAIGN RECORD CREATED"}));
  return n;
}
async function resolveRecipients(input){
  let n=normalize(input||read()||{});
  if(!automatic(n))throw new Error("Automatic scope required.");
  if(!n.campaignId)throw new Error("Backend campaign record is required before recipient resolution.");
  const a=api();if(!a?.isConnected?.())throw new Error("Private backend required.");
  phase="RESOLVING_RECIPIENTS";sync(n);
  await a.resolveRecipients(n.campaignId);
  const result=await a.getAudienceStatus(n.campaignId);
  const src=result?.audience||result?.statusRecord||result||{};
  const status=upper(src.audienceStatus||src.status);
  const resolved=src.audienceResolved===true||status==="RECIPIENTS RESOLVED";
  const frequencyStatus=clean(src.frequencyStatus||src.pressureStatus||n.frequencyStatus||"PENDING BACKEND EVALUATION");
  const exclusionStatus=clean(src.exclusionStatus||src.exclusionsStatus||n.exclusionStatus||"PENDING BACKEND EVALUATION");
  n=write(normalize({...n,audienceResolved:resolved,audienceStatus:resolved?"RECIPIENTS RESOLVED":status||PENDING,
    eligibleContactCount:resolved?Number(src.eligibleContactCount||src.eligibleContacts||src.eligibleCount||0):0,
    excludedContactCount:resolved?Number(src.excludedContactCount||src.excludedContacts||src.excludedCount||0):0,
    frequencyStatus,exclusionStatus,
    exclusionsCleared:src.exclusionsCleared===true||["CLEAR","CLEARED","PASSED"].includes(upper(exclusionStatus)),
    automationStage:resolved?"RECIPIENTS RESOLVED":"RECIPIENT RESOLUTION PENDING"}));
  return n;
}
function policyBlocked(n){
  const values=[n.frequencyStatus,n.exclusionStatus].map(upper);
  return values.some(v=>v.includes("BLOCK")||v.includes("DNC")||v.includes("COOLDOWN")||v.includes("FREQUENCY CAP")||v.includes("ACTIVE CAMPAIGN")||v.includes("HIGHER PRIORITY"));
}
function technicalGatesReady(n){
  const f=upper(n.frequencyStatus),e=upper(n.exclusionStatus);
  const frequencyClear=["CLEAR","PASSED"].includes(f);
  const exclusionsClear=n.exclusionsCleared===true||["CLEAR","CLEARED","PASSED"].includes(e);
  return frequencyClear&&exclusionsClear;
}
async function ensurePolicyApproval(input){
  let n=normalize(input||read()||{});
  if(!n.campaignId||!n.audienceResolved||Number(n.eligibleContactCount||0)<1)return n;
  const decision=playbooks()?.policyDecision?.(n)||{status:n.requiresHumanReview?"HUMAN EXCEPTION REVIEW":"AUTO BY POLICY",autoApproved:!n.requiresHumanReview};
  if(!decision.autoApproved){return write(normalize({...n,policyApprovalStatus:"HUMAN EXCEPTION REVIEW",requiresHumanReview:true,automationStage:"HUMAN EXCEPTION REVIEW"}));}
  if(policyBlocked(n))return write(normalize({...n,policyApprovalStatus:"BLOCKED BY TECHNICAL POLICY",automationStage:"TECHNICAL POLICY BLOCK"}));
  if(!technicalGatesReady(n))return write(normalize({...n,policyApprovalStatus:"TECHNICAL GATES PENDING",automationStage:"FREQUENCY / EXCLUSIONS PENDING"}));
  if(upper(n.policyApprovalStatus).includes("APPROVED")||upper(n.policyApprovalStatus).includes("AUTO BY POLICY"))return n;
  const a=api();if(!a?.isConnected?.())throw new Error("Private backend required.");
  phase="POLICY_APPROVAL";sync(n);
  await a.requestApproval(n.campaignId,{requestedBy:"V6 Policy Engine",policyBased:true,scopeId:n.scopeId});
  await a.recordApproval(n.campaignId,{approvedBy:"V6 Policy Engine",status:"APPROVED",reason:"AUTO BY POLICY",notes:"Automatic report-derived scope; no exception flags."});
  n=write(normalize({...n,approvalStatus:"APPROVED",policyApprovalStatus:"AUTO BY POLICY · APPROVED",autoApproved:true,automationStage:"POLICY APPROVED"}));
  return n;
}
async function autoAdvance(){
  if(activePromise)return activePromise;
  lastError="";
  activePromise=(async()=>{
    let n=normalize(read()||{});
    if(!automatic(n))return n;
    if(!api()?.isConnected?.())return n;
    n=await ensureCampaignRecord(n);
    if(!n.audienceResolved)n=await resolveRecipients(n);
    n=await ensurePolicyApproval(n);
    phase="IDLE";sync(n);return n;
  })().catch(error=>{lastError=clean(error?.message||error)||"Automatic campaign progression failed.";phase="IDLE";sync(read());throw error;})
    .finally(()=>{activePromise=null;sync(read());});
  return activePromise;
}
function install(){
  const render=global.DGL_MODULE_RENDERERS?.["campaign-studio"];
  if(!render)return;
  global.DGL_MODULE_RENDERERS["campaign-studio"]=container=>{
    render(container);sync(read());
    Promise.resolve().then(()=>autoAdvance()).catch(err=>{console.error("DGL V6 automatic campaign progression failed",err);global.DGL_INTERACTIONS?.toast?.(lastError,"error");});
  };
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-v5-audience]");
    if(!b||!automatic(read()))return;
    e.preventDefault();e.stopImmediatePropagation();
    autoAdvance().then(x=>global.DGL_INTERACTIONS?.toast?.(x?.policyApprovalStatus||x?.audienceStatus||"Automation advanced."))
      .catch(err=>global.DGL_INTERACTIONS?.toast?.(clean(err?.message||err),"error"));
  },true);
  global.addEventListener?.("dgl:v55-backend-change",event=>{
    if(!global.location?.hash?.includes("campaign-studio")||(event.detail||{}).state!=="PRIVATE_BACKEND")return;
    autoAdvance().catch(err=>console.error("DGL V6 backend-change progression failed",err));
  });
}
global.DGL_CAMPAIGN_SCOPE_BRIDGE_V6={version:"6.6.1-auto-bootstrap",automatic,normalize,label,sync,ensureCampaignRecord,resolveRecipients,ensurePolicyApproval,autoAdvance,getState:()=>({phase,lastError})};
install();
})(window);
