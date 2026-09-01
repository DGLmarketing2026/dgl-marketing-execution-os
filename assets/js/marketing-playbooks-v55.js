(function(global){
"use strict";

const STOP_CONDITIONS=["CUSTOMER_REPLIED","NEW_RFQ","NEW_QUOTE","LOAD_CREATED","DO_NOT_CONTACT","CAMPAIGN_ENDED"];
const APPROVAL_RULES={
  auto:[
    "PREPARE_STRATEGY","BUILD_CAMPAIGN_CONTEXT","BUILD_SEQUENCE","DETERMINISTIC_QA",
    "CREATE_TEST_DRAFT_PREPARATION","CALCULATE_STATUS","STOP_RESPONDED_ACCOUNT",
    "CREATE_AM_HANDOFF","POLICY_APPROVAL","ACTIVATE_WHEN_ALL_TECHNICAL_GATES_CLEAR"
  ],
  humanExceptionReview:[
    "STRATEGIC_TIER_1","RESTRICTED_ACCOUNT","MATERIAL_CHANGE_TO_ACTIVE_CAMPAIGN",
    "UNRESOLVED_COMMERCIAL_RESTRICTION","POLICY_OVERRIDE"
  ],
  neverAutomatic:[
    "CHANGE_AM_OWNER","CHANGE_PRICING","CHANGE_CREDIT","OVERRIDE_EXCLUSIONS",
    "CONTACT_DO_NOT_CONTACT","EXPOSE_PII","CHANGE_RESTRICTED_COMMERCIAL_DATA"
  ]
};

const seq=(days,purposes)=>days.map((day,i)=>({touch:i+1,day,channel:"Email",purpose:purposes[i]||`Touch ${i+1}`,status:i===0?"READY":"SCHEDULED"}));
const PLAYBOOKS=[
  {id:"QNB_0_14",objective:"Quoted Not Booked",qnbWindow:"0-14",purpose:"Recover a fresh quote without over-contacting the account.",messageAngle:"Quote Follow-Up",cta:"Reply with an updated requirement or send the next shipment.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,10],["Quote Follow-Up","Light Follow-Up"])},
  {id:"QNB_15_30",objective:"Quoted Not Booked",qnbWindow:"15-30",purpose:"Recover an aging quote with a controlled follow-up.",messageAngle:"Quote Recovery",cta:"Reopen/update the quote or send the current requirement.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,12],["Quote Recovery","Light Recovery Follow-Up"])},
  {id:"QNB_30_PLUS",objective:"Quoted Not Booked",qnbWindow:"30+",purpose:"Reopen an older quoted opportunity without implying that the old rate is still valid.",messageAngle:"Reopen the Conversation",cta:"Send a current lane or requirement for a fresh quote.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,14,30],["Reopen Conversation","Capability Reminder","Cooldown / Nurture Touch"])},
  {id:"RETENTION_RISK",objective:"Retention",purpose:"Act on a report-derived risk signal before the account becomes dormant.",messageAngle:"Planning Ahead",cta:"Review upcoming requirements.",creativeSystem:"DGL Editorial White",sequence:seq([0,14,30],["Relationship Check-In","Planning Ahead","Continuity Touch"])},
  {id:"REACTIVATION_ACCOUNT",objective:"Reactivation",purpose:"Bring a dormant eligible account back into conversation after automatic pressure and coordination checks.",messageAngle:"Previous Relationship",cta:"Send a current requirement.",creativeSystem:"DGL Editorial White",neverContact:["DO NOT CONTACT","COLLECTIONS","ACTIVE COMMERCIAL CONVERSATION","UNRESOLVED SERVICE CASE","EXCLUDED ACCOUNT"],sequence:seq([0,12,30],["Reactivation","Capability Reminder","Cooldown / Nurture"])},
  {id:"CROSS_SELL_SERVICE",objective:"Cross-Sell",purpose:"Expand an existing relationship from an automatically detected service gap and growth score.",messageAngle:"Additional Capability",cta:"Discuss a relevant additional service requirement.",creativeSystem:"DGL Service Architecture",sequence:seq([0,14,30],["Relevant Additional Capability","Use Case / Proof","Cooldown"])},
  {id:"ACCOUNT_NURTURE",objective:"Nurture",purpose:"Maintain or validate a relationship without unnecessary pressure.",messageAngle:"Stay Close",cta:"Share upcoming plans when ready.",creativeSystem:"DGL Editorial White",sequence:seq([0,30,60],["Relationship / Validation Message","Relevant Capacity Message","Stay-Close Message"])},
  {id:"LANE_CAMPAIGN",objective:"Lane Campaign",purpose:"Use an automatically eligible audience for a lane where DGL has a verified strength signal.",messageAngle:"Lane Capability",cta:"Share a current lane requirement.",creativeSystem:"DGL Route Intelligence",sequence:seq([0,12,30],["Lane Capability","Capacity Reminder","Cooldown"])},
  {id:"RELATIONSHIP_RENEWAL",objective:"Relationship Renewal",purpose:"Refresh a recovered or established commercial relationship.",messageAngle:"Planning Ahead",cta:"Review upcoming requirements.",creativeSystem:"DGL Case/Proof or Editorial White",sequence:seq([0,14,30],["Renew Current Activity","Planning Ahead","Continuity Follow-Up"])},
  {id:"SERVICE_CAMPAIGN",objective:"Service Campaign",purpose:"Execute an automatically qualified service campaign for an eligible account scope.",messageAngle:"Service Capability",cta:"Share a current service requirement.",creativeSystem:"DGL Split Hero",sequence:seq([0,14,30],["Service Capability","Relevant Use Case","Cooldown"])}
];

const QNB_REASON={
  HIGH_PRICE:{key:"HIGH PRICE",messageAngle:"Value Repositioning",tone:["Direct","Evidence-led","Commercial"],cta:"Review a current requirement against service reliability, transit and support."},
  NO_FEEDBACK:{key:"NO FEEDBACK",messageAngle:"Light Follow-Up",tone:["Short","Helpful","Low pressure"],cta:"Reply when the requirement is active again."},
  WORKING_ON_IT:{key:"WORKING ON IT",messageAngle:"Light Follow-Up",tone:["Short","Helpful","Low pressure"],cta:"Share any update when timing is confirmed."},
  EXTERNAL_DECISION:{key:"EXTERNAL DECISION",messageAngle:"Long-Term Nurture",tone:["Relationship-based","Non-pushy"],cta:"Keep DGL in mind for the next active requirement."}
};

const norm=v=>String(v||"").trim().toUpperCase().replace(/[–—]/g,"-").replace(/\s+/g," ");
function normalizeWindow(v){
  const x=norm(v).replace(/\s/g,"");
  if(x==="3-7"||x==="8-14"||x==="0-14")return"0-14";
  if(x==="15-30")return"15-30";
  if(x===">30"||x==="30+")return"30+";
  return x;
}
function getPlaybooks(){return PLAYBOOKS.map(p=>({...p,sequence:p.sequence.map(x=>({...x}))}));}
function getPlaybook(id){return getPlaybooks().find(p=>p.id===id)||null;}
function getPlaybookForRequest(r){
  const o=norm(r&&r.objective),q=normalizeWindow(r&&r.qnbWindow||r&&r.window);
  if(o==="QUOTED NOT BOOKED"||o==="QNB")return getPlaybook(q==="0-14"?"QNB_0_14":q==="15-30"?"QNB_15_30":q==="30+"?"QNB_30_PLUS":"QNB_30_PLUS");
  const map={"RETENTION":"RETENTION_RISK","REACTIVATION":"REACTIVATION_ACCOUNT","CROSS-SELL":"CROSS_SELL_SERVICE","CROSS SELL":"CROSS_SELL_SERVICE","NURTURE":"ACCOUNT_NURTURE","LANE CAMPAIGN":"LANE_CAMPAIGN","RELATIONSHIP RENEWAL":"RELATIONSHIP_RENEWAL","SERVICE CAMPAIGN":"SERVICE_CAMPAIGN"};
  return getPlaybook(map[o]);
}
function reasonStrategy(reason){
  const x=norm(reason);
  if(x.includes("HIGH PRICE")||x==="PRICE")return QNB_REASON.HIGH_PRICE;
  if(x.includes("NO FEEDBACK"))return QNB_REASON.NO_FEEDBACK;
  if(x.includes("WORKING"))return QNB_REASON.WORKING_ON_IT;
  if(x.includes("EXTERNAL"))return QNB_REASON.EXTERNAL_DECISION;
  return null;
}
function policyDecision(r){
  const x=r||{};
  const exception=!!(x.requiresHumanReview||x.strategicTier1||x.restrictedAccount||x.materialChange||x.policyOverride);
  return exception?{status:"HUMAN EXCEPTION REVIEW",autoApproved:false}:{status:"AUTO BY POLICY",autoApproved:true};
}
function validateRequest(r){
  r=r||{};const missing=[],automatic=!!(r.scopeId||String(r.audienceId||"").startsWith("SCOPE-"));
  ["objective","service"].forEach(k=>{if(!String(r[k]||"").trim())missing.push(k);});
  if(!automatic&&!(Number(r.accountCount)>0))missing.push("accountCount");
  if(!automatic&&!String(r.amOwner||"").trim())missing.push("amOwner");
  const objective=norm(r.objective);
  if((objective==="QUOTED NOT BOOKED"||objective==="QNB")&&!String(r.qnbWindow||r.window||"").trim())missing.push("qnbWindow");
  const playbook=getPlaybookForRequest(r);
  if(!playbook&&!missing.includes("objective"))missing.push("supported playbook");
  return{valid:missing.length===0,status:missing.length?"DATA / POLICY BLOCKED":"AUTOMATION READY",automationStatus:missing.length?"DATA / POLICY BLOCKED":"AUTOMATION READY",marketingStatus:missing.length?"DATA / POLICY BLOCKED":"AUTOMATION READY",missingFields:missing,playbookId:playbook&&playbook.id,policy:policyDecision(r)};
}
function resolveStrategy(r){
  const validation=validateRequest(r);if(!validation.valid)return{...validation,strategy:null};
  const p=getPlaybookForRequest(r),reason=reasonStrategy(r.reasonCategory),service=r.service;
  return{...validation,strategy:{
    campaignName:r.campaignName||`${p.id.replaceAll("_"," ")} · ${service}`,
    objective:r.objective,service,
    messageAngle:reason?.messageAngle||r.messageAngle||p.messageAngle,
    creativeSystem:p.creativeSystem,
    ctaIntent:reason?.cta||p.cta,CTA:reason?.cta||p.cta,
    sequence:p.sequence.map(x=>({...x})),
    qnbWindow:normalizeWindow(r.qnbWindow||r.window),
    lane:r.lane||"",playbookId:p.id,purpose:p.purpose,
    tone:reason?.tone||p.tone||[],
    reasonCategory:r.reasonCategory||"",
    dataQualityStatus:r.dataQualityStatus||((norm(r.objective)==="QUOTED NOT BOOKED"||norm(r.objective)==="QNB")&&!r.reasonCategory?"REASON SOURCE PENDING":"SOURCE SIGNAL AVAILABLE"),
    coordinationStatus:r.coordinationStatus||"",
    automationPolicy:validation.policy.status
  }};
}
function getSequence(r){const p=getPlaybookForRequest(r);return p?p.sequence.map(x=>({...x})):[];}

global.DGL_MARKETING_PLAYBOOKS={
  version:"6.4-automation-first",
  getPlaybooks,getPlaybook,getPlaybookForRequest,resolveStrategy,validateRequest,getSequence,
  getStopConditions:()=>STOP_CONDITIONS.slice(),
  getApprovalRules:()=>JSON.parse(JSON.stringify(APPROVAL_RULES)),
  reasonStrategy,policyDecision,normalizeWindow
};
global.DGL_MARKETING_STOP_CONDITIONS=STOP_CONDITIONS.slice();
})(window);