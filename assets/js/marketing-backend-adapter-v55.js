(function(global){
  "use strict";
  const REQUEST_KEY="dgl_v55_am_requests",CAMPAIGN_KEY="dgl_v55_campaigns",ACTIVITY_KEY="dgl_v55_activity";
  const read=k=>{try{return JSON.parse(localStorage.getItem(k)||"[]")}catch(_){return[]}};
  const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const now=()=>new Date().toISOString();
  function existingApi(){return global.DGL_API&&typeof global.DGL_API.upsert==="function"?global.DGL_API:null;}
  function update(key,id,patch){const rows=read(key),i=rows.findIndex(x=>x.id===id);if(i<0)return null;rows[i]={...rows[i],...patch,updatedAt:now()};write(key,rows);return rows[i];}
  function addActivity(action,entityId,data){const rows=read(ACTIVITY_KEY);rows.unshift({id:"ACT-"+Date.now(),timestamp:now(),action,entityId,data:data||null});write(ACTIVITY_KEY,rows);}
  const adapter={
    version:"5.5",mode:"LOCAL_DEMO",executionBoundary:"PRIVATE_BACKEND_REQUIRED",getRequests:()=>read(REQUEST_KEY),
    createRequest:r=>{const row={...r,createdAt:r.createdAt||now()};write(REQUEST_KEY,[row,...read(REQUEST_KEY)]);addActivity("CREATE_REQUEST",row.id);return row;},
    updateRequest:(id,p)=>update(REQUEST_KEY,id,p),getCampaigns:()=>read(CAMPAIGN_KEY),
    createCampaign:p=>{const row={...p,createdAt:p.createdAt||now()};write(CAMPAIGN_KEY,[row,...read(CAMPAIGN_KEY)]);addActivity("CREATE_CAMPAIGN",row.id);return row;},
    updateCampaign:(id,p)=>update(CAMPAIGN_KEY,id,p),requestApproval:id=>{addActivity("REQUEST_APPROVAL",id);return update(CAMPAIGN_KEY,id,{status:"WAITING APPROVAL",marketingStatus:"WAITING APPROVAL"});},
    recordApproval:(id,data)=>{addActivity("RECORD_APPROVAL",id,data);return update(CAMPAIGN_KEY,id,{status:"APPROVED",marketingStatus:"APPROVED",approval:data});},
    createTestDraft:id=>{addActivity("CREATE_TEST_DRAFT",id);return {id,status:"TEST DRAFT PREPARED",executionBoundary:"PRIVATE_BACKEND_REQUIRED"};},
    activateCampaign:id=>{addActivity("ACTIVATE_CAMPAIGN",id);return update(CAMPAIGN_KEY,id,{status:"CAMPAIGN ACTIVE",marketingStatus:"CAMPAIGN ACTIVE"});},
    pauseCampaign:id=>{addActivity("PAUSE_CAMPAIGN",id);return update(CAMPAIGN_KEY,id,{status:"CAMPAIGN READY",marketingStatus:"CAMPAIGN READY"});},
    recordResponse:p=>{addActivity("RECORD_RESPONSE",p.campaignId,p);return p;},stopAccount:p=>{addActivity("STOP_ACCOUNT",p.accountId,p);return p;},handoffToAM:p=>{addActivity("HANDOFF_TO_AM",p.accountId,p);return p;},recordOutcome:p=>{addActivity("RECORD_OUTCOME",p.accountId,p);return p;},getActivity:()=>read(ACTIVITY_KEY),privateBackendAvailable:()=>!!existingApi()
  };
  global.DGL_MARKETING_BACKEND_ADAPTER_V55=adapter;
})(window);
