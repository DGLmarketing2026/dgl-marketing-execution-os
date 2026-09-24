(function(global){
  "use strict";
  const ENDPOINT="https://script.google.com/macros/s/AKfycbw1lzTl7iwqYNp_sp_y2So7rtTt-yUsTmb9DEtRy3tsrF9tUGxHy-exI6Vo8Qmy66GH/exec";
  const TOKEN_KEY="dgl_mkt_v55_token_session";
  // V6/AURA is the connection authority. AUTH_ERROR means the backend
  // explicitly rejected the token (it is cleared). BACKEND_ERROR means V6
  // itself could not be reached/parsed for any other reason (network,
  // timeout, malformed response, missing route) — the token is preserved,
  // since the credential itself was never shown to be invalid.
  const STATES={DISCONNECTED:"DISCONNECTED",CONNECTING:"CONNECTING",PRIVATE_BACKEND:"PRIVATE_BACKEND",AUTH_ERROR:"AUTH_ERROR",BACKEND_ERROR:"BACKEND_ERROR"};
  let state=STATES.DISCONNECTED,lastError="",requests=[],campaigns=[],activity=[],requestSequence=0;
  const diag={
    state:STATES.DISCONNECTED,endpointReachable:null,v6Authenticated:false,
    v6OpportunitiesStatus:"UNKNOWN",auraReportStatus:"UNKNOWN",
    legacyRequestsStatus:"UNKNOWN",legacyCampaignsStatus:"UNKNOWN",legacyActivityStatus:"UNKNOWN",
    lastErrorCode:"",lastErrorMessage:""
  };
  function publishDiagnostic(){
    diag.state=state;
    try{global.DGL_BACKEND_DIAGNOSTIC=Object.freeze({...diag});}catch(_){global.DGL_BACKEND_DIAGNOSTIC={...diag};}
  }
  publishDiagnostic();
  let credential="";
  try{localStorage.removeItem(TOKEN_KEY);localStorage.removeItem("dgl_mkt_v55_token");credential=sessionStorage.getItem(TOKEN_KEY)||"";}catch(_){}
  const token=()=>credential;
  const setToken=value=>{credential=value;try{sessionStorage.setItem(TOKEN_KEY,value);}catch(_){}};
  const clearToken=()=>{credential="";try{sessionStorage.removeItem(TOKEN_KEY);}catch(_){}};
  const clone=v=>JSON.parse(JSON.stringify(v==null?null:v));

  function rerenderCurrentModule(){
    // Re-render on every state transition (not just once connected) so a
    // module already on screen flips from "PRIVATE BACKEND REQUIRED" to
    // "CONNECTING TO AURA..." to real live data as auto-connect progresses,
    // instead of freezing on whatever state existed at initial page render.
    setTimeout(()=>{
      try{
        const id=(global.location.hash||"#/command-center").replace("#/","").trim()||"command-center";
        const mount=document.getElementById("mainContent");
        const renderer=global.DGL_MODULE_RENDERERS&&global.DGL_MODULE_RENDERERS[id];
        if(mount&&renderer)renderer(mount);
      }catch(error){lastError="RENDER_FAILED";}
    },0);
  }

  function emit(){
    global.dispatchEvent(new CustomEvent("dgl:v55-backend-change",{detail:getConnectionState()}));
    rerenderCurrentModule();
  }
  function setState(next,error=""){state=next;lastError=error;publishDiagnostic();emit();}
  // Distinguishes a genuine credential rejection (AUTH — token is cleared)
  // from every other failure (BACKEND — token is preserved: network hiccup,
  // timeout, malformed response, a route that is temporarily missing). Only
  // AUTH ever clears the stored token.
  function classifyError(error,code){
    const raw=String(error?.message||error||"");
    const auth=/unauthoriz|forbidden|invalid token|token required|AUTH_REJECTED/i.test(raw);
    const safeCode=auth?"AUTH_REJECTED":/timeout|AbortError/i.test(raw)?"TIMEOUT":/METHOD_NOT_ALLOWED|REPLAY_REJECTED|STALE_REQUEST|IDEMPOTENCY_CONFLICT|ALREADY_APPLIED/.exec(raw)?.[0]||"BACKEND_UNAVAILABLE";
    return {kind:auth?"AUTH":"BACKEND",code:safeCode,text:auth?"PRIVATE BACKEND AUTHENTICATION FAILED":safeCode==="TIMEOUT"?"AURA BACKEND TEMPORARILY UNAVAILABLE":safeCode};
  }
  function unwrap(result){
    if(result&&result.ok===false)throw new Error(result.error||result.message||"Backend request failed");
    if(result&&Object.prototype.hasOwnProperty.call(result,"data"))return result.data;
    if(result&&Object.prototype.hasOwnProperty.call(result,"result"))return result.result;
    return result;
  }
  const requestDiagnostics=[];
  const id=()=>global.crypto.randomUUID();
  async function request(action,payload,requiresToken=true){
    if(requiresToken&&!token())throw new Error("Private backend token required");
    const correlationId=id(),startedAt=new Date().toISOString(),started=Date.now();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    const envelope={action,payload:JSON.stringify(payload||{}),token:requiresToken?token():undefined,correlationId,idempotencyKey:id(),timestamp:Date.now(),operation:action};
    const diagnostic={action,correlationId,startedAt,duration:0,success:false,errorCode:""};
    try{
      const response=await global.fetch(ENDPOINT,{method:"POST",mode:"cors",credentials:"omit",referrerPolicy:"no-referrer",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify(envelope),signal:controller.signal});
      if(!response.ok)throw new Error("BACKEND_UNAVAILABLE");
      const result=unwrap(await response.json());diagnostic.success=true;return result;
    }catch(error){const safe=classifyError(error);diagnostic.errorCode=safe.code;const failure=new Error(safe.text);failure.code=safe.code;failure.correlationId=correlationId;throw failure;}
    finally{clearTimeout(timer);diagnostic.duration=Date.now()-started;requestDiagnostics.push(diagnostic);if(requestDiagnostics.length>100)requestDiagnostics.shift();}
  }
  function normalizeRequest(row){const r={...(row||{})};r.id=r.requestId||r.id;r.requestId=r.id;r.marketingStatus=r.marketingStatus||r.status||r.automationStatus||"READY FOR MARKETING";r.automationStatus=r.automationStatus||r.marketingStatus;r.status=r.status||r.marketingStatus;return r;}
  function normalizeCampaign(row){const c={...(row||{})};c.id=c.campaignId||c.id;c.campaignId=c.id;c.name=c.campaignName||c.name;c.campaignName=c.name;c.objective=c.campaignType||c.objective;c.lastActivity=c.updatedAt||c.createdAt||c.lastActivity;c.marketingStatus=c.marketingStatus||c.status;c.accounts=Number(c.accounts||c.accountCount||c.audienceCount||0);return c;}
  const arrayFrom=(value,keys)=>{if(Array.isArray(value))return value;for(const key of keys)if(Array.isArray(value&&value[key]))return value[key];return [];};

  async function health(){return request("v55Health",undefined,false);}

  async function probe(action,payload,requiresToken=true){
    try{const value=await request(action,payload,requiresToken);return {ok:true,value};}
    catch(error){
      const msg=String(error&&error.message||error||"");
      return {ok:false,error,reached:!/unavailable|timeout/i.test(msg)};
    }
  }

  async function refresh(){
    if(!token())throw new Error("Private backend token required");
    // V6/AURA is the connection authority: a live Marketing OS only needs
    // one authenticated V6 read to prove the backend and the token are both
    // good. Legacy V5.5 datasets are optional context fetched afterward —
    // any of them failing must never disconnect a healthy V6 backend.
    const v6=await probe("v6Opportunities",{});
    diag.endpointReachable=v6.ok||!!v6.reached;
    if(!v6.ok){
      diag.v6OpportunitiesStatus="FAILED";
      diag.v6Authenticated=false;
      const c=classifyError(v6.error,v6.reached===false?"UNREACHABLE":undefined);
      diag.lastErrorCode=c.code;diag.lastErrorMessage=c.text;
      if(c.kind==="AUTH")clearToken();
      setState(c.kind==="AUTH"?STATES.AUTH_ERROR:STATES.BACKEND_ERROR,c.text);
      throw new Error(c.text);
    }
    diag.v6OpportunitiesStatus="OK";diag.v6Authenticated=true;
    diag.lastErrorCode="";diag.lastErrorMessage="";

    const [r,c,a,report]=await Promise.allSettled([
      request("v55Requests",{}),
      request("v55Campaigns",{}),
      request("v55Activity",{}),
      request("v6AuraExecutionReport",{})
    ]);
    requests=r.status==="fulfilled"?arrayFrom(r.value,["requests","records"]).map(normalizeRequest):[];
    campaigns=c.status==="fulfilled"?arrayFrom(c.value,["campaigns","records"]).map(normalizeCampaign):[];
    activity=a.status==="fulfilled"?arrayFrom(a.value,["activity","records"]):[];
    diag.legacyRequestsStatus=r.status==="fulfilled"?"OK":"FAILED";
    diag.legacyCampaignsStatus=c.status==="fulfilled"?"OK":"FAILED";
    diag.legacyActivityStatus=a.status==="fulfilled"?"OK":"FAILED";
    diag.auraReportStatus=report.status==="fulfilled"?"OK":"FAILED";
    setState(STATES.PRIVATE_BACKEND);
    return getConnectionState();
  }

  async function connect(){
    let value=token();
    if(!value){
      value=(global.prompt("Pega el token privado de DGL Marketing OS. Se guardará solo durante esta sesión de pestaña; Desconectar elimina la credencial.")||"").trim();
      if(!value){setState(STATES.DISCONNECTED);return getConnectionState();}
      setToken(value);
    }
    setState(STATES.CONNECTING);
    return refresh();
  }

  function disconnect(){
    clearToken();requests=[];campaigns=[];activity=[];
    diag.v6Authenticated=false;diag.endpointReachable=null;
    diag.v6OpportunitiesStatus="UNKNOWN";diag.auraReportStatus="UNKNOWN";
    diag.legacyRequestsStatus="UNKNOWN";diag.legacyCampaignsStatus="UNKNOWN";diag.legacyActivityStatus="UNKNOWN";
    diag.lastErrorCode="";diag.lastErrorMessage="";
    setState(STATES.DISCONNECTED);
    return getConnectionState();
  }
  function getConnectionState(){return {state,mode:state===STATES.PRIVATE_BACKEND?"PRIVATE_BACKEND":"LOCAL_DEMO",connected:state===STATES.PRIVATE_BACKEND,error:lastError,requestCount:requests.length,campaignCount:campaigns.length,activityCount:activity.length};}

  async function mutate(action,payload,refreshAfter=true){
    try{const result=await request(action,payload);if(refreshAfter)await refresh();return result;}
    catch(error){
      const c=classifyError(error);
      if(c.kind==="AUTH"){clearToken();setState(STATES.AUTH_ERROR,c.text);}
      throw new Error(c.text);
    }
  }

  async function createRequest(record){const result=await mutate("v55CreateRequest",{record},false),row=normalizeRequest(result&&result.request||result);if(!row.id)throw new Error("Private backend did not return a requestId.");requests=[row,...requests.filter(x=>x.id!==row.id)];emit();return row;}
  async function updateRequest(requestId,patch){const result=await mutate("v55UpdateRequest",{requestId,patch},false),row=normalizeRequest(result&&result.request||result);requests=requests.map(x=>x.id===requestId?{...x,...row}:x);emit();return row;}
  async function createCampaign(payload){const result=await mutate("v55CreateCampaign",{requestId:payload.requestId,strategy:payload.strategy||payload.context||payload},false),row=normalizeCampaign(result&&result.campaign||result);campaigns=[row,...campaigns.filter(x=>x.id!==row.id)];emit();return row;}
  function updateCampaign(id,patch){const current=campaigns.find(x=>x.id===id);if(!current)return null;Object.assign(current,patch);emit();return clone(current);}
  const campaignAction=(action,id,data)=>mutate(action,{campaignId:id,...(data||{})});
  async function createTestDraft(campaignId,draft){
    if(state!==STATES.PRIVATE_BACKEND)throw new Error("Connect the private backend before creating a test draft.");
    if(!campaignId)throw new Error("A backend campaignId is required.");
    return mutate("v55CreateTestDraft",{campaignId,draft},false);
  }
  const sharedActions=new Set(["v6AcqStatus","v6AcqRun","v6AcqSetup","v6AcqLandingPages","v6AcqSignals","v6AcqRouteLeads","v6AcqInstallTrigger"]);
  const adapter={
    authenticatedRequest:(action,payload)=>{if(!sharedActions.has(action))return Promise.reject(new Error("ACTION_NOT_ALLOWED"));return mutate(action,payload||{},false);},
    sanitizeError:error=>classifyError(error).text,
    getRequestDiagnostics:()=>clone(requestDiagnostics),
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
    v6RecordCreativeUsage:data=>mutate("v6RecordCreativeUsage",data||{},false),
    v6AuraExecutionReport:()=>mutate("v6AuraExecutionReport",{},false),
    v6AuraGmailFreshness:()=>mutate("v6AuraGmailFreshness",{},false),
    v6AuraGmailPanel:()=>mutate("v6AuraGmailPanel",{},false),
    v6AuraIngestHistory:()=>mutate("v6AuraIngestHistory",{},false),
    v6AuraSourceBreakdown:()=>mutate("v6AuraSourceBreakdown",{},false),
    // AURA dashboard bridge -- read-only reporting only (see MarketingV55Backend.gs's allowlist
    // comment): never a way to build a queue, dispatch, or send a real email from this page.
    v6AuraEmailPerformanceJob:jobId=>mutate("v6AuraEmailPerformanceJob",{jobId},false),
    v6AuraEmailPerformance:filters=>mutate("v6AuraEmailPerformance",{page:1,pageSize:25,...(filters||{})},false),
    v6AuraEmailPerformanceExport:filters=>mutate("v6AuraEmailPerformanceExport",filters||{},false),
    v6AuraRetentionDashboard:()=>mutate("v6AuraRetentionDashboard",{},false),
    v6AuraCampanaAAudit:()=>mutate("v6AuraCampanaAAudit",{},false),
    v6AuraCampanaAMatchReport:()=>mutate("v6AuraCampanaAMatchReport",{},false),
    v6AuraCampanaAStoppedBreakdown:()=>mutate("v6AuraCampanaAStoppedBreakdown",{},false),
    v6AuraAutomaticReportStatus:()=>mutate("v6AuraAutomaticReportStatus",{},false),
    v6AuraCampanaALatestRunSummary:()=>mutate("v6AuraCampanaALatestRunSummary",{},false),
    // Iniciativa 2 -- Campaign Studio como unica fuente canonica del email. approveCreative
    // persists the FULL approved creative (never just a status flag); getLatestApprovedCreative
    // reads it back for a post-approval invalidation check or a Test Draft comparison. Neither
    // writes a queue row nor sends anything -- still no second way to trigger a real send.
    approveCreative:(campaignId,creative)=>mutate("v6AuraApproveCreative",{campaignId,...(creative||{})},false),
    getLatestApprovedCreative:campaignId=>mutate("v6AuraLatestApprovedCreative",{campaignId},false),
    // PR #3 audit punto 4 -- editing an approved creative must revoke the BACKEND record, not
    // only local UI state. Called by campaign-studio-v5.js's invalidateApproval() helper on
    // every content change after an approval, before local state is reset.
    revokeApprovedCreative:(creativeId,revokedBy)=>mutate("v6AuraRevokeCreativeApproval",{creativeId,revokedBy},false)
  };
  Object.defineProperty(adapter,"mode",{enumerable:true,get:()=>state===STATES.PRIVATE_BACKEND?"PRIVATE_BACKEND":"LOCAL_DEMO"});
  global.DGL_MARKETING_BACKEND_ADAPTER_V55=adapter;

  document.addEventListener("DOMContentLoaded",()=>{
    if(token())connect().catch(()=>{});
    else emit();
  });
})(window);