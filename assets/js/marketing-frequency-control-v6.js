(function(global){
  "use strict";
  const RULES={maxAccountTouches30d:2,normalFollowUpDays:[10,14],noResponseCooldownDays:[30,45],nurtureSpacingDays:[30,60]};
  const BLOCKED=new Set(["DNC","ACTIVE COMMERCIAL CONVERSATION","COLLECTIONS","SERVICE CASE","NO VALID CONTACT"]);
  function evaluate(input){const x=input||{},status=String(x.restrictionStatus||"").toUpperCase();if(BLOCKED.has(status))return {eligible:false,status};if(x.competingActiveCampaign)return {eligible:false,status:"ACTIVE CAMPAIGN"};if(x.higherPriorityOpportunity)return {eligible:false,status:"HIGHER PRIORITY"};if(Number(x.accountTouches30d||0)>=RULES.maxAccountTouches30d)return {eligible:false,status:"FREQUENCY CAP"};if(Number(x.daysSinceNoResponse||999)<RULES.noResponseCooldownDays[0]&&!x.newCommercialSignalEligible)return {eligible:false,status:"COOLDOWN"};return {eligible:true,status:"CLEAR",followUpDays:RULES.normalFollowUpDays};}
  async function evaluatePrivate(payload){const api=global.DGL_MARKETING_BACKEND_ADAPTER_V55;if(!api?.isConnected?.())return {status:"PRIVATE BACKEND REQUIRED",eligible:false};try{return await api.v6EvaluateCampaignPressure(payload);}catch(_){return {status:"BACKEND FEATURE NOT DEPLOYED",eligible:false};}}
  global.DGL_MARKETING_FREQUENCY_CONTROL_V6={version:"6.0",RULES,evaluate,evaluatePrivate,statuses:["CLEAR","FREQUENCY CAP","COOLDOWN","ACTIVE CAMPAIGN","HIGHER PRIORITY","DNC","ACTIVE COMMERCIAL CONVERSATION","COLLECTIONS","SERVICE CASE","NO VALID CONTACT"]};
})(window);
