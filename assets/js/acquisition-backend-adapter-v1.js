/** DGL Acquisition Backend Adapter V1 — private aggregate/control routes only. */
(function(g){
"use strict";
const base=g.DGL_MARKETING_BACKEND_ADAPTER_V55;
const ENDPOINT=(base&&base.endpoint)||"https://script.google.com/macros/s/AKfycbw1lzTl7iwqYNp_sp_y2So7rtTt-yUsTmb9DEtRy3tsrF9tUGxHy-exI6Vo8Qmy66GH/exec";
const TOKEN_KEY="dgl_mkt_v55_token_session";
let seq=0;
const token=()=>sessionStorage.getItem(TOKEN_KEY)||"";
function unwrap(x){if(x&&x.ok===false)throw new Error(x.error||x.message||"Backend request failed");if(x&&Object.prototype.hasOwnProperty.call(x,"data"))return x.data;if(x&&Object.prototype.hasOwnProperty.call(x,"result"))return x.result;return x;}
function jsonp(action,payload){return new Promise((resolve,reject)=>{if(!token()){reject(new Error("PRIVATE BACKEND TOKEN REQUIRED"));return;}const cb=`__dglAcq_${Date.now()}_${++seq}`,s=document.createElement("script");let done=false;const timer=setTimeout(()=>finish(new Error("PRIVATE BACKEND TIMEOUT")),20000);function finish(err,val){if(done)return;done=true;clearTimeout(timer);try{delete g[cb]}catch(_){g[cb]=undefined}s.remove();err?reject(err):resolve(val);}g[cb]=x=>{try{finish(null,unwrap(x))}catch(e){finish(e)}};s.onerror=()=>finish(new Error("PRIVATE BACKEND UNAVAILABLE"));const q=new URLSearchParams({action,callback:cb,token:token(),payload:JSON.stringify(payload||{})});s.src=`${ENDPOINT}?${q.toString()}`;s.async=true;document.head.appendChild(s);});}
const api={
  isConnected:()=>!!token()&&(!base||!base.isConnected||base.isConnected()),
  status:()=>jsonp("v6AcqStatus",{}),
  run:()=>jsonp("v6AcqRun",{}),
  setup:()=>jsonp("v6AcqSetup",{}),
  pages:()=>jsonp("v6AcqLandingPages",{}),
  signals:()=>jsonp("v6AcqSignals",{}),
  routeLeads:()=>jsonp("v6AcqRouteLeads",{}),
  installTrigger:()=>jsonp("v6AcqInstallTrigger",{})
};
g.DGL_ACQUISITION_BACKEND_V1=api;
})(window);
