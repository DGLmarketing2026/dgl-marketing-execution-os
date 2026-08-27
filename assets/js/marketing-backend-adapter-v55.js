(function(global){
  "use strict";
  const ENDPOINT="https://script.google.com/macros/s/AKfycbw1lzTl7iwqYNp_sp_y2So7rtTt-yUsTmb9DEtRy3tsrF9tUGxHy-exI6Vo8Qmy66GH/exec";
  const TOKEN_KEY="dgl_mkt_v55_token_session";
  const STATES={DISCONNECTED:"DISCONNECTED",CONNECTING:"CONNECTING",PRIVATE_BACKEND:"PRIVATE_BACKEND",ERROR:"ERROR"};
  let state=STATES.DISCONNECTED,lastError="",requests=[],campaigns=[],activity=[],requestSequence=0;
  const token=()=>sessionStorage.getItem(TOKEN_KEY)||"";
  const clone=v=>JSON.parse(JSON.stringify(v==null?null:v));

  function rerenderCurrentModule(){
    if(state!==STATES.PRIVATE_BACKEND)return;
    setTimeout(()=>{
      try{
        const id=(global.location.hash||"#/command-center").replace("#/","").trim()||"command-center";
        const mount=document.getElementById("mainContent");
        const renderer=global.DGL_MODULE_RENDERERS&&global.DGL_MODULE_RENDERERS[id];
        if(mount&&renderer)renderer(mount);
      }catch(error){console.error("DGL lifecycle rerender failed",error);}
    },0);
  }

  function emit(){
    global.dispatchEvent(new CustomEvent("dgl:v55-backend-change",{detail:getConnectionState()}));
    rerenderCurrentModule();
  }
  function setState(next,error=""){state=next;lastError=error;emit();}
  function safeError(error){
    const message=String(error&&error.message||error||"Backend request failed");
    if(/unauthoriz/i.test(message))return "Private backend authorization failed.";
    if(/timeout/i.test(message))return "Private backend connection timed out.";
    const secret=token();return secret?message.replaceAll(secret,"[redacted]"):message;
  }
  function unwrap(result){
    if(result&&result.ok===false)throw new Error(result.error||result.message||"Backend request failed");
    if(result&&Object.prototype.hasOwnProperty.call(result,"data"))return result.data;
    if(result&&Object.prototype.hasOwnProperty.call(result,"result"))return result.result;
    return result;
  }
  function jsonp(action,payload,requiresToken=true){
    return new Promise((resolve,reject)=>{
      if(requiresToken&&!token()){reject(new Error("Private backend token required"));return;}
      const callback=`__dglV55Jsonp_${Date.now()}_${++requestSequence}`,script=document.createElement("script");
      let done=false;
      const timer=setTimeout(()=>finish(new Error("Private backend timeout")),20000);
      function finish(error,value){
        if(done)return;done=true;clearTimeout(timer);
        try{delete global[callback]}catch(_){global[callback]=undefined}
        script.remove();error?reject(error):resolve(value);
      }
      global[callback]=result=>{try{finish(null,unwrap(result))}catch(error){finish(error)}};
      script.onerror=()=>finish(new Error("Private backend unavailable"));
      const params=new URLSearchParams({action,callback});
      if(requiresToken)params.set("token",token());
      if(payload!==undefined)params.set("payload",JSON.stringify(payload));
      script.src=`${ENDPOINT}?${params.toString()}`;script.async=true;document.head.appendChild(script);
    });
  }

  function normalizeRequest(row){const r={...(row||{})};r.id=r.requestId||r.id;r.requestId=r.id;r.marketingStatus=r.marketingStatus||r.status||r.automationStatus||"READY FOR MARKETING";r.automationStatus=r.automationStatus||r.marketingStatus;r.status=r.status||r.marketingStatus;return r;}
  function normalizeCampaign(row){const c={...(row||{})};c.id=c.campaignId||c.id;c.campaignId=c.id;c.name=c.campaignName||c.name;c.campaignName=c.name;c.objective=c.campaignType||c.objective;c.lastActivity=c.updatedAt||c.createdAt||c.lastActivity;c.marketingStatus=c.marketingStatus||c.status;c.accounts=Number(c.accounts||c.accountCount||c.audienceCount||0);return c;}
  const arrayFrom=(value,keys)=>{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value&&value[key]))return value[key];return [];};

  async function health(){return jsonp("v55Health",undefined,false);}

  async function refresh(){
    if(!token())throw new Error("Private backend token required");
    try{
      const [r,c,a]=await Promise.all([
        jsonp("v55Requests",{}),
        jsonp("v55Campaigns",{}),
        jsonp("v55Activity",{})
      ]);
      requests=arrayFrom(r,["requests","records"]).map(normalizeRequest);
      campaigns=arrayFrom(c,["campaigns","records"]).map(normalizeCampaign);
      activity=arrayFrom(a,["activity","records"]);
      setState(STATES.PRIVATE_BACKEND);
      return getConnectionState();
    }catch(error){
      const message=safeError(error);
      if(message==="Private backend authorization failed.")sessionStorage.removeItem(TOKEN_KEY);
      setState(STATES.ERROR,message);
      throw new Error(message);
    }
  }

  async function connect(){
    let value=token();
    if(!value){
      value=(global.prompt("Pega el token privado de DGL Marketing OS. Se guardará solo durante esta pestaña y nunca en GitHub.")||"").trim();
      if(!value){setState(STATES.DISCONNECTED);return getConnectionState();}
      sessionStorage.setItem(TOKEN_KEY,value);
    }
    setState(STATES.CONNECTING);
    try{
      return await refresh();
    }catch(error){
      const message=safeError(error);
      if(message==="Private backend authorization failed.")sessionStorage.removeItem(TOKEN_KEY);
      setState(STATES.ERROR,message);
      throw new Error(message);
    }
  }

  function disconnect(){sessionStorage.removeItem(TOKEN_KEY);requests=[];campaigns=[];activity=[];setState(STATES.DISCONNECTED);return getConnectionState();}
  function getConnectionState(){return {state,mode:state===STATES.PRIVATE_BACKEND?"PRIVATE_BACKEND":"LOCAL_DEMO",connected:state===STATES.PRIVATE_BACKEND,error:lastError,requestCount:requests.length,campaignCount:campaigns.length,activityCount:activity.length};}

  async function mutate(action,payload,refreshAfter=true){
    try{const result=await jsonp(action,payload);if(refreshAfter)await refresh();return result;}
    catch(error){
      const message=safeError(error);
      if(message==="Private backend authorization failed."){sessionStorage.removeItem(TOKEN_KEY);setState(STATES.ERROR,message);}
      throw new Error(message);
    }
  }

  async function createRequest(record){const result=await mutate("v55CreateRequest",{record},false),row=normalizeRequest(result&&result.request||result);if(!row.id)throw new Error("Private backend did not return a requestId.");requests=[row,...requests.filter(x=>x.id!==row.id)];emit();return row;}
  async function updateRequest(requestId,patch){const result=await mutate("v55UpdateRequest",{requestId,patch},false),row=normalizeRequest(result&&result.request||result);requests=requests.map(x=>x.id===requestId?{...x,...row}:x);emit();return row;}
  async function createCampaign(payload){const result=await mutate("v55CreateCampaign",{requestId:payload.requestId,strategy:payload.strategy||payload.context||payload},false),row=normalizeCampaign(result&&result.campaign||result);campaigns=[row,...campaigns.filter(x=>x.id!==row.id)];emit();return row;}
  function updateCampaign(id,patch){const current=campaigns.find(x=>x.id===id);if(!current)return null;Object.assign(current,patch);emit();return clone(current);}
  const campaignAction=(action,id,data)=>mutate(action,{campaignId:id,...(data||{})});
  const activityKey=row=>String(row&&((row.id||row.activityId)||`${row.timestamp||row.createdAt||""}|${row.actionType||row.action||""}|${row.campaignId||""}`));
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function activityError(row){const value=row&&((row.error||row.message||row.result)||"Test draft creation failed."),raw=typeof value==="object"?JSON.stringify(value):String(value),secret=token();return secret?raw.replaceAll(secret,"[redacted]"):raw;}

  function postTestDraft(campaignId,draft){
    if(!token())return Promise.reject(new Error("Private backend token required"));
    return new Promise((resolve,reject)=>{
      const suffix=`${Date.now()}_${++requestSequence}`,frame=document.createElement("iframe"),form=document.createElement("form");
      frame.name=`dglV55DraftFrame_${suffix}`;frame.hidden=true;form.hidden=true;form.method="POST";form.action=ENDPOINT;form.target=frame.name;
      const fields={action:"v55CreateTestDraft",token:token(),payload:JSON.stringify({campaignId,draft})};
      Object.entries(fields).forEach(([name,value])=>{const input=document.createElement("input");input.type="hidden";input.name=name;input.value=value;form.appendChild(input);});
      document.body.append(frame,form);
      try{form.submit();form.remove();resolve(frame);}catch(error){form.remove();frame.remove();reject(error);}
    });
  }

  async function createTestDraft(campaignId,draft){
    if(state!==STATES.PRIVATE_BACKEND)throw new Error("Connect the private backend before creating a test draft.");
    if(!campaignId)throw new Error("A backend campaignId is required.");
    const baseline=new Set(activity.map(activityKey)),frame=await postTestDraft(campaignId,draft);
    try{
      for(let attempt=0;attempt<20;attempt++){
        await wait(attempt===0?900:1500);await refresh();
        const rows=activity.filter(row=>String(row.campaignId||row.entityId||"")===String(campaignId)&&!baseline.has(activityKey(row)));
        const failure=rows.find(row=>[row.actionType,row.action,row.status].some(value=>String(value||"").toUpperCase()==="API_ERROR"));
        if(failure)throw new Error(activityError(failure));
        const success=rows.find(row=>String(row.actionType||row.action||"").toUpperCase()==="TEST_DRAFT_CREATED");
        if(success)return {campaignId,status:"TEST DRAFT CREATED",activity:clone(success)};
      }
      throw new Error("Test draft confirmation timed out.");
    }finally{frame.remove();}
  }

  const adapter={
    version:"5.5",mode:"LOCAL_DEMO",endpoint:ENDPOINT,health,connect,disconnect,refresh,
    isConnected:()=>state===STATES.PRIVATE_BACKEND,getConnectionState,
    getRequests:()=>clone(requests),createRequest,updateRequest,
    getCampaigns:()=>clone(campaigns),createCampaign,updateCampaign,
    requestApproval:(id,data)=>campaignAction("v55RequestApproval",id,data),
    recordApproval:(id,data)=>campaignAction("v55RecordApproval",id,data),
    activateCampaign:(id,data)=>campaignAction("v55ActivateCampaign",id,data),
    pauseCampaign:(id,data)=>campaignAction("v55PauseCampaign",id,data),
    createTestDraft,
    resolveRecipients:id=>mutate("v55ResolveRecipients",{campaignId:id},false),
    getAudienceStatus:id=>mutate("v55AudienceStatus",{campaignId:id},false),
    recordResponse:p=>mutate("v55RecordResponse",p),
    stopAccount:p=>mutate("v55StopAccount",p),
    handoffToAM:p=>mutate("v55Handoff",p),
    recordOutcome:p=>mutate("v55RecordOutcome",p),
    getActivity:()=>clone(activity),
    privateBackendAvailable:()=>state===STATES.PRIVATE_BACKEND,
    v6Opportunities:()=>mutate("v6Opportunities",{},false),
    v6RunOpportunityEngine:data=>mutate("v6RunOpportunityEngine",data||{},false),
    v6OpportunitySummary:()=>mutate("v6OpportunitySummary",{},false),
    v6FrequencyStatus:data=>mutate("v6FrequencyStatus",data||{},false),
    v6EvaluateCampaignPressure:data=>mutate("v6EvaluateCampaignPressure",data||{},false),
    v6AccountPipeline:()=>mutate("v6AccountPipeline",{},false),
    v6PipelineSummary:()=>mutate("v6PipelineSummary",{},false),
    v6PipelineTransition:data=>mutate("v6PipelineTransition",data||{},false),
    v6PipelineSyncSignals:data=>mutate("v6PipelineSyncSignals",data||{},false),
    v6CreateExecution:data=>mutate("v6CreateExecution",data||{},false),
    v6QueueExecution:data=>mutate("v6QueueExecution",data||{},false),
    v6StartExecution:data=>mutate("v6StartExecution",data||{},false),
    v6ExecutionStatus:data=>mutate("v6ExecutionStatus",data||{},false),
    v6ExecutionArchiveStatus:data=>mutate("v6ExecutionArchiveStatus",data||{},false),
    v6CopyUsage:data=>mutate("v6CopyUsage",data||{},false),
    v6RecordCopyUsage:data=>mutate("v6RecordCopyUsage",data||{},false),
    v6CreativeUsage:data=>mutate("v6CreativeUsage",data||{},false),
    v6RecordCreativeUsage:data=>mutate("v6RecordCreativeUsage",data||{},false)
  };
  Object.defineProperty(adapter,"mode",{enumerable:true,get:()=>state===STATES.PRIVATE_BACKEND?"PRIVATE_BACKEND":"LOCAL_DEMO"});
  global.DGL_MARKETING_BACKEND_ADAPTER_V55=adapter;

  document.addEventListener("DOMContentLoaded",()=>{
    if(token())connect().catch(()=>{});
    else emit();
  });
})(window);