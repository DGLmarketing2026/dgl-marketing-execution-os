(function(global){
  "use strict";
  const read=()=>{try{return JSON.parse(sessionStorage.getItem("dgl_v5_campaign_context")||"{}")}catch(_){return {}}};
  const clean=v=>String(v==null?"":v).trim();
  const upper=v=>clean(v).toUpperCase();
  const isAutomaticScope=x=>!!(x.scopeId||(x.audienceId&&String(x.audienceId).startsWith("SCOPE-")&&!String(x.audienceId).startsWith("SCOPE-AMR-")));
  const providerStatus=()=>global.DGL_CAMPAIGN_EXECUTION_V6?.providerStatus||"BULK PROVIDER NOT CONFIGURED";
  const providerReady=()=>!upper(providerStatus()).includes("NOT CONFIGURED")&&!upper(providerStatus()).includes("BLOCKED");

  function statusClass(value){
    const x=upper(value);
    if(x.includes("APPROVED")||x.includes("READY")||x.includes("CLEAR")||x.includes("RESOLVED")||x.includes("LIVE"))return "is-good";
    if(x.includes("BLOCK")||x.includes("REQUIRED")||x.includes("NO CONTACT")||x.includes("NOT CONFIGURED")||x.includes("FAILED"))return "is-blocked";
    if(x.includes("PENDING")||x.includes("WAIT")||x.includes("PREPAR"))return "is-warn";
    return "";
  }

  function gateData(x){
    const auto=isAutomaticScope(x),detected=Number(x.detectedAccounts||x.accountCount||0),eligible=Number(x.eligibleAccounts||x.accountCount||0);
    const suppressed=Number(x.suppressedAccounts||Math.max(0,detected-eligible)||0),contacts=Number(x.eligibleContactCount||x.recipientCount||0);
    return [
      {n:"Automatic scope",v:auto?(x.scopeId||x.audienceId||"AUTOMATIC SCOPE"):"AUTOMATIC SCOPE REQUIRED"},
      {n:"Detected accounts",v:detected,numeric:true},{n:"Eligible accounts",v:eligible,numeric:true},{n:"Suppressed accounts",v:suppressed,numeric:true},
      {n:"Eligible contacts",v:contacts,numeric:true},{n:"Frequency guard",v:x.frequencyStatus||"PENDING BACKEND EVALUATION"},
      {n:"Exclusions",v:x.exclusionStatus||x.exclusionsStatus||"PENDING BACKEND EVALUATION"},
      {n:"Copy QA",v:x.copyQualityStatus||"READY FOR QA"},{n:"Creative QA",v:x.creativeQualityStatus||"READY FOR QA"},
      {n:"Marketing approval",v:x.approvalStatus||x.marketingApproval||"PENDING"},{n:"Bulk provider",v:providerStatus()},
      {n:"Drive archive",v:x.csvArchiveReady?"ARCHIVE READY":"ARCHIVE PENDING"}
    ];
  }

  function blockers(x){
    const out=[],auto=isAutomaticScope(x),contacts=Number(x.eligibleContactCount||x.recipientCount||0),frequency=upper(x.frequencyStatus||"PENDING BACKEND EVALUATION"),approval=upper(x.approvalStatus||x.marketingApproval||"PENDING");
    if(!auto)out.push("Automatic campaign scope has not been selected from report-derived opportunities.");
    if(auto&&contacts<1)out.push("Authoritative contact source is required before recipient resolution can complete.");
    if(frequency.includes("BLOCK"))out.push("Frequency / cooldown governance is blocking production execution.");
    if(approval!=="APPROVED")out.push("Marketing approval is required before activation.");
    if(!providerReady())out.push("Production bulk provider is not configured. Gmail remains QA-only.");
    if(!x.csvArchiveReady)out.push("Execution archive is not ready yet; completed runs must archive CSV / HTML / copy / creative.");
    return out;
  }

  function overallState(x){
    if(!isAutomaticScope(x))return {label:"SCOPE REQUIRED",tone:"blocked",detail:"Start from a report-derived Campaign Opportunity."};
    if(Number(x.eligibleContactCount||x.recipientCount||0)<1)return {label:"CONTACTS BLOCKED",tone:"blocked",detail:"Waiting for an authoritative private contact source."};
    if(upper(x.approvalStatus||x.marketingApproval||"PENDING")!=="APPROVED")return {label:"PREPARING / APPROVAL",tone:"warn",detail:"Creative, copy, governance and approval remain in progress."};
    if(!providerReady())return {label:"EXECUTION BLOCKED",tone:"blocked",detail:"Audience may be ready, but production provider is not configured."};
    return {label:"READY FOR ACTIVATION",tone:"good",detail:"All production gates are ready for governed execution."};
  }

  function polishHeader(x){
    const top=document.querySelector(".v5-topbar");if(!top)return;
    const kicker=top.querySelector(".v5-kicker"),title=top.querySelector("h1"),desc=top.querySelector("p"),actions=top.querySelector(".v5-top-actions");
    if(kicker)kicker.textContent="GOVERNED CAMPAIGN EXECUTION";
    if(title)title.innerHTML=`Campaign Studio <span class="v6-version">V6</span>`;
    if(desc)desc.textContent="Automatic scopes arrive from report-derived opportunities. Marketing governs strategy, copy, creative, QA, approval and execution without manually selecting customer accounts.";
    if(actions){const auto=isAutomaticScope(x);actions.innerHTML=`<span class="v5-badge ${auto?"green":""}">${auto?"AUTOMATIC SCOPE":"SCOPE REQUIRED"}</span><a class="v5-btn" href="#/campaign-opportunities">← Opportunities</a>`;}
  }

  function polishBrief(x){
    const bar=document.querySelector(".v5-briefbar");if(!bar)return;
    const labelMap={"SOURCE":"OPPORTUNITY SOURCE","PORTFOLIO":"CAMPAIGN SCOPE","ACCOUNTS":"DETECTED ACCOUNTS","CAMPAIGN AUDIENCE":"RECIPIENT STATUS","OBJECTIVE":"CAMPAIGN FAMILY"};
    [...bar.querySelectorAll(".v5-briefcell")].forEach(cell=>{
      const label=cell.querySelector("span"),value=cell.querySelector("strong");if(!label)return;const key=upper(label.textContent);
      if(labelMap[key])label.textContent=labelMap[key];
      if(value&&key==="SOURCE"&&!isAutomaticScope(x))value.textContent="Awaiting automatic scope";
      if(value&&key==="PORTFOLIO"&&!isAutomaticScope(x))value.textContent="Not selected";
      if(value&&key==="CAMPAIGN AUDIENCE"&&Number(x.eligibleContactCount||0)<1)value.textContent="Contacts pending";
    });
    const audience=document.getElementById("v5Audience");if(audience){audience.disabled=true;audience.title="Audience is governed by the automatic campaign scope and private recipient resolution.";}
  }

  function inject(){
    const x=read();polishHeader(x);polishBrief(x);
    document.querySelectorAll("[data-v6-studio-gates]").forEach(n=>n.remove());
    const anchor=document.querySelector(".v5-briefbar")||document.querySelector(".v5-stepper");if(!anchor)return;
    const state=overallState(x),issues=blockers(x),panel=document.createElement("section");
    panel.className="v6-studio-gates";panel.dataset.v6StudioGates="true";
    panel.innerHTML=`<div class="v6-gates-head"><div><div class="eyebrow-line">LIFECYCLE READINESS</div><h2>Production readiness</h2><p>One governed path from automatic opportunity scope to recipient resolution, approval, execution, response, AM handoff and attribution.</p></div><span class="v6-qa-chip">TEST DRAFT · QA AVAILABLE</span></div>
    <div class="v6-readiness-banner ${state.tone}"><div><span>CAMPAIGN STATE</span><strong>${state.label}</strong></div><p>${state.detail}</p></div>
    <div class="v6-status-grid">${gateData(x).map(g=>`<div class="v6-status-card ${statusClass(g.v)}"><span class="label">${g.n}</span><span class="value ${g.numeric?"numeric":""}">${g.v}</span></div>`).join("")}</div>
    <div class="v6-blocker-bar"><div class="v6-blocker-icon">!</div><div><strong>${issues.length?`${issues.length} production gate${issues.length===1?"":"s"} remaining`:"Production gates clear"}</strong><p>${issues.length?issues.join(" · "):"Campaign is ready to proceed through governed activation."}</p></div></div>`;
    anchor.parentNode.insertBefore(panel,anchor.nextSibling);
  }

  const renderer=global.DGL_MODULE_RENDERERS?.["campaign-studio"];
  if(renderer)global.DGL_MODULE_RENDERERS["campaign-studio"]=c=>{renderer(c);inject();};
  global.DGL_CAMPAIGN_STUDIO_V6={version:"6.1",gateData,blockers,overallState,inject};
})(window);
