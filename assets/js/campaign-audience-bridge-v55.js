(function(global){
  "use strict";
  const KEY="dgl_v5_campaign_context";
  const countOf=context=>Number(context&&((context.accountCount!=null?context.accountCount:context.audienceCount))||0);
  function isAMRequestScope(context){const id=String(context&&context.audienceId||"");return id.startsWith("SCOPE-")||(!id&&countOf(context)>0);}
  function normalizeContext(context){
    const next={...(context||{})};if(!isAMRequestScope(next))return next;
    if(!next.audienceId&&next.requestId)next.audienceId=`SCOPE-${next.requestId}`;
    next.audienceMode="AM_REQUEST_SCOPE";next.audienceResolved=false;next.audienceStatus="ACCOUNT SCOPE DEFINED · CONTACTS PENDING";return next;
  }
  function audienceLabel(context,includeName=false){const count=countOf(context),noun=count===1?"account":"accounts",name=String(context.portfolioName||context.accountName||"AM Request").trim();return `${includeName?name+" · ":""}${count} ${noun} · AM Request Scope`;}
  function readContext(){try{return JSON.parse(sessionStorage.getItem(KEY)||"null")}catch(_){return null}}
  function writeContext(context){sessionStorage.setItem(KEY,JSON.stringify(context));return context;}
  function normalizeStoredContext(){const current=readContext();return current?writeContext(normalizeContext(current)):null;}
  function syncUI(context){
    const scoped=normalizeContext(context||readContext());if(!isAMRequestScope(scoped))return;
    writeContext(scoped);
    const selector=document.getElementById("v5Audience");
    if(selector){let option=Array.from(selector.options).find(x=>x.value===scoped.audienceId);if(!option){option=document.createElement("option");option.value=scoped.audienceId;selector.appendChild(option);}option.textContent=audienceLabel(scoped,true);selector.value=scoped.audienceId;const field=selector.closest(".v5-field");if(field&&!field.querySelector("[data-v55-scope-help]")){const help=document.createElement("small");help.dataset.v55ScopeHelp="true";help.style.cssText="display:block;margin-top:7px;color:#667085;line-height:1.45";help.textContent="Account scope received from AM. Recipient contacts are resolved privately before activation or any audience send.";field.appendChild(help);}}
    const brief=document.getElementById("v5AudienceValue");if(brief)brief.textContent=audienceLabel(scoped,false);
    const action=document.querySelector("[data-v5-audience]");if(action){action.disabled=true;action.setAttribute("aria-disabled","true");action.innerHTML='<i data-lucide="lock"></i>RECIPIENT RESOLUTION PENDING';}
    const actions=document.querySelector(".v5-approval-actions");if(actions&&!document.querySelector("[data-v55-activation-gate]")){const notice=document.createElement("div");notice.dataset.v55ActivationGate="true";notice.className="v5-gate";notice.style.marginBottom="12px";notice.innerHTML="<strong>Activation Gate</strong><p>Creative approval and test-draft preparation are allowed. Activation and audience sending stay blocked until recipient contacts are resolved in the private backend.</p>";actions.parentNode.insertBefore(notice,actions);}
    global.lucide?.createIcons();
  }
  function install(){
    const studio=global.DGL_CAMPAIGN_STUDIO_V5,render=global.DGL_MODULE_RENDERERS&&global.DGL_MODULE_RENDERERS["campaign-studio"];if(!studio||!render)return;
    global.DGL_MODULE_RENDERERS["campaign-studio"]=container=>{const context=normalizeStoredContext();render(container);syncUI(context);};
    const originalLoad=studio.loadStrategy.bind(studio),originalStrategy=studio.strategy.bind(studio);
    studio.loadStrategy=patch=>{const normalized=normalizeContext(patch);const result=originalLoad(normalized);syncUI(normalized);return result;};
    studio.strategy=studio.getStrategy=()=>{const strategy=originalStrategy(),context=normalizeContext(readContext()||{});return isAMRequestScope(context)?{...strategy,audienceId:context.audienceId,audienceMode:context.audienceMode,audienceResolved:false,audienceStatus:context.audienceStatus}:strategy;};
    ["click","change","input"].forEach(type=>document.addEventListener(type,()=>{if(document.getElementById("v5Audience"))setTimeout(()=>syncUI(readContext()),0);}));
  }
  global.DGL_CAMPAIGN_AUDIENCE_BRIDGE_V55={version:"5.5",isAMRequestScope,normalizeContext,audienceLabel,syncUI};install();
})(window);
