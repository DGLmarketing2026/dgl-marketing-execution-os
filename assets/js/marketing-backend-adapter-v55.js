(function(global){
  "use strict";
  const ENDPOINT="https://script.google.com/macros/s/AKfycbw1lzTl7iwqYNp_sp_y2So7rtTt-yUsTmb9DEtRy3tsrF9tUGxHy-exI6Vo8Qmy66GH/exec";
  // Persistent (not session-only) storage: a one-time manual token entry
  // survives browser/tab restarts so Cristian never has to re-paste it on
  // every reopen. The token itself never leaves this device — it lives only
  // in the browser's own localStorage, is never written to GitHub source,
  // never appears in a URL, and is redacted from every logged/thrown error
  // (see classifyError/activityError below).
  const TOKEN_KEY="dgl_mkt_v55_token_session";
  const LEGACY_TOKEN_KEY="dgl_mkt_v55_token_session"; // pre-persistence sessionStorage key (same name, different store)
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
  function migrateLegacySessionToken(){
    try{
      const legacy=sessionStorage.getItem(LEGACY_TOKEN_KEY);
      if(legacy&&!localStorage.getItem(TOKEN_KEY))localStorage.setItem(TOKEN_KEY,legacy);
      sessionStorage.removeItem(LEGACY_TOKEN_KEY);
    }catch(_){/* storage unavailable — falls back to re-prompting */}
  }
  migrateLegacySessionToken();
  const token=()=>{try{return localStorage.getItem(TOKEN_KEY)||"";}catch(_){return "";}};
  const setToken=value=>{try{localStorage.setItem(TOKEN_KEY,value);}catch(_){/* storage unavailable */}};
  const clearToken=()=>{try{localStorage.removeItem(TOKEN_KEY);}catch(_){/* storage unavailable */}};
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
      }catch(error){lastError="Lifecycle rerender failed: "+(error&&error.message||error);}
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
    const raw=String(error&&error.message||error||"Backend request failed");
    const secret=token(),safe=secret?raw.replaceAll(secret,"[redacted]"):raw;
    if(/unauthoriz|forbidden|invalid token|token required/i.test(raw))
      return {kind:"AUTH",code:code||"AUTH_REJECTED",text:"PRIVATE BACKEND AUTHENTICATION FAILED"};
    if(/timeout/i.test(raw))
      return {kind:"BACKEND",code:code||"TIMEOUT",text:"AURA BACKEND TEMPORARILY UNAVAILABLE"};
    return {kind:"BACKEND",code:code||"UNREACHABLE",text:"AURA BACKEND TEMPORARILY UNAVAILABLE",detail:safe.slice(0,200)};
  }
  function unwrap(result){
    if(result&&result.ok===false)throw new Error(result.error||result.message||"Backend request failed");
    if(result&&Object.prototype.hasOwnProperty.call(result,"data"))return result.data;
    if(result&&Object.prototype.hasOwnProperty.call(result,"result"))return result.result;
    return result;
  }
  // Request metrics (in memory only): lets the UI and QA measure request counts and latency.
  const metrics={requests:0,cacheHits:0,dedupeHits:0,byAction:{},last:[]};
  function jsonp(action,payload,requiresToken=true){
    metrics.requests++;metrics.byAction[action]=(metrics.byAction[action]||0)+1;
    const started=Date.now();
    return jsonpRaw(action,payload,requiresToken).then(v=>{metrics.last=[{action,ms:Date.now()-started,ok:true},...metrics.last].slice(0,30);return v;},e=>{metrics.last=[{action,ms:Date.now()-started,ok:false},...metrics.last].slice(0,30);throw e;});
  }
  // Read cache: in-flight de-duplication + short in-memory TTL for read-only actions. Never
  // persisted (no localStorage/sessionStorage) and cleared by every mutation and disconnect.
  const readCache=new Map(),inflight=new Map();
  function clearReadCache(){readCache.clear();}
  function read(action,payload,ttlMs=30000){
    const key=action+"|"+JSON.stringify(payload===undefined?null:payload),hit=readCache.get(key);
    if(ttlMs>0&&hit&&Date.now()-hit.at<ttlMs){metrics.cacheHits++;return Promise.resolve(hit.value);}
    if(inflight.has(key)){metrics.dedupeHits++;return inflight.get(key);}
    const p=jsonp(action,payload).then(value=>{readCache.set(key,{at:Date.now(),value});return value;}).finally(()=>inflight.delete(key));
    inflight.set(key,p);return p;
  }
  async function readOrThrow(action,payload,ttlMs){
    try{return await read(action,payload,ttlMs);}
    catch(error){const c=classifyError(error);if(c.kind==="AUTH"){clearToken();setState(STATES.AUTH_ERROR,c.text);}throw new Error(c.text);}
  }
  function jsonpRaw(action,payload,requiresToken=true){
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

  async function probe(action,payload,requiresToken=true){
    try{const value=await jsonp(action,payload,requiresToken);return {ok:true,value};}
    catch(error){
      const msg=String(error&&error.message||error||"");
      return {ok:false,error,reached:!/unavailable|timeout/i.test(msg)};
    }
  }

  async function refresh(options){
    if(!token())throw new Error("Private backend token required");
    // ONE-request bootstrap (v55Bootstrap): auth probe + requests + campaigns + activity + AURA
    // report health aggregated server-side. Every Apps Script round trip costs ~3 s, so this
    // replaces 2 sequential waves (1 + 4 requests). Older backends without it fall through to
    // the previous path unchanged.
    const datasetsOnly=!!(options&&options.datasetsOnly&&state===STATES.PRIVATE_BACKEND);
    const boot=await probe("v55Bootstrap",{});
    if(boot.ok&&boot.value&&boot.value.contract==="V55_BOOTSTRAP_V1"){
      const b=boot.value,list=(p,keys)=>p&&p.ok?arrayFrom(p.data,keys):null;
      const r=list(b.requests,["requests","records"]),c=list(b.campaigns,["campaigns","records"]),a=list(b.activity,["activity","records"]);
      if(r||!datasetsOnly)requests=(r||[]).map(normalizeRequest);
      if(c||!datasetsOnly)campaigns=(c||[]).map(normalizeCampaign);
      if(a||!datasetsOnly)activity=a||[];
      diag.endpointReachable=true;diag.v6OpportunitiesStatus="OK";diag.v6Authenticated=true;
      diag.lastErrorCode="";diag.lastErrorMessage="";
      diag.legacyRequestsStatus=r?"OK":"FAILED";diag.legacyCampaignsStatus=c?"OK":"FAILED";diag.legacyActivityStatus=a?"OK":"FAILED";
      diag.auraReportStatus=b.auraReport&&b.auraReport.ok?"OK":"FAILED";
      // Seed the read cache so the lifecycle modules (Reactivation, Retention, QNB…) open
      // without another round trip right after connect.
      const now=Date.now();
      if(b.opportunities)readCache.set('v6Opportunities|{}',{at:now,value:b.opportunities});
      if(b.pipelineSummary&&b.pipelineSummary.ok)readCache.set('v6PipelineSummary|{}',{at:now,value:b.pipelineSummary.data});
      if(datasetsOnly){emit();return getConnectionState();}
      setState(STATES.PRIVATE_BACKEND);
      return getConnectionState();
    }
    if(!boot.ok&&classifyError(boot.error).kind==="AUTH"){
      const c=classifyError(boot.error);
      diag.endpointReachable=true;diag.v6OpportunitiesStatus="FAILED";diag.v6Authenticated=false;
      diag.lastErrorCode=c.code;diag.lastErrorMessage=c.text;clearToken();setState(STATES.AUTH_ERROR,c.text);
      throw new Error(c.text);
    }
    // After a mutation on an already-authenticated session only the datasets are re-read:
    // the auth probe and the AURA report health check are not repeated (5 -> 3 requests).
    if(options&&options.datasetsOnly&&state===STATES.PRIVATE_BACKEND){
      const [r,c,a]=await Promise.allSettled([read("v55Requests",{},0),read("v55Campaigns",{},0),read("v55Activity",{},0)]);
      if(r.status==="fulfilled")requests=arrayFrom(r.value,["requests","records"]).map(normalizeRequest);
      if(c.status==="fulfilled")campaigns=arrayFrom(c.value,["campaigns","records"]).map(normalizeCampaign);
      if(a.status==="fulfilled")activity=arrayFrom(a.value,["activity","records"]);
      emit();return getConnectionState();
    }
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
      read("v55Requests",{},0),
      read("v55Campaigns",{},0),
      read("v55Activity",{},0),
      read("v6AuraExecutionReport",{},60000)
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
      value=(global.prompt("Pega el token privado de DGL Marketing OS. Se guardará en este navegador (no en esta pestaña únicamente) y nunca en GitHub. Solo se pide una vez por navegador.")||"").trim();
      if(!value){setState(STATES.DISCONNECTED);return getConnectionState();}
      setToken(value);
    }
    setState(STATES.CONNECTING);
    return refresh();
  }

  function disconnect(){
    clearToken();clearReadCache();requests=[];campaigns=[];activity=[];
    diag.v6Authenticated=false;diag.endpointReachable=null;
    diag.v6OpportunitiesStatus="UNKNOWN";diag.auraReportStatus="UNKNOWN";
    diag.legacyRequestsStatus="UNKNOWN";diag.legacyCampaignsStatus="UNKNOWN";diag.legacyActivityStatus="UNKNOWN";
    diag.lastErrorCode="";diag.lastErrorMessage="";
    setState(STATES.DISCONNECTED);
    return getConnectionState();
  }
  function getConnectionState(){return {state,mode:state===STATES.PRIVATE_BACKEND?"PRIVATE_BACKEND":"LOCAL_DEMO",connected:state===STATES.PRIVATE_BACKEND,error:lastError,requestCount:requests.length,campaignCount:campaigns.length,activityCount:activity.length};}

  async function mutate(action,payload,refreshAfter=true){
    // Any call through mutate may write: cached reads are dropped before and after it.
    clearReadCache();
    try{const result=await jsonp(action,payload);clearReadCache();if(refreshAfter)await refresh({datasetsOnly:true});return result;}
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
  const activityKey=row=>String(row&&((row.id||row.activityId)||`${row.timestamp||row.createdAt||""}|${row.actionType||row.action||""}|${row.campaignId||""}`));
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function activityError(row){const value=row&&((row.error||row.message||row.result)||"Test draft creation failed."),raw=typeof value==="object"?JSON.stringify(value):String(value),secret=token();return secret?raw.replaceAll(secret,"[redacted]"):raw;}

  function postTestDraft(campaignId,draft,action="v55CreateTestDraft"){
    if(!token())return Promise.reject(new Error("Private backend token required"));
    return new Promise((resolve,reject)=>{
      const suffix=`${Date.now()}_${++requestSequence}`,frame=document.createElement("iframe"),form=document.createElement("form");
      frame.name=`dglV55DraftFrame_${suffix}`;frame.hidden=true;form.hidden=true;form.method="POST";form.action=ENDPOINT;form.target=frame.name;
      const fields={action,token:token(),payload:JSON.stringify({campaignId,draft})};
      Object.entries(fields).forEach(([name,value])=>{const input=document.createElement("input");input.type="hidden";input.name=name;input.value=value;form.appendChild(input);});
      document.body.append(frame,form);
      try{form.submit();form.remove();resolve(frame);}catch(error){form.remove();frame.remove();reject(error);}
    });
  }

  async function createTestDraft(campaignId,draft,action="v55CreateTestDraft"){
    if(state!==STATES.PRIVATE_BACKEND)throw new Error("Connect the private backend before creating a test draft.");
    if(!campaignId)throw new Error("A backend campaignId is required.");
    const baseline=new Set(activity.map(activityKey)),frame=await postTestDraft(campaignId,draft,action);
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
    v6Opportunities:()=>readOrThrow("v6Opportunities",{}),
    v6RunOpportunityEngine:data=>mutate("v6RunOpportunityEngine",data||{},false),
    v6OpportunitySummary:()=>mutate("v6OpportunitySummary",{},false),
    v6FrequencyStatus:data=>mutate("v6FrequencyStatus",data||{},false),
    v6EvaluateCampaignPressure:data=>mutate("v6EvaluateCampaignPressure",data||{},false),
    v6AccountPipeline:()=>mutate("v6AccountPipeline",{},false),
    v6PipelineSummary:()=>readOrThrow("v6PipelineSummary",{}),
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
    // Read-only reports: in-memory 30 s cache + in-flight de-duplication (see read()).
    v6AuraExecutionReport:()=>readOrThrow("v6AuraExecutionReport",{}),
    v6AuraGmailFreshness:()=>readOrThrow("v6AuraGmailFreshness",{}),
    v6AuraGmailPanel:()=>readOrThrow("v6AuraGmailPanel",{}),
    v6AuraIngestHistory:()=>readOrThrow("v6AuraIngestHistory",{}),
    v6AuraSourceBreakdown:()=>readOrThrow("v6AuraSourceBreakdown",{}),
    // AURA dashboard bridge -- read-only reporting only (see MarketingV55Backend.gs's allowlist
    // comment): never a way to build a queue, dispatch, or send a real email from this page.
    v6AuraEmailPerformanceJob:jobId=>mutate("v6AuraEmailPerformanceJob",{jobId},false),
    v6AuraEmailPerformance:()=>readOrThrow("v6AuraEmailPerformance",{}),
    v6AuraRetentionDashboard:()=>readOrThrow("v6AuraRetentionDashboard",{}),
    v6AuraCampanaAAudit:()=>readOrThrow("v6AuraCampanaAAudit",{}),
    v6AuraCampanaAMatchReport:()=>readOrThrow("v6AuraCampanaAMatchReport",{}),
    v6AuraCampanaAStoppedBreakdown:()=>readOrThrow("v6AuraCampanaAStoppedBreakdown",{}),
    v6AuraAutomaticReportStatus:()=>readOrThrow("v6AuraAutomaticReportStatus",{}),
    v6AuraCampanaALatestRunSummary:()=>readOrThrow("v6AuraCampanaALatestRunSummary",{}),
    // AURA Command Center: ONE read-only request for the whole Overview (agent state, scoped
    // KPIs, Campaign A audit, retention, execution report, latest run).
    v6AuraCommandCenter:options=>readOrThrow("v6AuraCommandCenter",{},options&&options.force?0:30000),
    // Agent decisions record a human approval only; external execution stays disabled in V1.
    agentDecide:(approvalId,decision,note)=>{clearReadCache();return mutate("v6AuraAgentDecide",{approvalId,decision,note},false);},
    agentRunNow:()=>{clearReadCache();return mutate("v6AuraAgentRunNow",{},false);},
    agentActivate:()=>{clearReadCache();return mutate("v6AuraAgentActivate",{},false);},
    getRequestMetrics:()=>JSON.parse(JSON.stringify(metrics)),
    // Iniciativa 2 -- Campaign Studio como unica fuente canonica del email. approveCreative
    // persists the FULL approved creative (never just a status flag); getLatestApprovedCreative
    // reads it back for a post-approval invalidation check or a Test Draft comparison. Neither
    // writes a queue row nor sends anything -- still no second way to trigger a real send.
    // includeApprovedCreatives: the backend returns the approved creative per approved language
    // in the same response (older backends ignore the flag and the Studio fetches them itself).
    campaignStudioContext:campaignId=>mutate("v6CampaignStudioContext",{campaignId,includeApprovedCreatives:true},false),
    campaignStudioTestDraft:(campaignId,draft)=>createTestDraft(campaignId,draft,"v6CampaignStudioTestDraft"),
    campaignStudioList:()=>mutate("v6CampaignStudioList",{},false),
    approveCreativeSet:campaignId=>mutate("v6CampaignStudioApproveSet",{campaignId},false),
    campaignIntake:campaignType=>mutate("v6AuraCampaignIntake",{campaignType},false),
    approveCreative:(campaignId,creative)=>mutate("v6AuraApproveCreative",{campaignId,...(creative||{})},false),
    getLatestApprovedCreative:(campaignId,language)=>mutate("v6AuraLatestApprovedCreative",{campaignId,language},false),
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