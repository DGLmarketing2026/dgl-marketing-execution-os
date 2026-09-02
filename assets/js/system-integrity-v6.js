(function(global){
"use strict";

/* DGL Marketing OS V6.6.2 — consolidated runtime remediation.
   Loaded from the canonical system-integrity slot so no extra script tag is required. */

const VERSION="6.6.2";
const BASE_URL="https://dglmarketing2026.github.io/dgl-marketing-execution-os/";
const OWNER_KEY="dgl_v6_owner_filter";
const clean=v=>String(v==null?"":v).trim();
const upper=v=>clean(v).toUpperCase();
const selectedOwner=()=>sessionStorage.getItem(OWNER_KEY)||"ALL";

function assetUrl(value){
  const raw=clean(value);
  if(!raw)return"";
  if(/^https?:\/\//i.test(raw)||/^cid:/i.test(raw)||/^data:/i.test(raw))return raw;
  return BASE_URL+raw.replace(/^\.\//,"").replace(/^\//,"");
}

function absolutizeHtml(html){
  let out=String(html||"");
  out=out.replace(/(["'(=])(?:\.\/)?assets\//gi,(_,lead)=>`${lead}${BASE_URL}assets/`);
  out=out.replace(/url\(\s*(["']?)(?:\.\/)?assets\//gi,(_,quote)=>`url(${quote}${BASE_URL}assets/`);
  return out;
}

function normalizedWindow(value){
  const raw=clean(value),x=upper(raw).replace(/–/g,"-");
  if(!raw)return"";
  if(["3-7","8-14","0-14"].includes(x))return"0-14";
  if(x==="15-30")return"15-30";
  if([">30","30+","30 +"].includes(x))return"30+";
  if(/GMT|STANDARD TIME|HORA ESTÁNDAR|^\w{3}\s\w{3}\s\d{1,2}\s\d{4}/i.test(raw))return"0-14";
  return raw;
}

function family(value){
  const x=upper(value);
  if(x.includes("QUOTE")||x.includes("QNB"))return"QNB";
  if(x.includes("RETENTION"))return"RETENTION";
  if(x.includes("REACTIVATION"))return"REACTIVATION";
  if(x.includes("CROSS"))return"CROSS-SELL";
  if(x.includes("NURTURE")||x.includes("RENEWAL"))return"NURTURE";
  return x||"UNKNOWN";
}

function mergeOpportunityGroups(groups){
  const map=new Map();
  (Array.isArray(groups)?groups:[]).forEach((row,index)=>{
    const window=normalizedWindow(row.window||row.qnbWindow||"");
    const reason=clean(row.reasonCategory||row.reason||"");
    const key=[
      clean(row.amOwner||"Unassigned"),
      family(row.opportunityType),
      clean(row.service||"Unspecified"),
      window,
      upper(reason)
    ].join("\u001f");

    if(!map.has(key)){
      map.set(key,{
        ...row,
        window,
        qnbWindow:window||row.qnbWindow||"",
        reasonCategory:reason,
        detectedAccounts:0,
        eligibleAccounts:0,
        suppressedAccounts:0,
        __firstIndex:index
      });
    }

    const target=map.get(key);
    target.detectedAccounts+=Number(row.detectedAccounts||0);
    target.eligibleAccounts+=Number(row.eligibleAccounts||0);
    target.suppressedAccounts+=Number(row.suppressedAccounts||0);
    target.priority=Math.min(Number(target.priority||99),Number(row.priority||99));
    if(clean(row.lastEngineRun)>clean(target.lastEngineRun))target.lastEngineRun=row.lastEngineRun;
  });

  return [...map.values()]
    .sort((a,b)=>
      Number(a.priority||99)-Number(b.priority||99) ||
      Number(b.eligibleAccounts||0)-Number(a.eligibleAccounts||0) ||
      a.__firstIndex-b.__firstIndex
    )
    .map((row,index)=>{
      const out={...row,groupId:row.groupId||`OPP-GROUP-${index+1}`};
      delete out.__firstIndex;
      return out;
    });
}

function normalizeOpportunityResponse(response){
  if(!response||typeof response!=="object")return response;
  const groups=mergeOpportunityGroups(response.groups||[]);
  const summary={...(response.summary||{}),groupCount:groups.length};
  return {...response,groups,summary};
}

function summarizePipeline(records){
  const rows=Array.isArray(records)?records:[];
  const grouped={currentStage:{},opportunityType:{},service:{},amOwner:{}};
  rows.forEach(row=>{
    Object.keys(grouped).forEach(field=>{
      const key=clean(row[field]||"UNSPECIFIED");
      grouped[field][key]=(grouped[field][key]||0)+1;
    });
  });
  return {
    total:rows.length,
    byCurrentStage:grouped.currentStage,
    byOpportunityType:grouped.opportunityType,
    byService:grouped.service,
    byAmOwner:grouped.amOwner
  };
}

function patchCreativeLibrary(){
  const lib=global.DGL_CREATIVE_LIBRARY_V5;
  if(!lib||lib.__v66Remediated)return;

  const originalResolve=typeof lib.resolveAsset==="function"
    ? lib.resolveAsset.bind(lib)
    : ()=>"";

  lib.resolveAsset=args=>{
    const input=args||{};
    const service=lib.SERVICES?.[input.service]||lib.SERVICES?.Multiservicio;
    const raw=input.objective==="Quoted Not Booked"
      ? (service?.asset||"")
      : originalResolve(input);
    return assetUrl(raw);
  };

  /* QNB remains concise but now uses the clean editorial system so the
     campaign has a real service image instead of an image-less email. */
  if(lib.OBJECTIVES?.["Quoted Not Booked"]){
    lib.OBJECTIVES["Quoted Not Booked"].recommendedSystem="editorial-white";
  }

  lib.__v66Remediated=true;
}

function patchStudioApi(){
  const studio=global.DGL_CAMPAIGN_STUDIO_V5;
  if(!studio||studio.__v66Remediated)return;

  const originalEmail=typeof studio.emailHtml==="function"
    ? studio.emailHtml.bind(studio)
    : ()=>"";
  const originalPreview=typeof studio.getPreview==="function"
    ? studio.getPreview.bind(studio)
    : ()=>({});

  studio.emailHtml=()=>absolutizeHtml(originalEmail());

  studio.getPreview=()=>{
    const preview=originalPreview()||{};
    const strategy={...(preview.strategy||{})};
    if(strategy.heroUrl)strategy.heroUrl=assetUrl(strategy.heroUrl);
    if(strategy.logoUrl)strategy.logoUrl=assetUrl(strategy.logoUrl);
    return {...preview,strategy,html:absolutizeHtml(preview.html||"")};
  };

  studio.__v66Remediated=true;
}

function patchBackendAdapter(){
  const adapter=global.DGL_MARKETING_BACKEND_ADAPTER_V55;
  if(!adapter||adapter.__v66Remediated)return;

  const originalDraft=adapter.createTestDraft?.bind(adapter);
  const originalOpportunities=adapter.v6Opportunities?.bind(adapter);
  const originalRun=adapter.v6RunOpportunityEngine?.bind(adapter);
  const originalSummary=adapter.v6OpportunitySummary?.bind(adapter);
  const originalPipeline=adapter.v6AccountPipeline?.bind(adapter);
  const originalPipelineSummary=adapter.v6PipelineSummary?.bind(adapter);

  /* Last-mile email sanitation: every repository asset that enters a
     Gmail QA draft becomes a canonical public HTTPS URL. */
  if(originalDraft){
    adapter.createTestDraft=(campaignId,draft)=>{
      const next={...(draft||{}),htmlBody:absolutizeHtml(draft?.htmlBody||"")};
      if(next.campaignPatch){
        next.campaignPatch={...next.campaignPatch};
        if(next.campaignPatch.heroUrl)next.campaignPatch.heroUrl=assetUrl(next.campaignPatch.heroUrl);
        if(next.campaignPatch.logoUrl)next.campaignPatch.logoUrl=assetUrl(next.campaignPatch.logoUrl);
      }
      return originalDraft(campaignId,next);
    };
  }

  /* Client-side normalization protects the live UI immediately even if
     the Apps Script source pack has not been redeployed yet. */
  if(originalOpportunities){
    adapter.v6Opportunities=async()=>normalizeOpportunityResponse(await originalOpportunities());
  }
  if(originalRun){
    adapter.v6RunOpportunityEngine=async data=>normalizeOpportunityResponse(await originalRun(data||{}));
  }
  if(originalSummary){
    adapter.v6OpportunitySummary=async()=>{
      if(originalOpportunities){
        const response=normalizeOpportunityResponse(await originalOpportunities());
        return {...(response?.summary||{}),groupCount:(response?.groups||[]).length};
      }
      return originalSummary();
    };
  }

  /* Make Pipeline / Analytics honor the same owner selected in the rest
     of the lifecycle instead of mixing owner-filtered opportunity KPIs
     with an unfiltered global pipeline. */
  if(originalPipeline){
    adapter.v6AccountPipeline=async()=>{
      const raw=await originalPipeline();
      const rows=raw?.records||raw?.pipeline||[];
      const owner=selectedOwner();
      if(owner==="ALL")return raw;
      const filtered=rows.filter(row=>clean(row.amOwner||"Unassigned")===owner);
      return {...raw,records:filtered,pipeline:filtered,total:filtered.length};
    };
  }

  if(originalPipelineSummary){
    adapter.v6PipelineSummary=async()=>{
      const owner=selectedOwner();
      if(owner==="ALL")return originalPipelineSummary();
      if(!originalPipeline)return originalPipelineSummary();
      const raw=await originalPipeline();
      const rows=(raw?.records||raw?.pipeline||[])
        .filter(row=>clean(row.amOwner||"Unassigned")===owner);
      return summarizePipeline(rows);
    };
  }

  adapter.__v66Remediated=true;
}

function readCampaignContext(){
  try{return JSON.parse(sessionStorage.getItem("dgl_v5_campaign_context")||"{}")}
  catch(_){return{}}
}

function setText(node,value){
  if(node&&node.textContent!==value)node.textContent=value;
}

function polishStudio(){
  if(!location.hash.includes("campaign-studio"))return;

  const ctx=readCampaignContext();
  const contacts=Number(ctx.eligibleContactCount||ctx.recipientCount||0);
  const frequency=upper(ctx.frequencyStatus||"");
  const exclusions=upper(ctx.exclusionStatus||ctx.exclusionsStatus||"");
  const approval=upper(ctx.policyApprovalStatus||ctx.approvalStatus||"");

  document.querySelectorAll(".v6-status-card").forEach(card=>{
    const labelNode=card.querySelector(".label");
    const valueNode=card.querySelector(".value");
    const label=upper(labelNode?.textContent);

    if(label==="ELIGIBLE ACCOUNTS"){
      setText(labelNode,"PRE-GATE ELIGIBLE ACCOUNTS");
    }

    if(label==="FREQUENCY GUARD"&&contacts<1&&(!frequency||frequency.includes("PENDING"))){
      setText(valueNode,"NOT EVALUATED · CONTACTS PENDING");
    }

    if(label==="EXCLUSIONS"&&contacts<1&&(!exclusions||exclusions.includes("PENDING"))){
      setText(valueNode,"NOT EVALUATED · CONTACTS PENDING");
    }

    if(label==="POLICY DECISION"){
      if(ctx.requiresHumanReview){
        setText(valueNode,"HUMAN EXCEPTION REVIEW");
      }else if(approval.includes("APPROVED")){
        setText(valueNode,"AUTO BY POLICY · APPROVED");
      }else if(contacts<1){
        setText(valueNode,"POLICY PENDING RECIPIENTS");
      }else if(
        !["CLEAR","PASSED"].includes(frequency) ||
        !["CLEAR","CLEARED","PASSED"].includes(exclusions)
      ){
        setText(valueNode,"POLICY PENDING TECHNICAL GATES");
      }
    }
  });

  document.querySelectorAll(".v5-briefcell").forEach(cell=>{
    const label=upper(cell.querySelector("span")?.textContent);
    const value=cell.querySelector("strong");
    if(label==="RECIPIENT STATUS"&&contacts<1){
      setText(value,"CONTACTS PENDING · 0 RESOLVED");
    }
  });
}

function polishEligibilityLabels(){
  document.querySelectorAll(".kpi-label").forEach(node=>{
    const x=upper(node.textContent);
    if(x==="ELIGIBLE"||x==="ELIGIBLE ACCOUNTS"){
      setText(node,"PRE-GATE ELIGIBLE");
    }
  });

  document.querySelectorAll(".life-metric-row span,.life-analytics-funnel span").forEach(node=>{
    if(upper(node.textContent)==="ELIGIBLE"){
      setText(node,"PRE-GATE ELIGIBLE");
    }
  });
}

function polish(){
  polishStudio();
  polishEligibilityLabels();
}

function installObserver(){
  const start=()=>{
    const target=document.getElementById("app")||document.body;
    if(!target||global.__DGL_V66_OBSERVER)return;

    let queued=false;
    const observer=new MutationObserver(()=>{
      if(queued)return;
      queued=true;
      queueMicrotask(()=>{
        queued=false;
        polish();
      });
    });

    observer.observe(target,{childList:true,subtree:true,characterData:true});
    global.__DGL_V66_OBSERVER=observer;
    polish();
  };

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",start,{once:true});
  }else{
    start();
  }

  global.addEventListener?.("hashchange",()=>setTimeout(polish,0));
  global.addEventListener?.("dgl:v55-backend-change",()=>setTimeout(polish,0));
}

function remediationSelfTest(){
  const issues=[];

  if(
    normalizedWindow("3-7")!=="0-14" ||
    normalizedWindow("8-14")!=="0-14" ||
    normalizedWindow("30+")!=="30+"
  ){
    issues.push("QNB window normalization failed");
  }

  const sample=absolutizeHtml(
    '<img src="assets/creative/dgl-ltl-terminal.png"><img src="assets/brand/dgl-logo-white.png">'
  );
  if(sample.includes('src="assets/')){
    issues.push("Relative email assets remain");
  }

  const merged=mergeOpportunityGroups([
    {amOwner:"A",opportunityType:"QNB",service:"LTL",window:"3-7",detectedAccounts:1,eligibleAccounts:1},
    {amOwner:"A",opportunityType:"Quoted Not Booked",service:"LTL",window:"8-14",detectedAccounts:1,eligibleAccounts:1}
  ]);

  if(
    merged.length!==1 ||
    merged[0].window!=="0-14" ||
    merged[0].detectedAccounts!==2
  ){
    issues.push("Normalized scope merge failed");
  }

  const qnbAsset=global.DGL_CREATIVE_LIBRARY_V5?.resolveAsset?.({
    objective:"Quoted Not Booked",
    service:"LTL"
  })||"";

  if(qnbAsset&&!/^https:\/\//i.test(qnbAsset)){
    issues.push("QNB email asset is not canonical HTTPS");
  }

  return {
    ok:issues.length===0,
    issues,
    version:VERSION,
    checkedAt:new Date().toISOString()
  };
}

patchCreativeLibrary();
patchStudioApi();
patchBackendAdapter();
installObserver();

global.DGL_V66_REMEDIATION={
  VERSION,
  BASE_URL,
  assetUrl,
  absolutizeHtml,
  normalizedWindow,
  mergeOpportunityGroups,
  normalizeOpportunityResponse,
  summarizePipeline,
  selfTest:remediationSelfTest,
  polish
};

/* Canonical runtime integrity guard. */
const forbiddenLoaded=[
  ["DGL_AM_REQUESTS","AM Request intake runtime"],
  ["DGL_CAMPAIGN_OPPORTUNITY_CENTER_V5","Legacy AM opportunity center"]
];

function inspect(){
  const issues=[];

  forbiddenLoaded.forEach(([key,label])=>{
    if(global[key])issues.push(`${label} is loaded (${key})`);
  });

  const required=[
    ["DGL_MARKETING_BACKEND_ADAPTER_V55","Private backend adapter"],
    ["DGL_MARKETING_PLAYBOOKS","Governed playbooks"],
    ["DGL_CAMPAIGN_STUDIO_V6","Campaign Studio V6"],
    ["DGL_CAMPAIGN_SCOPE_BRIDGE_V6","Automatic scope bridge"],
    ["DGL_LIFECYCLE_MODULES_V6","Lifecycle modules"],
    ["DGL_ACCOUNT_CAMPAIGN_PIPELINE_V6","Account pipeline"],
    ["DGL_V66_REMEDIATION","V6.6 remediation layer"]
  ];

  required.forEach(([key,label])=>{
    if(!global[key])issues.push(`${label} missing (${key})`);
  });

  const remediation=global.DGL_V66_REMEDIATION?.selfTest?.();
  if(remediation&&!remediation.ok){
    remediation.issues.forEach(issue=>issues.push(`Remediation: ${issue}`));
  }

  return {
    ok:issues.length===0,
    issues,
    architecture:"AUTOMATION_FIRST_V6_6",
    remediationVersion:VERSION,
    checkedAt:new Date().toISOString()
  };
}

global.DGL_SYSTEM_INTEGRITY_V6={version:VERSION,inspect};

document.addEventListener("DOMContentLoaded",()=>setTimeout(()=>{
  const result=inspect();
  if(!result.ok){
    console.error("DGL V6.6 integrity check failed",result.issues);
  }else{
    console.info("DGL V6.6 canonical runtime loaded",result);
  }
},0));

})(window);
