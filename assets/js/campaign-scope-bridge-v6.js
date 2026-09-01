(function(global){
"use strict";
const KEY="dgl_v5_campaign_context";
const PENDING="AUTOMATIC SCOPE READY · CONTACTS PENDING";
let resolving=false;
const clean=v=>String(v==null?"":v).trim();
const read=()=>{try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_){return null}};
const write=x=>{sessionStorage.setItem(KEY,JSON.stringify(x||{}));return x||{}};
const automatic=x=>!!(x&&(x.scopeId||String(x.audienceId||"").startsWith("SCOPE-")));
const count=x=>Number(x&&(x.eligibleAccounts??x.accountCount??x.audienceCount)||0);

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
  return n;
}
function label(x){
  const parts=[x.amOwner,x.campaignFamily||x.objective,x.service,x.window||x.qnbWindow].map(clean).filter(Boolean);
  return `${parts.join(" · ")} · ${count(x)} eligible accounts`;
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
  if(brief)brief.textContent=`${count(n)} eligible accounts · automatic scope`;
  const source=document.getElementById("v5SourceValue");
  if(source)source.textContent="REPORT / DATA HUB";
  const action=document.querySelector("[data-v5-audience]");
  if(action){
    action.disabled=resolving||n.audienceResolved||!n.campaignId;
    action.innerHTML=`<i data-lucide="${n.audienceResolved?"check-circle-2":resolving?"loader-circle":"users"}"></i>${n.audienceResolved?"RECIPIENTS RESOLVED":!n.campaignId?"CAMPAIGN RECORD PENDING":resolving?"RESOLVING RECIPIENTS":"RESOLVE RECIPIENTS"}`;
  }
  global.lucide?.createIcons();
}
async function resolveRecipients(){
  const n=normalize(read()||{});
  if(!automatic(n))throw new Error("Automatic scope required.");
  if(!n.campaignId)throw new Error("Backend campaign record is required before recipient resolution.");
  const api=global.DGL_MARKETING_BACKEND_ADAPTER_V55;
  if(!api?.isConnected?.())throw new Error("Private backend required.");
  resolving=true;sync(n);
  try{
    await api.resolveRecipients(n.campaignId);
    const result=await api.getAudienceStatus(n.campaignId);
    const src=result?.audience||result?.statusRecord||result||{};
    const status=String(src.audienceStatus||src.status||"").toUpperCase();
    const resolved=src.audienceResolved===true||status==="RECIPIENTS RESOLVED";
    const next=normalize({...n,audienceResolved:resolved,audienceStatus:resolved?"RECIPIENTS RESOLVED":status||PENDING,
      eligibleContactCount:resolved?Number(src.eligibleContactCount||src.eligibleContacts||src.eligibleCount||0):0,
      excludedContactCount:resolved?Number(src.excludedContactCount||src.excludedContacts||src.excludedCount||0):0});
    write(next);return next;
  }finally{resolving=false;sync(read());}
}
function install(){
  const render=global.DGL_MODULE_RENDERERS?.["campaign-studio"];
  if(!render)return;
  global.DGL_MODULE_RENDERERS["campaign-studio"]=container=>{render(container);sync(read());};
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-v5-audience]");
    if(!b||!automatic(read()))return;
    e.preventDefault();e.stopImmediatePropagation();
    resolveRecipients().then(x=>global.DGL_INTERACTIONS?.toast?.(x.audienceResolved?"Recipients resolved privately.":x.audienceStatus))
      .catch(err=>global.DGL_INTERACTIONS?.toast?.(err.message,"error"));
  },true);
}
global.DGL_CAMPAIGN_SCOPE_BRIDGE_V6={version:"6.6",automatic,normalize,label,sync,resolveRecipients};
install();
})(window);