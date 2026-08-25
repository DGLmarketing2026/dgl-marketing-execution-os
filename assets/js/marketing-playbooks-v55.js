(function (global) {
  "use strict";

  const STOP_CONDITIONS = ["CUSTOMER_REPLIED", "NEW_RFQ", "NEW_QUOTE", "LOAD_CREATED", "DO_NOT_CONTACT", "AM_STOP_REQUEST"];
  const APPROVAL_RULES = {
    auto: ["PREPARE_STRATEGY", "BUILD_CAMPAIGN_CONTEXT", "BUILD_SEQUENCE", "DETERMINISTIC_QA", "CREATE_TEST_DRAFT_PREPARATION", "CALCULATE_STATUS", "STOP_RESPONDED_ACCOUNT", "CREATE_AM_HANDOFF"],
    marketingApprovalRequired: ["ACTIVATE_CAMPAIGN", "SEND_AUDIENCE_EMAILS", "RESUME_CAMPAIGN", "MATERIAL_CHANGE_TO_ACTIVE_CAMPAIGN", "LAUNCH_PAID_CAMPAIGN"],
    neverAutomatic: ["CHANGE_AM_OBJECTIVE", "CHANGE_AM_OWNER", "CHANGE_PRICING", "CHANGE_CREDIT", "OVERRIDE_EXCLUSIONS", "CONTACT_DO_NOT_CONTACT", "EXPOSE_PII", "CHANGE_RESTRICTED_COMMERCIAL_DATA"]
  };
  const seq=(days, purposes)=>days.map((day,i)=>({touch:i+1,day,channel:"Email",purpose:purposes[i],status:i===0?"READY":"SCHEDULED"}));
  const PLAYBOOKS = [
    {id:"QNB_0_14",objective:"Quoted Not Booked",qnbWindow:"0-14",purpose:"Early commercial follow-up while the quote is still recent.",tone:["Direct","Short","Helpful","Non-promotional"],messageAngle:"Quote Follow-Up",cta:"Reply with updated requirements / send next shipment requirement.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,3,7],["Short Quote Follow-Up","Availability / Update Reminder","Final Light Follow-Up"])},
    {id:"QNB_15_30",objective:"Quoted Not Booked",qnbWindow:"15-30",purpose:"Recover a quote that is beginning to cool.",tone:["Direct","Helpful","Commercial"],messageAngle:"Quote Recovery",cta:"Reopen/update the quote or send current requirement.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,4,9],["Quote Recovery","Follow-Up","Final Recovery"])},
    {id:"QNB_30_PLUS",objective:"Quoted Not Booked",qnbWindow:"30+",purpose:"Reopen dormant quoted opportunities without implying that the original quote is still valid.",tone:["Executive","Brief","Relationship-based"],messageAngle:"Reopen the Conversation",cta:"Send a current lane / requirement for a fresh quote.",creativeSystem:"DGL Executive Minimal",sequence:seq([0,6,14],["Reopen Conversation","Capability Reminder","Final Nurture Touch"])},
    {id:"RETENTION_RISK",objective:"Retention",purpose:"Act before an active account becomes dormant.",tone:["Helpful","Relationship-based","Non-aggressive"],angles:["Stay Close","Planning Ahead","Relationship Continuity"],messageAngle:"Planning Ahead",cta:"Review upcoming requirements.",creativeSystem:"DGL Editorial White",sequence:seq([0,7,21],["Relationship Touch","Planning / Upcoming Needs","Relationship Continuity"])},
    {id:"REACTIVATION_ACCOUNT",objective:"Reactivation",purpose:"Bring a validated dormant account back into conversation.",angles:["Previous Relationship","Ready to Quote","Service Reminder"],messageAngle:"Previous Relationship",cta:"Send a current requirement.",creativeSystem:"DGL Editorial White",neverContact:["DO NOT CONTACT","COLLECTIONS BLOCK","ACTIVE AM CONVERSATION","UNRESOLVED SERVICE CASE","EXCLUDED ACCOUNT"],sequence:seq([0,5,12],["Reactivation","Service / Capability Reminder","Final Reactivation Follow-Up"])},
    {id:"CROSS_SELL_SERVICE",objective:"Cross-Sell",purpose:"Execute the additional service opportunity selected by AM.",angles:["Additional Capability","One Partner","Service Expansion"],messageAngle:"Additional Capability",cta:"Discuss the AM-selected service requirement.",creativeSystem:"DGL Service Architecture",sequence:seq([0,7,21],["Introduce Additional Capability","Relevant Service Use Case","Final Light Follow-Up"])},
    {id:"ACCOUNT_NURTURE",objective:"Nurture",purpose:"Maintain relationship with active or recovered accounts without over-contacting them.",messageAngle:"Stay Close",cta:"Share upcoming plans when ready.",creativeSystem:"DGL Editorial White",sequence:seq([0,30,60],["Relationship / Planning Message","Relevant Service / Capacity Message","Planning / Stay-Close Message"])},
    {id:"LANE_CAMPAIGN",objective:"Lane Campaign",purpose:"Reach only the AM-selected eligible audience for a specific lane.",messageAngle:"Lane Capability",cta:"Share a current lane requirement.",creativeSystem:"DGL Route Intelligence",sequence:seq([0,5,12],["Lane-Specific Capability","Capacity / Reminder","Final Lane Follow-Up"])},
    {id:"RELATIONSHIP_RENEWAL",objective:"Relationship Renewal",purpose:"Refresh active load relationships originating from older commercial relationships or quotes. This is not QNB.",angles:["Planning Ahead","Renew Current Activity","Keep Capacity Aligned"],messageAngle:"Planning Ahead",cta:"Review upcoming requirements / refresh current activity.",creativeSystem:"DGL Case/Proof or Editorial White",sequence:seq([0,14,30],["Renew Current Activity","Planning Ahead","Continuity Follow-Up"])},
    {id:"SERVICE_CAMPAIGN",objective:"Service Campaign",purpose:"Execute an AM-defined service campaign for an eligible audience.",messageAngle:"Service Capability",cta:"Share a current service requirement.",creativeSystem:"DGL Split Hero",sequence:seq([0,7,21],["Service Introduction","Relevant Use Case","Final Follow-Up"])}
  ];
  const norm=v=>String(v||"").trim().toUpperCase().replace(/[–—]/g,"-").replace(/\s+/g," ");
  function getPlaybooks(){return PLAYBOOKS.map(p=>({...p,sequence:p.sequence.map(x=>({...x}))}));}
  function getPlaybook(id){return getPlaybooks().find(p=>p.id===id)||null;}
  function getPlaybookForRequest(request){
    const o=norm(request&&request.objective), q=norm(request&&request.qnbWindow).replace(/\s/g,"");
    if(o==="QUOTED NOT BOOKED"||o==="QNB") return getPlaybook(q==="0-14"?"QNB_0_14":q==="15-30"?"QNB_15_30":q==="30+"?"QNB_30_PLUS":"");
    const map={"RETENTION":"RETENTION_RISK","REACTIVATION":"REACTIVATION_ACCOUNT","CROSS-SELL":"CROSS_SELL_SERVICE","CROSS SELL":"CROSS_SELL_SERVICE","NURTURE":"ACCOUNT_NURTURE","LANE CAMPAIGN":"LANE_CAMPAIGN","RELATIONSHIP RENEWAL":"RELATIONSHIP_RENEWAL","SERVICE CAMPAIGN":"SERVICE_CAMPAIGN"};
    return getPlaybook(map[o]);
  }
  function validateRequest(request){
    const r=request||{}, missing=[];
    if(!String(r.amOwner||"").trim())missing.push("amOwner");
    if(!String(r.portfolioName||r.accountName||"").trim())missing.push("portfolioName/accountName");
    ["objective","service","priority","requestedOutcome"].forEach(k=>{if(!String(r[k]||"").trim())missing.push(k);});
    if(!(Number(r.accountCount)>0))missing.push("accountCount");
    const objective=norm(r.objective);
    if((objective==="QUOTED NOT BOOKED"||objective==="QNB")&&!String(r.qnbWindow||"").trim())missing.push("qnbWindow");
    if(objective==="LANE CAMPAIGN"&&!String(r.lane||"").trim())missing.push("lane");
    if((objective==="CROSS-SELL"||objective==="CROSS SELL")&&!String(r.service||"").trim()&&!missing.includes("service"))missing.push("service");
    const playbook=getPlaybookForRequest(r);if(!playbook&&!missing.includes("objective"))missing.push("supported playbook");
    return {valid:missing.length===0,status:missing.length?"NEEDS CLARIFICATION":"READY FOR MARKETING",automationStatus:missing.length?"NEEDS CLARIFICATION":"READY FOR MARKETING",marketingStatus:missing.length?"NEEDS CLARIFICATION":"READY FOR MARKETING",missingFields:missing,playbookId:playbook&&playbook.id};
  }
  function resolveStrategy(request){
    const validation=validateRequest(request);if(!validation.valid)return {...validation,strategy:null};
    const p=getPlaybookForRequest(request), service=request.service;
    return {...validation,strategy:{campaignName:request.campaignName||`${p.id.replaceAll("_"," ")} · ${service}`,objective:request.objective,service,messageAngle:request.messageAngle||p.messageAngle,creativeSystem:p.creativeSystem,ctaIntent:p.cta,CTA:p.cta,sequence:p.sequence.map(x=>({...x})),qnbWindow:request.qnbWindow||"",lane:request.lane||"",playbookId:p.id,purpose:p.purpose,tone:p.tone||[]}};
  }
  function getSequence(request){const p=getPlaybookForRequest(request);return p?p.sequence.map(x=>({...x})):[];}
  const api={version:"5.5",getPlaybooks,getPlaybook,getPlaybookForRequest,resolveStrategy,validateRequest,getSequence,getStopConditions:()=>STOP_CONDITIONS.slice(),getApprovalRules:()=>JSON.parse(JSON.stringify(APPROVAL_RULES))};
  global.DGL_MARKETING_PLAYBOOKS=api;global.DGL_MARKETING_STOP_CONDITIONS=STOP_CONDITIONS.slice();
})(window);
