(function(global){
  "use strict";
  const KEY="dgl_v5_campaign_context",PENDING="ACCOUNT SCOPE DEFINED · CONTACTS PENDING",SAFE_BLOCKED=new Set(["NO CONTACTS AVAILABLE","NO ELIGIBLE CONTACTS","ACCOUNT SCOPE UNRESOLVED"]);
  let resolving=false;
  const countOf=context=>Number(context&&((context.accountCount!=null?context.accountCount:context.audienceCount))||0);
  function isAMRequestScope(context){const id=String(context&&context.audienceId||"");return id.startsWith("SCOPE-")||(!id&&countOf(context)>0);}
  function normalizeContext(context){
    const next={...(context||{})};if(!isAMRequestScope(next))return next;
    if(!next.audienceId&&next.requestId)next.audienceId=`SCOPE-${next.requestId}`;
    next.audienceMode="AM_REQUEST_SCOPE";next.audienceResolved=next.audienceResolved===true;
    next.audienceStatus=next.audienceResolved?"RECIPIENTS RESOLVED":SAFE_BLOCKED.has(String(next.audienceStatus||"").toUpperCase())?String(next.audienceStatus).toUpperCase():PENDING;
    next.eligibleContactCount=Number(next.eligibleContactCount||0);next.excludedContactCount=Number(next.excludedContactCount||0);return next;
  }
  function audienceLabel(context,includeName=false){const count=countOf(context),noun=count===1?"account":"accounts",name=String(context.portfolioName||context.accountName||"AM Request").trim();return `${includeName?name+" · ":""}${count} ${noun} · AM Request Scope`;}
  function readContext(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_){return null}}
  function writeContext(context){sessionStorage.setItem(KEY,JSON.stringify(context));return context;}
  function normalizeStoredContext(){const current=readContext();return current?writeContext(normalizeContext(current)):null;}
  function safeResolution(result,current){
    const source=result&&((result.audience||result.statusRecord)||result)||{},status=String(source.audienceStatus||source.status||source.code||"").toUpperCase(),resolved=source.audienceResolved===true||status==="RECIPIENTS RESOLVED";
    return normalizeContext({...current,audienceResolved:resolved,audienceStatus:resolved?"RECIPIENTS RESOLVED":SAFE_BLOCKED.has(status)?status:PENDING,eligibleContactCount:resolved?Number(source.eligibleContactCount||source.eligibleContacts||source.eligibleCount||0):0,excludedContactCount:resolved?Number(source.excludedContactCount||source.excludedContacts||source.excludedCount||0):0});
  }
  function statusText(context){if(context.audienceResolved)return `RECIPIENTS RESOLVED · Eligible contacts: ${context.eligibleContactCount} · Excluded contacts: ${context.excludedContactCount}`;return context.audienceStatus||PENDING;}
  function syncUI(context){
    const scoped=normalizeContext(context||readContext());if(!isAMRequestScope(scoped))return;writeContext(scoped);
    const selector=document.getElementById("v5Audience");if(selector){let option=Array.from(selector.options).find(x=>x.value===scoped.audienceId);if(!option){option=document.createElement("option");option.value=scoped.audienceId;selector.appendChild(option);}option.textContent=audienceLabel(scoped,true);selector.value=scoped.audienceId;const field=selector.closest(".v5-field");if(field&&!field.querySelector("[data-v55-scope-help]")){const help=document.createElement("small");help.dataset.v55ScopeHelp="true";help.style.cssText="display:block;margin-top:7px;color:#667085;line-height:1.45";help.textContent="Account scope received from AM. Recipient contacts are resolved privately before activation or any audience send.";field.appendChild(help);}}
    const brief=document.getElementById("v5AudienceValue");if(brief){brief.textContent=audienceLabel(scoped,false);const cell=brief.closest(".v5-briefcell");let status=cell&&cell.querySelector("[data-v55-recipient-status]");if(cell&&!status){status=document.createElement("small");status.dataset.v55RecipientStatus="true";status.style.cssText="display:block;margin-top:4px;color:#667085;line-height:1.35";cell.appendChild(status);}if(status)status.textContent=statusText(scoped);}
    const action=document.querySelector("[data-v5-audience]");if(action){action.disabled=resolving||scoped.audienceResolved;action.setAttribute("aria-disabled",String(action.disabled));action.innerHTML=`<i data-lucide="${scoped.audienceResolved?"check-circle-2":resolving?"loader-circle":"users"}"></i>${scoped.audienceResolved?"RECIPIENTS RESOLVED":resolving?"RESOLVING RECIPIENTS":"RESOLVE RECIPIENTS"}`;}
    const actions=document.querySelector(".v5-approval-actions");if(actions&&!document.querySelector("[data-v55-activation-gate]")){const notice=document.createElement("div");notice.dataset.v55ActivationGate="true";notice.className="v5-gate";notice.style.marginBottom="12px";notice.innerHTML="<strong>Activation Gate</strong><p>Creative approval and test-draft preparation are allowed. Activation and audience sending stay blocked until recipient contacts are resolved in the private backend.</p>";actions.parentNode.insertBefore(notice,actions);}global.lucide?.createIcons();
  }
  async function resolveRecipients(){
    const current=normalizeContext(readContext()||{}),campaignId=current.campaignId;if(!campaignId)throw new Error("A private backend campaign is required.");resolving=true;syncUI(current);
    try{const adapter=global.DGL_MARKETING_BACKEND_ADAPTER_V55;await adapter.resolveRecipients(campaignId);const result=await adapter.getAudienceStatus(campaignId),safe=safeResolution(result,current);writeContext(safe);adapter.updateCampaign(campaignId,{audienceId:safe.audienceId,audienceMode:"AM_REQUEST_SCOPE",audienceResolved:safe.audienceResolved,audienceStatus:safe.audienceStatus,eligibleContactCount:safe.eligibleContactCount,excludedContactCount:safe.excludedContactCount});return safe;}finally{resolving=false;syncUI(readContext());}
  }
  function install(){
    const studio=global.DGL_CAMPAIGN_STUDIO_V5,render=global.DGL_MODULE_RENDERERS&&global.DGL_MODULE_RENDERERS["campaign-studio"];if(!studio||!render)return;
    global.DGL_MODULE_RENDERERS["campaign-studio"]=container=>{const context=normalizeStoredContext();render(container);syncUI(context);};
    const originalLoad=studio.loadStrategy.bind(studio),originalStrategy=studio.strategy.bind(studio);studio.loadStrategy=patch=>{const normalized=normalizeContext(patch),result=originalLoad(normalized);syncUI(normalized);return result;};studio.strategy=studio.getStrategy=()=>{const strategy=originalStrategy(),context=normalizeContext(readContext()||{});return isAMRequestScope(context)?{...strategy,audienceId:context.audienceId,audienceMode:context.audienceMode,audienceResolved:context.audienceResolved,audienceStatus:context.audienceStatus}:strategy;};
    document.addEventListener("click",event=>{const button=event.target.closest("[data-v5-audience]");if(!button||!isAMRequestScope(readContext()))return;event.preventDefault();event.stopImmediatePropagation();resolveRecipients().then(context=>global.DGL_INTERACTIONS?.toast?.(context.audienceResolved?"Recipients resolved privately.":context.audienceStatus)).catch(error=>global.DGL_INTERACTIONS?.toast?.(error.message,"error"));},true);
    ["click","change","input"].forEach(type=>document.addEventListener(type,()=>{if(document.getElementById("v5Audience"))setTimeout(()=>syncUI(readContext()),0);}));
  }
  global.DGL_CAMPAIGN_AUDIENCE_BRIDGE_V55={version:"5.5",isAMRequestScope,normalizeContext,audienceLabel,safeResolution,statusText,syncUI,resolveRecipients};install();
})(window);
