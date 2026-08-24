/**
 * DGL Marketing Agent Contract V1
 * Stable browser-side adapter for a future Claude Marketing Agent/private backend.
 * GitHub Pages is presentation-only: never place PII, API keys, Claude credentials,
 * Salesforce credentials, or customer records in this file or browser storage.
 *
 * Standard AgentAction:
 * { actionId, actionType, entityType, entityId, requestedAt, requestedBy,
 *   status, requiresApproval, approvedBy, executedAt, result, error }
 * Status: QUEUED | PREPARING | WAITING_APPROVAL | APPROVED | EXECUTING |
 *         COMPLETED | BLOCKED | FAILED
 */
(function (global) {
  "use strict";

  const PERMISSIONS = Object.freeze({
    AUTO: Object.freeze(["READ_AM_REQUESTS","CLASSIFY_CONFIGURATION","PREPARE_STRATEGY","GENERATE_COPY","SELECT_CREATIVE","BUILD_PREVIEW","PREPARE_SEQUENCE","QA_CHECKS","ANALYZE_RESULTS","PREPARE_RECOMMENDATIONS","STOP_ACCOUNT_AUTOMATION","HANDOFF_TO_AM"]),
    APPROVAL_REQUIRED: Object.freeze(["ACTIVATE_CAMPAIGN","SEND_AUDIENCE_EMAILS","MATERIAL_CHANGE_ACTIVE_CAMPAIGN","RESUME_CAMPAIGN","LAUNCH_PAID_CAMPAIGN"]),
    NEVER_AUTO: Object.freeze(["CHANGE_AM_INTENT","CHANGE_ACCOUNT_OWNER","MODIFY_SENSITIVE_COMMERCIAL_DATA","CHANGE_CREDIT","CHANGE_PRICING","SEND_OUTSIDE_APPROVED_RULES","OVERRIDE_EXCLUSIONS","CONTACT_DO_NOT_CONTACT","EXPOSE_PII_OR_SECRETS"])
  });
  const STOP_CONDITIONS = Object.freeze(["CUSTOMER_REPLIED","NEW_RFQ","NEW_QUOTE","LOAD_CREATED","DO_NOT_CONTACT","AM_STOP_REQUEST","CAMPAIGN_ENDED"]);
  const REQUEST_STATES = Object.freeze(["READY FOR MARKETING","NEEDS CLARIFICATION","IN PREPARATION","CAMPAIGN READY","CAMPAIGN ACTIVE","RESPONSE RECEIVED","HANDED TO AM","CLOSED"]);
  const CAMPAIGN_STATES = Object.freeze(["DRAFT","PREPARED BY AGENT","WAITING APPROVAL","APPROVED","ACTIVE","RESPONSE RECEIVED","HANDED TO AM","CLOSED","CONVERTED"]);
  const HANDOFF_STATES = Object.freeze(["PENDING","HANDED_TO_AM","ACKNOWLEDGED","CLOSED"]);
  const activity=[], accountStops=new Map(), handoffs=[];
  const now=()=>new Date().toISOString();
  function action(actionType,entityType,entityId,permission,status,result,error){
    const item={actionId:"ACT-"+Date.now().toString(36).toUpperCase()+"-"+Math.random().toString(36).slice(2,6).toUpperCase(),actionType,entityType,entityId,requestedAt:now(),requestedBy:"MARKETING_AGENT_CONTRACT_V1",status:status||"QUEUED",requiresApproval:permission==="APPROVAL_REQUIRED",approvedBy:null,executedAt:status==="COMPLETED"?now():null,result:result||null,error:error||null,permissionLevel:permission};
    activity.unshift(item); return item;
  }
  function response(actionItem,status,data){return {mode:"LOCAL_DEMO",status,externalExecution:false,action:actionItem,data:data||null,message:status==="BACKEND_REQUIRED"?"A private backend is required; no external action was executed.":"Local demo state only."}}
  function campaigns(){return [
    {id:"CMP-DEMO-XSELL-FTL",requestId:"AMR-003",name:"Cross-Sell FTL · Additional Capability",amOwner:"Laura Pérez",objective:"Cross-Sell",service:"FTL",status:"PREPARED BY AGENT",agentStatus:"LOCAL_DEMO",automationStatus:"PAUSED",accounts:12,delivered:0,replies:0,rfqs:0,quotes:0,loads:0},
    {id:"CMP-DEMO-REACT-FTL",requestId:"AMR-001",name:"Reactivation FTL",amOwner:"Laura Pérez",objective:"Reactivation",service:"FTL",status:"WAITING APPROVAL",agentStatus:"APPROVAL_REQUIRED",automationStatus:"PAUSED",accounts:7,delivered:0,replies:0,rfqs:0,quotes:0,loads:0},
    {id:"CMP-DEMO-QNB-DRAY",requestId:"AMR-002",name:"QNB Drayage · 15-30 Days",amOwner:"Carlos Gómez",objective:"Quoted Not Booked",service:"Drayage",status:"ACTIVE",agentStatus:"LOCAL_DEMO",automationStatus:"RUNNING",accounts:5,delivered:4,replies:1,rfqs:1,quotes:0,loads:0}
  ]}
  function getRequests(){const rows=global.DGL_AM_REQUESTS?.getRequests?.()||[];return Promise.resolve(response(action("GET_REQUESTS","AM_REQUEST","ALL","AUTO","COMPLETED",{count:rows.length}),"LOCAL_DEMO",rows))}
  function getRequest(id){const row=global.DGL_AM_REQUESTS?.getRequest?.(id)||null;return Promise.resolve(response(action("GET_REQUEST","AM_REQUEST",id,"AUTO","COMPLETED",{found:!!row}),row?"LOCAL_DEMO":"BLOCKED",row))}
  function prepareCampaign(requestId){const request=global.DGL_AM_REQUESTS?.getRequest?.(requestId);if(!request)return Promise.resolve(response(action("PREPARE_CAMPAIGN","AM_REQUEST",requestId,"AUTO","BLOCKED",null,"Request not found"),"BLOCKED"));const context=global.DGL_AM_REQUESTS.toStudioContext(request);return Promise.resolve(response(action("PREPARE_CAMPAIGN","CAMPAIGN",requestId,"AUTO","COMPLETED",{localContextPrepared:true}),"BACKEND_REQUIRED",context))}
  function getCampaign(id){const row=campaigns().find(c=>c.id===id)||null;return Promise.resolve(response(action("GET_CAMPAIGN","CAMPAIGN",id,"AUTO","COMPLETED"),"LOCAL_DEMO",row))}
  function getCampaigns(){const rows=campaigns();return Promise.resolve(response(action("GET_CAMPAIGNS","CAMPAIGN","ALL","AUTO","COMPLETED",{count:rows.length}),"LOCAL_DEMO",rows))}
  function localPrep(type,id,data){return Promise.resolve(response(action(type,"CAMPAIGN",id,"AUTO","COMPLETED",{localPrepared:true}),"BACKEND_REQUIRED",data))}
  function approval(type,id){return Promise.resolve(response(action(type,"CAMPAIGN",id,"APPROVAL_REQUIRED","WAITING_APPROVAL"),"APPROVAL_REQUIRED"))}
  function stopAutomationForAccount(campaignId,accountId,details){const key=campaignId+":"+accountId,record={campaignId,accountId,stopReason:details?.stopReason||details?.responseType||"CUSTOMER_REPLIED",stoppedAt:now(),responseType:details?.responseType||"CUSTOMER_REPLIED",scope:"ACCOUNT_ONLY",remainingCampaignAccountsContinue:true};accountStops.set(key,record);return Promise.resolve(response(action("STOP_ACCOUNT_AUTOMATION","ACCOUNT",accountId,"AUTO","COMPLETED",record),"LOCAL_DEMO",record))}
  async function handoffToAM(campaignId,accountId,details){const campaign=campaigns().find(c=>c.id===campaignId)||{};const record={campaignId,accountId,amOwner:details?.amOwner||campaign.amOwner||"AM owner",responseType:details?.responseType||"CUSTOMER_REPLIED",responseDate:details?.responseDate||now(),campaignObjective:campaign.objective||details?.campaignObjective||"",service:campaign.service||details?.service||"",nextAction:details?.nextAction||"AM follow-up",handoffStatus:"HANDED_TO_AM"};handoffs.unshift(record);return response(action("HANDOFF_TO_AM","ACCOUNT",accountId,"AUTO","COMPLETED",record),"LOCAL_DEMO",record)}
  async function recordResponse(campaignId,accountId,responseType){const stopped=await stopAutomationForAccount(campaignId,accountId,{stopReason:responseType,responseType});const handoff=await handoffToAM(campaignId,accountId,{responseType});return response(action("RECORD_RESPONSE","ACCOUNT",accountId,"AUTO","COMPLETED",{automationStopped:true,handoffCreated:true}),"BACKEND_REQUIRED",{stopped:stopped.data,handoff:handoff.data})}
  const queue=()=>[
    {action:"Prepare Campaign",campaign:"Cross-Sell FTL",amOwner:"Laura Pérez",status:"READY",permission:"AUTO",requestedAt:"Today 10:00",nextStep:"Prepare strategy"},
    {action:"Activate Campaign",campaign:"Reactivation FTL",amOwner:"Laura Pérez",status:"WAITING APPROVAL",permission:"APPROVAL REQUIRED",requestedAt:"Today 09:30",nextStep:"Marketing approval needed"},
    {action:"Monitor Automation",campaign:"QNB Drayage",amOwner:"Carlos Gómez",status:"ACTIVE",permission:"AUTO",requestedAt:"Today 09:10",nextStep:"Continue eligible accounts"},
    {action:"Clarify Brief",campaign:"Retention · Planning Ahead",amOwner:"Andrea Ruiz",status:"BLOCKED",permission:"AUTO",requestedAt:"Today 08:50",nextStep:"Waiting for AM clarification"}
  ];
  const seedActivity=()=>[
    {timestamp:"2026-08-24T10:05:00-05:00",agentAction:"PREPARE_CAMPAIGN",campaignId:"CMP-DEMO-XSELL-FTL",requestId:"AMR-003",accountId:null,permissionLevel:"AUTO",status:"COMPLETED",result:"Local strategy prepared; backend required for execution.",approvedBy:null},
    {timestamp:"2026-08-24T09:35:00-05:00",agentAction:"REQUEST_APPROVAL",campaignId:"CMP-DEMO-REACT-FTL",requestId:"AMR-001",accountId:null,permissionLevel:"APPROVAL REQUIRED",status:"WAITING_APPROVAL",result:"No audience communication sent.",approvedBy:null},
    {timestamp:"2026-08-24T09:20:00-05:00",agentAction:"HANDOFF_TO_AM",campaignId:"CMP-DEMO-QNB-DRAY",requestId:"AMR-002",accountId:"DEMO-ACCOUNT-004",permissionLevel:"AUTO",status:"COMPLETED",result:"One demo account stopped; remaining accounts continue.",approvedBy:null}
  ];
  const contract={version:"1.0",connectionStatus:"NOT_CONNECTED",executionBoundary:"PRIVATE_BACKEND_REQUIRED",permissions:PERMISSIONS,stopConditions:STOP_CONDITIONS,requestStates:REQUEST_STATES,campaignStates:CAMPAIGN_STATES,handoffStates:HANDOFF_STATES,getRequests,getRequest,getAMRequests:getRequests,getAMRequest:getRequest,prepareCampaign,createCampaignFromRequest:prepareCampaign,getCampaign,getCampaigns,getCampaignStatus:getCampaign,getCampaignResults:(id)=>localPrep("GET_CAMPAIGN_RESULTS",id),updateStrategy:(id,patch)=>localPrep("UPDATE_STRATEGY",id,patch),updateCampaignStrategy:(id,patch)=>localPrep("UPDATE_STRATEGY",id,patch),generateCopy:(id)=>localPrep("GENERATE_COPY",id),generateCampaignCopy:(id)=>localPrep("GENERATE_COPY",id),selectCreative:(id)=>localPrep("SELECT_CREATIVE",id),selectCreativeSystem:(id)=>localPrep("SELECT_CREATIVE",id),buildPreview:(id)=>localPrep("BUILD_PREVIEW",id),generateCampaignPreview:(id)=>localPrep("BUILD_PREVIEW",id),createTestDraft:(id)=>localPrep("CREATE_TEST_DRAFT",id),requestApproval:(id)=>approval("REQUEST_APPROVAL",id),recordApproval:(id,approvedBy)=>Promise.resolve(response(action("RECORD_APPROVAL","CAMPAIGN",id,"APPROVAL_REQUIRED","APPROVED",{approvedBy}),"BACKEND_REQUIRED",{approvedBy})),approveCampaign:(id,approvedBy)=>Promise.resolve(response(action("RECORD_APPROVAL","CAMPAIGN",id,"APPROVAL_REQUIRED","APPROVED",{approvedBy}),"BACKEND_REQUIRED",{approvedBy})),activateCampaign:(id)=>approval("ACTIVATE_CAMPAIGN",id),launchCampaign:(id)=>approval("ACTIVATE_CAMPAIGN",id),pauseCampaign:(id)=>localPrep("PAUSE_CAMPAIGN",id),closeCampaign:(id)=>localPrep("CLOSE_CAMPAIGN",id),recordResponse,stopAutomationForAccount,stopAccountAutomation:stopAutomationForAccount,handoffToAM,recordOutcome:(campaignId,accountId,outcome)=>localPrep("RECORD_OUTCOME",accountId,{campaignId,outcome}),getAgentQueue:()=>Promise.resolve(response(action("GET_AGENT_QUEUE","AGENT_QUEUE","ALL","AUTO","COMPLETED"),"LOCAL_DEMO",queue())),getAgentActivity:()=>Promise.resolve(response(action("GET_AGENT_ACTIVITY","AUDIT_LOG","ALL","AUTO","COMPLETED"),"LOCAL_DEMO",seedActivity().concat(activity))),getAccountStops:()=>Array.from(accountStops.values()),getHandoffs:()=>handoffs.slice()};
  global.DGL_AGENT_PERMISSIONS=PERMISSIONS;global.DGL_MARKETING_STOP_CONDITIONS=STOP_CONDITIONS;global.DGL_MARKETING_AGENT_CONTRACT=Object.freeze(contract);
})(window);
